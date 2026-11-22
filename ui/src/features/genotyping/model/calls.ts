/**
 * The call table's row model: each `CallRow` from `get_locus_calls` with
 * what triage needs (allele shares, low-probability calls, narrow misses,
 * review state, why it needs attention), plus the filters and sort orders of
 * the review screen. Everything comes from the row itself; nothing is read
 * from exports.
 *
 * "Needs attention" = not reviewed, and at least one concern: failed or no
 * usable run (samples), a negative control with alleles, off-scale signal, a
 * called allele below the bootstrap probability, or a narrow miss. Reviewing
 * a call takes it out of the attention queue; it comes back by itself when
 * the call changes (the engine drops the mark).
 */
import { fmtProbability, fmtShare as fmtShareOf } from '@/lib/format'
import type { CallRow, NarrowMiss } from '@/api/bindings'

export interface AlleleChip {
  bin_id: number
  label: string
  /** Size (bp) of the allele's peak; null for a bin called by hand without a peak. */
  size: number | null
  /** Share of the called signal (bias-corrected when the project corrects), 0..1. */
  share: number | null
  corrected: boolean
  probability: number | null
  /** Called with a probability below the bootstrap threshold. */
  lowProbability: boolean
}

export interface CallView {
  id: string
  row: CallRow
  /** In size order; every called allele, never truncated. */
  chips: AlleleChip[]
  failed: boolean
  noRun: boolean
  curated: boolean
  offscale: boolean
  /** An allele-bin peak sits where the dyes were not separated (spectral breakdown). */
  spectral: boolean
  commented: boolean
  control: boolean
  /** Binned peaks rejected by a small margin (engine rule), by size. */
  narrow: NarrowMiss[]
  lowProbability: number
  /** Reference run's plate and well. */
  plate: string | null
  well: string | null
  /** Runs of the sample at this locus (reference included). */
  runCount: number
  reviewed: boolean
  /** Why its review mark was dropped (the call changed since it was reviewed); null when not dropped. */
  dropped: string | null
  /** What makes this call worth a look, whatever its review state. */
  concerns: string[]
  /** Not reviewed and has a concern. */
  needsAttention: boolean
}

export interface CallViewOptions {
  /** Called alleles below this probability do not count toward MOI (default 0.99). */
  bootstrapThreshold?: number
  /** The project corrects shares for amplification bias (a quantification-bias estimator is linked). */
  biasCorrected?: boolean
}

export function buildCallView(row: CallRow, o: CallViewOptions = {}): CallView {
  const limit = o.bootstrapThreshold ?? 0.99
  const noRun = row.reference_run_id == null
  const failed = row.flags.failure
  const chips: AlleleChip[] = row.alleles.map((a) => {
    const corrected = o.biasCorrected && a.corrected_proportion != null
    const probability = a.probability ?? null
    return {
      bin_id: a.bin_id,
      label: a.label,
      size: a.size ?? null,
      share: (corrected ? a.corrected_proportion : a.proportion) ?? null,
      corrected: !!corrected,
      probability,
      lowProbability: probability != null && probability < limit,
    }
  })
  const narrow = row.narrow_misses ?? []
  const lowProbability = chips.filter((c) => c.lowProbability).length
  const control = row.designation !== 'sample'
  const concerns: string[] = []
  if (noRun) concerns.push('no usable run')
  else if (failed && !control) concerns.push('failed')
  if (row.designation === 'negative_control' && row.alleles.length > 0) concerns.push('negative control with alleles')
  if (row.flags.offscale) concerns.push('off-scale')
  if (row.flags.spectral) concerns.push('spectral breakdown')
  if (lowProbability) concerns.push(`${lowProbability} low-probability call${lowProbability > 1 ? 's' : ''}`)
  if (narrow.length) concerns.push(`${narrow.length} narrow miss${narrow.length > 1 ? 'es' : ''}`)
  const reviewed = !!row.reviewed
  return {
    id: String(row.sample_id),
    row,
    chips,
    failed,
    noRun,
    curated: row.flags.manual_curation,
    offscale: row.flags.offscale,
    spectral: row.flags.spectral,
    commented: !!row.comment,
    control,
    narrow,
    lowProbability,
    plate: row.plate_label ?? null,
    well: row.well_label ?? null,
    runCount: row.run_count ?? (noRun ? 0 : 1),
    reviewed,
    dropped: dropReason(row),
    concerns,
    needsAttention: !reviewed && concerns.length > 0,
  }
}

// ------------------------------------------------------------------ narrow misses in words

const rfu = (v: number) => Math.round(v).toLocaleString('en-US')

/**
 * The margin of a narrow miss in words: "36 RFU below the calling limit
 * after expected stutter (264 of 300 RFU)" or "probability 0.85, threshold
 * 0.90".
 */
export function narrowMissText(m: NarrowMiss): string {
  if (m.reason === 'artifact') return `${rfu(Math.max(0, m.limit - m.value))} RFU below the calling limit after expected stutter (${rfu(m.value)} of ${rfu(m.limit)} RFU)`
  return `probability ${fmtProbability(m.value)}, threshold ${m.limit}`
}

/** Short form for chips: "36 RFU short" or "P 0.85". */
export function narrowMissShort(m: NarrowMiss): string {
  return m.reason === 'artifact' ? `${rfu(Math.max(0, m.limit - m.value))} RFU short` : `P ${m.value.toFixed(2)}`
}

// ------------------------------------------------------------------ filters

export type CallFilterKey = 'attention' | 'unreviewed' | 'failed' | 'curated' | 'commented' | 'low-prob' | 'narrow' | 'offscale' | 'spectral' | 'multi-run' | 'controls'

export const FILTER_LABEL: Record<CallFilterKey, string> = {
  attention: 'Needs attention',
  unreviewed: 'Not reviewed',
  failed: 'Failed / no run',
  curated: 'Curated',
  commented: 'Commented',
  'low-prob': 'Low-probability calls',
  narrow: 'Narrow misses',
  offscale: 'Off-scale',
  spectral: 'Spectral breakdown',
  'multi-run': 'Several runs',
  controls: 'Controls',
}

export const FILTER_HELP: Record<CallFilterKey, string> = {
  attention: 'Not reviewed yet, and failed or no usable run, a negative control with alleles, off-scale, a spectral breakdown, a low-probability call, or a narrow miss.',
  unreviewed: 'Calls nobody has marked reviewed, or whose mark was dropped because the call changed.',
  failed: 'No peak above the failure threshold, or no run with usable sizing.',
  curated: 'Calls edited by hand.',
  commented: 'Calls with a comment.',
  'low-prob': 'A called allele whose probability is below the bootstrap threshold: it does not count toward MOI.',
  narrow: 'A peak in a bin that one calling rule rejected by a small margin: as stutter, just under the height limit; or a probability just under the threshold.',
  offscale: 'Saturated signal; proportions are unreliable.',
  spectral: 'Under a peak in a bin, another dye reads far below its baseline: the capillary\'s dyes were not separated, so a peak may be another dye\'s signal and this dye\'s alleles may show elsewhere.',
  'multi-run': 'The sample has more than one run at this locus (R overlays them).',
  controls: 'Negative and positive controls.',
}

export type AlleleCountFilter = 'any' | '0' | '1' | '2' | '3+' | '2+'

export interface CallFilters {
  text: string
  flags: CallFilterKey[]
  alleles: AlleleCountFilter
}

export const NO_FILTERS: CallFilters = { text: '', flags: [], alleles: 'any' }

function matchesFlag(v: CallView, f: CallFilterKey): boolean {
  switch (f) {
    case 'attention':
      return v.needsAttention
    case 'unreviewed':
      return !v.reviewed
    case 'failed':
      return v.failed || v.noRun
    case 'curated':
      return v.curated
    case 'commented':
      return v.commented
    case 'low-prob':
      return v.lowProbability > 0
    case 'narrow':
      return v.narrow.length > 0
    case 'offscale':
      return v.offscale
    case 'spectral':
      return v.spectral
    case 'multi-run':
      return v.runCount > 1
    case 'controls':
      return v.control
  }
}

function matchesCount(n: number, f: AlleleCountFilter): boolean {
  switch (f) {
    case 'any':
      return true
    case '3+':
      return n >= 3
    case '2+':
      return n >= 2
    default:
      return n === Number(f)
  }
}

/** Every flag filter must match (AND); text matches barcode, allele labels, well or comment. */
export function filterCalls(rows: readonly CallView[], f: CallFilters): CallView[] {
  const q = f.text.trim().toLowerCase()
  return rows.filter((v) => {
    if (!matchesCount(v.row.alleles.length, f.alleles)) return false
    for (const k of f.flags) if (!matchesFlag(v, k)) return false
    if (!q) return true
    if (v.row.barcode.toLowerCase().includes(q)) return true
    if (v.well?.toLowerCase() === q) return true
    if (v.row.comment?.toLowerCase().includes(q)) return true
    return v.row.alleles.some((a) => a.label.toLowerCase() === q)
  })
}

/** The active filters in words, for the bulk-review confirmation. */
export function describeFilters(f: CallFilters): string {
  const parts: string[] = f.flags.map((k) => FILTER_LABEL[k].toLowerCase())
  if (f.alleles !== 'any') parts.push(f.alleles === '0' ? 'no allele' : f.alleles.endsWith('+') ? `${f.alleles.slice(0, -1)} or more alleles` : `${f.alleles} allele${f.alleles === '1' ? '' : 's'}`)
  if (f.text.trim()) parts.push(`matching “${f.text.trim()}”`)
  return parts.join(', ')
}

// ------------------------------------------------------------------ sort

export type CallSortKey = 'barcode' | 'alleles' | 'moi' | 'height' | 'attention' | 'well' | 'probability'

export interface CallSort {
  key: CallSortKey
  desc: boolean
}

/** Natural order for barcodes like D1-S2 < D1-S10. */
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

function sortValue(v: CallView, k: CallSortKey): number | string | null {
  switch (k) {
    case 'barcode':
      return v.row.barcode
    case 'alleles':
      return v.row.alleles.length
    case 'moi':
      return v.row.moi
    case 'height':
      return v.row.max_height
    case 'attention':
      // Needing attention first, then reviewed-with-concerns, then by concern count.
      return (v.needsAttention ? 100 : 0) + v.concerns.length
    case 'well':
      return v.well ? `${v.plate ?? ''} ${v.well.slice(1)}${v.well[0]}` : null // column-major like a plate run
    case 'probability':
      return v.row.min_probability ?? null
  }
}

/** Stable sort; missing values last in either direction; ties by barcode. */
export function sortCalls(rows: readonly CallView[], s: CallSort): CallView[] {
  const dir = s.desc ? -1 : 1
  return rows
    .map((v, i) => ({ v, i, k: sortValue(v, s.key) }))
    .sort((a, b) => {
      if (a.k == null || b.k == null) {
        if (a.k == null && b.k == null) return collator.compare(a.v.row.barcode, b.v.row.barcode) || a.i - b.i
        return a.k == null ? 1 : -1
      }
      const c = typeof a.k === 'number' && typeof b.k === 'number' ? a.k - b.k : collator.compare(String(a.k), String(b.k))
      return c * dir || collator.compare(a.v.row.barcode, b.v.row.barcode) || a.i - b.i
    })
    .map((x) => x.v)
}

/** Share as "62%"/"4.1%", or "" when unknown. */
export function fmtShare(s: number | null | undefined): string {
  return s == null ? '' : fmtShareOf(s)
}

// ------------------------------------------------------------------ review marks

/** Review progress of a locus or project: "34 of 276 reviewed". */
export interface ReviewProgress {
  calls: number
  reviewed: number
}

export function addProgress(a: ReviewProgress, b: ReviewProgress): ReviewProgress {
  return { calls: a.calls + b.calls, reviewed: a.reviewed + b.reviewed }
}

/**
 * Why a call's review mark no longer holds (the engine's `review_dropped`:
 * a mark is stored but its alleles, flags or reference run changed since),
 * in words; null when it was not dropped.
 */
export function dropReason(row: CallRow): string | null {
  if (!row.review_dropped) return null
  if (row.flags.manual_curation) return 'Its alleles were changed by hand after it was reviewed. Confirm it again (Enter or M) once it looks right.'
  return 'The call changed since it was reviewed (its alleles, flags or reference run, after re-analysis or the probabilistic pass), so the mark no longer holds. Review it again.'
}
