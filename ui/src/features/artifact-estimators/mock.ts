/**
 * Mock artifact estimators (`pnpm dev:mock`, `?mock`). Classes come from the
 * synthetic runs of the bin-estimator mock: runs with one dominant peak, their
 * other peaks grouped by distance, each frequent group fit per segment with
 * the chosen method (least squares, Theil–Sen, a seeded RANSAC, or the mean),
 * with RMS or MAD error. Breakpoints, method changes, re-fits, deletions and
 * the equations CSV follow the engine's rules.
 */
import type { ArtifactBreakpointParams, ArtifactParams, ArtifactEquation, ArtifactEstimatorView, ArtifactPoint, ErrorEstimator, IdParams, LocusArtifacts, ProjectLocusParams, RegressionMethod, Segment, SetArtifactErrorEstimatorParams, SetArtifactMethodParams } from '@/api/bindings'
import { registerMocks, type MockHandler } from '@/api/mock/registry'
import { RpcError } from '@/api/transport'
import { rng } from '@/mock/data'
import { bumpRevision, effectiveParams, fingerprint, getProject, locusStatus, projectLoci, registerMockAnalyzer, type MockProject } from '@/features/projects-shared/mock'
import { mockBinsOf, seedStudy } from '@/features/bin-estimators/mock'
import { mockLocusRuns } from '@/features/bin-estimators/mockData'

interface Est {
  id: number
  label: string
  distance: number | null
  buffer: number | null
  points: ArtifactPoint[]
  equations: ArtifactEquation[]
}

interface LocusStore {
  ests: Est[]
  mono: number
  range: [number, number]
}

const store = new Map<string, LocusStore>()
let estSeq = 700
const key = (pid: number, lid: number) => `${pid}:${lid}`

// ------------------------------------------------------------------ fitting

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const n = s.length
  return n ? (n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2) : 0
}

function leastSquares(x: number[], y: number[]): [number, number] {
  const n = x.length
  const mx = x.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my)
    sxx += (x[i]! - mx) ** 2
  }
  const slope = sxx > 0 ? sxy / sxx : 0
  return [slope, my - slope * mx]
}

function theilSen(x: number[], y: number[]): [number, number] {
  const slopes: number[] = []
  const step = Math.max(1, Math.floor(x.length / 300))
  for (let i = 0; i < x.length; i += step)
    for (let j = i + 1; j < x.length; j += step) if (x[j] !== x[i]) slopes.push((y[j]! - y[i]!) / (x[j]! - x[i]!))
  const slope = slopes.length ? median(slopes) : 0
  return [slope, median(y.map((v, i) => v - slope * x[i]!))]
}

function ransac(x: number[], y: number[], seed: number): [number, number] {
  const r = rng(seed + 1)
  const thr = median(y.map((v) => Math.abs(v - median(y)))) || 1e-6
  let best: number[] = []
  for (let t = 0; t < 100; t++) {
    const i = Math.floor(r.next() * x.length)
    const j = Math.floor(r.next() * x.length)
    if (x[i] === x[j]) continue
    const s = (y[j]! - y[i]!) / (x[j]! - x[i]!)
    const b = y[i]! - s * x[i]!
    const inl = x.map((_, k) => k).filter((k) => Math.abs(y[k]! - (s * x[k]! + b)) <= thr)
    if (inl.length > best.length) best = inl
  }
  if (best.length < 2) return leastSquares(x, y)
  return leastSquares(
    best.map((k) => x[k]!),
    best.map((k) => y[k]!),
  )
}

/** Center and half-width of the shortest interval holding ⌊n/2⌋ + 1 values. */
function densestHalf(v: number[]): [number, number] {
  const s = [...v].sort((a, b) => a - b)
  const h = Math.floor(s.length / 2) + 1
  let best: [number, number] = [s[0]!, Infinity]
  for (let i = 0; i + h - 1 < s.length; i++) {
    const w = s[i + h - 1]! - s[i]!
    if (w < best[1]) best = [s[i]!, w]
  }
  return [best[0] + best[1] / 2, best[1] / 2]
}

function fit(seg: Segment, x: number[], y: number[], seed: number) {
  const [slope, line] =
    seg.method === 'least_squares' ? leastSquares(x, y) : seg.method === 'theil_sen' ? theilSen(x, y) : seg.method === 'ransac' ? ransac(x, y, seed) : [0, y.reduce((a, b) => a + b, 0) / y.length]
  const robust = seg.method !== 'least_squares'
  // Engine `densest_half_line`: the line moves to the middle of the shortest
  // band holding half the residuals, and the SD comes from that half.
  const half = robust && seg.error === 'densest_half' ? densestHalf(y.map((v, i) => v - (slope * x[i]! + line))) : null
  const intercept = half ? line + half[0] : line
  const res = y.map((v, i) => v - (slope * x[i]! + intercept))
  const my = y.reduce((a, b) => a + b, 0) / y.length
  const ssRes = res.reduce((a, b) => a + b * b, 0)
  const ssTot = y.reduce((a, b) => a + (b - my) ** 2, 0)
  const sd = half ? 1.4826 * half[1] : robust && seg.error === 'mad' ? 1.4826 * median(res.map((v) => Math.abs(v))) : Math.sqrt(ssRes / y.length)
  return { slope, intercept, sd, r_squared: ssTot > 0 ? 1 - ssRes / ssTot : 0 }
}

function refit(e: Est, segs: Segment[], seed: number) {
  const eqs: ArtifactEquation[] = []
  for (const [i, seg] of segs.entries()) {
    // Closed ranges; a point on a breakpoint belongs to the lower segment.
    const pts = e.points.filter((p) => (i === 0 ? seg.start_size <= p.parent_size : seg.start_size < p.parent_size) && p.parent_size <= seg.end_size)
    if (!pts.length) continue
    eqs.push({
      segment: seg,
      fit: fit(
        seg,
        pts.map((p) => p.parent_size),
        pts.map((p) => p.relative_height),
        seed,
      ),
      n_points: pts.length,
    })
  }
  e.equations = eqs.sort((a, b) => a.segment.start_size - b.segment.start_size)
}

// ------------------------------------------------------------------ estimation

function estimate(p: MockProject, locusId: number): LocusStore {
  const data = mockLocusRuns(locusId)
  const prm: ArtifactParams = effectiveParams(p, locusId).artifact ?? { max_secondary_relative_peak_height: 0.4, min_artifact_peak_frequency: 10, min_artifact_run_fraction: 0.5, seed: 0, error_estimator: 'densest_half' }
  const range: [number, number] = data?.range ?? [0, 500]
  if (!data) return { ests: [], mono: 0, range }
  const bins = p.bin_estimator_id != null ? mockBinsOf(p.bin_estimator_id, locusId) : []
  const inBin = (s: number) => bins.some((b) => Math.abs(s - b.base_size) <= b.bin_buffer)
  const pool: { d: number; pt: ArtifactPoint; inBin: boolean }[] = []
  let mono = 0
  // A large locus does not need every run for a mock model.
  for (const run of data.runs.slice(0, 1500)) {
    const main = run.filter((pk) => pk.rel >= prm.max_secondary_relative_peak_height)
    if (main.length !== 1 || !inBin(main[0]!.size)) continue
    mono++
    const m = main[0]!
    for (const pk of run) if (pk !== m) pool.push({ d: pk.size - m.size, pt: { parent_size: +m.size.toFixed(3), size: +pk.size.toFixed(3), relative_height: +(pk.height / m.height).toFixed(5) }, inBin: inBin(pk.size) })
  }
  pool.sort((a, b) => a.d - b.d)
  const groups: (typeof pool)[] = []
  let cur: typeof pool = []
  for (const x of pool) {
    if (cur.length && x.d - cur[cur.length - 1]!.d > data.repeat / 3) {
      groups.push(cur)
      cur = []
    }
    cur.push(x)
  }
  if (cur.length) groups.push(cur)
  const minN = Math.max(prm.min_artifact_peak_frequency, Math.ceil(prm.min_artifact_run_fraction * mono))
  const whole: Segment = { start_size: range[0], end_size: range[1], method: 'theil_sen', error: prm.error_estimator }
  const ests: Est[] = []
  const left: typeof pool = []
  for (const g of groups) {
    const c = median(g.map((x) => x.d))
    if (Math.abs(c) < 0.5 || g.length < minN) {
      if (Math.abs(c) >= 0.5) left.push(...g)
      continue
    }
    const sd = Math.sqrt(g.reduce((a, x) => a + (x.d - c) ** 2, 0) / g.length)
    const e: Est = { id: estSeq++, label: c.toFixed(2), distance: +c.toFixed(3), buffer: +Math.max(0.5, 3 * sd).toFixed(3), points: g.map((x) => x.pt), equations: [] }
    const xs = e.points.map((q) => q.parent_size)
    refit(e, [Math.max(...xs) - Math.min(...xs) < data.repeat ? { ...whole, method: 'no_slope' } : whole], prm.seed)
    ests.push(e)
  }
  ests.sort((a, b) => b.points.length - a.points.length)
  const global = left.filter((x) => !x.inBin)
  if (global.length >= Math.max(prm.min_artifact_peak_frequency, 2)) {
    const e: Est = { id: estSeq++, label: 'Global Artifact', distance: null, buffer: null, points: global.map((x) => x.pt), equations: [] }
    refit(e, [{ ...whole, method: 'no_slope', error: 'mad' }], prm.seed)
    ests.push(e)
  }
  return { ests, mono, range }
}

function locusStore(p: MockProject, locusId: number): LocusStore {
  const k = key(p.id, locusId)
  let s = store.get(k)
  if (!s) {
    s = p.analyzed.has(locusId) ? estimate(p, locusId) : { ests: [], mono: 0, range: [0, 0] }
    store.set(k, s)
  }
  return s
}

function view(p: MockProject, locusId: number, e: Est): ArtifactEstimatorView {
  return { id: e.id, project_id: p.id, locus_id: locusId, label: e.label, artifact_distance: e.distance, artifact_distance_buffer: e.buffer, points: e.points, equations: e.equations }
}

function owner(id: number): { p: MockProject; lid: number; s: LocusStore; e: Est } {
  for (const [k, s] of store) {
    const e = s.ests.find((x) => x.id === id)
    if (e) {
      const [pid, lid] = k.split(':').map(Number) as [number, number]
      return { p: getProject(pid), lid, s, e }
    }
  }
  throw new RpcError('not_found', `Artifact estimator ${id} does not exist`)
}

registerMockAnalyzer('artifact_estimator', (p, locus) => {
  const t0 = performance.now()
  const s = estimate(p, locus.id)
  store.set(key(p.id, locus.id), s)
  return {
    locus_id: locus.id,
    locus_label: locus.label,
    run_count: mockLocusRuns(locus.id)?.runs.length ?? 0,
    usable_runs: s.mono,
    summary: `${s.ests.length} artifact classes from ${s.mono} mono-allelic runs`,
    warnings: [],
    ms: Math.round(performance.now() - t0),
  }
})

function edit(id: number, f: (e: Est, seed: number, s: LocusStore) => void, ctx: { changed: (e: string, ids?: number[] | null) => void }) {
  const o = owner(id)
  const seed = effectiveParams(o.p, o.lid).artifact?.seed ?? 0
  f(o.e, seed, o.s)
  bumpRevision(o.p, o.lid)
  ctx.changed('projects', null)
  return view(o.p, o.lid, o.e)
}

const segs = (e: Est) => e.equations.map((q) => q.segment)

const handlers: Record<string, MockHandler> = {
  get_locus_artifact_estimators: async (params) => {
    const a = params as ProjectLocusParams
    const p = getProject(a.project_id)
    if (p.kind !== 'artifact_estimator') throw new RpcError('invalid', `Project ${p.title} is not an artifact estimator.`)
    if (!(await projectLoci(p)).some((l) => l.id === a.locus_id)) throw new RpcError('not_found', `Locus ${a.locus_id} is not in this project.`)
    const s = locusStore(p, a.locus_id)
    return { locus_id: a.locus_id, estimators: s.ests.map((e) => view(p, a.locus_id, e)), mono_allelic_runs: p.analyzed.has(a.locus_id) ? s.mono : null, status: locusStatus(p, a.locus_id) }
  },
  add_artifact_breakpoint: (params, ctx) => {
    const a = params as ArtifactBreakpointParams
    return edit(
      a.id,
      (e, seed) => {
        const ss = segs(e)
        const i = ss.findIndex((s) => s.start_size < a.size && a.size < s.end_size)
        if (i < 0) throw new RpcError('invalid', `${a.size.toFixed(2)} bp is not inside a segment of this class.`)
        const s = ss[i]!
        ss.splice(i, 1, { ...s, end_size: a.size }, { ...s, start_size: a.size })
        refit(e, ss, seed)
      },
      ctx,
    )
  },
  remove_artifact_breakpoint: (params, ctx) => {
    const a = params as ArtifactBreakpointParams
    return edit(
      a.id,
      (e, seed) => {
        const ss = segs(e)
        let best = -1
        let bd = 1
        for (let k = 0; k + 1 < ss.length; k++) {
          const d = Math.min(Math.abs(ss[k]!.end_size - a.size), Math.abs(ss[k + 1]!.start_size - a.size))
          if (d <= bd) {
            bd = d
            best = k
          }
        }
        if (best < 0) throw new RpcError('invalid', `There is no breakpoint near ${a.size.toFixed(2)} bp.`)
        const merged = [...ss]
        merged[best] = { ...ss[best]!, end_size: ss[best + 1]!.end_size }
        merged.splice(best + 1, 1)
        refit(e, merged, seed)
      },
      ctx,
    )
  },
  clear_artifact_breakpoints: (params, ctx) =>
    edit(
      (params as IdParams).id,
      (e, seed, s) => {
        const first = e.equations[0]?.segment
        const method: RegressionMethod = first?.method ?? (e.distance == null ? 'ransac' : 'theil_sen')
        const error: ErrorEstimator = first?.error ?? 'mad'
        refit(e, [{ start_size: s.range[0], end_size: s.range[1], method, error }], seed)
      },
      ctx,
    ),
  set_artifact_equation_method: (params, ctx) => {
    const a = params as SetArtifactMethodParams
    return edit(
      a.id,
      (e, seed) => {
        const ss = segs(e)
        if (!ss[a.equation_index]) throw new RpcError('not_found', `This class has no equation ${a.equation_index}.`)
        ss[a.equation_index] = { ...ss[a.equation_index]!, method: a.method }
        refit(e, ss, seed)
      },
      ctx,
    )
  },
  // Re-fits in place (breakpoints, methods and deleted classes stay). For
  // every class it also sets the locus parameter and moves the stored
  // fingerprint along, so the locus stays current while dependents go stale.
  set_artifact_error_estimator: async (params, ctx) => {
    const a = params as SetArtifactErrorEstimatorParams
    const p = getProject(a.project_id)
    const s = locusStore(p, a.locus_id)
    const seed = effectiveParams(p, a.locus_id).artifact?.seed ?? 0
    for (const e of s.ests) {
      if (a.ids && !a.ids.includes(e.id)) continue
      const ss = segs(e).map((g) => ({ ...g, error: a.error_estimator }))
      refit(e, ss, seed)
    }
    if (!a.ids) {
      const cur = { ...(p.params.get(a.locus_id) ?? {}) } as Record<string, Record<string, unknown>>
      const art = { ...(cur.artifact ?? {}) }
      if (a.error_estimator === 'mad') delete art.error_estimator
      else art.error_estimator = a.error_estimator
      if (Object.keys(art).length) cur.artifact = art
      else delete cur.artifact
      p.params.set(a.locus_id, cur)
      const was = p.analyzed.get(a.locus_id)
      if (was) p.analyzed.set(a.locus_id, { ...was, fp: JSON.stringify(fingerprint(p, a.locus_id)) })
    }
    bumpRevision(p, a.locus_id)
    ctx.changed('projects', null)
    const out: LocusArtifacts = { locus_id: a.locus_id, estimators: s.ests.map((e) => view(p, a.locus_id, e)), mono_allelic_runs: s.mono, status: locusStatus(p, a.locus_id) }
    return out
  },
  refit_artifact_estimator: (params, ctx) => edit((params as IdParams).id, (e, seed) => refit(e, segs(e), seed), ctx),
  delete_artifact_estimator: (params, ctx) => {
    const o = owner((params as IdParams).id)
    o.s.ests = o.s.ests.filter((x) => x !== o.e)
    bumpRevision(o.p, o.lid)
    ctx.changed('projects', null)
    return null
  },
  export_artifact_equations: async (params) => {
    const p = getProject((params as IdParams).id)
    const rows = [['Locus', 'Label', 'Artifact Distance', 'Distance Buffer', 'Start Size', 'End Size', 'Method', 'Slope', 'Intercept', 'SD', 'R Squared', 'Points']]
    for (const l of await projectLoci(p))
      for (const e of locusStore(p, l.id).ests)
        for (const q of e.equations)
          rows.push([
            l.label,
            e.label,
            e.distance?.toFixed(4) ?? '',
            e.buffer?.toFixed(4) ?? '',
            q.segment.start_size.toFixed(3),
            q.segment.end_size.toFixed(3),
            q.segment.method,
            q.fit.slope.toExponential(6),
            q.fit.intercept.toFixed(6),
            q.fit.sd.toFixed(6),
            q.fit.r_squared.toFixed(4),
            String(q.n_points),
          ])
    return { filename: `${p.title.replace(/\W+/g, '_')}_artifact_equations.csv`, content: rows.map((r) => r.join(',')).join('\n') + '\n' }
  },
}

const wrapped: Record<string, MockHandler> = {}
for (const [k, h] of Object.entries(handlers))
  wrapped[k] = async (params, ctx) => {
    await seedStudy(ctx)
    return h(params, ctx)
  }
registerMocks(wrapped)
