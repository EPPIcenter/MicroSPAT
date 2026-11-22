/**
 * What a fitted segment predicts, in words. Genotyping expects
 * `max(0, slope · parent size + intercept) · parent height` RFU at the class's
 * distance from every parent peak, with an error of `sd · parent height`
 * (microspat_core::artifact). A peak there is flagged as artifact when its
 * height minus the expected artifact (minus `hard_artifact_sd_limit` errors)
 * is below `absolute_peak_height_limit`, and the probabilistic pass calls it
 * regardless of probability once it is more than `soft_artifact_sd_limit`
 * errors above the expectation. Contributions and errors add over all
 * parents of a peak; the sentences here are for one parent.
 */
import type { ArtifactEquation, LinearFit } from '@/api/bindings'
import { signed, type ClassName } from './classes'

export interface Expectation {
  /** Predicted artifact height relative to the parent (may be negative). */
  ratio: number
  /** RFU, clamped at 0 like the engine. */
  expected: number
  /** One SD, RFU. */
  sd: number
  /** The line is below zero here: the engine expects nothing. */
  clamped: boolean
}

export function expectation(fit: Pick<LinearFit, 'slope' | 'intercept' | 'sd'>, parentSize: number, parentHeight: number): Expectation {
  const ratio = fit.slope * parentSize + fit.intercept
  return { ratio, expected: Math.max(0, ratio) * parentHeight, sd: Math.max(0, fit.sd) * parentHeight, clamped: ratio < 0 }
}

/** "8,500" (whole RFU). */
export function rfu(v: number): string {
  return Math.round(v).toLocaleString('en-US')
}

export function pct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`
}

/**
 * The segment whose range holds a parent size. Ranges are closed, and a size
 * on a breakpoint belongs to the lower segment, as in the engine (segments
 * come in size order, so the first match is the lower one).
 */
export function segmentAt<T extends Pick<ArtifactEquation, 'segment'>>(eqs: readonly T[], size: number): T | undefined {
  return eqs.find((e) => e.segment.start_size <= size && size <= e.segment.end_size)
}

function peakNoun(c: ClassName): string {
  if (c.repeats === -1) return 'stutter peak'
  if (c.repeats === -2) return 'double-stutter peak'
  if (c.repeats === 1) return 'forward-stutter peak'
  return 'artifact peak'
}

/**
 * "At 200 bp, a 10,000 RFU parent is expected to produce a stutter peak at
 * 197.0 bp of 850 ± 120 RFU."
 */
export function expectedSentence(
  c: ClassName,
  distance: number | null,
  fit: Pick<LinearFit, 'slope' | 'intercept' | 'sd'>,
  parentSize: number,
  parentHeight: number,
): string {
  const e = expectation(fit, parentSize, parentHeight)
  const at = `At ${parentSize.toFixed(0)} bp, a ${rfu(parentHeight)} RFU`
  const amount = `${rfu(e.expected)} ± ${rfu(e.sd)} RFU`
  const below = e.clamped ? ' (the fitted line is below zero at this size, so the expectation is 0)' : ''
  if (c.global || distance == null)
    return `${at} main peak is expected to add ${amount} of background to every other peak of the run${below}.`
  return `${at} parent is expected to produce a ${peakNoun(c)} at ${(parentSize + distance).toFixed(1)} bp of ${amount}${below}.`
}

export interface CallingLimits {
  absolute_peak_height_limit: number
  hard_artifact_sd_limit: number
  soft_artifact_sd_limit: number
}

/** The engine's default calling settings (GenotypingParams). */
export const DEFAULT_CALLING: CallingLimits = { absolute_peak_height_limit: 200, hard_artifact_sd_limit: 0, soft_artifact_sd_limit: 6 }

/** Heights at which a peak at that position (with only this parent) is kept and is called outright. */
export function callingHeights(e: Expectation, limits: CallingLimits = DEFAULT_CALLING): { keep: number; sure: number } {
  return {
    keep: e.expected + limits.hard_artifact_sd_limit * e.sd + limits.absolute_peak_height_limit,
    sure: e.expected + limits.soft_artifact_sd_limit * Math.max(e.sd, 1),
  }
}

/** "With default calling settings, a peak there from this parent alone is flagged as artifact below 1,150 RFU and called whatever its probability above 1,570 RFU." */
export function callingSentence(c: ClassName, e: Expectation, limits: CallingLimits = DEFAULT_CALLING): string {
  const h = callingHeights(e, limits)
  const where = c.global ? 'another peak of the run' : 'a peak there'
  return `With default calling settings, ${where} with only this parent is flagged as artifact below ${rfu(h.keep)} RFU and is called whatever its probability above ${rfu(h.sure)} RFU (${limits.soft_artifact_sd_limit} SD).`
}

export interface FitWarning {
  text: string
}

/** Signs of a fit that deserves a look, for scanning many classes. */
export function fitWarnings(eq: ArtifactEquation): FitWarning[] {
  const out: FitWarning[] = []
  const { slope, intercept, sd, r_squared } = eq.fit
  const s = eq.segment
  if (eq.n_points < 10) out.push({ text: `Only ${eq.n_points} points.` })
  const at = (x: number) => slope * x + intercept
  const mid = at((s.start_size + s.end_size) / 2)
  if (sd > 0 && sd > Math.abs(mid)) {
    const hint =
      s.method !== 'least_squares' && s.error !== 'mad'
        ? ' A few high points (minor alleles in runs taken as single-clone) inflate an RMS SD; robust MAD ignores them.'
        : ''
    out.push({ text: `Noisy: the SD (${pct(sd)}) is larger than the expected height (${pct(Math.max(0, mid))}).${hint}` })
  }
  if (s.method !== 'no_slope' && r_squared < 0)
    out.push({ text: `R² is ${r_squared.toFixed(2)}: the line explains less than a flat mean would.` })
  const a = at(s.start_size)
  const b = at(s.end_size)
  if (a < 0 || b < 0) {
    const zero = slope !== 0 ? -intercept / slope : NaN
    const range = a < 0 && b < 0 ? 'over the whole segment' : a < 0 ? `below ${zero.toFixed(0)} bp` : `above ${zero.toFixed(0)} bp`
    out.push({ text: `The line is below zero ${range}: no artifact is expected there.` })
  }
  return out
}

/** "+0.16 % per bp". */
export function slopeText(slope: number): string {
  return `${signed(slope * 100, Math.abs(slope * 100) < 0.01 ? 4 : 3)} % per bp`
}
