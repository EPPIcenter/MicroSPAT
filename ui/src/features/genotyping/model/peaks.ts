/**
 * What each peak of a sample × locus call is, in words and as a drawing
 * state. Follows `microspat_core::genotyping`:
 *
 * - a peak is *callable* when it is inside a bin and carries no flag;
 * - before the probabilistic pass every callable peak of a non-failed run
 *   is called; after it, a callable peak is called when its probability
 *   reaches the threshold or it stands more than the soft SD limit above
 *   its expected artifact height;
 * - manual curation toggles bins; the stored call keeps the result.
 *
 * The automatic rule is recomputed here only to tell which called / uncalled
 * peaks the user changed by hand (the engine stores the final set of bins).
 */
import { fmtFraction } from '@/features/plates/model/quality'
import { fmtProbability, fmtShare } from '@/lib/format'
import type { AlleleRef, CallRow, GenotypingParams, LeakEstimate, NarrowMiss, Peak } from '@/api/bindings'
import type { PeakState } from '@/components/TraceViewer'
import { narrowMissText } from './calls'

/** Short words for each drawing state, used by the legend, table and readout alike. */
export const PEAK_STATE_TEXT: Record<PeakState, string> = {
  called: 'Called',
  'manual-on': 'Called by hand',
  'manual-off': 'Removed by hand',
  artifact: 'Artifact',
  flagged: 'Pull-up / crosstalk / spectral',
  below: 'Too low',
  'out-of-bin': 'No bin',
  candidate: 'Not called (P)',
}

export interface CallContext {
  /** Bin ids called for the sample at this locus. */
  alleles: ReadonlySet<number>
  failed: boolean
  manualCuration: boolean
  /** The locus's genotyping parameters, when known. */
  params?: GenotypingParams | null
  /** Called alleles by bin, with the engine's shares and probability. */
  alleleInfo?: ReadonlyMap<number, AlleleRef>
  /** The engine's narrow misses by bin. */
  narrow?: ReadonlyMap<number, NarrowMiss>
  /** Plate-measured pull-up targeting the locus's dye for the shown run. */
  platePullUp?: readonly LeakEstimate[]
}

export function callContext(row: Pick<CallRow, 'alleles' | 'flags' | 'narrow_misses'>, params?: GenotypingParams | null, platePullUp?: readonly LeakEstimate[]): CallContext {
  return {
    alleles: new Set(row.alleles.map((a) => a.bin_id)),
    failed: row.flags.failure,
    manualCuration: row.flags.manual_curation,
    params,
    alleleInfo: new Map(row.alleles.map((a) => [a.bin_id, a])),
    narrow: new Map((row.narrow_misses ?? []).map((m) => [m.bin_id, m])),
    platePullUp,
  }
}

/**
 * The engine's narrow miss this peak is, or null. The engine lists one per
 * bin (its tallest qualifying peak) with the size to 2 decimals.
 */
export function narrowMissOf(p: Peak, ctx: CallContext): NarrowMiss | null {
  if (p.bin_id == null) return null
  const m = ctx.narrow?.get(p.bin_id)
  return m && Math.abs(m.size - p.size) < 0.011 ? m : null
}

export function anyPeakFlag(p: Peak): boolean {
  const f = p.flags
  return f.artifact || f.bleedthrough || f.crosstalk || f.spectral || f.below_relative_threshold
}

/** In a bin and unflagged: the engine may call it. */
export function isCallable(p: Peak): boolean {
  return p.in_bin && p.bin_id != null && !anyPeakFlag(p)
}

/** Height above the expected artifact, in artifact SDs (the soft-limit test). */
export function artifactSds(p: Peak): number {
  return (p.height - p.artifact_contribution) / Math.max(p.artifact_error, 1)
}

/** Would the engine call this peak on its own (no manual curation)? */
export function autoCalled(p: Peak, ctx: CallContext): boolean {
  if (ctx.failed || !isCallable(p)) return false
  if (p.probability == null || !ctx.params) return true
  return p.probability >= ctx.params.probability_threshold || artifactSds(p) > ctx.params.soft_artifact_sd_limit
}

export function isCalled(p: Peak, ctx: CallContext): boolean {
  return p.bin_id != null && ctx.alleles.has(p.bin_id)
}

/**
 * Drawing state. Manual changes win; then called; then the most specific
 * reason it was not called (pull-up and crosstalk before height, a peak
 * too low on its own before "explained by artifact").
 */
export function classifyPeak(p: Peak, ctx: CallContext): PeakState {
  const called = isCalled(p, ctx)
  if (ctx.manualCuration && p.bin_id != null) {
    const auto = autoCalled(p, ctx)
    if (called && !auto) return 'manual-on'
    if (!called && auto) return 'manual-off'
  }
  if (called) return 'called'
  if (p.flags.bleedthrough || p.flags.crosstalk || p.flags.spectral) return 'flagged'
  if (p.flags.below_relative_threshold) return 'below'
  if (p.flags.artifact) return tooLowOnItsOwn(p, ctx.params) ? 'below' : 'artifact'
  if (!p.in_bin || p.bin_id == null) return 'out-of-bin'
  return 'candidate'
}

/** Rejected for height even with no artifact expected at all. */
function tooLowOnItsOwn(p: Peak, params: GenotypingParams | null | undefined): boolean {
  if (params) return p.height - p.artifact_error * params.hard_artifact_sd_limit < params.absolute_peak_height_limit
  return p.artifact_contribution <= 0
}

const pct = fmtShare
const rfu = (v: number) => Math.round(v).toLocaleString('en-US')

function pullUpReason(p: Peak, g: GenotypingParams | null | undefined, platePullUp?: readonly LeakEstimate[]): string {
  const offscale = g != null ? p.bleedthrough_ratio >= 2 && p.height * p.bleedthrough_ratio > g.offscale_threshold : false
  if (offscale) return `Pull-up: an off-scale other dye in the well is ${p.bleedthrough_ratio.toFixed(2)}× this peak’s height.`
  if (g?.measured_pullup !== false && p.pullup_contribution != null && p.pullup_error != null) {
    if (g != null && p.fallback_bleedthrough_ratio > g.bleedthrough_filter_limit)
      return `Pull-up (fallback): an unmeasured other dye in the well is ${p.fallback_bleedthrough_ratio.toFixed(2)}× this peak’s height (fallback limit ${g.bleedthrough_filter_limit}).`
    const sd = g?.pullup_sd_limit ?? 4
    const bound = p.pullup_contribution + sd * p.pullup_error
    const positiveRates = (platePullUp ?? []).filter((l) => l.fraction != null && l.fraction > 0)
    const rateNote = positiveRates.length ? `; plate leak: ${positiveRates.map((l) => `${l.source} ${fmtFraction(l.fraction)}`).join(', ')}` : ''
    if (g != null && p.height - p.artifact_contribution > bound)
      return `Pull-up: ${rfu(p.height)} − ${rfu(p.pullup_contribution)} expected pull-up${rateNote} leaves ${rfu(p.height - p.pullup_contribution)} RFU, below ${rfu(g.absolute_peak_height_limit)}.`
    const afterArt = p.artifact_contribution > 0 && g != null && p.height - p.artifact_contribution >= g.absolute_peak_height_limit && p.height > bound
    const shown = afterArt ? `${rfu(p.height - p.artifact_contribution)} RFU after artifact` : `${rfu(p.height)} RFU`
    return `Pull-up: ${shown} sits within ${sd} SD of expected pull-up (${rfu(p.pullup_contribution)} ± ${rfu(p.pullup_error)} RFU${rateNote}; bound ${rfu(bound)} RFU).`
  }
  return `Pull-up: another dye in the well is ${p.bleedthrough_ratio.toFixed(2)}× this peak’s height${g ? ` (fallback limit ${g.bleedthrough_filter_limit})` : ''}.`
}

/** Every reason a peak is or is not called, in plain words with the numbers. */
export function peakReasons(p: Peak, ctx: CallContext): string[] {
  const g = ctx.params
  const out: string[] = []
  const state = classifyPeak(p, ctx)
  if (state === 'manual-on') out.push('Called by hand (the automatic call left it out).')
  if (state === 'manual-off') out.push('Removed by hand (the automatic call included it).')
  if (ctx.failed) out.push(`The run failed at this locus: no peak above ${g ? rfu(g.failure_threshold) + ' RFU' : 'the failure threshold'}.`)
  if (p.flags.bleedthrough) out.push(pullUpReason(p, g, ctx.platePullUp))
  if (p.flags.crosstalk)
    out.push(`Crosstalk: a neighboring capillary is ${p.crosstalk_ratio.toFixed(2)}× this peak’s height${g ? ` (limit ${g.crosstalk_filter_limit})` : ''}.`)
  if (p.flags.spectral)
    out.push(`Spectral breakdown: another dye reads ${p.spectral_dip_ratio.toFixed(2)}× this peak’s signal below its baseline here, so the dyes were not separated.`)
  if (p.flags.below_relative_threshold)
    out.push(`Only ${pct(p.relative_height)} of the tallest peak${g ? ` (needs ${pct(g.relative_peak_height_limit)})` : ''}.`)
  if (p.flags.artifact) {
    if (g) {
      const left = p.height - p.artifact_contribution - p.artifact_error * g.hard_artifact_sd_limit
      out.push(
        p.artifact_contribution > 0
          ? `Explained by artifact: ${rfu(p.height)} − ${rfu(p.artifact_contribution)} expected${g.hard_artifact_sd_limit ? ` − ${g.hard_artifact_sd_limit}×${rfu(p.artifact_error)}` : ''} = ${rfu(left)} RFU, below ${rfu(g.absolute_peak_height_limit)}.`
          : `Too low: ${rfu(p.height)} RFU, below ${rfu(g.absolute_peak_height_limit)}.`,
      )
    } else out.push('Height is explained by artifacts of other peaks, or too low.')
  }
  if (p.bin_id == null) out.push('Outside every bin: not an allele of this locus.')
  else if (!p.in_bin) out.push(`Near bin ${p.bin_label ?? '?'} but outside its window.`)
  if (isCallable(p) && !ctx.failed && p.probability != null && g) {
    const sds = artifactSds(p)
    if (isCalled(p, ctx) && state !== 'manual-on') {
      out.push(
        p.probability >= g.probability_threshold
          ? `Probability ${fmtProbability(p.probability)} ≥ ${g.probability_threshold}.`
          : `${sds.toFixed(1)} SD above expected artifact (> ${g.soft_artifact_sd_limit}), called whatever its probability.`,
      )
    } else if (!isCalled(p, ctx) && state !== 'manual-off') {
      out.push(`Probability ${fmtProbability(p.probability)} below ${g.probability_threshold}, and only ${sds.toFixed(1)} SD above expected artifact.`)
    }
  }
  if (isCalled(p, ctx) && p.probability != null && g && p.probability < g.bootstrap_probability_threshold)
    out.push(`Probability below ${g.bootstrap_probability_threshold}: this allele does not count toward MOI.`)
  const miss = narrowMissOf(p, ctx)
  if (miss) out.push(`Narrow miss: ${narrowMissText(miss)}.`)
  if (out.length === 0 && isCalled(p, ctx)) out.push('In a bin, unflagged, and taller than artifacts explain.')
  return out
}

/** A called allele whose probability is below the bootstrap threshold (does not count toward MOI). */
export function isLowProbabilityCall(p: Peak, ctx: CallContext): boolean {
  if (!isCalled(p, ctx) || p.probability == null) return false
  const limit = ctx.params?.bootstrap_probability_threshold ?? 0.99
  return p.probability < limit
}

/** The flags of a peak as short words, for tables. */
export function flagWords(p: Peak): string[] {
  const out: string[] = []
  if (p.flags.bleedthrough) out.push('pull-up')
  if (p.flags.crosstalk) out.push('crosstalk')
  if (p.flags.spectral) out.push('spectral')
  if (p.flags.below_relative_threshold) out.push('low relative')
  if (p.flags.artifact) out.push('artifact')
  if (!p.in_bin) out.push(p.bin_id == null ? 'no bin' : 'off-bin')
  return out
}

/**
 * Peaks that number keys toggle: the ones with a bin, inside the locus
 * range, by size. Key 1 is the smallest.
 */
export function numberedPeaks(peaks: readonly Peak[], range: [number, number]): Peak[] {
  return peaks.filter((p) => p.bin_id != null && p.size >= range[0] - 1 && p.size <= range[1] + 1).sort((a, b) => a.size - b.size)
}

/** Peaks inside the locus range (±1 bp), by size. */
export function peaksInRange(peaks: readonly Peak[], range: [number, number]): Peak[] {
  return peaks.filter((p) => p.size >= range[0] - 1 && p.size <= range[1] + 1).sort((a, b) => a.size - b.size)
}
