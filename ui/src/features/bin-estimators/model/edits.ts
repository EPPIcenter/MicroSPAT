/**
 * Unsaved bin edits of one locus: the bins as saved (`base`), the bins as
 * edited (`present`), and multi-step undo / redo between them. Saving sends
 * the difference as one `update_locus_bins` batch: new bins (id ≤ 0),
 * changed bins, and the ids of deleted bins.
 */
import type { Bin, UpdateLocusBinsParams } from '@/api/bindings'

export interface BinEdits {
  /** Bins as last loaded from the engine. */
  base: Bin[]
  present: Bin[]
  past: Bin[][]
  future: Bin[][]
  /** Coalescing: consecutive edits with the same key within `COALESCE_MS` make one undo step. */
  lastKey: string | null
  lastAt: number
}

/** Keyboard nudges of one bin within this window are one undo step. */
export const COALESCE_MS = 800
/** Undo steps kept. */
export const HISTORY_LIMIT = 200

export function initEdits(bins: readonly Bin[]): BinEdits {
  return { base: [...bins], present: [...bins], past: [], future: [], lastKey: null, lastAt: 0 }
}

/** Record an edit. `key` (e.g. "nudge:12") merges repeats into one undo step. */
export function applyEdit(s: BinEdits, next: Bin[], key: string | null = null, now = Date.now()): BinEdits {
  if (sameBins(next, s.present)) return s
  const coalesce = key != null && key === s.lastKey && now - s.lastAt < COALESCE_MS && s.past.length > 0
  const past = coalesce ? s.past : [...s.past, s.present].slice(-HISTORY_LIMIT)
  return { ...s, present: next, past, future: [], lastKey: key, lastAt: now }
}

export function undo(s: BinEdits): BinEdits {
  const prev = s.past[s.past.length - 1]
  if (!prev) return s
  return { ...s, present: prev, past: s.past.slice(0, -1), future: [s.present, ...s.future], lastKey: null }
}

export function redo(s: BinEdits): BinEdits {
  const next = s.future[0]
  if (!next) return s
  return { ...s, present: next, past: [...s.past, s.present], future: s.future.slice(1), lastKey: null }
}

/** Back to the saved bins. Discarding is final (no redo). */
export function discard(s: BinEdits): BinEdits {
  return initEdits(s.base)
}

/**
 * New bins arrived from the engine. Without edits, adopt them. With edits,
 * keep the edits on top of the old base (the caller warns that the bins
 * changed underneath, see `baseChanged`).
 */
export function receive(s: BinEdits | undefined, bins: readonly Bin[]): BinEdits {
  if (!s) return initEdits(bins)
  if (isDirty(s) || sameBins(s.base, bins)) return s
  return initEdits(bins)
}

/** The saved bins differ from what the edits started from. */
export function baseChanged(s: BinEdits, bins: readonly Bin[]): boolean {
  return !sameBins(s.base, bins)
}

function sameBin(a: Bin, b: Bin): boolean {
  return a.id === b.id && a.label === b.label && a.base_size === b.base_size && a.bin_buffer === b.bin_buffer
}

export function sameBins(a: readonly Bin[], b: readonly Bin[]): boolean {
  if (a.length !== b.length) return false
  const m = new Map(b.map((x) => [x.id, x]))
  return a.every((x) => {
    const y = m.get(x.id)
    return !!y && sameBin(x, y)
  })
}

export interface BinDiff {
  created: Bin[]
  changed: Bin[]
  deleted: Bin[]
}

export function diffBins(base: readonly Bin[], present: readonly Bin[]): BinDiff {
  const old = new Map(base.map((b) => [b.id, b]))
  const now = new Set(present.map((b) => b.id))
  const created: Bin[] = []
  const changed: Bin[] = []
  for (const b of present) {
    const o = b.id > 0 ? old.get(b.id) : undefined
    if (!o) created.push(b)
    else if (!sameBin(o, b)) changed.push(b)
  }
  const deleted = base.filter((b) => !now.has(b.id))
  return { created, changed, deleted }
}

export function isDirty(s: BinEdits): boolean {
  const d = diffBins(s.base, s.present)
  return d.created.length + d.changed.length + d.deleted.length > 0
}

/** "2 new, 1 moved or resized, 3 deleted". */
export function describeDiff(d: BinDiff): string {
  const parts: string[] = []
  if (d.created.length) parts.push(`${d.created.length} new`)
  if (d.changed.length) parts.push(`${d.changed.length} changed`)
  if (d.deleted.length) parts.push(`${d.deleted.length} deleted`)
  return parts.join(', ')
}

/**
 * The `update_locus_bins` batch for the edits, or null when nothing changed.
 * New bins carry id ≤ 0 and, when `counts` is given, the number of peaks
 * now inside their window as `peak_count`. Labels are trimmed.
 */
export function buildBatch(
  projectId: number,
  locusId: number,
  base: readonly Bin[],
  present: readonly Bin[],
  counts?: ReadonlyMap<number, number>,
): UpdateLocusBinsParams | null {
  const d = diffBins(base, present)
  if (d.created.length + d.changed.length + d.deleted.length === 0) return null
  // A created bin with a positive id (it vanished from the saved set) needs a fresh unsaved id.
  let fresh = Math.min(0, ...d.created.map((b) => b.id))
  const bins = [
    ...d.changed.map((b) => ({ ...b, label: b.label.trim() })),
    ...d.created.map((b) => ({ ...b, id: b.id <= 0 ? b.id : --fresh, label: b.label.trim(), peak_count: counts?.get(b.id) ?? b.peak_count })),
  ]
  const out: UpdateLocusBinsParams = { project_id: projectId, locus_id: locusId, bins }
  if (d.deleted.length) out.delete_ids = d.deleted.map((b) => b.id)
  return out
}
