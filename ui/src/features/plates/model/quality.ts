/**
 * Plate quality: labels, sorting and formatting of the engine's quality
 * report (`get_plate_quality`), the pull-up and crosstalk tables, and the
 * per-well measures the plate grid can be colored by. Pure functions over
 * engine types, so they are unit-tested.
 *
 * The engine decides what is an issue and writes its text; this module only
 * presents it. The grid scales use the per-well limits each report carries
 * (`report.limits`), so they mark the same wells as the engine's flags.
 */
import type {
  Color,
  CrosstalkEstimate,
  Issue,
  IssueValue,
  LeakEstimate,
  PlateQuality,
  QualityLimits,
  QualitySummary,
  Severity,
  WellFlag,
  WellQuality,
} from '@/api/bindings'
import { COLORS } from '@/api/helpers'
import { rampColor, signalColor, DEFAULT_SIGNAL_SCALE, type WellDatum } from '@/components/PlateGrid'
import { countOf, fmtNumber, fmtRfu } from '@/lib/format'
import type { Tone } from './status'

// ------------------------------------------------------------------ severity

export const SEVERITIES: readonly Severity[] = ['problem', 'warning', 'info']

export const SEVERITY_LABEL: Record<Severity, string> = { problem: 'Problem', warning: 'Warning', info: 'Note' }

export const SEVERITY_TONE: Record<Severity, Tone> = { problem: 'danger', warning: 'warn', info: 'neutral' }

const RANK: Record<Severity, number> = { info: 1, warning: 2, problem: 3 }

/** Issues worst first; issues of one severity keep the engine's order. */
export function sortIssues(issues: readonly Issue[]): Issue[] {
  return issues
    .map((issue, i) => ({ issue, i }))
    .sort((a, b) => RANK[b.issue.severity] - RANK[a.issue.severity] || a.i - b.i)
    .map((x) => x.issue)
}

/** "1 problem, 1 note"; "No issues"; "Not checked" (no report yet). */
export function qualityLabel(q: QualitySummary | null | undefined): string {
  if (!q) return 'Not checked'
  const parts: string[] = []
  if (q.problems) parts.push(countOf(q.problems, 'problem'))
  if (q.warnings) parts.push(countOf(q.warnings, 'warning'))
  if (q.infos) parts.push(countOf(q.infos, 'note'))
  return parts.length ? parts.join(', ') : 'No issues'
}

/** Total issues of a summary. */
export function issueCount(q: QualitySummary | null | undefined): number {
  return q ? q.problems + q.warnings + q.infos : 0
}

/** Sort key, higher is worse: not checked < no issues < notes < warnings < problems. */
export function qualityRank(q: QualitySummary | null | undefined): number {
  if (!q) return -1
  const c = (n: number) => Math.min(n, 999)
  return c(q.problems) * 1e6 + c(q.warnings) * 1e3 + c(q.infos)
}

/** Summary from a list of issues (for a report fetched without one). */
export function summarize(issues: readonly Issue[], outdated = false): QualitySummary {
  const n = (s: Severity) => issues.filter((i) => i.severity === s).length
  const worst = SEVERITIES.find((s) => n(s) > 0) ?? null
  return { problems: n('problem'), warnings: n('warning'), infos: n('info'), worst, outdated }
}

// ------------------------------------------------------------------ numbers

/** A fraction as a percentage: two decimals below 1%, one above ("0.04%", "4.0%"). */
export function fmtFraction(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '–'
  const p = v * 100
  return `${p.toFixed(Math.abs(p) < 1 && p !== 0 ? 2 : 1)}%`
}

/** One number behind an issue, with its unit. */
export function fmtIssueValue(v: Pick<IssueValue, 'value' | 'unit'>): string {
  switch (v.unit) {
    case 'percent':
      return fmtFraction(v.value)
    case 'rfu':
      return `${fmtRfu(v.value)} RFU`
    case 'bp':
      return `${fmtNumber(v.value, 2)} bp`
    case 'count':
      return fmtNumber(v.value, 0)
    default:
      return fmtNumber(v.value, 2)
  }
}

/** Issues that name a well. */
export function issuesForWell(issues: readonly Issue[], well: string): Issue[] {
  return sortIssues(issues.filter((i) => i.wells.includes(well) || i.values.some((v) => v.well === well)))
}

/** An issue's numbers grouped for display: plate-level first, then per well. */
export function groupValues(issue: Issue): { well: string | null; values: IssueValue[] }[] {
  const out: { well: string | null; values: IssueValue[] }[] = []
  for (const v of issue.values) {
    const key = v.well ?? null
    const g = out.find((x) => x.well === key)
    if (g) g.values.push(v)
    else out.push({ well: key, values: [v] })
  }
  return out.sort((a, b) => (a.well == null ? -1 : b.well == null ? 1 : 0))
}

// ------------------------------------------------------------------ pull-up and crosstalk

/** How a leak compares with the limits the default calling settings assume. */
export type LeakLevel = 'ok' | 'warning' | 'problem'

export const LEAK_LEVEL_LABEL: Record<LeakLevel, string> = {
  ok: 'typical',
  warning: 'above the warning limit',
  problem: 'above the problem limit',
}

/** Dyes of a report's pull-up table, in the usual dye order. */
export function pullUpDyes(q: Pick<PlateQuality, 'pull_up'>): Color[] {
  const seen = new Set<Color>()
  for (const l of q.pull_up) {
    seen.add(l.source)
    seen.add(l.target)
  }
  return COLORS.filter((c) => seen.has(c))
}

export function findLeak(q: Pick<PlateQuality, 'pull_up'>, source: Color, target: Color): LeakEstimate | undefined {
  return q.pull_up.find((l) => l.source === source && l.target === target)
}

/** Level of a pull-up fraction (dips, which are negative, never count). Null when not measured. */
export function pullUpLevel(fraction: number | null, limits: QualityLimits): LeakLevel | null {
  if (fraction == null) return null
  if (fraction > limits.pull_up_problem) return 'problem'
  if (fraction > limits.pull_up_warning) return 'warning'
  return 'ok'
}

/**
 * Level of a crosstalk estimate. As in the engine, crosstalk three
 * capillaries away is at most a warning: the default crosstalk rule looks
 * two capillaries away.
 */
export function crosstalkLevel(x: Pick<CrosstalkEstimate, 'fraction' | 'saturated' | 'distance'>, limits: QualityLimits): LeakLevel | null {
  if (x.fraction == null) return null
  const warn = x.saturated ? limits.crosstalk_saturated_warning : limits.crosstalk_warning
  const problem = x.saturated ? limits.crosstalk_saturated_problem : limits.crosstalk_problem
  if (x.fraction > problem && x.distance <= 2) return 'problem'
  if (x.fraction > warn) return 'warning'
  return 'ok'
}

/** Crosstalk rows by distance, with the off-scale sources' estimate beside it when there is one. */
export function crosstalkRows(q: Pick<PlateQuality, 'crosstalk'>): { distance: number; normal: CrosstalkEstimate | null; saturated: CrosstalkEstimate | null }[] {
  const ds = [...new Set(q.crosstalk.map((x) => x.distance))].sort((a, b) => a - b)
  return ds.map((d) => ({
    distance: d,
    normal: q.crosstalk.find((x) => x.distance === d && !x.saturated) ?? null,
    saturated: q.crosstalk.find((x) => x.distance === d && x.saturated) ?? null,
  }))
}

/** A limit as a percentage, as short as it is exact: "20%", "3.3%", "2.75%". */
export function fmtLimit(v: number): string {
  const p = v * 100
  const hundredths = Math.round(p * 100)
  const digits = Math.abs(p * 100 - hundredths) < 1e-6 && hundredths % 10 !== 0 ? 2 : 1
  return `${p.toFixed(digits).replace(/\.0+$/, '')}%`
}

/** The sentence under the tables: how measured pull-up and fixed crosstalk apply. */
export function limitsSentence(limits: QualityLimits): string {
  return `Calling accounts for each plate’s measured pull-up automatically; pull-up above ${fmtLimit(limits.pull_up_warning)} is unusual for a 3730 and above ${fmtLimit(limits.pull_up_problem)} points to a stale spectral calibration. Crosstalk uses the fixed limit up to ${fmtLimit(limits.crosstalk_problem)} (${fmtLimit(limits.crosstalk_saturated_problem)} next to off-scale peaks; warning above ${fmtLimit(limits.crosstalk_warning)}).`
}

// ------------------------------------------------------------------ wells

export const WELL_FLAG_LABEL: Record<WellFlag, string> = {
  unseparated_dyes: 'Dyes not separated',
  low_ladder: 'Weak ladder',
  weak_injection: 'Weak ladder and almost no sample signal',
  ladder_disagrees: 'Ladder disagrees with the plate',
  ladder_fading: 'Ladder fades along the run',
  noisy: 'Noisy',
  offscale: 'Off-scale signal',
  negative_control_signal: 'Signal in a negative control',
}

/** Largest noise SD over the well's dyes (RFU); null without dyes. */
export function maxNoise(w: Pick<WellQuality, 'dyes'>): number | null {
  return w.dyes.length ? Math.max(...w.dyes.map((d) => d.noise_sd)) : null
}

export function median(values: readonly number[]): number | null {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return null
  const m = v.length >> 1
  return v.length % 2 ? (v[m] as number) : ((v[m - 1] as number) + (v[m] as number)) / 2
}

// ------------------------------------------------------------------ grid coloring

export type QualityMeasure = 'ladder_height' | 'signal' | 'noise' | 'separation'

export const QUALITY_MEASURES: readonly { value: QualityMeasure; label: string }[] = [
  { value: 'ladder_height', label: 'Ladder height' },
  { value: 'signal', label: 'Sample signal' },
  { value: 'noise', label: 'Noise' },
  { value: 'separation', label: 'Spectral separation' },
]

/** The per-well limits the grid scales use (they come with every report, `report.limits`). */
export type WellLimits = Pick<QualityLimits, 'low_ladder_fraction' | 'weak_signal_rfu' | 'noisy_factor' | 'unseparated_min_peaks' | 'spectral_deviation_limit'>

/** The engine's defaults, for callers without a report (mocks, tests). */
export const DEFAULT_WELL_LIMITS: WellLimits = {
  low_ladder_fraction: 0.25,
  weak_signal_rfu: 500,
  noisy_factor: 2.5,
  unseparated_min_peaks: 2,
  spectral_deviation_limit: 0.03,
}

/** Ramp from good through doubtful to bad, as theme variables. */
export const QUALITY_RAMP = ['--scale-good', '--scale-low', '--scale-none'] as const

const clamp01 = (t: number) => Math.max(0, Math.min(1, t))

export interface MeasureScale {
  measure: QualityMeasure
  /** Legend title, with the unit. */
  title: string
  /** What the colors mean, in a sentence. */
  explanation: string
  /** The same in a few words, for the legend line (the sentence is its tooltip). */
  short: string
  /** Legend gradient left to right, with labels at both ends. */
  gradient: string[]
  from: string
  to: string
  /** The well's value, formatted with its unit. */
  format: (w: WellQuality) => string
  /** Fill of a well; `var(--c-surface-3)` when the measure is missing. */
  color: (w: WellQuality) => string
  /** Flags this measure is about: such wells get a "!" in the grid. */
  flags: readonly WellFlag[]
}

const NO_DATA = 'var(--c-surface-3)'

function rampStops(n = 5): string[] {
  return Array.from({ length: n }, (_, i) => rampColor(i / (n - 1), QUALITY_RAMP))
}

/** Badness 0..1 of a ladder height against the plate median: 0 at or above it, 1 at the low-ladder fraction of it or less. */
export function ladderBadness(height: number | null, plateMedian: number | null, L: WellLimits = DEFAULT_WELL_LIMITS): number | null {
  if (height == null || plateMedian == null || plateMedian <= 0) return null
  if (height <= 0) return 1
  if (L.low_ladder_fraction >= 1) return height < plateMedian ? 1 : 0
  return clamp01(Math.log(plateMedian / height) / Math.log(1 / L.low_ladder_fraction))
}

/** Badness 0..1 of a noise SD against the plate's typical one: 0 up to half the noisy factor times it, 1 from the noisy factor. */
export function noiseBadness(noise: number | null, typical: number | null, L: WellLimits = DEFAULT_WELL_LIMITS): number | null {
  if (noise == null || typical == null || typical <= 0) return null
  const lo = L.noisy_factor / 2
  return clamp01((noise / typical - lo) / (L.noisy_factor - lo))
}

/**
 * Badness 0..1 of a capillary's spectral separation: peaks at a spectral
 * breakdown (one can happen in a healthy capillary, two or more is a
 * pattern) or its ladder pull-up differing from the plate's typical
 * capillary (normal up to half the limit, bad at the limit).
 */
export function separationBadness(w: Pick<WellQuality, 'breakdowns' | 'spectral_deviation' | 'tall_peaks'>, L: WellLimits = DEFAULT_WELL_LIMITS): number | null {
  if (w.spectral_deviation == null && w.tall_peaks === 0) return null
  const fromPeaks = clamp01(w.breakdowns / L.unseparated_min_peaks)
  const lim = L.spectral_deviation_limit
  const fromLadder = w.spectral_deviation == null ? 0 : clamp01((w.spectral_deviation - lim / 2) / (lim / 2))
  return Math.max(fromPeaks, fromLadder)
}

/** How to color the grid by one measure on this plate. */
export function measureScale(measure: QualityMeasure, report: Pick<PlateQuality, 'wells' | 'ladder_height' | 'limits'>): MeasureScale {
  const L: WellLimits = report.limits
  const ramp = rampStops()
  if (measure === 'ladder_height') {
    const m = report.ladder_height
    return {
      measure,
      title: 'Ladder height (RFU)',
      explanation:
        m == null
          ? 'Median height of each well’s ladder peaks.'
          : `Median height of each well’s ladder peaks. The plate’s median is ${fmtRfu(m)} RFU; a well under ${fmtLimit(L.low_ladder_fraction)} of it (${fmtRfu(m * L.low_ladder_fraction)} RFU) has a weak ladder.`,
      short: m == null ? 'Median height of the ladder peaks' : `Plate median ${fmtRfu(m)} RFU; weak under ${fmtLimit(L.low_ladder_fraction)} of it`,
      gradient: ramp,
      from: m == null ? 'plate median' : `${fmtRfu(m)} or more`,
      to: m == null ? `${fmtLimit(L.low_ladder_fraction)} of it` : `${fmtRfu(m * L.low_ladder_fraction)} or less`,
      format: (w) => (w.ladder_height == null ? 'no ladder' : `${fmtRfu(w.ladder_height)} RFU`),
      color: (w) => {
        const t = ladderBadness(w.ladder_height, m, L)
        return t == null ? (w.ladder_height == null && m != null ? rampColor(1, QUALITY_RAMP) : NO_DATA) : rampColor(t, QUALITY_RAMP)
      },
      flags: ['low_ladder', 'weak_injection'],
    }
  }
  if (measure === 'noise') {
    const typical = median(report.wells.map(maxNoise).filter((v): v is number => v != null))
    return {
      measure,
      title: 'Noise (RFU)',
      explanation:
        typical == null
          ? 'The largest noise of each well’s dyes (standard deviation of the baseline).'
          : `The largest noise of each well’s dyes (standard deviation of the baseline). Typical on this plate: ${fmtNumber(typical, 1)} RFU; ${L.noisy_factor} times that (${fmtNumber(typical * L.noisy_factor, 1)} RFU) is noisy.`,
      short: typical == null ? 'Largest noise of the well’s dyes' : `Largest noise of the well’s dyes; typical ${fmtNumber(typical, 1)} RFU`,
      gradient: ramp,
      from: typical == null ? 'typical' : `${fmtNumber(typical * (L.noisy_factor / 2), 1)} or less`,
      to: typical == null ? `${L.noisy_factor}× typical` : `${fmtNumber(typical * L.noisy_factor, 1)} or more`,
      format: (w) => {
        const n = maxNoise(w)
        return n == null ? 'no data' : `${fmtNumber(n, 1)} RFU`
      },
      color: (w) => {
        const t = noiseBadness(maxNoise(w), typical, L)
        return t == null ? NO_DATA : rampColor(t, QUALITY_RAMP)
      },
      flags: ['noisy'],
    }
  }
  if (measure === 'separation') {
    return {
      measure,
      title: 'Spectral separation',
      explanation: `Whether each capillary keeps its dyes apart: tall peaks at a spectral breakdown (one can happen, ${L.unseparated_min_peaks} or more mean the dyes are not separated), or ladder pull-up that differs from the plate’s typical capillary (normal up to ${fmtLimit(L.spectral_deviation_limit / 2)}, not separated from ${fmtLimit(L.spectral_deviation_limit)}).`,
      short: `${L.unseparated_min_peaks} or more peaks at a spectral breakdown, or ladder pull-up ${fmtLimit(L.spectral_deviation_limit)} off the plate’s: not separated`,
      gradient: ramp,
      from: 'separated',
      to: 'not separated',
      format: (w) =>
        `${countOf(w.breakdowns, 'peak')} at a breakdown of ${w.tall_peaks} tall; ladder pull-up ${fmtFraction(w.spectral_deviation)} off the plate’s`,
      color: (w) => {
        const t = separationBadness(w, L)
        return t == null ? NO_DATA : rampColor(t, QUALITY_RAMP)
      },
      flags: ['unseparated_dyes'],
    }
  }
  const s = DEFAULT_SIGNAL_SCALE
  return {
    measure,
    title: 'Sample signal (RFU)',
    explanation: `The strongest sample-dye signal of each well, on the Signal view’s scale. Under ${fmtRfu(L.weak_signal_rfu)} RFU a well has no usable sample signal.`,
    short: `Strongest sample-dye signal; under ${fmtRfu(L.weak_signal_rfu)} RFU is not usable`,
    gradient: [0, 0.25, 0.5, 0.75, 1].map((t) => signalColor(s.none * Math.pow(s.offscale / s.none, t), s)),
    from: `${fmtRfu(s.none)} or less`,
    to: `${fmtRfu(s.offscale)} (off-scale)`,
    format: (w) => (w.signal == null ? 'no data' : `${fmtRfu(w.signal)} RFU`),
    color: (w) => (w.signal == null ? NO_DATA : signalColor(w.signal <= s.none ? null : w.signal, s)),
    flags: ['weak_injection', 'offscale'],
  }
}

/** Grid data for coloring the plate by a quality measure; flagged wells get a "!" and their flags in the tooltip. */
export function qualityWells(report: Pick<PlateQuality, 'wells'>, scale: MeasureScale): Record<string, WellDatum> {
  const out: Record<string, WellDatum> = {}
  for (const w of report.wells) {
    const flagged = w.flags.filter((f) => scale.flags.includes(f))
    out[w.well] = {
      color: scale.color(w),
      glyph: flagged.length ? '!' : null,
      detail: [
        `${scale.title.replace(/ \(RFU\)$/, '')}: ${scale.format(w)}`,
        ...(w.capillary != null ? [`Capillary ${w.capillary}`] : []),
        ...w.flags.map((f) => WELL_FLAG_LABEL[f]),
      ],
    }
  }
  return out
}
