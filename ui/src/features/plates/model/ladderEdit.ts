/**
 * Manual ladder editing as plain data. A draft is the list of ladder peaks
 * the user proposes for one well, each with the ladder size the user chose
 * for it or `null` to let the engine's fitter decide. The engine assigns and
 * judges every proposal (`preview_well_ladder_peaks`); nothing here guesses
 * sizes.
 *
 * Requests: with no chosen sizes the draft goes as `peak_indices` (the
 * fitter assigns sizes, guided by the plate's other wells). Once the user
 * has chosen a size for any peak, the draft goes as explicit `peaks`: the
 * chosen sizes, and for the other peaks the size the fitter gave them in the
 * preview of the same peaks.
 */
import type { LadderCandidate, LadderPeak, LadderPreview, SetWellLadderPeaksParams } from '@/api/bindings'
import type { LadderMarker, TracePeak } from '@/components/TraceViewer'

export interface DraftPeak {
  index: number
  /** Ladder size the user chose; null leaves it to the fitter. */
  size: number | null
}

export type LadderDraft = readonly DraftPeak[]

function sorted(d: readonly DraftPeak[]): DraftPeak[] {
  const by = new Map<number, DraftPeak>()
  for (const p of d) by.set(Math.round(p.index), { index: Math.round(p.index), size: p.size })
  return [...by.values()].sort((a, b) => a.index - b.index)
}

/** A draft of the stored peaks, sizes left to the fitter. */
export function startDraft(saved: readonly LadderPeak[]): DraftPeak[] {
  return sorted(saved.map((p) => ({ index: p.index, size: null })))
}

export function addPeak(d: LadderDraft, index: number): DraftPeak[] {
  return d.some((p) => p.index === index) ? [...d] : sorted([...d, { index, size: null }])
}

export function removePeak(d: LadderDraft, index: number): DraftPeak[] {
  return d.filter((p) => p.index !== index)
}

/** Choose the ladder size of one peak (null: back to the fitter's choice). */
export function setPeakSize(d: LadderDraft, index: number, size: number | null): DraftPeak[] {
  return d.map((p) => (p.index === index ? { index, size } : p))
}

/** The draft peak within `radius` points of `index`, nearest first. */
export function nearestPeak(d: LadderDraft, index: number, radius: number): number | null {
  let best: number | null = null
  let bestD = Infinity
  for (const p of d) {
    const dist = Math.abs(p.index - index)
    if (dist <= radius && dist < bestD) {
      best = p.index
      bestD = dist
    }
  }
  return best
}

export interface DraftDiff {
  kept: number[]
  added: number[]
  removed: number[]
  /** Peaks whose size the user chose differently from the stored fit. */
  corrected: number[]
  dirty: boolean
}

export function diffDraft(d: LadderDraft, saved: readonly LadderPeak[]): DraftDiff {
  const savedSize = new Map(saved.map((p) => [p.index, p.size]))
  const proposed = new Set(d.map((p) => p.index))
  const kept = d.filter((p) => savedSize.has(p.index)).map((p) => p.index)
  const added = d.filter((p) => !savedSize.has(p.index)).map((p) => p.index)
  const removed = saved.filter((p) => !proposed.has(p.index)).map((p) => p.index)
  const corrected = d.filter((p) => p.size != null && savedSize.has(p.index) && savedSize.get(p.index) !== p.size).map((p) => p.index)
  return { kept, added, removed, corrected, dirty: added.length + removed.length + corrected.length > 0 }
}

/** True when the draft is the stored fit (no draft to keep). */
export function isClean(d: LadderDraft, saved: readonly LadderPeak[]): boolean {
  return !diffDraft(d, saved).dirty
}

export function hasChosenSizes(d: LadderDraft): boolean {
  return d.some((p) => p.size != null)
}

/** The fitter's request for the draft's peaks (sizes left to it). */
export function fitterRequest(id: number, d: LadderDraft): SetWellLadderPeaksParams | null {
  // The engine refuses an empty list (`invalid`): there is nothing to fit yet.
  return d.length ? { id, peak_indices: d.map((p) => p.index) } : null
}

/** Shown in place of a preview while the draft holds no peaks. */
export const NO_PEAKS_YET = 'No peaks yet: click the ladder trace to add peaks, or apply the automatic fit.'

/**
 * The explicit request once sizes were chosen, filling the other peaks from
 * the fitter's assignment of the same peaks. Returns a problem instead when
 * a peak has no size either way (the fitter could not assign them).
 */
export function explicitRequest(
  id: number,
  d: LadderDraft,
  fitted: readonly LadderPeak[] | null,
): { request: SetWellLadderPeaksParams; problem: null } | { request: null; problem: string } {
  const bySize = new Map((fitted ?? []).map((p) => [p.index, p.size]))
  const missing = d.filter((p) => p.size == null && !bySize.has(p.index))
  if (missing.length)
    return {
      request: null,
      problem: `The fitter could not assign ${missing.length === 1 ? 'one peak' : `${missing.length} peaks`}; choose ${missing.length === 1 ? 'its size' : 'their sizes'} or remove ${missing.length === 1 ? 'it' : 'them'}.`,
    }
  return { request: { id, peaks: d.map((p) => ({ index: p.index, size: p.size ?? (bySize.get(p.index) as number) })) }, problem: null }
}

/**
 * After the user moved one peak by some ladder steps, move every other peak
 * by the same number of steps (from the sizes now shown), choosing all of
 * them. Null when that would run off either end of the ladder.
 */
export function shiftOthers(
  d: LadderDraft,
  index: number,
  shown: ReadonlyMap<number, number>,
  fitted: number | null,
  ladderSizes: readonly number[],
): DraftPeak[] | null {
  const me = d.find((p) => p.index === index)
  if (me?.size == null || fitted == null) return null
  const steps = ladderSizes.indexOf(me.size) - ladderSizes.indexOf(fitted)
  if (steps === 0 || ladderSizes.indexOf(fitted) < 0) return null
  const out: DraftPeak[] = []
  for (const p of d) {
    if (p.index === index) {
      out.push(p)
      continue
    }
    const cur = shown.get(p.index)
    const k = cur == null ? -1 : ladderSizes.indexOf(cur)
    const size = ladderSizes[k + steps]
    if (k < 0 || size == null) return null
    out.push({ index: p.index, size })
  }
  return out
}

/** Size of each draft peak to draw: the user's choice, else the preview's. */
export function assignedSizes(d: LadderDraft, preview: LadderPreview | null): Map<number, number> {
  const fromPreview = new Map((preview?.peaks ?? []).map((p) => [p.index, p.size]))
  const out = new Map<number, number>()
  for (const p of d) {
    const s = p.size ?? fromPreview.get(p.index)
    if (s != null) out.set(p.index, s)
  }
  return out
}

export interface DraftMarks {
  ladder: LadderMarker[]
  peaks: TracePeak[]
}

/**
 * What the plot draws while editing. Every proposed peak is a clickable
 * marker (stored ones filled, new ones as manual peaks, a ring on the
 * selected one; the hover says whose size it is) with its assigned
 * size from the preview above it; removed stored peaks are crossed out;
 * the fitter's other candidate peaks are hollow circles to click.
 */
export function draftMarks(
  d: LadderDraft,
  saved: readonly LadderPeak[],
  opts: {
    seriesId: string
    trace: ArrayLike<number>
    preview: LadderPreview | null
    candidates: readonly LadderCandidate[]
    selected: number | null
  },
): DraftMarks {
  const savedIdx = new Set(saved.map((p) => p.index))
  const sizes = assignedSizes(d, opts.preview)
  const proposed = new Set(d.map((p) => p.index))
  const h = (i: number) => (opts.trace[i] as number | undefined) ?? 0
  const ladder: LadderMarker[] = d.map((p) => ({
    index: p.index,
    size: sizes.get(p.index) ?? null,
    seriesId: opts.seriesId,
    status: sizes.has(p.index) ? 'ok' : 'unassigned',
  }))
  const peaks: TracePeak[] = d.map((p) => {
    const size = sizes.get(p.index)
    return {
      id: `p-${p.index}`,
      seriesId: opts.seriesId,
      index: p.index,
      size: Number.NaN,
      height: h(p.index),
      state: savedIdx.has(p.index) ? ('called' as const) : ('manual-on' as const),
      selected: p.index === opts.selected,
      stateLabel: savedIdx.has(p.index) ? 'Ladder peak' : 'New ladder peak',
      detail: [
        size == null ? 'No size assigned' : p.size != null ? `${size} bp (chosen by you)` : `${size} bp (assigned by the fitter)`,
        savedIdx.has(p.index) ? 'In the stored fit' : 'Unsaved: will be added',
        'Click to select · Alt-click to remove',
      ],
    }
  })
  for (const p of saved)
    if (!proposed.has(p.index))
      peaks.push({
        id: `rm-${p.index}`,
        seriesId: opts.seriesId,
        index: p.index,
        size: Number.NaN,
        height: h(p.index),
        state: 'manual-off',
        stateLabel: 'Removed ladder peak',
        detail: [`Stored as ${p.size} bp`, 'Unsaved: will be removed', 'Click to keep'],
      })
  for (const c of opts.candidates)
    if (!proposed.has(c.index) && !savedIdx.has(c.index))
      peaks.push({
        id: `c-${c.index}`,
        seriesId: opts.seriesId,
        index: c.index,
        size: Number.NaN,
        height: h(c.index) || c.height,
        state: 'candidate',
        stateLabel: 'Ladder peak candidate',
        detail: ['Click to add'],
      })
  return { ladder, peaks }
}
