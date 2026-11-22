/**
 * The amplification-bias model as the engine fits it (microspat_core::quant_bias):
 *
 *   logit(observed share) = logit(true share) + β · (size − mixture center)
 *
 * β is per locus, in log-odds per bp. PCR favours short fragments, so β is
 * normally negative: an allele shorter than the mixture's center (negative
 * offset) shows a larger share than it really has. These helpers translate β
 * into shares people can read, and judge whether a fit can be trusted.
 */
import type { BiasEstimate, QuantBiasPoint } from '@/api/bindings'

export function logit(p: number): number {
  return Math.log(p / (1 - p))
}

export function sigmoid(l: number): number {
  return 1 / (1 + Math.exp(-l))
}

/** Share an allele `offset` bp from the mixture's center appears to have when its true share is `trueShare`. */
export function apparentShare(beta: number, offset: number, trueShare = 0.5): number {
  return sigmoid(logit(trueShare) + beta * offset)
}

/** Percent with one decimal, e.g. "51.2%". */
export function pct1(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

export interface BetaReading {
  /** "A fragment 10 bp shorter than its mixture's center appears as 51.2% when its true share is 50%." */
  sentence: string
  /** The companion for a longer fragment. */
  longer: string
  /** Which length the locus favours at this β. */
  favours: 'shorter' | 'longer' | 'neither'
  shortShare: number
  longShare: number
}

/**
 * Translate β for people: what a 50% allele `offset` bp shorter (and longer)
 * than its mixture's center looks like in the peak heights.
 */
export function readBeta(beta: number, offset = 10): BetaReading {
  const shortShare = apparentShare(beta, -offset)
  const longShare = apparentShare(beta, offset)
  const favours = pct1(shortShare) === pct1(longShare) ? 'neither' : shortShare > longShare ? 'shorter' : 'longer'
  return {
    sentence: `A fragment ${offset} bp shorter than its mixture's center appears as ${pct1(shortShare)} when its true share is 50%.`,
    longer: `One ${offset} bp longer appears as ${pct1(longShare)}.`,
    favours,
    shortShare,
    longShare,
  }
}

/** β in a fixed, readable form: "−0.0049". */
export function fmtBeta(beta: number | null | undefined, digits = 4): string {
  if (beta == null || !Number.isFinite(beta)) return '–'
  const s = Math.abs(beta).toFixed(digits)
  return beta < 0 ? `−${s}` : s
}

/**
 * Standard error of β for a least-squares fit through the origin, clustered
 * by control mixture: √(G/(G−1) · Σ_g (Σ_{i∈g} x_i·e_i)²) / Σx², with x the
 * size offsets of the peaks used, e their residuals and G the number of
 * mixtures. The peaks of one run are not independent (a two-strain run's
 * two points mirror each other), so the plain sd / √Σx² is too small. Null
 * with no spread or fewer than two mixtures.
 */
export function betaStandardError(est: BiasEstimate | null | undefined, points: readonly QuantBiasPoint[]): number | null {
  if (!est) return null
  let sxx = 0
  const score = new Map<number, number>()
  for (const p of points) {
    if (!p.used || p.log_odds_error == null) continue
    sxx += p.centered_size * p.centered_size
    const e = p.log_odds_error - est.beta * p.centered_size
    score.set(p.sample_id, (score.get(p.sample_id) ?? 0) + p.centered_size * e)
  }
  const g = score.size
  if (!(sxx > 0) || g < 2) return null
  let meat = 0
  for (const v of score.values()) meat += v * v
  return Math.sqrt((g / (g - 1)) * meat) / sxx
}

export interface FitIssue {
  level: 'warn' | 'danger'
  /** Short tag for lists: "positive β". */
  tag: string
  text: string
}

/** Fits below this R² are flagged. */
export const POOR_R2 = 0.5
/** Fits from fewer mixtures than this are flagged. */
export const FEW_MIXTURES = 3

/** What makes a locus's β suspect, most serious first. */
export function fitIssues(est: BiasEstimate | null | undefined, se?: number | null): FitIssue[] {
  if (!est) return [{ level: 'danger', tag: 'no estimate', text: 'No mixture qualified, so there is no β. Genotyping projects get no correction at this locus.' }]
  const out: FitIssue[] = []
  if (est.beta > 0)
    out.push({
      level: 'danger',
      tag: 'positive β',
      text: 'β is positive: longer fragments appear over-represented, the opposite of the usual PCR bias. Check the control alleles at this locus and the mixture proportions.',
    })
  if (est.r_squared < POOR_R2)
    out.push({ level: 'warn', tag: `R² ${est.r_squared.toFixed(2)}`, text: `Poor fit (R² ${est.r_squared.toFixed(2)}): size explains little of the observed-versus-true difference.` })
  if (est.n_sets < FEW_MIXTURES)
    out.push({ level: 'warn', tag: `${est.n_sets} mixture${est.n_sets === 1 ? '' : 's'}`, text: `Only ${est.n_sets} mixture${est.n_sets === 1 ? '' : 's'} behind the estimate.` })
  if (se != null && est.beta < 0 && Math.abs(est.beta) < 1.96 * se)
    out.push({ level: 'warn', tag: 'not clearly ≠ 0', text: 'The 95% interval of β includes 0: the data do not show a clear bias.' })
  return out
}
