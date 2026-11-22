/**
 * Mock bin estimators (`pnpm dev:mock`, `?mock`): bins and the peak scatter
 * per project × locus, estimated from the synthetic runs of mockData.ts by a
 * simple gap clustering, hand edits with the engine's checks, and the bins
 * CSV. Seeds "Mock bins" (created by the genotyping mock) on first use.
 */
import type { Bin, BinScatter, IdParams, ProjectLocusParams, UpdateLocusBinsParams } from '@/api/bindings'
import { getMock, registerMocks, type MockContext, type MockHandler } from '@/api/mock/registry'
import { RpcError } from '@/api/transport'
import {
  bumpRevision,
  effectiveParams,
  getProject,
  locusStatus,
  mockProjects,
  projectLoci,
  registerMockAnalyzer,
  type MockProject,
} from '@/features/projects-shared/mock'
import { mockLocusRuns } from './mockData'

interface Stored {
  bins: Bin[]
  sizes: number[]
  heights: number[]
}

const store = new Map<string, Stored>()
// The genotyping mock's get_locus_bins seeds the mock study (it creates
// "Mock bins") and answers for ids that are not bin estimators. Calling it
// rather than every project seed avoids a cycle: the controls and
// quantification-bias seeds read bins through get_locus_bins themselves.
const fallbackGetBins = getMock('get_locus_bins')
export async function seedStudy(ctx: MockContext): Promise<void> {
  await fallbackGetBins?.({ project_id: 0, locus_id: 0 }, ctx)
}
let binSeq = 20000
const key = (pid: number, lid: number) => `${pid}:${lid}`

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)] ?? 0
}

/**
 * Mode finding on a 0.1 bp histogram: the mock stand-in for the engine's
 * mean shift. Local maxima of the counts within ±0.3 bp, at least 0.6 bp
 * apart, become clusters of the sizes within ±0.5 bp of them.
 */
export function estimate(p: MockProject, locusId: number): Stored {
  const data = mockLocusRuns(locusId)
  const params = effectiveParams(p, locusId).bins ?? { min_peak_frequency: 10, default_bin_buffer: 0.75 }
  const sizes: number[] = []
  const heights: number[] = []
  for (const run of data?.runs ?? [])
    for (const pk of run) {
      sizes.push(+pk.size.toFixed(3))
      heights.push(+pk.rel.toFixed(4))
    }
  const groups: number[][] = []
  if (sizes.length) {
    const lo = Math.floor(Math.min(...sizes)) - 1
    const n = Math.ceil((Math.max(...sizes) - lo) / 0.1) + 2
    const hist = new Float64Array(n)
    for (const x of sizes) hist[Math.round((x - lo) / 0.1)]!++
    const win = new Float64Array(n)
    for (let i = 0; i < n; i++) for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) win[i]! += hist[j]!
    const peaks: number[] = []
    for (let i = 0; i < n; i++) {
      let top = true
      for (let j = Math.max(0, i - 6); j <= Math.min(n - 1, i + 6) && top; j++)
        if (win[j]! > win[i]! || (win[j] === win[i] && j < i)) top = false
      if (top && win[i]! >= params.min_peak_frequency) peaks.push(lo + i * 0.1)
    }
    const sorted = [...sizes].sort((a, b) => a - b)
    for (const c of peaks) groups.push(sorted.filter((x) => Math.abs(x - c) <= 0.4))
  }
  const old = store.get(key(p.id, locusId))?.bins ?? []
  const bins: Bin[] = []
  const used = new Set<string>()
  for (const g of groups) {
    if (g.length < params.min_peak_frequency) continue
    const c = +median(g).toFixed(3)
    let label = String(Math.round(c))
    while (used.has(label)) label += "'"
    used.add(label)
    const mean = g.reduce((a, b) => a + b, 0) / g.length
    const sd = Math.sqrt(g.reduce((a, b) => a + (b - mean) ** 2, 0) / g.length)
    // Like the engine, a re-estimated bin keeps the id of a bin with its label.
    const id = old.find((b) => b.label === label)?.id ?? binSeq++
    bins.push({
      id,
      label,
      base_size: c,
      bin_buffer: params.default_bin_buffer > 0 ? params.default_bin_buffer : +Math.max(0.05, sd).toFixed(3),
      peak_count: g.length,
    })
  }
  return { bins, sizes, heights }
}

function stored(p: MockProject, locusId: number): Stored {
  const k = key(p.id, locusId)
  let s = store.get(k)
  if (!s) {
    s = p.analyzed.has(locusId) ? estimate(p, locusId) : { bins: [], sizes: [], heights: [] }
    store.set(k, s)
  }
  return s
}

/** Bins of a bin estimator at a locus (for other mocks). */
export function mockBinsOf(projectId: number, locusId: number): Bin[] {
  const p = mockProjects.get(projectId)
  return p ? stored(p, locusId).bins : []
}

function binEstimator(id: number): MockProject {
  const p = getProject(id)
  if (p.kind !== 'bin_estimator') throw new RpcError('invalid', `Project ${p.title} is not a bin estimator.`)
  return p
}

async function checkLocus(p: MockProject, locusId: number) {
  if (!(await projectLoci(p)).some((l) => l.id === locusId)) throw new RpcError('not_found', `Locus ${locusId} is not in this project.`)
}

registerMockAnalyzer('bin_estimator', (p, locus) => {
  const t0 = performance.now()
  const s = estimate(p, locus.id)
  store.set(key(p.id, locus.id), s)
  const runs = mockLocusRuns(locus.id)?.runs.length ?? 0
  return {
    locus_id: locus.id,
    locus_label: locus.label,
    run_count: runs,
    usable_runs: runs,
    summary: `${s.bins.length} bins from ${s.sizes.length.toLocaleString('en-US')} peaks`,
    warnings: [],
    ms: Math.round(performance.now() - t0),
  }
})

function checkBin(b: Bin): string {
  const label = b.label.trim()
  if (!label || label.length > 50) throw new RpcError('invalid', 'A bin label must be 1–50 characters.')
  if (!(Number.isFinite(b.base_size) && b.base_size > 0)) throw new RpcError('invalid', `Bin ${label}: the center must be a positive size.`)
  if (!(Number.isFinite(b.bin_buffer) && b.bin_buffer > 0 && b.bin_buffer < 50))
    throw new RpcError('invalid', `Bin ${label}: the buffer must be between 0 and 50 bp.`)
  return label
}

const handlers: Record<string, MockHandler> = {
  get_locus_bins: async (params, ctx) => {
    const a = params as ProjectLocusParams
    const any = mockProjects.get(a.project_id)
    if (any?.kind !== 'bin_estimator' && fallbackGetBins) return fallbackGetBins(params, ctx)
    // No locus check here: other mocks read bins in loops while seeding, and
    // each dispatch costs a simulated round trip.
    const p = binEstimator(a.project_id)
    return {
      locus_id: a.locus_id,
      bins: [...stored(p, a.locus_id).bins].sort((x, y) => x.base_size - y.base_size),
      status: locusStatus(p, a.locus_id),
    }
  },
  get_bin_estimator_peaks: async (params) => {
    const a = params as ProjectLocusParams
    const p = binEstimator(a.project_id)
    await checkLocus(p, a.locus_id)
    const s = stored(p, a.locus_id)
    const out: BinScatter = { locus_id: a.locus_id, sizes: s.sizes, relative_heights: s.heights, status: locusStatus(p, a.locus_id) }
    return out
  },
  update_locus_bins: async (params, ctx) => {
    const a = params as UpdateLocusBinsParams
    const p = binEstimator(a.project_id)
    await checkLocus(p, a.locus_id)
    const s = stored(p, a.locus_id)
    const existing = new Map(s.bins.map((b) => [b.id, b]))
    const deletes = new Set(a.delete_ids ?? [])
    for (const id of deletes) if (!existing.has(id)) throw new RpcError('not_found', `Bin ${id} is not at this locus.`)
    const labels = new Map<number, string>([...existing].filter(([id]) => !deletes.has(id)).map(([id, b]) => [id, b.label]))
    const fresh: string[] = []
    for (const b of a.bins) {
      const l = checkBin(b)
      if (b.id > 0) {
        if (!existing.has(b.id) || deletes.has(b.id)) throw new RpcError('not_found', `Bin ${b.id} is not at this locus.`)
        labels.set(b.id, l)
      } else fresh.push(l)
    }
    const seen = new Set<string>()
    for (const l of [...labels.values(), ...fresh]) {
      if (seen.has(l.toLowerCase())) throw new RpcError('conflict', `Two bins would both be labeled "${l}".`)
      seen.add(l.toLowerCase())
    }
    let bins = s.bins.filter((b) => !deletes.has(b.id))
    for (const b of a.bins) {
      const nb = { ...b, label: b.label.trim() }
      if (b.id > 0) bins = bins.map((x) => (x.id === b.id ? { ...nb, peak_count: x.peak_count } : x))
      else bins.push({ ...nb, id: binSeq++ })
    }
    s.bins = bins
    bumpRevision(p, a.locus_id)
    p.updated_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
    ctx.changed('projects', null)
    ctx.changed('controls', null)
    return { locus_id: a.locus_id, bins: [...bins].sort((x, y) => x.base_size - y.base_size), status: locusStatus(p, a.locus_id) }
  },
  export_bins: async (params) => {
    const p = binEstimator((params as IdParams).id)
    const rows = [['Locus', 'Label', 'Base Size', 'Bin Buffer', 'Peak Count']]
    for (const l of await projectLoci(p))
      for (const b of stored(p, l.id).bins)
        rows.push([l.label, b.label, b.base_size.toFixed(3), b.bin_buffer.toFixed(3), String(b.peak_count)])
    return { filename: `${p.title.replace(/\W+/g, '_')}_bins.csv`, content: rows.map((r) => r.join(',')).join('\n') + '\n' }
  },
}

const wrapped: Record<string, MockHandler> = {}
for (const [k, h] of Object.entries(handlers))
  wrapped[k] = async (params, ctx) => {
    await seedStudy(ctx)
    return h(params, ctx)
  }
registerMocks(wrapped)
