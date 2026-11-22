/**
 * Synthetic plate quality reports for the mock transport and the gallery.
 * Deterministic: the same wells and options give the same report. The issue
 * texts follow the engine's (`derive_issues` in
 * `crates/microspat-core/src/quality.rs`).
 */
import type { Color, ControlSignal, DyeQuality, Issue, LeakEstimate, PlateQuality, QualityLimits, WellQuality } from '@/api/bindings'
import { parseWell } from '@/components/PlateGrid'
import { rng } from '@/mock/data'
import { DEFAULT_WELL_LIMITS, median } from './model/quality'

export const MOCK_LIMITS: QualityLimits = {
  pull_up_warning: 0.08,
  pull_up_problem: 0.2,
  crosstalk_warning: 0.0275,
  crosstalk_problem: 1 / 30,
  crosstalk_saturated_warning: 0.05,
  crosstalk_saturated_problem: 0.1,
  ...DEFAULT_WELL_LIMITS,
  ladder_fade_limit: 0.2,
  weak_plate_fraction: 0.1,
  saturation_info_fraction: 0.25,
  control_height_limit: 300,
}

export interface MockQualityWell {
  label: string
  /** False when the ladder could not be fitted. */
  sized: boolean
  sizingQuality: number | null
  /** Strongest signal per sample dye (RFU); null = no signal. */
  signal: Partial<Record<Color, number | null>>
}

export interface MockQualityOptions {
  seed: number
  ladderColor?: Color
  /** Wells whose dyes are not separated. */
  unseparated?: string[]
  /** Pull-up fractions to use instead of the typical ones, e.g. `{ 'blue>green': 0.14 }`. */
  pullUp?: Partial<Record<`${Color}>${Color}`, number>>
  /** Negative-control peaks; `controlsChecked` defaults to true when given. */
  controls?: ControlSignal[]
  controlsChecked?: boolean
  /** Report wells without a fitted ladder as weak (default true). */
  weakWells?: boolean
}

const TYPICAL_PULL_UP: Record<string, number> = {
  'blue>green': 0.04,
  'blue>yellow': -0.012,
  'green>blue': -0.012,
  'green>yellow': 0.015,
  'yellow>blue': 0.011,
  'yellow>green': -0.03,
}

/** Capillary of a well: the mock instrument loads capillaries down the columns. */
export function mockCapillary(label: string): number | null {
  const p = parseWell(label)
  return p ? p.col * 8 + p.row + 1 : null
}

function where(wells: readonly WellQuality[]): string {
  const caps = wells.map((w) => w.capillary)
  const labels = wells.map((w) => w.well)
  const and = (xs: (string | number | null)[]) => (xs.length < 2 ? String(xs[0]) : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
  return wells.length === 1 ? `capillary ${caps[0]} (well ${labels[0]})` : `capillaries ${and(caps)} (wells ${and(labels)})`
}

export function mockQualityReport(wells: readonly MockQualityWell[], opts: MockQualityOptions): PlateQuality {
  const r = rng(opts.seed * 7919 + 13)
  const ladderColor = opts.ladderColor ?? 'orange'
  const unseparated = new Set(opts.unseparated ?? [])
  const sampleDyes = (['blue', 'green', 'yellow', 'red'] as Color[]).filter((c) => c !== ladderColor && wells.some((w) => w.signal[c] !== undefined))
  const dyes = [...sampleDyes, ladderColor]
  const ladderHeights = wells.filter((w) => w.sized).map(() => 2500 + r.next() * 3500)
  let li = 0

  const out: WellQuality[] = wells.map((w) => {
    const bad = unseparated.has(w.label)
    const ladderHeight = w.sized ? (ladderHeights[li++] as number) : null
    const dq: DyeQuality[] = dyes.map((c) => {
      const s = c === ladderColor ? (ladderHeight ?? 150) : (w.signal[c] ?? 60)
      const tall = s >= 600 && c !== ladderColor ? 1 + Math.floor(r.next() * 3) : c === ladderColor && w.sized ? 21 : 0
      return {
        color: c,
        noise_sd: Math.round((6 + r.next() * 6) * 100) / 100,
        baseline: Math.round(-80 + r.next() * 100),
        offscale_points: s >= 30000 ? 3 : 0,
        max_signal: s,
        tall_peaks: tall,
        breakdown_peaks: bad && c !== ladderColor ? Math.min(tall, 3) : 0,
        copy_peaks: bad && c !== ladderColor ? Math.min(tall, 3) : 0,
      }
    })
    const sample = dq.filter((d) => d.color !== ladderColor)
    const tall = sample.reduce((n, d) => n + d.tall_peaks, 0)
    const breakdowns = sample.reduce((n, d) => n + d.breakdown_peaks, 0)
    const signal = Math.max(0, ...sample.map((d) => d.max_signal))
    return {
      well: w.label,
      capillary: mockCapillary(w.label),
      sizing_quality: w.sizingQuality,
      plate_error: w.sized ? Math.round(r.next() * 25) / 100 : null,
      ladder_height: ladderHeight,
      ladder_fade: w.sized ? 0.7 + r.next() * 0.35 : null,
      signal,
      offscale_points: sample.reduce((n, d) => n + d.offscale_points, 0),
      dyes: dq,
      tall_peaks: tall,
      breakdowns,
      copies: breakdowns,
      breakdown_fraction: tall ? breakdowns / tall : null,
      ladder_leaks: w.sized ? sampleDyes.map((c) => ({ target: c, fraction: 0.01 + r.next() * 0.01 })) : [],
      spectral_deviation: w.sized ? (bad ? 0.045 : r.next() * 0.012) : null,
      flags: [],
    }
  })
  out.sort((a, b) => (a.capillary ?? 0) - (b.capillary ?? 0))

  const plateLadder = median(out.map((w) => w.ladder_height).filter((v): v is number => v != null))
  for (const w of out) {
    if (w.breakdowns >= 2 || (w.spectral_deviation ?? 0) > 0.03) w.flags.push('unseparated_dyes')
    const low = w.ladder_height == null || (plateLadder != null && w.ladder_height < plateLadder * 0.25)
    if (low) w.flags.push('low_ladder')
    if (low && (w.signal ?? 0) < 500) w.flags.push('weak_injection')
    if (w.offscale_points > 0) w.flags.push('offscale')
  }

  const pull_up: LeakEstimate[] = []
  for (const s of dyes)
    for (const t of dyes) {
      if (s === t) continue
      const key = `${s}>${t}` as const
      const f = opts.pullUp?.[key] ?? TYPICAL_PULL_UP[key] ?? (r.next() - 0.5) * 0.02
      const peaks = s === ladderColor ? 1800 + Math.floor(r.next() * 200) : 60 + Math.floor(r.next() * 60)
      pull_up.push({ source: s, target: t, fraction: s === 'yellow' && t === ladderColor ? null : f, spread: 0.0015, peaks: s === 'yellow' && t === ladderColor ? 12 : peaks })
    }

  const controls = opts.controls ?? []
  const controlsChecked = opts.controlsChecked ?? controls.length > 0
  for (const c of controls) if (!c.explained_by) out.find((w) => w.well === c.well)?.flags.push('negative_control_signal')

  const issues: Issue[] = []
  const faulty = out.filter((w) => w.flags.includes('unseparated_dyes'))
  if (faulty.length) {
    const one = faulty.length === 1
    issues.push({
      kind: 'unseparated_dyes',
      severity: 'problem',
      title: 'Dyes not separated',
      message: `The dyes are not separated in ${where(faulty)}: a peak of one dye can show in another dye at the same point, as tall as the original, with the other dyes dipping below their baseline. Calls from ${one ? 'this well' : 'these wells'} can be in the wrong dye. Rerun ${one ? 'it' : 'them'}, and have the instrument's spectral calibration redone if the same capillaries keep showing this.`,
      wells: faulty.map((w) => w.well),
      values: faulty.flatMap((w) => [
        { label: 'Peaks at a spectral breakdown', value: w.breakdowns, unit: 'count', well: w.well },
        { label: "Ladder pull-up off the plate's", value: w.spectral_deviation ?? 0, unit: 'percent', well: w.well },
      ]),
    })
  }
  const unexplained = controls.filter((c) => !c.explained_by)
  if (unexplained.length) {
    const ws = [...new Set(unexplained.map((c) => c.well))].sort()
    const loci = [...new Set(unexplained.map((c) => c.locus))]
    const tallest = [...unexplained].sort((a, b) => b.height - a.height)[0]!
    issues.push({
      kind: 'negative_control_signal',
      severity: 'problem',
      title: 'Signal in negative controls',
      message: `${ws.length} negative-control ${ws.length === 1 ? 'well' : 'wells'} (${ws.join(', ')}) ${ws.length === 1 ? 'has' : 'have'} peaks above the 200 RFU calling limit at ${loci.length} ${loci.length === 1 ? 'locus' : 'loci'} that no neighboring capillary or other dye explains; the tallest is ${Math.round(tallest.height).toLocaleString('en-US')} RFU in ${tallest.well} at ${tallest.locus}. This points to contamination or a mislabeled well: check the plate map and repeat the controls.`,
      wells: ws,
      values: unexplained.map((c) => ({ label: `Tallest peak at ${c.locus}`, value: c.height, unit: 'rfu', well: c.well })),
    })
  }
  for (const l of pull_up) {
    if (l.fraction == null || l.fraction <= MOCK_LIMITS.pull_up_warning) continue
    const problem = l.fraction > MOCK_LIMITS.pull_up_problem
    issues.push({
      kind: 'pull_up',
      severity: problem ? 'problem' : 'warning',
      title: `${l.source[0]!.toUpperCase()}${l.source.slice(1)} signal shows in ${l.target}`,
      message: `On this plate ${(l.fraction * 100).toFixed(1)}% of the ${l.source} signal shows in ${l.target} at the same point. ${
        problem
          ? `Calling accounts for this plate's measured pull-up automatically, but pull-up this high points to a stale spectral calibration and hides minor ${l.target} alleles under ${l.source} peaks. Recalibrate the instrument's spectral settings.`
          : `Typical pull-up is 1 to 4%. Calling accounts for this plate's measured pull-up automatically, but high pull-up reduces sensitivity for minor ${l.target} alleles under tall ${l.source} peaks.`
      }`,
      wells: [],
      values: [
        { label: `${l.source[0]!.toUpperCase()}${l.source.slice(1)} into ${l.target}`, value: l.fraction, unit: 'percent' },
        { label: 'Source peaks', value: l.peaks, unit: 'count' },
      ],
    })
  }
  const weak = opts.weakWells === false ? [] : out.filter((w) => w.flags.includes('weak_injection'))
  if (weak.length) {
    const plateWide = weak.length >= 0.1 * out.length
    issues.push({
      kind: 'weak_injection',
      severity: plateWide ? 'problem' : 'info',
      title: plateWide ? 'Weak or failed injection' : 'Weak wells',
      message: plateWide
        ? `${weak.length} of ${out.length} wells have a weak ladder and almost no sample signal (${where(weak)}). The injection likely failed: check the run conditions and rerun the plate.`
        : `${where(weak).replace(/^c/, 'C')} ${weak.length === 1 ? 'has' : 'have'} a weak ladder and almost no sample signal. ${weak.length === 1 ? 'Rerun it unless it is an empty well.' : 'Rerun them unless they are empty wells.'}`,
      wells: weak.map((w) => w.well),
      values: weak.map((w) => ({ label: 'Strongest sample signal', value: w.signal ?? 0, unit: 'rfu', well: w.well })),
    })
  }
  if (opts.weakWells === false) for (const w of out) w.flags = w.flags.filter((f) => f !== 'weak_injection' && f !== 'low_ladder')
  const rank = { problem: 3, warning: 2, info: 1 } as const
  issues.sort((a, b) => rank[b.severity] - rank[a.severity])

  return {
    version: 1,
    wells: out,
    ladder_height: plateLadder,
    pull_up,
    crosstalk: [
      { distance: 1, saturated: false, fraction: 0.011, spread: 0.002, peaks: 400 },
      { distance: 2, saturated: false, fraction: 0.007, spread: 0.002, peaks: 390 },
      { distance: 3, saturated: false, fraction: 0.004, spread: 0.002, peaks: 380 },
      { distance: 1, saturated: true, fraction: 0.027, spread: 0.004, peaks: 24 },
      { distance: 2, saturated: true, fraction: null, spread: null, peaks: 8 },
      { distance: 3, saturated: true, fraction: null, spread: null, peaks: 8 },
    ],
    controls,
    controls_checked: controlsChecked,
    issues,
    limits: MOCK_LIMITS,
  }
}
