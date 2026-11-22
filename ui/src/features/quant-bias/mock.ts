/**
 * Mock quantification-bias estimators (`pnpm dev:mock`, `?mock`). "Mock bias"
 * holds ten two-strain control mixtures (3D7 with DD2 or HB3 at 30/50/70/90%,
 * one off-scale, one weak) on "Mock bins". Analysis follows the engine's
 * rules (microspat_core::quant_bias): control peaks get true shares, peaks
 * with a share outside [min, 1 − min] or too low are left out, a mixture
 * qualifies with two usable peaks summing to 1 and none off-scale, and β is
 * fitted through the origin. The last locus is planted with a positive β so
 * a wrong-signed fit shows up.
 */
import type {
  BiasEstimate,
  Bin,
  ControlPeakExclusion,
  ImportControlMixturesParams,
  LocusQuantBias,
  MixtureComponent,
  MixturesReport,
  Peak,
  ProjectLocusParams,
  ProjectSampleRow,
  QuantBiasComponent,
  QuantBiasMixture,
  QuantBiasParams,
  QuantBiasPoint,
  Sample,
  SetControlMixturesParams,
} from '@/api/bindings'
import { makePeak } from '@/api/helpers'
import { dispatchMock, getMock, registerMocks, type MockHandler } from '@/api/mock/registry'
import { RpcError } from '@/api/transport'
import { rng } from '@/mock/data'
import { controlUse, mockBins, mockControls, seedControls } from '@/features/controls/mock'
import { headerKey, parseCsv } from '@/features/loci/csv'
import {
  createMockProject,
  effectiveParams,
  getProject,
  locusStatus,
  markAnalyzed,
  mockProjects,
  onMockProjectDeleted,
  projectLoci,
  registerMockAnalyzer,
  registerMockSampleRemover,
  registerMockSeed,
  type MockProject,
} from '@/features/projects-shared/mock'
import { logit, sigmoid } from './model/beta'

/** project id → sample id → components. */
const mixtures = new Map<number, Map<number, MixtureComponent[]>>()
/** project id → locus id → stored result. */
const results = new Map<
  number,
  Map<number, { estimate: BiasEstimate | null; points: QuantBiasPoint[]; params: QuantBiasParams; mixtures: QuantBiasMixture[] }>
>()

const mixOf = (pid: number) => {
  let m = mixtures.get(pid)
  if (!m) mixtures.set(pid, (m = new Map()))
  return m
}

controlUse.count = (id) =>
  [...mixtures.values()].reduce((n, m) => n + [...m.values()].filter((cs) => cs.some((c) => c.control_id === id)).length, 0)
controlUse.titles = (id) =>
  [...mixtures.entries()]
    .filter(([, m]) => [...m.values()].some((cs) => cs.some((c) => c.control_id === id)))
    .map(([pid]) => mockProjects.get(pid)?.title ?? `#${pid}`)
onMockProjectDeleted((id) => {
  mixtures.delete(id)
  results.delete(id)
})
registerMockSampleRemover('quant_bias_estimator', (p, ids) => {
  for (const id of ids) mixOf(p.id).delete(id)
})

const labelOf = (id: number) => mockControls.get(id)?.label

// ------------------------------------------------------------------ analysis

/** Planted β per locus position (the last one wrong-signed). */
const TRUE_BETA = [-0.0055, -0.0045, -0.005, 0.0035]
/** Per-sample signal scale (RFU of the whole mixture); one off-scale, one weak. */
function scaleOf(barcode: string): number {
  if (barcode.endsWith('-HOT')) return 52000
  if (barcode.endsWith('-WEAK')) return 2600
  let h = 0
  for (const ch of barcode) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return 7000 + (h % 6000)
}

async function analyzeLocus(p: MockProject, locusId: number, position: number) {
  const params = effectiveParams(p, locusId).quant_bias!
  const beta0 = TRUE_BETA[position % TRUE_BETA.length]!
  const bins = await mockBins(p.bin_estimator_id ?? 0, locusId)
  const r = rng(1000 + locusId * 17)
  const points: QuantBiasPoint[] = []
  const mixtures: QuantBiasMixture[] = []
  const x: number[] = []
  const y: number[] = []
  let sets = 0
  for (const [sid, comps] of mixOf(p.id)) {
    const s = p.samples.get(sid)
    if (!s) continue
    // Controls that share an allele add up on one peak (as assign_true_proportions does).
    const byBin = new Map<number, { c: MixtureComponent; bin: Bin }>()
    const components: QuantBiasComponent[] = []
    for (const c of comps) {
      const bin = bins.find((b) => b.id === mockControls.get(c.control_id)?.alleles.get(locusId))
      components.push({
        control_id: c.control_id,
        control_label: labelOf(c.control_id) ?? `#${c.control_id}`,
        proportion: c.proportion,
        bin_id: bin?.id ?? null,
        bin_label: bin?.label ?? null,
        ...(bin ? {} : { missing: 'not_set' as const }),
      })
      if (!bin) continue
      const had = byBin.get(bin.id)
      byBin.set(bin.id, { c: { ...c, proportion: (had?.c.proportion ?? 0) + c.proportion }, bin })
    }
    const parts = [...byBin.values()]
    const mixture: QuantBiasMixture = {
      sample_id: sid,
      barcode: s.barcode,
      reference_run_id: sid,
      plate_label: 'Demo plate',
      well_label: 'A01',
      used: false,
      components,
    }
    mixtures.push(mixture)
    if (parts.length === 0) continue
    const sizes = parts.map((q) => q.bin.base_size + (r.next() - 0.5) * 0.2)
    const center = sizes.reduce((a, b) => a + b, 0) / sizes.length
    const raw = parts.map((q, i) =>
      sigmoid(logit(Math.min(0.999, Math.max(0.001, q.c.proportion))) + beta0 * (sizes[i]! - center) + (r.next() - 0.5) * 0.06),
    )
    const tot = raw.reduce((a, b) => a + b, 0)
    const obs = raw.map((v) => v / tot)
    const scale = scaleOf(s.barcode)
    const pk: Peak[] = parts.map((q, i) => ({
      ...makePeak({
        index: 1000 + i * 30,
        size: sizes[i]!,
        height: Math.round(obs[i]! * scale),
        bin_id: q.bin.id,
        bin_label: q.bin.label,
        in_bin: true,
      }),
      true_proportion: q.c.proportion,
    }))
    // A stutter peak, which is not part of any control.
    pk.push({ ...makePeak({ index: 990, size: sizes[0]! - 3, height: Math.round(obs[0]! * scale * 0.08) }), true_proportion: 0 })
    const min = params.min_true_proportion - 1e-9
    const set = pk.filter((k) => (k.true_proportion ?? 0) >= min && k.height > params.min_peak_height)
    const totalTrue = set.reduce((a, k) => a + (k.true_proportion ?? 0), 0)
    const qualifies = set.length >= 2 && Math.abs(totalTrue - 1) < 1e-4 && !set.some((k) => k.height > params.offscale_threshold)
    const basis = qualifies ? set : pk.filter((k) => (k.true_proportion ?? 0) > 0)
    const bc = basis.reduce((a, k) => a + k.size, 0) / basis.length
    const bt = basis.reduce((a, k) => a + Math.max(1, k.height), 0)
    let used = false
    for (const k of pk) {
      const t = k.true_proportion ?? 0
      if (t <= 0) continue
      const o = Math.max(1, k.height) / bt
      const u = qualifies && set.includes(k) && t >= min && t <= 1 - min
      // Peak-level reasons first, then the run's, as the engine orders them.
      const exclusion: ControlPeakExclusion | undefined = u
        ? undefined
        : t < min
          ? 'below_min_true_proportion'
          : t > 1 - min + 2e-9
            ? 'above_max_true_proportion'
            : k.height <= params.min_peak_height
              ? 'below_min_height'
              : components.some((c) => c.missing)
                ? 'control_allele_not_found'
                : set.some((q) => q.height > params.offscale_threshold)
                  ? 'off_scale'
                  : set.length < 2
                    ? 'single_peak_set'
                    : 'partner_excluded'
      if (u) {
        x.push(k.size - bc)
        y.push(logit(o) - logit(t))
        used = true
      }
      points.push({
        sample_id: sid,
        barcode: s.barcode,
        size: k.size,
        centered_size: k.size - bc,
        observed_proportion: o,
        true_proportion: t,
        log_odds_error: o > 0 && o < 1 && t > 0 && t < 1 ? logit(o) - logit(t) : null,
        corrected_proportion: null,
        used: u,
        height: k.height,
        ...(k.bin_id != null ? { bin_id: k.bin_id, bin_label: k.bin_label ?? undefined } : {}),
        ...(exclusion ? { exclusion } : {}),
      })
    }
    mixture.used = used
    if (used) sets++
  }
  let estimate: BiasEstimate | null = null
  if (x.length) {
    const sxx = x.reduce((a, v) => a + v * v, 0)
    const beta = sxx > 0 ? x.reduce((a, v, i) => a + v * y[i]!, 0) / sxx : 0
    const res = y.map((v, i) => v - beta * x[i]!)
    const sse = res.reduce((a, v) => a + v * v, 0)
    const sst = y.reduce((a, v) => a + v * v, 0)
    estimate = { beta, sd: Math.sqrt(sse / x.length), r_squared: sst > 0 ? 1 - sse / sst : 0, n_peaks: x.length, n_sets: sets }
  }
  // Correct every mixture's true peaks with β (per-peak inversion, renormalized).
  for (const [sid, group] of groupBy(points)) {
    void sid
    const center = group.reduce((a, q) => a + q.size, 0) / group.length
    const raw = group.map((q) =>
      estimate ? sigmoid(logit(Math.min(0.9999, q.observed_proportion)) - estimate.beta * (q.size - center)) : q.observed_proportion,
    )
    const sum = raw.reduce((a, v) => a + v, 0)
    group.forEach((q, i) => (q.corrected_proportion = raw[i]! / sum))
  }
  let byLocus = results.get(p.id)
  if (!byLocus) results.set(p.id, (byLocus = new Map()))
  points.sort((a, b) => a.barcode.localeCompare(b.barcode) || a.size - b.size)
  mixtures.sort((a, b) => a.barcode.localeCompare(b.barcode))
  byLocus.set(locusId, { estimate, points, params, mixtures })
  return estimate
}

function groupBy(points: QuantBiasPoint[]): Map<number, QuantBiasPoint[]> {
  const m = new Map<number, QuantBiasPoint[]>()
  for (const q of points) m.set(q.sample_id, [...(m.get(q.sample_id) ?? []), q])
  return m
}

registerMockAnalyzer('quant_bias_estimator', async (p, locus) => {
  const loci = await projectLoci(p)
  const est = await analyzeLocus(
    p,
    locus.id,
    loci.findIndex((l) => l.id === locus.id),
  )
  return {
    locus_id: locus.id,
    locus_label: locus.label,
    run_count: mixOf(p.id).size,
    usable_runs: mixOf(p.id).size,
    summary: est
      ? `β = ${est.beta.toFixed(4)} (SD ${est.sd.toFixed(3)}, R² ${est.r_squared.toFixed(2)}) from ${est.n_sets} control runs`
      : 'no estimate',
    warnings: est ? [] : [`No control run at ${locus.label} qualified for estimating β.`],
    ms: 12,
  }
})

// ------------------------------------------------------------------ seed

let seeding: Promise<void> | null = null
// Concurrent callers wait for the same seed instead of seeing a half-built store.
registerMockSeed(() => (seeding ??= seed()))
async function seed() {
  await seedControls()
  const bins = [...mockProjects.values()].find((p) => p.kind === 'bin_estimator')
  const art = [...mockProjects.values()].find((p) => p.kind === 'artifact_estimator')
  if (!bins) return
  const byLabel = new Map([...mockControls.values()].map((c) => [c.label, c.id]))
  const defs: [string, string, string, number][] = []
  for (const partner of ['DD2', 'HB3'])
    for (const share of [30, 50, 70, 90]) defs.push([`MIX-3D7-${partner}-${share}`, '3D7', partner, share / 100])
  defs.push(['MIX-3D7-DD2-50-HOT', '3D7', 'DD2', 0.5], ['MIX-3D7-HB3-60-WEAK', '3D7', 'HB3', 0.6])
  const p = createMockProject({
    kind: 'quant_bias_estimator',
    title: 'Mock bias',
    description: 'Two-strain control mixtures at 30/50/70/90% (one off-scale, one weak).',
    locus_set_id: bins.locus_set_id,
    bin_estimator_id: bins.id,
    artifact_estimator_id: art?.id ?? null,
    quant_bias_estimator_id: null,
    all_samples: false,
    samples: new Map(),
  })
  const existing = new Map(((await dispatchMock('list_samples', null)) as Sample[]).map((x) => [x.barcode, x]))
  for (const [barcode, a, b, share] of defs) {
    const s = existing.get(barcode) ?? ((await dispatchMock('create_sample', { barcode })) as Sample)
    p.samples.set(s.id, { barcode: s.barcode, designation: s.designation, moi: null })
    mixOf(p.id).set(s.id, [
      { control_id: byLabel.get(a)!, proportion: share },
      { control_id: byLabel.get(b)!, proportion: Math.round((1 - share) * 1e6) / 1e6 },
    ])
  }
  const loci = await projectLoci(p)
  for (const [i, l] of loci.entries()) {
    await analyzeLocus(p, l.id, i)
    markAnalyzed(p, l.id)
  }
}

// ------------------------------------------------------------------ handlers

function requireQb(id: number): MockProject {
  const p = getProject(id)
  if (p.kind !== 'quant_bias_estimator') throw new RpcError('invalid', `"${p.title}" is not a quantification-bias estimator.`)
  return p
}

function validate(p: MockProject, named: { name: string; sampleId: number; comps: MixtureComponent[] }[]): string[] {
  const problems: string[] = []
  const seen = new Set<number>()
  for (const { name, sampleId, comps } of named) {
    if (seen.has(sampleId)) {
      problems.push(`${name} appears twice`)
      continue
    }
    seen.add(sampleId)
    if (!comps.length) {
      problems.push(`${name} has no controls`)
      continue
    }
    let total = 0
    let ok = true
    const ids = new Set<number>()
    for (const c of comps) {
      if (mockControls.get(c.control_id)?.bin_estimator_id !== p.bin_estimator_id) {
        problems.push(`${name}: control ${c.label ?? c.control_id} does not belong to the project's bin estimator`)
        ok = false
      }
      if (ids.has(c.control_id)) {
        problems.push(`${name}: a control is listed twice`)
        ok = false
      }
      ids.add(c.control_id)
      if (!(c.proportion > 0 && c.proportion <= 1)) {
        problems.push(`${name}: proportion ${c.proportion} must be in (0, 1]`)
        ok = false
      }
      total += c.proportion
    }
    if (ok && Math.abs(total - 1) > 0.01) problems.push(`${name}: proportions sum to ${total.toFixed(3)}, not 1`)
  }
  return problems
}

function apply(
  p: MockProject,
  named: { sampleId: number; name: string; comps: MixtureComponent[] }[],
  designation: Map<number, Sample['designation']>,
) {
  let added = 0
  let replaced = 0
  for (const { sampleId, name, comps } of named) {
    if (p.samples.has(sampleId)) replaced++
    else {
      added++
      p.samples.set(sampleId, { barcode: name, designation: designation.get(sampleId) ?? 'sample', moi: null })
    }
    const total = comps.reduce((a, c) => a + c.proportion, 0)
    mixOf(p.id).set(
      sampleId,
      comps.map((c) => ({ control_id: c.control_id, proportion: c.proportion / total })),
    )
  }
  // Mixture changes are an input of every locus: the mock marks them through the sample fingerprint.
  p.updated_at = new Date().toISOString()
  return { added, replaced }
}

const preview = (named: { name: string; comps: MixtureComponent[] }[]) =>
  named.map((n) => ({
    barcode: n.name,
    components: n.comps.map((c) => ({ control_id: c.control_id, label: labelOf(c.control_id) ?? c.label, proportion: c.proportion })),
  }))

async function samples(): Promise<Sample[]> {
  return (await dispatchMock('list_samples', null)) as Sample[]
}

const baseSampleRows = getMock('list_project_samples')

const handlers: Record<string, MockHandler> = {
  list_project_samples: async (params, ctx) => {
    const rows = ((await baseSampleRows?.(params, ctx)) ?? []) as ProjectSampleRow[]
    const pid = (params as { id: number }).id
    const m = mixtures.get(pid)
    if (!m) return rows
    return rows.map((r) => ({
      ...r,
      run_count: r.run_count || 4,
      controls: (m.get(r.sample_id) ?? []).map((c) => ({ ...c, label: labelOf(c.control_id) })),
    }))
  },
  get_locus_quant_bias: async (params) => {
    const a = params as ProjectLocusParams
    const p = requireQb(a.project_id)
    const r = results.get(p.id)?.get(a.locus_id)
    const out: LocusQuantBias = {
      locus_id: a.locus_id,
      estimate: r?.estimate ?? null,
      points: r?.points ?? [],
      status: locusStatus(p, a.locus_id),
      ...(r ? { params: r.params, mixtures: r.mixtures } : {}),
    }
    return out
  },
  set_control_mixtures: async (params, ctx) => {
    const a = params as SetControlMixturesParams
    const p = requireQb(a.id)
    const all = new Map((await samples()).map((s) => [s.id, s]))
    const named = a.mixtures.map((m) => {
      const s = all.get(m.sample_id)
      if (!s) throw new RpcError('not_found', `Sample ${m.sample_id} does not exist`)
      return { name: s.barcode, sampleId: s.id, comps: m.components }
    })
    const problems = validate(p, named)
    if (problems.length) throw new RpcError('invalid', `The control mixtures were not set: ${problems.slice(0, 6).join('; ')}`)
    const { added, replaced } = apply(p, named, new Map([...all.values()].map((s) => [s.id, s.designation])))
    ctx.changed('projects', [p.id])
    const report: MixturesReport = { applied: true, problems: [], mixtures: preview(named), added, replaced }
    return report
  },
  import_control_mixtures_csv: async (params, ctx) => {
    const a = params as ImportControlMixturesParams
    const p = requireQb(a.id)
    const table = parseCsv(a.content ?? '').filter((r) => r.some((c) => c.trim()))
    const bi = (table[0] ?? []).map(headerKey).indexOf('barcode')
    if (bi < 0) throw new RpcError('invalid', 'The controls CSV needs a Barcode column, then columns of CONTROL;PROPORTION.')
    const all = await samples()
    const byBarcode = new Map(all.map((s) => [s.barcode.toLowerCase(), s]))
    const ctl = new Map(
      [...mockControls.values()].filter((c) => c.bin_estimator_id === p.bin_estimator_id).map((c) => [c.label.toLowerCase(), c.id]),
    )
    const problems: string[] = []
    const unknown: string[] = []
    const named: { name: string; sampleId: number; comps: MixtureComponent[] }[] = []
    table.slice(1).forEach((rec, k) => {
      const barcode = (rec[bi] ?? '').trim()
      if (!barcode) return
      const comps: MixtureComponent[] = []
      rec.forEach((cell, i) => {
        if (i === bi || !cell.trim()) return
        const parts = cell.split(';').map((x) => x.trim())
        if (parts.length !== 2 || !parts[0]) return void problems.push(`line ${k + 2}: "${cell}" should read CONTROL;PROPORTION`)
        const v = Number(parts[1])
        if (!Number.isFinite(v) || parts[1] === '')
          return void problems.push(`line ${k + 2}: "${cell}": proportion "${parts[1]}" is not a number`)
        const id = ctl.get(parts[0].toLowerCase())
        if (id == null) return void problems.push(`${barcode}: control "${parts[0]}" is not a control of this project's bin estimator`)
        comps.push({ control_id: id, label: parts[0], proportion: v })
      })
      const s = byBarcode.get(barcode.toLowerCase())
      if (!s) return void unknown.push(barcode)
      named.push({ name: barcode, sampleId: s.id, comps })
    })
    if (unknown.length) problems.push(`Unknown barcodes (${unknown.length}): ${unknown.slice(0, 10).join(', ')}`)
    problems.push(...validate(p, named))
    const report: MixturesReport = { applied: false, problems, mixtures: preview(named), added: 0, replaced: 0 }
    if (problems.length && !a.dry_run) throw new RpcError('invalid', `The controls CSV was not applied: ${problems.slice(0, 6).join('; ')}`)
    if (!problems.length && !a.dry_run) {
      Object.assign(report, apply(p, named, new Map(all.map((s) => [s.id, s.designation]))), { applied: true })
      ctx.changed('projects', [p.id])
    } else if (!problems.length) {
      report.replaced = named.filter((n) => p.samples.has(n.sampleId)).length
      report.added = named.length - report.replaced
    }
    return report
  },
}

registerMocks(handlers)
