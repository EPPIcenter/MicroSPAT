/**
 * Non-visual logic of TraceViewer: series bounds, x conversion between
 * data-point index and base pairs, auto y-range, peak state mapping.
 */
import type { Color, Peak } from '@/api/bindings'
import type { Domain } from '@/plot/scale'
import { interpAt, invertInterp, rangeMax, visibleRange, type NumArray } from '@/plot/decimate'

export type XAxisMode = 'index' | 'bp'

export interface TraceSeries {
  id: string
  /** Dye name (themed) or any CSS color. */
  color: Color | string
  /** Signal in RFU, one value per data point. */
  data: NumArray
  /** Base size (bp) of every data point, from the well's ladder. Needed for `xMode: 'bp'`. */
  baseSizes?: NumArray | null
  label?: string
  /** Draw faded and thin: the same locus in another well, for comparison. */
  overlay?: boolean
  hidden?: boolean
}

/**
 * How a peak is drawn.
 * - called: true allele (in a bin, no flags)
 * - manual-on / manual-off: the user overrode the call
 * - artifact: explained by stutter etc. of other peaks
 * - flagged: bleedthrough or crosstalk
 * - below: under the relative/absolute height threshold
 * - out-of-bin: unflagged, but outside every bin (cannot be called)
 * - candidate: found by peak scanning, not (yet) called
 */
export type PeakState = 'called' | 'manual-on' | 'manual-off' | 'artifact' | 'flagged' | 'below' | 'out-of-bin' | 'candidate'

export const PEAK_STATE_LABEL: Record<PeakState, string> = {
  called: 'Called allele',
  'manual-on': 'Manually called',
  'manual-off': 'Manually removed',
  artifact: 'Artifact',
  flagged: 'Bleedthrough / crosstalk',
  below: 'Below threshold',
  'out-of-bin': 'Outside any bin',
  candidate: 'Uncalled peak',
}

export interface TracePeak {
  id: string | number
  /** Series the peak belongs to (for color and y); defaults to the first series. */
  seriesId?: string
  index: number
  size: number
  /** Height the analysis uses (RFU above baseline); shown in the hover readout. */
  height: number
  /**
   * Raw signal at the apex: where the marker sits on the drawn (raw) trace.
   * Defaults to `height`, which is right for traces without a baseline.
   */
  apex?: number
  state: PeakState
  /** Short label drawn above the marker, e.g. the allele/bin label. */
  label?: string | null
  /** Extra lines for the hover readout. */
  detail?: string[]
  /**
   * Expected artifact height at this peak (RFU) with one SD of error, drawn
   * as an error bar so the user can compare the peak with what stutter of
   * the other peaks would explain.
   */
  expected?: { height: number; error: number } | null
  /** Draw a selection ring (e.g. the peak under the keyboard cursor). */
  selected?: boolean
  /** Small tag drawn beside the marker, e.g. the number key that toggles it. */
  tag?: string
  /** Replaces the state's name in the hover readout (e.g. for ladder peaks, which are not alleles). */
  stateLabel?: string
  /**
   * Draw attention to the peak: a dashed ring in the warning color, and its
   * `label` in that color even when it is not called (e.g. a narrow miss).
   */
  highlight?: 'warn'
}

export interface TraceBin {
  id: number | string
  label: string
  /** Center in bp. */
  center: number
  /** Half-width in bp. */
  halfWidth: number
  highlighted?: boolean
}

export interface LadderMarker {
  /** Data-point index of the ladder peak. */
  index: number
  /** Assigned ladder size in bp, or null when the peak is not used. */
  size: number | null
  seriesId?: string
  /** `outlier`: used but with a large residual. */
  status?: 'ok' | 'outlier' | 'unassigned'
}

/** First visible, non-overlay series: it defines index<->bp conversion. */
export function primarySeries(series: readonly TraceSeries[]): TraceSeries | undefined {
  return series.find((s) => !s.overlay && !s.hidden) ?? series.find((s) => !s.hidden) ?? series[0]
}

/** X of data point i of a series in the given axis mode. */
export function pointX(s: TraceSeries, i: number, mode: XAxisMode): number {
  return mode === 'bp' && s.baseSizes ? (s.baseSizes[i] as number) : i
}

/** Full x extent of the data, used as zoom bounds. */
export function computeBounds(series: readonly TraceSeries[], mode: XAxisMode): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const s of series) {
    if (s.hidden || s.data.length === 0) continue
    const n = s.data.length
    if (mode === 'bp' && s.baseSizes && s.baseSizes.length) {
      // Sizes before the first ladder peak are extrapolated and can go
      // negative; nothing below 0 bp is meaningful.
      lo = Math.min(lo, Math.max(0, s.baseSizes[0] as number))
      hi = Math.max(hi, s.baseSizes[s.baseSizes.length - 1] as number)
    } else {
      lo = Math.min(lo, 0)
      hi = Math.max(hi, n - 1)
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [0, 1]
  return [lo, hi]
}

/** Convert a bp value to the current axis (identity in bp mode). */
export function bpToAxis(bp: number, mode: XAxisMode, primary: TraceSeries | undefined): number | null {
  if (mode === 'bp') return bp
  if (!primary?.baseSizes) return null
  return invertInterp(primary.baseSizes, bp)
}

/** Convert an axis x to bp (identity in bp mode; null without base sizes). */
export function axisToBp(x: number, mode: XAxisMode, primary: TraceSeries | undefined): number | null {
  if (mode === 'bp') return x
  if (!primary?.baseSizes) return null
  return interpAt(primary.baseSizes, x)
}

/** Convert an axis x to a fractional data index of `s`. */
export function axisToIndex(x: number, mode: XAxisMode, s: TraceSeries | undefined): number {
  if (!s) return x
  if (mode === 'bp' && s.baseSizes) return invertInterp(s.baseSizes, x)
  return x
}

export function peakX(p: TracePeak, mode: XAxisMode): number {
  return mode === 'bp' ? p.size : p.index
}

/**
 * Top of the y axis for auto mode: the tallest visible signal plus headroom.
 * Overlays count, so a faded comparison trace is never clipped.
 */
export function autoYMax(
  series: readonly TraceSeries[],
  mode: XAxisMode,
  domain: Domain,
  extra: readonly number[] = [],
): number {
  let m = 0
  for (const s of series) {
    if (s.hidden) continue
    const xs = mode === 'bp' ? (s.baseSizes ?? null) : null
    if (mode === 'bp' && !s.baseSizes) continue
    const [i0, i1] = visibleRange(xs, s.data.length, domain[0], domain[1])
    // visibleRange pads by one point each side; drop the padding so a tall
    // peak just outside the view does not set the scale.
    m = Math.max(m, rangeMax(s.data, Math.min(i0 + 1, i1), Math.max(i0 + 1, i1 - 1)))
  }
  for (const v of extra) m = Math.max(m, v)
  return Math.max(50, m * 1.12)
}

/** Default view: the locus range with a margin, else the full bounds. */
export function defaultDomain(
  bounds: Domain,
  mode: XAxisMode,
  locusRange: Domain | null | undefined,
  primary: TraceSeries | undefined,
): [number, number] {
  if (locusRange) {
    const lo = bpToAxis(locusRange[0], mode, primary)
    const hi = bpToAxis(locusRange[1], mode, primary)
    if (lo != null && hi != null && hi > lo) {
      const pad = (hi - lo) * 0.08
      return [Math.max(bounds[0], lo - pad), Math.min(bounds[1], hi + pad)]
    }
  }
  return [bounds[0], bounds[1]]
}

export interface PeakStateOptions {
  /** User override from manual curation. */
  manual?: 'on' | 'off' | null
}

/** Map an engine Peak to a drawing state. Flags win over binning. */
export function peakStateOf(p: Peak, o: PeakStateOptions = {}): PeakState {
  if (o.manual === 'on') return 'manual-on'
  if (o.manual === 'off') return 'manual-off'
  if (p.flags.artifact) return 'artifact'
  if (p.flags.bleedthrough || p.flags.crosstalk) return 'flagged'
  if (p.flags.below_relative_threshold) return 'below'
  if (p.in_bin || p.bin_id != null) return 'called'
  return 'candidate'
}

/** Y of a peak's marker: the raw apex when known, else its height. */
export function markerRfu(p: TracePeak): number {
  return p.apex ?? p.height
}

/** Convert engine peaks to TraceViewer peaks. */
export function toTracePeaks(
  peaks: readonly Peak[],
  opts: { seriesId?: string; manual?: (p: Peak) => 'on' | 'off' | null; idPrefix?: string } = {},
): TracePeak[] {
  return peaks.map((p) => {
    const detail: string[] = []
    detail.push(`rel. height ${(p.relative_height * 100).toFixed(1)}%`)
    if (p.artifact_contribution > 0)
      detail.push(`artifact ${Math.round(p.artifact_contribution)} ± ${Math.round(p.artifact_error)} RFU`)
    if (p.probability != null) detail.push(`P(allele) ${p.probability.toFixed(3)}`)
    if (p.pullup_contribution != null && p.pullup_error != null && (Math.abs(p.pullup_contribution) >= 10 || p.pullup_error >= 10 || p.flags.bleedthrough))
      detail.push(`expected pull-up ${Math.round(p.pullup_contribution)} ± ${Math.round(p.pullup_error)} RFU`)
    else if (p.bleedthrough_ratio > 0.5) detail.push(`bleedthrough ×${p.bleedthrough_ratio.toFixed(2)}`)
    if (p.crosstalk_ratio > 0.5) detail.push(`crosstalk ×${p.crosstalk_ratio.toFixed(2)}`)
    return {
      id: `${opts.idPrefix ?? ''}${p.index}`,
      seriesId: opts.seriesId,
      index: p.index,
      size: p.size,
      height: p.height,
      // Peaks stored before raw heights existed have raw_height 0 and a raw `height`.
      apex: p.raw_height > 0 ? p.raw_height : p.height,
      state: peakStateOf(p, { manual: opts.manual?.(p) ?? null }),
      label: p.bin_label,
      detail,
    }
  })
}
