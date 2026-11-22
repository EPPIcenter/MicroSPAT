/**
 * Plain-word names for artifact distance classes. A class is a distance
 * from the parent (the run's main peak) at which secondary peaks recur in
 * single-clone runs: −1 repeat is classic stutter, −2 repeats double
 * stutter, +1 repeat forward stutter; distances that are not a whole number
 * of repeats (e.g. −1 bp, incomplete A-addition) are named in bp. The global
 * class has no distance: left-over low peaks anywhere in the run.
 */
import type { ArtifactEstimatorView, ErrorEstimator, RegressionMethod } from '@/api/bindings'

export interface ClassName {
  /** "−1 repeat (−3.0 bp)", "−1.0 bp", "Global (background)". */
  label: string
  /** "Stutter: one repeat shorter than its parent." */
  description: string
  /** Whole repeats when the distance is (near) a multiple of the repeat. */
  repeats: number | null
  global: boolean
  /** Sort key: global last, then by |distance|, shorter side first. */
  order: number
}

/** A distance is "a whole number of repeats" within this fraction of a repeat. */
export const REPEAT_TOLERANCE = 0.15

const MINUS = '−'

/** Signed number with a real minus sign and a + for positives. */
export function signed(v: number, digits = 1): string {
  const s = Math.abs(v).toFixed(digits)
  if (Number(s) === 0) return s
  return v < 0 ? `${MINUS}${s}` : `+${s}`
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five']

export function className(distance: number | null, repeat: number): ClassName {
  if (distance == null)
    return {
      label: 'Global (background)',
      description: 'Low peaks anywhere in the run, not at a fixed distance from the main peak.',
      repeats: null,
      global: true,
      order: Number.MAX_SAFE_INTEGER,
    }
  const bp = `${signed(distance)} bp`
  const order = Math.abs(distance) * 2 + (distance > 0 ? 1 : 0)
  if (repeat > 0) {
    const k = distance / repeat
    const whole = Math.round(k)
    if (whole !== 0 && Math.abs(k - whole) <= REPEAT_TOLERANCE) {
      const n = Math.abs(whole)
      const label = `${whole < 0 ? MINUS : '+'}${n} repeat${n > 1 ? 's' : ''} (${bp})`
      const words = WORDS[n] ?? String(n)
      const description =
        whole === -1
          ? 'Stutter: one repeat shorter than its parent.'
          : whole === 1
            ? 'Forward stutter: one repeat longer than its parent.'
            : whole < 0
              ? `${whole === -2 ? 'Double stutter' : 'Stutter'}: ${words} repeats shorter than its parent.`
              : `${words[0]!.toUpperCase()}${words.slice(1)} repeats longer than its parent.`
      return { label, description, repeats: whole, global: false, order }
    }
  }
  const near1 = Math.abs(Math.abs(distance) - 1) < 0.35
  return {
    label: bp,
    description:
      near1 && distance < 0
        ? 'One base shorter than its parent, not a whole repeat: often incomplete non-templated A-addition.'
        : `${Math.abs(distance).toFixed(1)} bp ${distance < 0 ? 'shorter' : 'longer'} than its parent, not a whole number of repeats.`,
    repeats: null,
    global: false,
    order,
  }
}

/** Estimators of a locus in reading order: −1 repeat, +1 repeat, −2 repeats, …, global last. */
export function sortClasses<T extends Pick<ArtifactEstimatorView, 'artifact_distance'>>(ests: readonly T[], repeat: number): T[] {
  return [...ests].sort((a, b) => className(a.artifact_distance, repeat).order - className(b.artifact_distance, repeat).order)
}

export const METHOD_LABEL: Record<RegressionMethod, string> = {
  theil_sen: 'Theil–Sen',
  least_squares: 'Least squares',
  ransac: 'RANSAC',
  no_slope: 'No slope (mean)',
}

export const METHOD_HELP: Record<RegressionMethod, string> = {
  theil_sen: 'Median of pairwise slopes. Robust to outliers; the default for distance classes.',
  least_squares: 'Ordinary least squares. Pulled by outliers such as minor alleles that passed as stutter.',
  ransac: 'Fits the inliers of repeated random samples. Very tight when there is plenty of data, erratic with few points.',
  no_slope: 'A flat line (at the mean ratio, or at the densest half with that error estimate). Used when parents cover too narrow a size range to measure a slope, or the line would go negative between them; the default for the global class.',
}

export const ERROR_LABEL: Record<ErrorEstimator, string> = {
  densest_half: 'Densest half',
  mad: 'Robust MAD',
  rms: 'RMS',
}

/** For tight table cells. */
export const ERROR_SHORT: Record<ErrorEstimator, string> = {
  densest_half: 'half',
  mad: 'MAD',
  rms: 'RMS',
}

/** Breakpoints of a class: the starts of every segment but the first. */
export function breakpointsOf(e: Pick<ArtifactEstimatorView, 'equations'>): number[] {
  return e.equations.slice(1).map((q) => q.segment.start_size)
}

/** Global estimator tooltip text: what it is and how genotyping uses it. */
export const GLOBAL_HELP =
  'Secondary peaks of single-clone runs that belong to no distance class and sit in no allele bin, fit flat at their mean with the MAD spread (at least as many points as a class needs). ' +
  'In genotyping it applies to the run’s tallest peak only: every other peak of the run is expected to carry this much background on top of any stutter.'
