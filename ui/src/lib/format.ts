/** Number formatting shared by tables, tooltips and plot readouts. Always en-US (1,234.5), as the CSV exports are, so separators never mix. */

export function fmtNumber(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '–'
  return v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

export function fmtFixed(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '–'
  return v.toFixed(digits)
}

export function fmtPercent(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return '–'
  return `${(v * 100).toFixed(digits)}%`
}

export function fmtRfu(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '–'
  return Math.round(v).toLocaleString('en-US')
}

/** English plural of a count noun: plural(1, 'locus', 'loci') → 'locus'. Defaults to adding "s". */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return n === 1 ? singular : pluralForm
}

/** "1 plate", "3 loci", "0 samples", with thousands separators. */
export function countOf(n: number, singular: string, pluralForm?: string): string {
  return `${n.toLocaleString('en-US')} ${plural(n, singular, pluralForm)}`
}

/** A share of a whole (allele share, prevalence): one decimal below 10%, whole percent above ("4.5%", "38%"). */
export function fmtShare(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '–'
  return v > 0 && v < 0.1 ? `${(v * 100).toFixed(1)}%` : `${Math.round(v * 100)}%`
}

/** A probability, always three decimals so 0.990 and 0.999 differ ("0.987"). */
export function fmtProbability(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '–'
  return v.toFixed(3)
}
