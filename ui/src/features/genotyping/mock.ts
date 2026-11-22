/**
 * Mock genotyping data (`pnpm dev:mock`, `?mock`): a small polyclonal study
 * on the mock "Demo panel" (loci 1–4). 36 samples with 1–5 clones at
 * unequal proportions plus two negative controls, synthetic traces with
 * stutter, a pull-up peak, a failed sample, a five-allele sample, and a
 * minor allele sitting exactly on the −1 repeat stutter of a major one.
 * Calling follows the engine's rules (flags, then callable peaks in bins;
 * the probabilistic pass re-calls from probabilities and keeps manual calls).
 *
 * Call rows carry what the engine's do: allele sizes, shares and
 * probabilities, narrow misses (the engine's rule), the reference well,
 * run count and the review mark (a key over reference run, alleles and
 * flags, so a changed call reads unreviewed). Every fifth sample was run
 * again on a second plate (and MX-004 on a third), with its own trace and
 * wells whose other dyes can be overlaid, so the run and dye overlays work
 * in mock mode.
 */
import type {
  Bin,
  CallParams,
  ChannelTrace,
  GetWellParams,
  NarrowMiss,
  SampleRunView,
  SetCallReviewedParams,
  SetCallsReviewedParams,
  WellDetail,
  CallRow,
  ExportParams,
  GenotypingParams,
  GenotypingSummary,
  IdParams,
  Locus,
  LocusCalls,
  Peak,
  ProjectLocusParams,
  ProjectSampleParams,
  SampleCalls,
  SampleLocusCallView,
  SetCallCommentParams,
  ToggleAlleleParams,
} from '@/api/bindings'
import { makePeak } from '@/api/helpers'
import { getMock, registerMocks, type MockHandler } from '@/api/mock/registry'
import { RpcError } from '@/api/transport'
import { DEMO_LOCI, rng } from '@/mock/data'
import {
  createMockProject,
  effectiveParams,
  getProject,
  locusStatus,
  markAnalyzed,
  nowIso,
  onMockProjectDeleted,
  probFingerprint,
  probStatus,
  projectLoci,
  registerMockAnalyzer,
  registerMockSeed,
  registerMockSampleRemover,
  type MockProject,
} from '@/features/projects-shared/mock'

// ------------------------------------------------------------------ data

const LOCI = DEMO_LOCI.map((l, i) => ({ id: i + 1, label: l.label, color: l.color, range: l.range, repeat: l.repeat }))
type L = (typeof LOCI)[number]

let binSeq = 5000
const BINS = new Map<number, Bin[]>(
  LOCI.map((l) => {
    const bins: Bin[] = []
    for (let bp = l.range[0] + 3; bp <= l.range[1] - 3; bp += l.repeat) bins.push({ id: binSeq++, label: String(Math.round(bp)), base_size: bp, bin_buffer: 0.75, peak_count: 40 })
    return [l.id, bins]
  }),
)

interface Clone {
  weight: number
  alleles: Record<number, number> // locus id -> bin index
}
interface MockSampleDef {
  id: number
  barcode: string
  designation: 'sample' | 'negative_control'
  clones: Clone[]
  scale: number
  failLocus?: number
  pullup?: number
}

const SAMPLES: MockSampleDef[] = []
;(function seed() {
  const r = rng(424242)
  const pick = (n: number) => Math.floor(r.next() * n)
  for (let i = 1; i <= 36; i++) {
    const u = r.next()
    let k = u < 0.38 ? 1 : u < 0.68 ? 2 : u < 0.88 ? 3 : 4
    if (i === 5) k = 5
    const clones: Clone[] = []
    for (let c = 0; c < k; c++) {
      const alleles: Record<number, number> = {}
      for (const l of LOCI) alleles[l.id] = Math.min((BINS.get(l.id)?.length ?? 1) - 1, 1 + pick(8) + (l.id % 2))
      clones.push({ weight: c === 0 ? 1 : 0.08 + r.next() * 0.55, alleles })
    }
    if (i === 5) clones.forEach((c, j) => (c.alleles[1] = 1 + j * 2)) // five distinct alleles at PfPK2
    if (i === 3) {
      // Minor clone exactly one repeat below the major at PfPK2.
      clones.length = 0
      clones.push({ weight: 1, alleles: { 1: 6, 2: 3, 3: 4, 4: 2 } }, { weight: 0.16, alleles: { 1: 5, 2: 5, 3: 4, 4: 6 } })
    }
    SAMPLES.push({
      id: 900000 + i,
      barcode: `MX-${String(i).padStart(3, '0')}`,
      designation: 'sample',
      clones,
      scale: 3500 + r.next() * 9000,
      failLocus: i === 7 ? 2 : i === 22 ? 4 : undefined,
      pullup: i === 9 ? 1 : undefined,
    })
  }
  for (let j = 1; j <= 2; j++) SAMPLES.push({ id: 900100 + j, barcode: `MX-NTC-${j}`, designation: 'negative_control', clones: [], scale: 0 })
})()
const SAMPLE_BY_ID = new Map(SAMPLES.map((s) => [s.id, s]))

interface Trace {
  trace: number[]
  base_sizes: number[]
  peaks: Peak[]
}
const traceCache = new Map<string, Trace>()

/** Runs of a sample at every locus: 1, 2 for every fifth sample (a re-run on plate MOCK-2), 3 for MX-004. */
function runsOf(s: MockSampleDef): number {
  if (s.designation !== 'sample') return 1
  const i = s.id - 900000
  return i === 4 ? 3 : i % 5 === 2 ? 2 : 1
}

/**
 * Synthetic run `k` of one sample at one locus: rendered trace and its peaks
 * with artifact expectations. Re-runs (k > 0) have the same alleles at a
 * different signal level, with their own noise.
 */
function runOf(s: MockSampleDef, l: L, k = 0): Trace {
  const key = `${s.id}:${l.id}:${k}`
  const hit = traceCache.get(key)
  if (hit) return hit
  const r = rng(s.id * 31 + l.id + k * 7919)
  const bins = BINS.get(l.id) ?? []
  const lo = l.range[0] - 15
  const hi = l.range[1] + 15
  const step = 0.05
  const n = Math.round((hi - lo) / step)
  const sizes = Array.from({ length: n }, (_, i) => +(lo + i * step).toFixed(2))
  const total = s.clones.reduce((a, c) => a + c.weight, 0) || 1
  // A failed locus failed on the first plate only; re-runs come out at 45% and 160% of the signal.
  const fail = s.failLocus === l.id && k === 0 ? 0.03 : k === 1 ? 0.45 : k === 2 ? 1.6 : 1
  // True alleles (merge clones sharing one).
  const alleles = new Map<number, number>()
  for (const c of s.clones) {
    const b = bins[c.alleles[l.id] ?? 0]
    if (!b) continue
    alleles.set(b.base_size, (alleles.get(b.base_size) ?? 0) + (s.scale * c.weight * fail) / total)
  }
  const comps: { bp: number; h: number }[] = []
  for (const [bp, h] of alleles) {
    const off = r.gauss() * 0.08
    comps.push({ bp: bp + off, h })
    comps.push({ bp: bp + off - l.repeat, h: h * 0.09 })
    comps.push({ bp: bp + off - 2 * l.repeat, h: h * 0.015 })
    comps.push({ bp: bp + off + l.repeat, h: h * 0.02 })
  }
  for (let k = 0; k < 3; k++) comps.push({ bp: l.range[0] + r.next() * (l.range[1] - l.range[0]), h: 30 + r.next() * 60 })
  if (s.pullup === l.id && k === 0) comps.push({ bp: (bins[3]?.base_size ?? l.range[0] + 10) + 0.2, h: 520 })
  const data = new Array<number>(n).fill(0)
  const sd = 0.33
  for (const c of comps) {
    const i0 = Math.max(0, Math.floor((c.bp - lo - 4 * sd) / step))
    const i1 = Math.min(n - 1, Math.ceil((c.bp - lo + 4 * sd) / step))
    for (let i = i0; i <= i1; i++) data[i]! += c.h * Math.exp(-0.5 * (((sizes[i] as number) - c.bp) / sd) ** 2)
  }
  for (let i = 0; i < n; i++) data[i] = Math.max(0, Math.round((data[i] as number) + 12 + r.gauss() * 4))
  // Peaks: local maxima above 25 RFU.
  const raw: { index: number; size: number; height: number }[] = []
  for (let i = 3; i < n - 3; i++) {
    const v = data[i] as number
    if (v < 25) continue
    let max = true
    for (let k = -3; k <= 3; k++) if (k !== 0 && (data[i + k] as number) > v) max = false
    if (max && (raw.length === 0 || i - raw[raw.length - 1]!.index > 8)) raw.push({ index: i, size: sizes[i] as number, height: v })
  }
  const tallest = Math.max(1, ...raw.map((p) => p.height))
  const peaks = raw.map((p) => {
    let ac = 0
    let err = 0
    for (const q of raw) {
      if (q === p) continue
      const d = p.size - q.size
      if (Math.abs(d + l.repeat) < 0.8) {
        ac += 0.085 * q.height
        err += 0.025 * q.height
      } else if (Math.abs(d + 2 * l.repeat) < 0.8) {
        ac += 0.014 * q.height
        err += 0.006 * q.height
      } else if (Math.abs(d - l.repeat) < 0.8) {
        ac += 0.019 * q.height
        err += 0.007 * q.height
      }
    }
    if (p.height === tallest) {
      ac += 2
      err += 3
    }
    const near = bins.reduce<Bin | null>((best, b) => (Math.abs(b.base_size - p.size) < Math.abs((best?.base_size ?? Infinity) - p.size) ? b : best), null)
    const dist = near ? Math.abs(near.base_size - p.size) : Infinity
    const pull = s.pullup === l.id && k === 0 && near && Math.abs(p.size - (bins[3]?.base_size ?? 0) - 0.2) < 0.3
    return makePeak({
      index: p.index,
      size: p.size,
      height: p.height,
      area: p.height * 9,
      relative_height: p.height / tallest,
      bin_id: near && dist <= 2 * near.bin_buffer ? near.id : null,
      bin_label: near && dist <= 2 * near.bin_buffer ? near.label : null,
      in_bin: !!near && dist <= near.bin_buffer,
      artifact_contribution: ac,
      artifact_error: err,
      bleedthrough_ratio: pull ? 4.2 : 0.04 + r.next() * 0.1,
      crosstalk_ratio: 0.02 + r.next() * 0.05,
    })
  })
  const t = { trace: data, base_sizes: sizes, peaks }
  traceCache.set(key, t)
  return t
}

// ------------------------------------------------------------------ runs, channels, wells

/** Mock plates the runs sit on (MOCK-1 holds every reference run). */
const MOCK_PLATE_ID = 970000
const RUN_BASE = 50_000_000
const CHANNEL_BASE = 60_000_000
const WELL_BASE = 70_000_000
const runId = (sid: number, lid: number, k: number) => RUN_BASE + (sid - 900000) * 100 + lid * 10 + k
const channelId = (sid: number, lid: number, k: number) => CHANNEL_BASE + (sid - 900000) * 100 + lid * 10 + k
const wellId = (sid: number, k: number) => WELL_BASE + (sid - 900000) * 10 + k

function decodeChannel(id: number): { s: MockSampleDef; l: L; k: number } | null {
  if (id < CHANNEL_BASE || id >= WELL_BASE) return null
  const x = id - CHANNEL_BASE
  const s = SAMPLE_BY_ID.get(900000 + Math.floor(x / 100))
  const l = LOCI.find((q) => q.id === Math.floor((x % 100) / 10))
  return s && l ? { s, l, k: x % 10 } : null
}

const GRID_LO = Math.min(...LOCI.map((l) => l.range[0])) - 15
const GRID_HI = Math.max(...LOCI.map((l) => l.range[1])) + 15
const GRID = Array.from({ length: Math.round((GRID_HI - GRID_LO) / 0.05) }, (_, i) => +(GRID_LO + i * 0.05).toFixed(2))

/** Every dye of a mock well: each locus's run placed on one size grid, a little spectral overlap, and the pull-up source. */
function mockWell(id: number): WellDetail | null {
  if (id < WELL_BASE || id >= WELL_BASE + 10_000_000) return null
  const x = id - WELL_BASE
  const s = SAMPLE_BY_ID.get(900000 + Math.floor(x / 10))
  const k = x % 10
  if (!s) return null
  const r = rng(id)
  const colors = [...new Set(LOCI.map((l) => l.color))]
  const own = new Map(colors.map((c) => [c, GRID.map(() => Math.max(0, Math.round(10 + r.gauss() * 3)))]))
  for (const l of LOCI) {
    const t = runOf(s, l, k)
    const tr = own.get(l.color)!
    t.base_sizes.forEach((bp, i) => {
      const j = Math.round((bp - GRID_LO) / 0.05)
      if (j >= 0 && j < tr.length) tr[j] = Math.max(tr[j]!, t.trace[i]!)
    })
  }
  if (s.pullup != null && k === 0) {
    // The strong peak in another dye that shows up as pull-up at the pull-up locus.
    const l = LOCI.find((q) => q.id === s.pullup)!
    const bp = (BINS.get(l.id)?.[3]?.base_size ?? l.range[0] + 10) + 0.2
    const src = own.get(colors.find((c) => c !== l.color)!)!
    GRID.forEach((g, j) => (src[j] = src[j]! + Math.round(2200 * Math.exp(-0.5 * ((g - bp) / 0.33) ** 2))))
  }
  const channels = colors.map((c, i) => {
    const mine = own.get(c)!
    const trace = mine.map((v, j) => Math.round(v + 0.02 * colors.reduce((a, o) => (o === c ? a : a + (own.get(o)![j] ?? 0)), 0)))
    return { id: id * 10 + i, color: c, dye_number: i + 1, dye_name: `Dye ${i + 1} (${c})`, wavelength: null, max_signal: Math.max(...trace), trace, runs: [] }
  })
  return {
    id,
    plate_id: MOCK_PLATE_ID + k,
    plate_label: `MOCK-${k + 1}`,
    label: wellOf(s.id),
    sample_name: s.barcode,
    ladder: { id: 1, label: 'Mock ladder', color: 'orange' },
    sizing: 'good',
    sizing_quality: 0.99,
    sizing_error: null,
    manual_ladder: false,
    ladder_peaks: [],
    offscale_indices: [],
    trace_len: GRID.length,
    base_sizes: GRID,
    channels,
  }
}

// ------------------------------------------------------------------ calls

interface StoredCall {
  sample_id: number
  locus_id: number
  reference_run_id: number | null
  peaks: Peak[]
  alleles: Set<number>
  failure: boolean
  offscale: boolean
  manual: boolean
  comment: string | null
  /** Review key stored when marked reviewed (see `reviewKey`). */
  reviewed: string | null
}
const calls = new Map<number, Map<string, StoredCall>>()
const callsOf = (pid: number) => {
  let m = calls.get(pid)
  if (!m) calls.set(pid, (m = new Map()))
  return m
}

/** Engine `spectral_breakdown`: another dye far below its baseline under a peak. */
function spectralBreakdown(p: Peak): boolean {
  return p.spectral_dip_ratio > 0.25 * Math.max(p.bleedthrough_ratio, 1) && p.spectral_dip_ratio * p.height >= 150
}

function flag(peaks: Peak[], g: GenotypingParams) {
  for (const p of peaks) {
    let bleedthrough = p.bleedthrough_ratio > g.bleedthrough_filter_limit
    if (g.measured_pullup && p.pullup_contribution != null && p.pullup_error != null) {
      const bound = p.pullup_contribution + g.pullup_sd_limit * p.pullup_error
      const hit =
        p.height - p.artifact_contribution >= g.absolute_peak_height_limit
          ? (bound > 0 && p.height - p.artifact_contribution <= bound) || (p.pullup_contribution > 0 && p.height - p.pullup_contribution < g.absolute_peak_height_limit)
          : bound > 0 && p.height <= bound
      bleedthrough = hit || p.fallback_bleedthrough_ratio > g.bleedthrough_filter_limit
    }
    p.flags = {
      below_relative_threshold: p.relative_height < g.relative_peak_height_limit,
      artifact: p.height - p.artifact_contribution - p.artifact_error * g.hard_artifact_sd_limit < g.absolute_peak_height_limit,
      bleedthrough,
      crosstalk: p.crosstalk_ratio > g.crosstalk_filter_limit,
      spectral: g.reject_spectral_breakdown && spectralBreakdown(p),
    }
  }
}
const callable = (p: Peak) => p.in_bin && p.bin_id != null && !(p.flags.artifact || p.flags.bleedthrough || p.flags.crosstalk || p.flags.below_relative_threshold)

/** Shares of the called signal: height minus expected artifact, over every called peak (as the engine). */
function quantify(c: StoredCall) {
  const signal = (p: Peak) => Math.max(0, p.height - p.artifact_contribution)
  const called = c.peaks.filter((p) => p.bin_id != null && c.alleles.has(p.bin_id))
  const sum = called.reduce((a, p) => a + signal(p), 0)
  for (const p of c.peaks) {
    const on = p.bin_id != null && c.alleles.has(p.bin_id)
    p.relative_quantification = on && sum ? signal(p) / sum : null
    p.corrected_relative_quantification = p.relative_quantification
  }
}

/** What a review mark confirms: reference run, called bins, flags. */
function reviewKey(c: StoredCall): string {
  return JSON.stringify([c.reference_run_id, [...c.alleles].sort((a, b) => a - b), c.failure, c.offscale, c.manual])
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4

/** The engine's narrow-miss rule (api/calls.rs `narrow_misses`). */
function narrowMisses(c: StoredCall, g: GenotypingParams, bins: readonly Bin[]): NarrowMiss[] {
  if (c.failure || c.reference_run_id == null) return []
  const by = new Map<number, { p: Peak; m: NarrowMiss }>()
  for (const p of c.peaks) {
    if (p.bin_id == null || !p.in_bin || c.alleles.has(p.bin_id)) continue
    const f = p.flags
    let hit: Pick<NarrowMiss, 'reason' | 'value' | 'limit'> | null = null
    if (f.artifact && !f.below_relative_threshold && !f.bleedthrough && !f.crosstalk) {
      const left = p.height - p.artifact_contribution - g.hard_artifact_sd_limit * p.artifact_error
      const limit = g.absolute_peak_height_limit
      const margin = Math.min(0.2 * limit, Math.max(0.1 * limit, p.artifact_error))
      if (left < limit && limit - left <= margin) hit = { reason: 'artifact', value: Math.round(left), limit }
    } else if (!(f.artifact || f.bleedthrough || f.crosstalk || f.below_relative_threshold) && p.probability != null) {
      const sds = (p.height - p.artifact_contribution) / Math.max(p.artifact_error, 1)
      if (p.probability >= 0.5 && p.probability < g.probability_threshold && sds <= g.soft_artifact_sd_limit) hit = { reason: 'probability', value: r4(p.probability), limit: g.probability_threshold }
    }
    if (!hit) continue
    const prev = by.get(p.bin_id)
    if (!prev || p.height > prev.p.height)
      by.set(p.bin_id, { p, m: { bin_id: p.bin_id, label: bins.find((b) => b.id === p.bin_id)?.label ?? '?', size: Math.round(p.size * 100) / 100, height: Math.round(p.height), ...hit } })
  }
  return [...by.values()].map((x) => x.m).sort((a, b) => a.size - b.size)
}

function callLocus(p: MockProject, l: L) {
  const params = effectiveParams(p, l.id)
  const g = params.genotyping!
  const m = callsOf(p.id)
  for (const sid of p.samples.keys()) {
    const s = SAMPLE_BY_ID.get(sid)
    const key = `${sid}:${l.id}`
    const prev = m.get(key)
    if (!s) {
      m.set(key, { sample_id: sid, locus_id: l.id, reference_run_id: null, peaks: [], alleles: new Set(), failure: false, offscale: false, manual: false, comment: prev?.comment ?? null, reviewed: prev?.reviewed ?? null })
      continue
    }
    const run = runOf(s, l)
    const peaks = run.peaks.filter((x) => x.height >= params.filter.min_peak_height && x.height <= params.filter.max_peak_height).map((x) => ({ ...x, flags: { ...x.flags }, probability: null }))
    flag(peaks, g)
    const failure = !peaks.some((x) => x.height > g.failure_threshold)
    const c: StoredCall = {
      sample_id: sid,
      locus_id: l.id,
      reference_run_id: sid * 10 + l.id,
      peaks,
      alleles: failure ? new Set() : new Set(peaks.filter(callable).map((x) => x.bin_id!)),
      failure,
      offscale: peaks.some((x) => x.height > g.offscale_threshold),
      manual: false,
      comment: prev?.comment ?? null,
      reviewed: prev?.reviewed ?? null,
    }
    quantify(c)
    m.set(key, c)
  }
}

registerMockAnalyzer('genotyping', async (p, locus) => {
  const l = LOCI.find((x) => x.id === locus.id)
  if (!l) return { locus_id: locus.id, locus_label: locus.label, run_count: 0, usable_runs: 0, summary: 'No runs at this locus.', warnings: ['No runs.'], ms: 1 }
  callLocus(p, l)
  const m = callsOf(p.id)
  const rows = [...p.samples.keys()].map((sid) => m.get(`${sid}:${l.id}`))
  const typed = rows.filter((c) => c && c.alleles.size).length
  return { locus_id: l.id, locus_label: l.label, run_count: p.samples.size, usable_runs: p.samples.size, summary: `${typed} of ${p.samples.size} samples typed`, warnings: [], ms: 12 }
})
registerMockSampleRemover('genotyping', (p, ids) => {
  const m = callsOf(p.id)
  for (const k of [...m.keys()]) if (ids.includes(Number(k.split(':')[0]))) m.delete(k)
})
onMockProjectDeleted((id) => calls.delete(id))

function wellOf(sid: number): string {
  const idx = SAMPLES.findIndex((x) => x.id === sid)
  return `${'ABCDEFGH'[idx % 8]}${String(Math.floor(idx / 8) + 1).padStart(2, '0')}`
}

function rowOf(p: MockProject, c: StoredCall): CallRow {
  const s = p.samples.get(c.sample_id)!
  const bins = BINS.get(c.locus_id) ?? []
  const g = effectiveParams(p, c.locus_id).genotyping!
  const alleles = bins
    .filter((b) => c.alleles.has(b.id))
    .map((b) => {
      const pk = c.peaks.filter((x) => x.bin_id === b.id).sort((x, y) => y.height - x.height)[0]
      if (!pk) return { bin_id: b.id, label: b.label }
      const share = c.peaks.filter((x) => x.bin_id === b.id).reduce((a, x) => a + (x.relative_quantification ?? 0), 0)
      return {
        bin_id: b.id,
        label: b.label,
        size: Math.round(pk.size * 100) / 100,
        proportion: r4(share),
        corrected_proportion: r4(share),
        ...(pk.probability != null ? { probability: r4(pk.probability) } : {}),
      }
    })
  const probs = alleles.map((a) => ('probability' in a ? a.probability : undefined)).filter((x): x is number => x != null)
  const narrow = narrowMisses(c, g, bins)
  const def = SAMPLE_BY_ID.get(c.sample_id)
  return {
    sample_id: c.sample_id,
    barcode: s.barcode,
    designation: s.designation,
    reference_run_id: c.reference_run_id,
    alleles,
    flags: { failure: c.failure, offscale: c.offscale, spectral: c.peaks.some((p) => p.in_bin && spectralBreakdown(p)), manual_curation: c.manual },
    moi: s.moi,
    comment: c.comment,
    peak_count: c.peaks.length,
    max_height: c.peaks.length ? Math.max(...c.peaks.map((x) => x.height)) : null,
    ...(probs.length ? { min_probability: Math.min(...probs) } : {}),
    ...(narrow.length ? { narrow_misses: narrow } : {}),
    ...(c.reference_run_id != null ? { plate_label: 'MOCK-1', well_label: wellOf(c.sample_id) } : {}),
    run_count: def ? runsOf(def) : 0,
    reviewed: c.reviewed != null && c.reviewed === reviewKey(c),
    ...(c.reviewed != null && c.reviewed !== reviewKey(c) ? { review_dropped: true } : {}),
  }
}

function getCall(pid: number, sid: number, lid: number): StoredCall {
  const c = callsOf(pid).get(`${sid}:${lid}`)
  if (!c) throw new RpcError('not_found', 'This sample has no call at this locus yet. Analyze the locus first.')
  return c
}

/** Simplified probabilistic pass: prevalence, MOI (second-largest count), probabilities from artifact SDs. */
function probabilities(p: MockProject) {
  const m = callsOf(p.id)
  const lociIds = LOCI.map((l) => l.id)
  const cand = (c: StoredCall) => c.peaks.filter(callable)
  for (const [sid, s] of p.samples) {
    if (s.designation !== 'sample') continue
    const counts = lociIds.map((lid) => {
      const c = m.get(`${sid}:${lid}`)
      return c && !c.failure ? cand(c).filter((x) => (x.height - x.artifact_contribution) / Math.max(x.artifact_error, 1) > 3).length : 0
    })
    s.moi = [...counts].sort((a, b) => b - a)[1] ?? 0
  }
  for (const c of m.values()) {
    const g = effectiveParams(p, c.locus_id).genotyping!
    for (const x of c.peaks) {
      if (!callable(x) || c.failure) {
        x.probability = 0
        continue
      }
      const z = (x.height - x.artifact_contribution) / Math.max(x.artifact_error, 1e-6)
      x.probability = Math.max(0, Math.min(1, 1 - Math.exp(-Math.max(0, z) * 0.9)))
    }
    if (!c.manual && !c.failure)
      c.alleles = new Set(
        c.peaks.filter((x) => callable(x) && ((x.probability ?? 0) >= g.probability_threshold || (x.height - x.artifact_contribution) / Math.max(x.artifact_error, 1) > g.soft_artifact_sd_limit)).map((x) => x.bin_id!),
      )
    quantify(c)
  }
  p.prob = { at: nowIso(), fp: probFingerprint(p) }
}

// ------------------------------------------------------------------ seed project

let seeded = false
async function seedProjects() {
  if (seeded) return
  seeded = true
  const common = { description: '', locus_set_id: 1, quant_bias_estimator_id: null, samples: new Map() } as const
  const bins = createMockProject({ ...common, kind: 'bin_estimator', title: 'Mock bins', description: 'Bins from every mock sample.', bin_estimator_id: null, artifact_estimator_id: null, all_samples: true, samples: new Map() })
  const art = createMockProject({ ...common, kind: 'artifact_estimator', title: 'Mock artifacts', description: 'Stutter model.', bin_estimator_id: bins.id, artifact_estimator_id: null, all_samples: true, samples: new Map() })
  for (const l of LOCI) {
    markAnalyzed(bins, l.id)
    markAnalyzed(art, l.id)
  }
  const geno = createMockProject({
    ...common,
    kind: 'genotyping',
    title: 'Mock genotyping',
    description: 'A small polyclonal study: 36 samples with 1–5 clones and two negative controls.',
    bin_estimator_id: bins.id,
    artifact_estimator_id: art.id,
    all_samples: false,
    samples: new Map(SAMPLES.map((s) => [s.id, { barcode: s.barcode, designation: s.designation, moi: null }])),
  })
  for (const l of LOCI) {
    callLocus(geno, l)
    markAnalyzed(geno, l.id)
  }
  probabilities(geno)
  // A comment and a curated call, so those states show up.
  const c = callsOf(geno.id).get(`900011:1`)
  if (c) c.comment = 'Re-run? Minor peak close to stutter.'
  // Some calls reviewed already, so progress and marks show from the start.
  for (const [k, call] of callsOf(geno.id)) if (call.locus_id === 1 && Number(k.split(':')[0]) <= 900012) call.reviewed = reviewKey(call)
  for (const [, call] of callsOf(geno.id)) if (call.locus_id === 2 && call.sample_id <= 900004) call.reviewed = reviewKey(call)
}
registerMockSeed(seedProjects)

const locusOf = (id: number): L => {
  const l = LOCI.find((x) => x.id === id)
  if (!l) throw new RpcError('not_found', `Locus ${id} does not exist`)
  return l
}

async function locusLabelMap(p: MockProject): Promise<Map<number, Locus>> {
  return new Map((await projectLoci(p)).map((l) => [l.id, l]))
}

function csv(rows: (string | number | null)[][]): string {
  return rows.map((r) => r.map((v) => (v == null ? '' : String(v))).join(',')).join('\n') + '\n'
}

function checkExport(p: MockProject, a: ExportParams) {
  if (a.allow_stale) return
  const bad = LOCI.filter((l) => locusStatus(p, l.id).state !== 'current').map((l) => `${l.label} (${locusStatus(p, l.id).state === 'stale' ? 'stale' : 'not analyzed'})`)
  if (bad.length) throw new RpcError('invalid', `Some loci need analysis: ${bad.join(', ')}. Analyze them, or export anyway with allow_stale.`)
  if (probStatus(p)?.state === 'stale') throw new RpcError('invalid', 'Peak probabilities are stale. Recalculate them, or export anyway with allow_stale.')
}

const handlers: Record<string, MockHandler> = {
  get_locus_bins: async (params) => {
    const a = params as ProjectLocusParams
    return { locus_id: a.locus_id, bins: BINS.get(a.locus_id) ?? [], status: { state: 'current', reasons: [], analyzed_at: nowIso() } }
  },
  get_locus_calls: async (params) => {
    const a = params as ProjectLocusParams
    const p = getProject(a.project_id)
    const l = (await locusLabelMap(p)).get(a.locus_id)
    if (!l) throw new RpcError('not_found', `Locus ${a.locus_id} is not in this project`)
    const m = callsOf(p.id)
    const rows = [...p.samples.keys()].map((sid) => m.get(`${sid}:${a.locus_id}`)).filter((c): c is StoredCall => !!c).map((c) => rowOf(p, c))
    const out: LocusCalls = {
      project_id: p.id,
      locus_id: a.locus_id,
      locus_label: l.label,
      status: locusStatus(p, a.locus_id),
      probabilities: probStatus(p),
      bins: BINS.get(a.locus_id) ?? [],
      rows: rows.sort((x, y) => x.barcode.localeCompare(y.barcode)),
    }
    return out
  },
  get_sample_locus_call: async (params) => {
    const a = params as CallParams
    const p = getProject(a.project_id)
    const l = locusOf(a.locus_id)
    const c = getCall(p.id, a.sample_id, a.locus_id)
    const s = SAMPLE_BY_ID.get(a.sample_id)
    const run = s ? runOf(s, l) : null
    const runs: SampleRunView[] =
      s && run && c.reference_run_id != null
        ? Array.from({ length: runsOf(s) }, (_, k) => {
            const t = runOf(s, l, k)
            const g = effectiveParams(p, l.id).genotyping!
            const peaks = k === 0 ? c.peaks : t.peaks.map((x) => ({ ...x, flags: { ...x.flags }, probability: null }))
            if (k > 0) flag(peaks, g)
            return {
              run_id: k === 0 ? c.reference_run_id! : runId(s.id, l.id, k),
              channel_id: channelId(s.id, l.id, k),
              well_id: wellId(s.id, k),
              plate_id: MOCK_PLATE_ID + k,
              plate_label: `MOCK-${k + 1}`,
              well_label: wellOf(s.id),
              sizing: 'good' as const,
              max_signal: Math.max(...t.trace),
              is_reference: k === 0,
              peaks,
            }
          })
        : []
    const view: SampleLocusCallView = {
      project_id: p.id,
      sample_id: a.sample_id,
      barcode: p.samples.get(a.sample_id)!.barcode,
      designation: p.samples.get(a.sample_id)!.designation,
      locus_id: l.id,
      locus_label: l.label,
      color: l.color,
      min_base_length: l.range[0],
      max_base_length: l.range[1],
      status: locusStatus(p, l.id),
      row: rowOf(p, c),
      peaks: c.peaks,
      bins: BINS.get(l.id) ?? [],
      reference: run && c.reference_run_id != null ? { run_id: c.reference_run_id, channel_id: channelId(a.sample_id, l.id, 0), color: l.color, trace: run.trace, base_sizes: run.base_sizes } : null,
      runs,
    }
    return view
  },
  get_project_sample_calls: async (params) => {
    const a = params as ProjectSampleParams
    const p = getProject(a.project_id)
    const s = p.samples.get(a.sample_id)
    if (!s) throw new RpcError('not_found', 'Sample not in project')
    const m = callsOf(p.id)
    const ls = await projectLoci(p)
    const counts = ls.map((l) => ({ l, c: m.get(`${a.sample_id}:${l.id}`) })).filter((x) => x.c && x.c.reference_run_id != null)
    const maxAlleles = counts.length ? Math.max(...counts.map((x) => x.c!.alleles.size)) : null
    const out: SampleCalls = {
      project_id: p.id,
      sample_id: a.sample_id,
      barcode: s.barcode,
      designation: s.designation,
      moi: s.moi,
      ...(maxAlleles != null
        ? { max_alleles: maxAlleles, max_alleles_loci: maxAlleles > 0 ? counts.filter((x) => x.c!.alleles.size === maxAlleles).map((x) => ({ locus_id: x.l.id, locus_label: x.l.label })) : [] }
        : {}),
      probabilities: probStatus(p),
      loci: ls.map((l) => {
        const c = m.get(`${a.sample_id}:${l.id}`)
        const bins = BINS.get(l.id) ?? []
        return {
          locus_id: l.id,
          locus_label: l.label,
          color: l.color,
          status: locusStatus(p, l.id),
          row: c ? rowOf(p, c) : null,
          called: c
            ? c.peaks
                .filter((x) => x.bin_id != null && c.alleles.has(x.bin_id))
                .map((x) => ({ bin_id: x.bin_id!, label: bins.find((b) => b.id === x.bin_id)?.label ?? '?', size: x.size, height: x.height, relative_quantification: x.relative_quantification, corrected_relative_quantification: x.corrected_relative_quantification, probability: x.probability }))
            : [],
        }
      }),
    }
    return out
  },
  toggle_allele: (params, ctx) => {
    const a = params as ToggleAlleleParams
    const p = getProject(a.project_id)
    if (!(BINS.get(a.locus_id) ?? []).some((b) => b.id === a.bin_id)) throw new RpcError('invalid', `Bin ${a.bin_id} is not a bin of this project's bin estimator at this locus.`)
    const c = getCall(p.id, a.sample_id, a.locus_id)
    if (c.alleles.has(a.bin_id)) c.alleles.delete(a.bin_id)
    else c.alleles.add(a.bin_id)
    c.manual = true
    quantify(c)
    ctx.changed('projects', [p.id])
    return rowOf(p, c)
  },
  set_call_comment: (params, ctx) => {
    const a = params as SetCallCommentParams
    const p = getProject(a.project_id)
    const c = getCall(p.id, a.sample_id, a.locus_id)
    c.comment = a.comment?.trim() || null
    ctx.changed('projects', [p.id])
    return rowOf(p, c)
  },
  set_call_reviewed: (params, ctx) => {
    const a = params as SetCallReviewedParams
    const p = getProject(a.project_id)
    const c = getCall(p.id, a.sample_id, a.locus_id)
    c.reviewed = a.reviewed ? reviewKey(c) : null
    ctx.changed('projects', [p.id])
    return rowOf(p, c)
  },
  set_calls_reviewed: (params, ctx) => {
    const a = params as SetCallsReviewedParams
    const p = getProject(a.project_id)
    const m = callsOf(p.id)
    const ids = a.sample_ids ?? [...p.samples.keys()]
    let updated = 0
    const missing: number[] = []
    for (const sid of ids) {
      const c = m.get(`${sid}:${a.locus_id}`)
      if (!c) {
        missing.push(sid)
        continue
      }
      c.reviewed = a.reviewed ? reviewKey(c) : null
      updated++
    }
    ctx.changed('projects', [p.id])
    return { updated, missing }
  },
  calculate_peak_probabilities: async (params, ctx) => {
    const a = params as { id: number }
    const p = getProject(a.id)
    const bad = LOCI.filter((l) => locusStatus(p, l.id).state !== 'current')
    if (bad.length) throw new RpcError('invalid', `Every locus must be current first: ${bad.map((l) => l.label).join(', ')}.`)
    await ctx.runTask('calculate_peak_probabilities', `Calculating peak probabilities for ${p.title}`, 1500)
    probabilities(p)
    ctx.changed('projects', [p.id])
    const counts = new Map<number, number>()
    for (const s of p.samples.values()) if (s.moi != null) counts.set(s.moi, (counts.get(s.moi) ?? 0) + 1)
    return { samples: p.samples.size, moi: [...counts].sort((x, y) => x[0] - y[0]).map(([moi, samples]) => ({ moi, samples })), manual_calls_kept: [...callsOf(p.id).values()].filter((c) => c.manual).length }
  },
  get_genotyping_summary: async (params) => {
    const p = getProject((params as IdParams).id)
    const m = callsOf(p.id)
    const trueIds = [...p.samples].filter(([, s]) => s.designation === 'sample').map(([id]) => id)
    const counts = new Map<number, number>()
    for (const id of trueIds) {
      const v = p.samples.get(id)!.moi
      if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    const moi = [...counts].sort((x, y) => x[0] - y[0]).map(([k, v]) => ({ moi: k, samples: v }))
    const n = moi.reduce((a, x) => a + x.samples, 0)
    const out: GenotypingSummary = {
      project_id: p.id,
      samples: trueIds.length,
      loci: (await projectLoci(p)).map((l) => {
        const rows = trueIds.map((id) => m.get(`${id}:${l.id}`)).filter((c): c is StoredCall => !!c)
        const typed = rows.filter((c) => c.alleles.size > 0).length
        const failed = rows.filter((c) => c.failure).length
        const noRun = rows.filter((c) => c.reference_run_id == null).length
        const all = [...p.samples.keys()].map((id) => m.get(`${id}:${l.id}`)).filter((c): c is StoredCall => !!c)
        return {
          calls: all.length,
          reviewed: all.filter((c) => c.reviewed != null && c.reviewed === reviewKey(c)).length,
          locus_id: l.id,
          locus_label: l.label,
          status: locusStatus(p, l.id),
          samples: rows.length,
          typed,
          failed,
          no_run: noRun,
          failure_rate: rows.length ? (failed + noRun) / rows.length : 0,
          alleles: (BINS.get(l.id) ?? []).map((b) => {
            const count = rows.filter((c) => c.alleles.has(b.id)).length
            return { bin_id: b.id, label: b.label, base_size: b.base_size, count, prevalence: typed ? count / typed : 0, estimated_prevalence: p.prob ? (typed ? Math.max(0, count / typed - 0.01) : 0) : null }
          }),
        }
      }),
      moi,
      mean_moi: n ? moi.reduce((a, x) => a + x.moi * x.samples, 0) / n : null,
      moi_source: probStatus(p)?.state === 'current' ? 'probabilistic' : 'allele counts',
      probabilities: probStatus(p) ?? { state: 'not_analyzed', reasons: [], analyzed_at: null },
    }
    return out
  },
  export_alleles_wide: async (params) => {
    const a = params as ExportParams
    const p = getProject(a.id)
    checkExport(p, a)
    const ls = await projectLoci(p)
    const m = callsOf(p.id)
    const rows: (string | null)[][] = [['Sample', ...ls.map((l) => l.label)]]
    for (const [sid, s] of p.samples) rows.push([s.barcode, ...ls.map((l) => (BINS.get(l.id) ?? []).filter((b) => m.get(`${sid}:${l.id}`)?.alleles.has(b.id)).map((b) => b.label).join(';'))])
    return { filename: `${p.title.replace(/\W+/g, '_')}_alleles.csv`, content: csv(rows) }
  },
  export_alleles_long: async (params) => {
    const a = params as ExportParams
    const p = getProject(a.id)
    checkExport(p, a)
    const ls = await projectLoci(p)
    const m = callsOf(p.id)
    const rows: (string | number | null)[][] = [['Sample', 'Locus', 'Allele', 'Size', 'Height', 'Proportion', 'Corrected Proportion', 'Probability', 'MOI', 'Reviewed']]
    for (const [sid, s] of p.samples)
      for (const l of ls) {
        const c = m.get(`${sid}:${l.id}`)
        if (!c) continue
        for (const b of BINS.get(l.id) ?? []) {
          if (!c.alleles.has(b.id)) continue
          const pk = c.peaks.find((x) => x.bin_id === b.id)
          rows.push([s.barcode, l.label, b.label, pk?.size.toFixed(2) ?? '', pk ? Math.round(pk.height) : '', pk?.relative_quantification?.toFixed(4) ?? '', pk?.corrected_relative_quantification?.toFixed(4) ?? '', pk?.probability?.toFixed(4) ?? '', s.moi, c.reviewed != null && c.reviewed === reviewKey(c) ? 'True' : 'False'])
        }
      }
    return { filename: `${p.title.replace(/\W+/g, '_')}_alleles_long.csv`, content: csv(rows) }
  },
  export_peak_data: async (params) => {
    const a = params as ExportParams
    const p = getProject(a.id)
    checkExport(p, a)
    const ls = await projectLoci(p)
    const m = callsOf(p.id)
    const rows: (string | number | null)[][] = [
      ['Sample', 'Locus', 'Peak Height', 'Relative Peak Height', 'Proportion', 'Corrected Proportion', 'Peak Size', 'Peak Area', 'Left Tail', 'Right Tail', 'Artifact Contribution', 'Artifact Error', 'In Bin', 'Called Allele', 'Allele Label', 'Bleedthrough Ratio', 'Crosstalk Ratio', 'Probability', 'Well', 'Artifact Flag', 'Below Relative Threshold Flag', 'Bleedthrough Flag', 'Crosstalk Flag', 'Height Share of All Peaks', 'Spectral Dip Ratio', 'Spectral Flag', 'Expected Pull-Up', 'Pull-Up Error'],
    ]
    const T = (b: boolean) => (b ? 'True' : 'False')
    for (const [sid, s] of p.samples) {
      const well = wellOf(sid)
      for (const l of ls) {
        const c = m.get(`${sid}:${l.id}`)
        if (!c || c.failure) continue
        const total = c.peaks.reduce((a, x) => a + x.height, 0)
        for (const x of c.peaks)
          rows.push([s.barcode, l.label, Math.round(x.height), x.relative_height.toFixed(4), x.relative_quantification?.toFixed(4) ?? 'NA', x.corrected_relative_quantification?.toFixed(4) ?? 'NA', x.size.toFixed(2), Math.round(x.area), 'NA', 'NA', x.artifact_contribution.toFixed(2), x.artifact_error.toFixed(2), T(x.in_bin), x.bin_id != null ? T(c.alleles.has(x.bin_id)) : '', x.bin_label ?? '', x.bleedthrough_ratio.toFixed(4), x.crosstalk_ratio.toFixed(4), x.probability?.toFixed(4) ?? 'NA', well, T(x.flags.artifact), T(x.flags.below_relative_threshold), T(x.flags.bleedthrough), T(x.flags.crosstalk), total ? (x.height / total).toFixed(4) : 'NA', x.spectral_dip_ratio.toFixed(4), T(x.flags.spectral), x.pullup_contribution?.toFixed(2) ?? 'NA', x.pullup_error?.toFixed(2) ?? 'NA'])
      }
    }
    return { filename: `${p.title.replace(/\W+/g, '_')}_peak_data.csv`, content: csv(rows) }
  },
}

// Channels and wells of the mock runs; anything else goes to the plates mock.
const plateChannelTrace = getMock('get_channel_trace')
const plateWell = getMock('get_well')
handlers.get_channel_trace = (params, ctx) => {
  const id = (params as IdParams).id
  const d = decodeChannel(id)
  if (!d) {
    if (!plateChannelTrace) throw new RpcError('not_found', `Channel ${id} does not exist`)
    return plateChannelTrace(params, ctx)
  }
  const t = runOf(d.s, d.l, d.k)
  const out: ChannelTrace = { channel_id: id, well_id: wellId(d.s.id, d.k), color: d.l.color, trace: t.trace, base_sizes: t.base_sizes }
  return out
}
handlers.get_well = (params, ctx) => {
  const a = params as GetWellParams
  const w = mockWell(a.id)
  if (!w) {
    if (!plateWell) throw new RpcError('not_found', `Well ${a.id} does not exist`)
    return plateWell(params, ctx)
  }
  return w
}

// Every handler first seeds the mock study (the shared ones do too).
const wrapped: Record<string, MockHandler> = {}
for (const [k, h] of Object.entries(handlers))
  wrapped[k] = async (params, ctx) => {
    await seedProjects()
    return h(params, ctx)
  }
registerMocks(wrapped)
