/**
 * The control peaks behind a β fit, as table rows. The engine reports, per
 * point, whether it entered the fit (`used`), the peak's height and allele as
 * the fit saw them, and when it was left out the reason (`exclusion`), all
 * from the same code as the fit itself; this module only words them.
 */
import type { ControlPeakExclusion, MissingControlAllele, QuantBiasParams, QuantBiasPoint } from '@/api/bindings'
import { fmtRfu } from '@/lib/format'

export interface Exclusion {
  code: ControlPeakExclusion | 'unknown'
  /** Short label for the table. */
  label: string
  /** Full sentence for the tooltip / hover. */
  text: string
}

export interface PointRow {
  /** Stable key: sample and size. */
  key: string
  point: QuantBiasPoint
  /** Index into the points array (for the plot). */
  index: number
  allele: string | null
  height: number | null
  /** Null when used. */
  excluded: Exclusion | null
  /** (y − β·x) / sd for plotted, used points; null otherwise. */
  z: number | null
}

function pct(v: number): string {
  const s = (v * 100).toFixed(1)
  return `${s.endsWith('.0') ? s.slice(0, -2) : s}%`
}

/**
 * Why the fit left a point out, in words. `params` are the parameters the
 * fit used (`LocusQuantBias.params`), for the numbers in the sentence.
 */
export function exclusionOf(p: QuantBiasPoint, params: QuantBiasParams | null | undefined): Exclusion | null {
  if (p.used) return null
  const min = params?.min_true_proportion
  const range = min != null ? `the ${pct(min)}–${pct(1 - min)} range used for estimation` : 'the range used for estimation'
  switch (p.exclusion) {
    case 'below_min_true_proportion':
      return {
        code: p.exclusion,
        label: `share ${pct(p.true_proportion)} below range`,
        text: `Its true share, ${pct(p.true_proportion)}, is below ${range} (minimum true proportion).`,
      }
    case 'above_max_true_proportion':
      return {
        code: p.exclusion,
        label: `share ${pct(p.true_proportion)} above range`,
        text: `Its true share, ${pct(p.true_proportion)}, is above ${range}.`,
      }
    case 'below_min_height':
      return {
        code: p.exclusion,
        label: p.height != null ? `${fmtRfu(p.height)} RFU ≤ min height` : 'below min height',
        text: `This peak${p.height != null ? ` is ${fmtRfu(p.height)} RFU,` : ' is'} at or below the ${params ? `${fmtRfu(params.min_peak_height)} RFU ` : ''}minimum peak height.`,
      }
    case 'off_scale':
      return {
        code: p.exclusion,
        label: 'mixture off-scale',
        text: `The mixture is left out: a control peak is above the ${params ? `${fmtRfu(params.offscale_threshold)} RFU ` : ''}off-scale threshold, so heights no longer track template amounts.`,
      }
    case 'control_allele_not_found':
      return {
        code: p.exclusion,
        label: 'a control allele is missing',
        text: "The mixture is left out: part of it is on no peak (a control has no allele set at this locus, or no peak in its allele's bin), so the shares found do not add up to the mixture.",
      }
    case 'single_peak_set':
      return {
        code: p.exclusion,
        label: 'too few usable peaks',
        text: 'The mixture is left out: fewer than two of its control peaks pass the share and height limits, so there is nothing to compare this peak with.',
      }
    case 'partner_excluded':
      return {
        code: p.exclusion,
        label: 'partner peak left out',
        text: 'The mixture is left out: another of its control peaks was left out, so the counted ones do not sum to 100%.',
      }
    default:
      return { code: 'unknown', label: 'left out', text: 'The engine left this peak out of the fit.' }
  }
}

/** Why a mixture component has no peak, in words. */
export function missingText(m: MissingControlAllele): string {
  switch (m) {
    case 'not_set':
      return 'no allele set at this locus'
    case 'bin_deleted':
      return "its allele's bin was deleted"
    case 'no_peak':
      return "no peak in its allele's bin"
  }
}

/** Every point as a table row, with its allele, height and exclusion reason. */
export function buildPointRows(
  points: readonly QuantBiasPoint[],
  params: QuantBiasParams | null | undefined,
  opts: { beta?: number | null; sd?: number | null } = {},
): PointRow[] {
  return points.map((p, index) => {
    const z =
      p.used && p.log_odds_error != null && opts.beta != null && opts.sd != null && opts.sd > 0
        ? (p.log_odds_error - opts.beta * p.centered_size) / opts.sd
        : null
    return {
      key: `${p.sample_id}:${p.size.toFixed(2)}`,
      point: p,
      index,
      allele: p.bin_label ?? null,
      height: p.height ?? null,
      excluded: exclusionOf(p, params),
      z,
    }
  })
}

/** |z| above this marks an outlier. */
export const OUTLIER_Z = 2

export interface Accuracy {
  /** Mean absolute error of observed share against true share. */
  before: number
  /** Same after correction with β. */
  after: number
  n: number
}

/** How far shares are from the truth before and after correction (peaks with 0 < true < 1 and a corrected share). */
export function correctionAccuracy(points: readonly QuantBiasPoint[], onlyUsed = false): Accuracy | null {
  let b = 0
  let a = 0
  let n = 0
  for (const p of points) {
    if (onlyUsed && !p.used) continue
    if (p.corrected_proportion == null || p.true_proportion <= 0 || p.true_proportion >= 1) continue
    b += Math.abs(p.observed_proportion - p.true_proportion)
    a += Math.abs(p.corrected_proportion - p.true_proportion)
    n++
  }
  return n ? { before: b / n, after: a / n, n } : null
}
