/**
 * Controls: known lab strains with one allele (a bin of their bin estimator)
 * per locus. Pure helpers for the list and the allele grid.
 */
import type { Bin, Control, ControlAlleleInput, DeletedBin } from '@/api/bindings'

/** Loci with an allele set, out of all loci of the bin estimator's locus set. */
export function allelesSet(c: Pick<Control, 'alleles'>): { set: number; total: number } {
  return { set: c.alleles.filter((a) => a.bin_id != null).length, total: c.alleles.length }
}

/**
 * Bins matching what the user typed: by label (exact first, then prefix,
 * then substring) or, for a number, by size (within 2 bp, nearest first).
 * An empty query lists every bin by size.
 */
export function filterBins(bins: readonly Bin[], query: string): Bin[] {
  const q = query.trim().toLowerCase()
  const bySize = [...bins].sort((a, b) => a.base_size - b.base_size)
  if (!q) return bySize
  const num = /^\d+(\.\d*)?$/.test(q) ? Number(q) : null
  const scored: { b: Bin; s: number }[] = []
  for (const b of bySize) {
    const l = b.label.toLowerCase()
    let s = Infinity
    if (l === q) s = 0
    else if (l.startsWith(q)) s = 1
    else if (num != null && Math.abs(b.base_size - num) <= 2) s = 2 + Math.abs(b.base_size - num)
    else if (l.includes(q)) s = 10
    if (s < Infinity) scored.push({ b, s })
  }
  return scored.sort((a, b) => a.s - b.s || a.b.base_size - b.b.base_size).map((x) => x.b)
}

/** Words that clear an allele when typed into the picker. */
export function isNoneQuery(q: string): boolean {
  return ['-', '—', 'none', 'no', 'x'].includes(q.trim().toLowerCase())
}

/** A free label like "3D7 copy", "3D7 copy 2", … not in `taken` (case-insensitive). */
export function copyLabel(label: string, taken: readonly string[]): string {
  const set = new Set(taken.map((t) => t.toLowerCase()))
  const base = `${label} copy`
  if (!set.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) if (!set.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`
}

/** Draft alleles: locus id → bin id (null = none). */
export type AlleleDraft = ReadonlyMap<number, number | null>

export function draftOf(c: Pick<Control, 'alleles'> | null): Map<number, number | null> {
  return new Map((c?.alleles ?? []).map((a) => [a.locus_id, a.bin_id]))
}

/** Alleles to send: only loci whose bin differs from the saved control (all set loci for a new one). */
export function changedAlleles(draft: AlleleDraft, saved: Pick<Control, 'alleles'> | null): ControlAlleleInput[] {
  const before = draftOf(saved)
  const out: ControlAlleleInput[] = []
  for (const [locus_id, bin_id] of draft) {
    const was = before.get(locus_id) ?? null
    if (saved ? was !== bin_id : bin_id != null) out.push({ locus_id, bin_id })
  }
  return out
}

export interface AlleleIssue {
  locusId: number
  kind: 'missing' | 'deleted' | 'gone' | 'stale' | 'no_bins'
  level: 'warn' | 'danger'
  text: string
}

/**
 * What is wrong with a control's alleles against the bin estimator's current
 * bins: an allele whose bin was deleted (`deleted`: the engine remembers the
 * bin, so this is told apart from a locus never set), a locus without an
 * allele, an allele pointing at a bin not in the list (`gone`), and bins
 * that are not current at a locus (re-estimate pending, so the allele may
 * move). `deleted` maps a locus to the bin its saved allele had.
 */
export function alleleIssues(
  alleles: ReadonlyMap<number, number | null>,
  loci: readonly { locus_id: number; label: string; binsState?: 'current' | 'stale' | 'not_analyzed' }[],
  binsByLocus: ReadonlyMap<number, readonly Bin[]>,
  deleted: ReadonlyMap<number, DeletedBin> = new Map(),
): AlleleIssue[] {
  const out: AlleleIssue[] = []
  for (const l of loci) {
    const bin = alleles.get(l.locus_id) ?? null
    const bins = binsByLocus.get(l.locus_id)
    if (l.binsState === 'not_analyzed') out.push({ locusId: l.locus_id, kind: 'no_bins', level: 'warn', text: `${l.label}: the bin estimator has no bins here yet.` })
    else if (l.binsState === 'stale') out.push({ locusId: l.locus_id, kind: 'stale', level: 'warn', text: `${l.label}: the bin estimator's bins are out of date; re-estimating may remove or rename this allele's bin.` })
    const was = deleted.get(l.locus_id)
    if (bin == null && was)
      out.push({
        locusId: l.locus_id,
        kind: 'deleted',
        level: 'danger',
        text: `${l.label}: its allele's bin ${was.label} (${was.base_size.toFixed(2)} bp) was deleted from the bin estimator. Pick the allele again.`,
      })
    else if (bin == null) out.push({ locusId: l.locus_id, kind: 'missing', level: 'warn', text: `${l.label}: no allele set.` })
    else if (bins && !bins.some((b) => b.id === bin)) out.push({ locusId: l.locus_id, kind: 'gone', level: 'danger', text: `${l.label}: the allele's bin no longer exists in the bin estimator.` })
  }
  return out
}

/** Locus id → the deleted bin of each allele that lost its bin. */
export function deletedBins(c: Pick<Control, 'alleles'> | null): Map<number, DeletedBin> {
  return new Map((c?.alleles ?? []).flatMap((a) => (a.deleted_bin ? [[a.locus_id, a.deleted_bin] as const] : [])))
}
