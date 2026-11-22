/**
 * Mock handlers for the Plates screen (`pnpm dev:mock`, `?mock`). A small
 * in-memory workspace: three plates with a few failed and flagged wells, a
 * contaminated negative control, plate maps, manual ladder edits and imports.
 */
import type {
  ApplyPlateMapParams,
  Color,
  GetWellParams,
  IdParams,
  LadderPeak,
  LadderPreview,
  PlateMapAssignment,
  ImportPlatesParams,
  Ladder,
  LadderSpec,
  Locus,
  PlateDetail,
  PlateImportOutcome,
  PlateMapReport,
  PlateQuality,
  PlateQualityView,
  PlateSummary,
  RunSummary,
  SetWellLadderPeaksParams,
  SizePlateParams,
  SizingState,
  WellDetail,
  WellSummary,
  ComputePlateQualityParams,
} from '@/api/bindings'
import { registerMocks, type MockContext, type MockHandler } from '@/api/mock/registry'
import { RpcError } from '@/api/transport'
import { allWells } from '@/components/PlateGrid'
import { DEMO_LOCI, LIZ500, makeWell, rng } from '@/mock/data'
import { invertInterp } from '@/plot/decimate'
import { parsePlateMap } from './model/plateMap'
import { summarize } from './model/quality'
import { mockQualityReport, type MockQualityOptions } from './mockQuality'

const SCAN: LadderSpec['scanning'] = { maxima_window: 10, relmax_window: 6, smoothing_window: 11, smoothing_order: 7, tophat_factor: 0.005 }

function spec(color: Color, sizes: number[]): LadderSpec {
  return {
    base_sizes: sizes,
    color,
    sq_flag_limit: 1,
    sq_unusable_limit: 2,
    base_size_precision: 2,
    index_overlap: 5,
    min_time: 1200,
    max_peak_height: 24000,
    min_peak_height: 200,
    min_relative_height: 0.25,
    maximum_missing_peak_count: 5,
    allow_bleedthrough: true,
    scanning: SCAN,
  }
}

const LADDERS: Ladder[] = [
  { id: 1, label: 'GeneScan 500 LIZ', spec: spec('orange', LIZ500), plate_count: 0 },
  {
    id: 2,
    label: 'HD ROX 400',
    spec: spec('red', [50, 60, 90, 100, 120, 150, 160, 180, 190, 200, 220, 240, 260, 280, 290, 300, 320, 340, 360, 380, 400]),
    plate_count: 0,
  },
]

const LOCI: Locus[] = DEMO_LOCI.map((l, i) => ({
  id: i + 1,
  label: l.label,
  color: l.color,
  min_base_length: l.range[0],
  max_base_length: l.range[1],
  nucleotide_repeat_length: l.repeat,
  run_count: 0,
  locus_set_ids: [],
}))

interface MockRun {
  locus: number
  sample: string
}

interface MockWellState {
  id: number
  label: string
  seed: number
  sizing: SizingState
  quality: number | null
  error: string | null
  manual: boolean
  /** Hand-picked peaks with their sizes; null for the automatic fit. */
  peaks: LadderPeak[] | null
  reason: string | null
  auto: { quality: number | null; error: string | null }
  signal: Partial<Record<Color, number | null>>
  runs: MockRun[]
}

interface MockPlate {
  summary: Omit<PlateSummary, 'sizing' | 'has_plate_map' | 'run_count' | 'contaminated_loci' | 'well_count' | 'ladder_label' | 'quality'>
  wells: MockWellState[]
  /** How its quality report is made; null = not checked yet (imported before quality checks). */
  qualityOptions: Omit<MockQualityOptions, 'seed'> | null
  computedAt: string | null
}

const samples = new Map<string, 'sample' | 'negative_control'>()
let plates: MockPlate[] = []
let nextPlate = 1
let nextWell = 1

function stateOf(q: number | null): SizingState {
  if (q == null) return 'failed'
  return q > 3 ? 'unusable' : q > 1 ? 'flagged' : 'good'
}

const LADDER_SIZES = LIZ500
const MAX_MISSING = 5

function autoReason(w: MockWellState): string | null {
  if (w.sizing === 'failed') return w.error
  if (w.sizing === 'unusable') return `Largest leave-one-out sizing error is ${w.quality?.toFixed(2)} bp, above the unusable limit of 3 bp.`
  if (w.sizing === 'flagged') return `Largest leave-one-out sizing error is ${w.quality?.toFixed(2)} bp, above the flag limit of 1 bp.`
  return null
}

/**
 * The mock fitter. Hand-picked indices get the size whose peak sits nearest
 * in this well's generated ladder (the engine is guided by the plate's other
 * wells; the mock wells all share one ladder shape). Explicit sizes are
 * checked against the ladder. Quality grows with how far each peak is from
 * where its size really is, so a wrong assignment scores badly.
 */
function mockFit(w: MockWellState, req: { peak_indices?: number[] | null; peaks?: LadderPeak[] | null }): LadderPreview {
  const auto = ladderIndices(w.seed % 997)
  const fail = (reason: string): LadderPreview => ({ sizing: 'failed', sizing_quality: null, reason, peaks: [] })
  let peaks: LadderPeak[]
  if (req.peaks != null) {
    peaks = [...req.peaks].sort((a, b) => a.index - b.index)
    for (const p of peaks) if (!LADDER_SIZES.includes(p.size)) return fail(`${p.size} bp is not a size of this ladder.`)
    for (let k = 1; k < peaks.length; k++)
      if (peaks[k]!.size <= peaks[k - 1]!.size)
        return fail(
          `Sizes must increase with the peak index and each ladder size be used once (peak ${peaks[k]!.index}: ${peaks[k]!.size} bp).`,
        )
  } else {
    const idx = [...new Set(req.peak_indices ?? [])].sort((a, b) => a - b)
    peaks = idx.map((i) => {
      let k = 0
      auto.forEach((a, j) => {
        if (Math.abs(a - i) < Math.abs((auto[k] as number) - i)) k = j
      })
      return { index: i, size: LADDER_SIZES[k] as number }
    })
    const used = new Set(peaks.map((p) => p.size))
    if (used.size < peaks.length) return fail('Two peaks fall on the same ladder size; remove one of them.')
  }
  if (peaks.length < 4) return fail(`Only ${peaks.length} usable ladder peaks, need 4.`)
  const err = Math.max(...peaks.map((p) => Math.abs(p.index - (auto[LADDER_SIZES.indexOf(p.size)] as number)))) * 0.08
  const quality = Math.round((0.04 + err) * 1000) / 1000
  const need = LADDER_SIZES.length - MAX_MISSING
  if (peaks.length < need)
    return {
      sizing: 'unusable',
      sizing_quality: quality,
      peaks,
      reason: `Only ${peaks.length} of the ladder's ${LADDER_SIZES.length} peaks are assigned; at least ${need} are needed (at most ${MAX_MISSING} may be missing).`,
    }
  if (quality > 3)
    return {
      sizing: 'unusable',
      sizing_quality: quality,
      peaks,
      reason: `Largest leave-one-out sizing error is ${quality.toFixed(2)} bp, above the unusable limit of 3 bp.`,
    }
  if (quality > 1)
    return {
      sizing: 'flagged',
      sizing_quality: quality,
      peaks,
      reason: `Largest leave-one-out sizing error is ${quality.toFixed(2)} bp, above the flag limit of 1 bp.`,
    }
  return { sizing: 'good', sizing_quality: quality, peaks, reason: null }
}

/** The automatic fit of a mock well: what it was generated with. */
function autoFit(w: MockWellState): { quality: number | null; error: string | null } {
  return w.auto
}

function ladderIndices(seed: number): number[] {
  const w = makeWell(seed)
  return LIZ500.map((s) => Math.round(invertInterp(w.baseSizes, s)))
}

function makePlate(label: string, seed: number, mapped: boolean, qualityOptions: MockPlate['qualityOptions'] = {}): MockPlate {
  const r = rng(seed)
  const id = nextPlate++
  const wells = allWells(96).map((wl, i): MockWellState => {
    const u = r.next()
    const quality = u < 0.04 ? null : u < 0.07 ? 3 + r.next() * 3 : u < 0.13 ? 1 + r.next() * 1.5 : 0.04 + r.next() * 0.25
    const col = i % 12
    const colFactor = 1 - (col / 12) * 0.55
    const sig = (base: number) =>
      quality == null
        ? null
        : r.next() < 0.03
          ? Math.round(40 + r.next() * 40)
          : Math.round(Math.min(32000, Math.exp(Math.log(base * colFactor) + r.gauss() * 0.7)))
    const ntc = wl === 'H12' || wl === 'H11'
    const barcode = ntc ? `NTC-${label}-${wl}` : `${label}-S${String(i + 1).padStart(3, '0')}`
    if (mapped) samples.set(barcode, ntc ? 'negative_control' : 'sample')
    const signal: MockWellState['signal'] = {
      blue: ntc ? (wl === 'H12' && seed === 1 ? 1800 : 30) : sig(8000),
      green: ntc ? 25 : sig(3500),
      yellow: ntc ? 20 : sig(2200),
      red: ntc ? 22 : sig(3000),
    }
    const error =
      quality == null
        ? r.next() < 0.5
          ? 'only 7 usable ladder peaks, need 11'
          : 'ladder signal too low: tallest peak after min_time is 96 RFU, need more than 200'
        : null
    return {
      id: nextWell++,
      label: wl,
      seed: seed * 1000 + i,
      sizing: stateOf(quality),
      quality,
      error,
      auto: { quality, error },
      manual: false,
      peaks: null,
      reason: null,
      signal,
      runs: mapped ? LOCI.map((l) => ({ locus: l.id, sample: barcode })) : [],
    }
  })
  return {
    summary: {
      id,
      label,
      run_date: `2026-03-${String(17 + seed).padStart(2, '0')}T09:30:00`,
      instrument: 'MOCK-3730xl',
      instrument_model: '3730',
      plate_size: 96,
      ladder_id: 1,
      imported_at: `2026-11-2${seed}T10:00:00Z`,
      source: `${label}.zip`,
    },
    wells,
    qualityOptions,
    computedAt: qualityOptions ? `2026-11-2${seed}T10:01:00Z` : null,
  }
}

function ensure() {
  if (plates.length) return
  plates = [
    // Issues: a capillary with unseparated dyes, blue pull-up into green above the warning limit, a contaminated negative control.
    makePlate('MOCK-1', 1, true, {
      unseparated: ['F06'],
      pullUp: { 'blue>green': 0.14 },
      controls: [
        { well: 'H12', locus: 'PfPK2', sample: 'NTC-MOCK-1-H12', color: 'blue', size: 171.4, height: 1800, peaks: 2, explained_by: null },
        {
          well: 'H11',
          locus: 'TA81',
          sample: 'NTC-MOCK-1-H11',
          color: 'green',
          size: 122.1,
          height: 240,
          peaks: 1,
          explained_by: 'crosstalk',
        },
      ],
    }),
    // No issues.
    makePlate('MOCK-2', 2, true, { weakWells: false, controlsChecked: true }),
    // Imported before quality checks: not checked until "Check quality".
    makePlate('MOCK-3', 3, false, null),
  ]
}

function qualityReport(p: MockPlate): PlateQuality | null {
  if (!p.qualityOptions) return null
  const ladder = LADDERS.find((l) => l.id === p.summary.ladder_id)
  return mockQualityReport(
    p.wells.map((w) => ({ label: w.label, sized: w.sizing !== 'failed', sizingQuality: w.quality, signal: w.signal })),
    { seed: p.summary.id, ladderColor: ladder?.spec.color ?? 'orange', ...p.qualityOptions },
  )
}

const CONTAMINATION = 500

function runSummaries(p: MockPlate, w: MockWellState, color: Color): RunSummary[] {
  const hot = contaminatedLoci(p)
  return w.runs
    .map((r) => ({ r, l: LOCI.find((l) => l.id === r.locus) as Locus }))
    .filter(({ l }) => l.color === color)
    .map(({ r, l }) => {
      const designation = samples.get(r.sample) ?? 'sample'
      const max = w.sizing === 'failed' ? null : (w.signal[color] ?? null)
      return {
        id: w.id * 100 + l.id,
        locus_id: l.id,
        locus_label: l.label,
        sample_id: 1,
        sample_barcode: r.sample,
        designation,
        max_signal: max,
        contaminated: designation === 'negative_control' && (max ?? 0) > CONTAMINATION,
        locus_contaminated: hot.has(l.id),
      }
    })
}

function contaminatedLoci(p: MockPlate): Set<number> {
  const out = new Set<number>()
  for (const w of p.wells)
    for (const r of w.runs) {
      const l = LOCI.find((x) => x.id === r.locus) as Locus
      if (samples.get(r.sample) === 'negative_control' && (w.signal[l.color] ?? 0) > CONTAMINATION && w.sizing !== 'failed') out.add(l.id)
    }
  return out
}

function summary(p: MockPlate): PlateSummary {
  const sizing = { good: 0, flagged: 0, unusable: 0, failed: 0 }
  for (const w of p.wells) sizing[w.sizing]++
  const runCount = p.wells.reduce((n, w) => n + w.runs.length, 0)
  const hot = contaminatedLoci(p)
  return {
    ...p.summary,
    ladder_label: LADDERS.find((l) => l.id === p.summary.ladder_id)?.label ?? '?',
    well_count: p.wells.length,
    sizing,
    has_plate_map: runCount > 0,
    run_count: runCount,
    contaminated_loci: LOCI.filter((l) => hot.has(l.id)).map((l) => l.label),
    quality: p.qualityOptions ? summarize(qualityReport(p)?.issues ?? []) : null,
  }
}

const COLORS: Color[] = ['blue', 'green', 'yellow', 'red', 'orange']

function wellSummary(p: MockPlate, w: MockWellState): WellSummary {
  return {
    id: w.id,
    label: w.label,
    sample_name: `S${w.label}`,
    sizing: w.sizing,
    sizing_quality: w.quality,
    sizing_error: w.error,
    sizing_reason: w.manual ? w.reason : autoReason(w),
    manual_ladder: w.manual,
    offscale_count: (w.signal.blue ?? 0) > 30000 ? 3 : 0,
    channels: COLORS.map((c, k) => ({
      id: w.id * 10 + k,
      color: c,
      max_signal: w.sizing === 'failed' ? null : (w.signal[c] ?? 1500),
      runs: runSummaries(p, w, c),
    })),
  }
}

function find(wellId: number): { p: MockPlate; w: MockWellState } {
  for (const p of plates) {
    const w = p.wells.find((x) => x.id === wellId)
    if (w) return { p, w }
  }
  throw new RpcError('not_found', `Well ${wellId} does not exist`)
}

function plateById(id: number): MockPlate {
  const p = plates.find((x) => x.summary.id === id)
  if (!p) throw new RpcError('not_found', `Plate ${id} does not exist`)
  return p
}

function wellDetail(p: MockPlate, w: MockWellState, traces: boolean): WellDetail {
  const gen = makeWell(w.seed % 997)
  const ladder = LADDERS.find((l) => l.id === p.summary.ladder_id) as Ladder
  const auto = ladderIndices(w.seed % 997)
  const ladderPeaks: LadderPeak[] =
    w.sizing === 'failed'
      ? []
      : (w.peaks ??
        auto.map((i, k) => ({ index: i, size: ladder.spec.base_sizes[Math.min(k, ladder.spec.base_sizes.length - 1)] as number })))
  const ws = wellSummary(p, w)
  // A failed well's ladder is weak; it stays weak when its peaks are picked by hand.
  const scale = w.auto.quality == null ? 0.12 : 1
  return {
    id: w.id,
    plate_id: p.summary.id,
    plate_label: p.summary.label,
    label: w.label,
    sample_name: ws.sample_name,
    ladder: { id: ladder.id, label: ladder.label, color: ladder.spec.color },
    sizing: w.sizing,
    sizing_quality: w.quality,
    sizing_error: w.error,
    sizing_reason: ws.sizing_reason,
    manual_ladder: w.manual,
    ladder_peaks: ladderPeaks,
    // A failed mock well's ladder stops after seven peaks (like the engine's demo).
    ladder_candidates: traces
      ? (w.auto.quality == null ? auto.slice(0, 7) : auto).map((i) => ({ index: i, height: Math.round(1000 * scale) }))
      : null,
    offscale_indices: [],
    trace_len: gen.baseSizes.length,
    base_sizes: traces && w.sizing !== 'failed' ? Array.from(gen.baseSizes) : null,
    channels: ws.channels.map((c, k) => {
      const s = gen.series.find((x) => x.color === c.color)
      return {
        id: c.id,
        color: c.color,
        dye_number: k + 1,
        dye_name: c.color === 'orange' ? 'LIZ' : null,
        wavelength: null,
        max_signal: c.max_signal,
        trace: traces && s ? Array.from(s.data, (v) => Math.round(c.color === 'orange' ? v * scale : v)) : null,
        runs: c.runs,
      }
    }),
  }
}

function report(
  p: MockPlate,
  params: ApplyPlateMapParams,
): { report: PlateMapReport; cells: { well: string; locus: number; sample: string }[] } {
  const text = params.content ?? ''
  const parsed = parsePlateMap(text)
  const r: PlateMapReport = {
    applied: false,
    problems: [],
    unknown_samples: [],
    unknown_loci: [],
    created_samples: [],
    run_count: 0,
    runs_kept: 0,
    runs_removed: 0,
  }
  if (params.path && !params.content) r.problems.push('Mock transport cannot read files by path; paste the CSV instead.')
  if (parsed.error) r.problems.push(parsed.error)
  const cols = parsed.loci.map((h) => LOCI.find((l) => l.label.toLowerCase() === h.toLowerCase()) ?? null)
  r.unknown_loci = parsed.loci.filter((_, i) => !cols[i])
  if (r.unknown_loci.length) r.problems.push(`Unknown loci in the header: ${r.unknown_loci.join(', ')}. Create them first.`)
  const cells: { well: string; locus: number; sample: string }[] = []
  const missing: string[] = []
  for (const row of parsed.rows) {
    if (!p.wells.some((w) => w.label === row.well)) {
      missing.push(row.well)
      continue
    }
    row.cells.forEach((b, i) => {
      const l = cols[i]
      if (l && b) cells.push({ well: row.well, locus: l.id, sample: b })
    })
  }
  if (missing.length) r.problems.push(`Wells not on this plate: ${missing.join(', ')}`)
  const unknown = [...new Set(cells.map((c) => c.sample).filter((s) => !samples.has(s)))]
  r.unknown_samples = unknown
  if (params.create_samples)
    r.created_samples = unknown.map((b) => ({ barcode: b, designation: /ntc/i.test(b) ? 'negative_control' : 'sample' }))
  else if (unknown.length)
    r.problems.push(
      `Unknown samples (${unknown.length}): ${unknown.slice(0, 10).join(', ')}. Turn on "create missing samples" to add them.`,
    )
  r.run_count = cells.length
  const existing = p.wells.flatMap((w) => w.runs.map((x) => `${w.label}|${x.locus}|${x.sample}`))
  const wanted = new Set(cells.map((c) => `${c.well}|${c.locus}|${c.sample}`))
  r.runs_kept = existing.filter((e) => wanted.has(e)).length
  r.runs_removed = existing.length - r.runs_kept
  // Like the engine: well order, then locus label; a changed cell is its old run removed, then the new one.
  const assignments: PlateMapAssignment[] = []
  const sampleId = (b: string) => (samples.has(b) ? [...samples.keys()].indexOf(b) + 1 : null)
  const byLabel = [...LOCI].sort((a, b) => a.label.localeCompare(b.label))
  for (const w of p.wells)
    for (const l of byLabel) {
      const old = w.runs.find((x) => x.locus === l.id)
      const cell = cells.find((c) => c.well === w.label && c.locus === l.id)
      const row = (barcode: string, change: PlateMapAssignment['change']): PlateMapAssignment => ({
        well: w.label,
        locus_id: l.id,
        locus_label: l.label,
        barcode,
        sample_id: sampleId(barcode),
        change,
        creates_sample: change === 'new' && !samples.has(barcode) && !!params.create_samples,
      })
      if (old && cell && old.sample === cell.sample) assignments.push(row(old.sample, 'unchanged'))
      else {
        if (old) assignments.push(row(old.sample, 'removed'))
        if (cell) assignments.push(row(cell.sample, 'new'))
      }
    }
  r.assignments = assignments
  return { report: r, cells }
}

const handlers: Record<string, MockHandler> = {
  list_ladders: () => {
    ensure()
    return LADDERS.map((l) => ({ ...l, plate_count: plates.filter((p) => p.summary.ladder_id === l.id).length }))
  },
  list_loci: () => LOCI,
  list_plates: () => {
    ensure()
    return [...plates].reverse().map(summary)
  },
  get_plate: (params) => {
    ensure()
    const p = plateById((params as IdParams).id)
    const hot = contaminatedLoci(p)
    const detail: PlateDetail = {
      plate: summary(p),
      wells: p.wells.map((w) => wellSummary(p, w)),
      loci: LOCI.filter((l) => p.wells.some((w) => w.runs.some((r) => r.locus === l.id))).map((l) => ({
        locus_id: l.id,
        label: l.label,
        color: l.color,
        run_count: p.wells.filter((w) => w.runs.some((r) => r.locus === l.id)).length,
        contaminated: hot.has(l.id),
      })),
    }
    return detail
  },
  get_plate_run_traces: (params) => {
    const p = plateById((params as IdParams).id)
    const r = rng(p.summary.id)
    const n = 400
    const series = (base: number, sd: number) =>
      Array.from({ length: n }, (_, i) => Math.round(base + r.gauss() * sd + (i < 20 ? -base * (1 - i / 20) * 0.5 : 0)))
    return { voltage: series(1500, 2), current: series(220, 3), power: series(330, 4), temperature: series(60, 0.2) }
  },
  get_well: (params) => {
    const p = params as GetWellParams
    const { p: plate, w } = find(p.id)
    return wellDetail(plate, w, p.traces ?? true)
  },
  get_channel_trace: (params) => {
    const id = (params as IdParams).id
    const { p, w } = find(Math.floor(id / 10))
    const d = wellDetail(p, w, true)
    const ch = d.channels.find((c) => c.id === id)
    if (!ch) throw new RpcError('not_found', `Channel ${id} does not exist`)
    return { channel_id: id, well_id: w.id, color: ch.color, trace: ch.trace ?? [], base_sizes: d.base_sizes }
  },
  preview_well_ladder_peaks: (params) => {
    const p = params as SetWellLadderPeaksParams
    const { w } = find(p.id)
    if (p.peak_indices == null && p.peaks == null) {
      const r = autoFit(w)
      return { sizing: stateOf(r.quality), sizing_quality: r.quality, reason: r.error ?? null, peaks: [] }
    }
    return mockFit(w, p)
  },
  set_well_ladder_peaks: (params, ctx: MockContext) => {
    const p = params as SetWellLadderPeaksParams
    const { p: plate, w } = find(p.id)
    if (p.peak_indices == null && p.peaks == null) {
      const r = autoFit(w)
      w.manual = false
      w.peaks = null
      w.quality = r.quality
      w.error = r.error
      w.reason = null
      w.sizing = stateOf(w.quality)
    } else {
      const fit = mockFit(w, p)
      if (fit.sizing === 'failed') throw new RpcError('invalid', `Cannot fit the ladder with these peaks: ${fit.reason}`)
      w.manual = true
      w.peaks = fit.peaks
      w.quality = fit.sizing_quality
      w.error = null
      w.reason = fit.reason
      w.sizing = fit.sizing
    }
    ctx.changed('plates', [plate.summary.id])
    ctx.changed('samples')
    return wellDetail(plate, w, false)
  },
  size_plate: async (params, ctx) => {
    const p = params as SizePlateParams
    const plate = plateById(p.id)
    await ctx.runTask('size_plate', `Sizing ${plate.summary.label}`, 1200)
    if (p.ladder_id != null) plate.summary.ladder_id = p.ladder_id
    for (const w of plate.wells) {
      w.manual = false
      w.peaks = null
    }
    ctx.changed('plates', [plate.summary.id])
    ctx.changed('ladders')
    return summary(plate)
  },
  delete_plate: (params, ctx) => {
    const id = (params as IdParams).id
    plateById(id)
    plates = plates.filter((p) => p.summary.id !== id)
    ctx.changed('plates', [id])
    ctx.changed('workspace')
    return null
  },
  import_plates: async (params, ctx) => {
    ensure()
    const p = params as ImportPlatesParams
    await ctx.runTask('import_plates', `Importing ${p.paths.length} item${p.paths.length === 1 ? '' : 's'}`, 1500 + 300 * p.paths.length)
    const outcomes: PlateImportOutcome[] = p.paths.map((path, i) => {
      const name = (path.split('/').pop() ?? path).replace(/\.(zip|fsa)$/i, '')
      if (/fail/i.test(name))
        return {
          label: name,
          source: path,
          status: 'failed',
          plate_id: null,
          well_count: 0,
          sizing: null,
          message: 'not an FSA file (bad ABIF header)',
          quality: null,
        }
      if (plates.some((x) => x.summary.label === name))
        return {
          label: name,
          source: path,
          status: 'duplicate',
          plate_id: null,
          well_count: 96,
          sizing: null,
          message: `already imported as ${name}`,
          quality: null,
        }
      // A file name with "spectral" gives a plate whose dyes are not separated in two capillaries.
      const plate = makePlate(name, 10 + plates.length + i, false, /spectral/i.test(name) ? { unseparated: ['B03', 'B04'] } : {})
      plate.summary.ladder_id = p.ladder_id
      plates.push(plate)
      ctx.changed('plates', [plate.summary.id])
      const s = summary(plate)
      return {
        label: name,
        source: path,
        status: 'imported',
        plate_id: plate.summary.id,
        well_count: 96,
        sizing: s.sizing,
        message: null,
        quality: s.quality,
      }
    })
    ctx.changed('workspace')
    return { plates: outcomes }
  },
  apply_plate_map: (params, ctx) => {
    const p = params as ApplyPlateMapParams
    const plate = plateById(p.plate_id)
    const { report: r, cells } = report(plate, p)
    if (p.dry_run) return r
    if (r.problems.length) throw new RpcError('invalid', `The plate map was not applied: ${r.problems.join('; ')}`)
    for (const c of r.created_samples) samples.set(c.barcode, c.designation === 'negative_control' ? 'negative_control' : 'sample')
    for (const w of plate.wells) w.runs = cells.filter((c) => c.well === w.label).map((c) => ({ locus: c.locus, sample: c.sample }))
    ctx.changed('plates', [plate.summary.id])
    ctx.changed('samples')
    return { ...r, applied: true }
  },
  clear_plate_map: (params, ctx) => {
    const plate = plateById((params as IdParams).id)
    for (const w of plate.wells) w.runs = []
    ctx.changed('plates', [plate.summary.id])
    return null
  },
  get_plate_quality: (params) => {
    ensure()
    const p = plateById((params as IdParams).id)
    const report = qualityReport(p)
    const s = summary(p)
    const view: PlateQualityView = {
      plate_id: p.summary.id,
      plate_label: p.summary.label,
      instrument: p.summary.instrument,
      instrument_model: p.summary.instrument_model,
      run_date: p.summary.run_date,
      computed_at: report ? p.computedAt : null,
      report,
      summary: s.quality,
    }
    return view
  },
  compute_plate_quality: async (params, ctx) => {
    ensure()
    const ids = (params as ComputePlateQualityParams | null)?.ids
    const todo = ids ? ids.map(plateById) : plates.filter((p) => !p.qualityOptions)
    await ctx.runTask(
      'compute_plate_quality',
      `Checking quality of ${todo.length} plate${todo.length === 1 ? '' : 's'}`,
      600 + 300 * todo.length,
    )
    for (const p of todo) {
      p.qualityOptions ??= {}
      p.computedAt = new Date().toISOString().slice(0, 19) + 'Z'
    }
    if (todo.length)
      ctx.changed(
        'plates',
        todo.map((p) => p.summary.id),
      )
    return { plate_ids: todo.map((p) => p.summary.id) }
  },
  export_plate_quality: (params) => {
    const p = plateById((params as IdParams).id)
    const q = qualityReport(p)
    if (!q) throw new RpcError('invalid', `${p.summary.label} has no quality report yet: check its quality first.`)
    const head = [
      'plate',
      'well',
      'capillary',
      'ladder_height',
      'ladder_fade',
      'plate_error',
      'signal',
      'max_noise_sd',
      'tall_peaks',
      'breakdowns',
      'spectral_deviation',
      'offscale_points',
      'flags',
    ]
    const rows = q.wells.map((w) =>
      [
        p.summary.label,
        w.well,
        w.capillary ?? '',
        w.ladder_height?.toFixed(0) ?? '',
        w.ladder_fade?.toFixed(3) ?? '',
        w.plate_error?.toFixed(3) ?? '',
        w.signal?.toFixed(0) ?? '',
        Math.max(...w.dyes.map((d) => d.noise_sd)).toFixed(2),
        w.tall_peaks,
        w.breakdowns,
        w.spectral_deviation?.toFixed(4) ?? '',
        w.offscale_points,
        w.flags.join(' '),
      ].join(','),
    )
    return { filename: `${p.summary.label}_quality.csv`, content: `${[head.join(','), ...rows].join('\n')}\n` }
  },
  export_plate_map: (params) => {
    const plate = plateById((params as IdParams).id)
    const used = LOCI.filter((l) => plate.wells.some((w) => w.runs.some((r) => r.locus === l.id)))
    const lines = [['Well', ...used.map((l) => l.label)].join(',')]
    for (const w of plate.wells) lines.push([w.label, ...used.map((l) => w.runs.find((r) => r.locus === l.id)?.sample ?? '')].join(','))
    return { filename: `${plate.summary.label}_plate_map.csv`, content: `${lines.join('\n')}\n` }
  },
}

registerMocks(handlers)
