/**
 * Checks and bulk helpers for a locus's bins: the repeat grid the bins
 * should sit on, bins off that grid (often a frequent stutter or −1 bp
 * position that got binned), bins whose windows overlap, duplicate labels,
 * live peak counts from the scatter, and the bulk edits built on them.
 *
 * The grid is `origin + step · k`. `step` starts at the repeat length and is
 * refit on the bins that sit on it, so the slow drift of fragment mobility
 * across a locus (a few hundredths of a bp per repeat) does not push the far
 * bins off the grid.
 */
import type { Bin } from '@/api/bindings'
import { moveBin, setBuffer } from '@/components/BinPlot/binEdit'

export interface RepeatGrid {
  origin: number
  step: number
  repeat: number
}

/** Bins farther than this from the grid are flagged: max(0.5 bp, 20 % of a repeat). */
export function gridTolerance(repeat: number): number {
  return Math.max(0.5, 0.2 * repeat)
}

/** Grid index and expected center of a size. */
export function gridPosition(g: RepeatGrid, x: number): { k: number; expected: number; offset: number } {
  const k = Math.round((x - g.origin) / g.step)
  const expected = g.origin + g.step * k
  return { k, expected, offset: x - expected }
}

function weightedMedian(values: number[], weights: number[]): number {
  const idx = values.map((_, i) => i).sort((a, b) => values[a]! - values[b]!)
  const total = weights.reduce((a, b) => a + b, 0)
  let acc = 0
  for (const i of idx) {
    acc += weights[i]!
    if (acc >= total / 2) return values[i]!
  }
  return values[idx[idx.length - 1]!]!
}

/**
 * Fit the repeat grid to the bins, weighting by peak count (the frequent
 * alleles define the grid). Null without bins or a repeat length.
 */
export function fitRepeatGrid(bins: readonly Bin[], repeat: number): RepeatGrid | null {
  if (!bins.length || !(repeat > 0)) return null
  const w = bins.map((b) => Math.max(1, b.peak_count))
  const anchor = bins.reduce((a, b) => (b.peak_count > a.peak_count ? b : a))
  // Phase with the nominal repeat: weighted median of each bin's offset.
  const ks0 = bins.map((b) => Math.round((b.base_size - anchor.base_size) / repeat))
  let origin = weightedMedian(
    bins.map((b, i) => b.base_size - repeat * ks0[i]!),
    w,
  )
  let step = repeat
  const tol = gridTolerance(repeat)
  // Refit on the bins near the grid, robustly (Theil–Sen): the step is the
  // median of pairwise slopes, the origin the weighted median offset, so one
  // half-off bin does not tilt the grid. Twice, as bins may change index.
  for (let pass = 0; pass < 2; pass++) {
    const g: RepeatGrid = { origin, step, repeat }
    const pts = bins.map((b, i) => ({ ...gridPosition(g, b.base_size), x: b.base_size, w: w[i]! })).filter((p) => Math.abs(p.offset) <= tol)
    if (new Set(pts.map((p) => p.k)).size < 3) break
    const slopes: number[] = []
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const dk = pts[j]!.k - pts[i]!.k
        if (dk !== 0) slopes.push((pts[j]!.x - pts[i]!.x) / dk)
      }
    const s = weightedMedian(
      slopes,
      slopes.map(() => 1),
    )
    // Mobility drift is small; a wild step means the bins are not on a grid.
    if (!(Math.abs(s - repeat) <= 0.05 * repeat)) break
    step = s
    origin = weightedMedian(
      pts.map((p) => p.x - step * p.k),
      pts.map((p) => p.w),
    )
  }
  return { origin, step, repeat }
}

/** Grid positions within [lo, hi], for drawing. */
export function gridLines(g: RepeatGrid | null, lo: number, hi: number): number[] {
  if (!g) return []
  const out: number[] = []
  const k0 = Math.ceil((lo - g.origin) / g.step)
  for (let k = k0; g.origin + g.step * k <= hi && out.length < 500; k++) out.push(g.origin + g.step * k)
  return out
}

export type BinIssueKind = 'overlap' | 'off_grid' | 'duplicate_label' | 'invalid'

export interface BinIssue {
  kind: BinIssueKind
  message: string
  /** Other bins involved (overlap, duplicate label). */
  others?: number[]
}

/** Pairs of bins whose windows (center ± buffer) overlap. */
export function overlappingPairs(bins: readonly Bin[]): [Bin, Bin][] {
  const sorted = [...bins].sort((a, b) => a.base_size - a.bin_buffer - (b.base_size - b.bin_buffer))
  const out: [Bin, Bin][] = []
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!
    const aHi = a.base_size + a.bin_buffer
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!
      if (b.base_size - b.bin_buffer >= aHi) break
      out.push([a, b])
    }
  }
  return out
}

/** Why a bin cannot be saved as it is (mirrors the engine's checks), or null. */
export function invalidReason(b: Bin): string | null {
  const l = b.label.trim()
  if (!l) return 'Label is empty.'
  if (l.length > 50) return 'Label is longer than 50 characters.'
  if (!(Number.isFinite(b.base_size) && b.base_size > 0)) return 'Center must be a positive size.'
  if (!(Number.isFinite(b.bin_buffer) && b.bin_buffer > 0 && b.bin_buffer < 50)) return 'Buffer must be between 0 and 50 bp.'
  return null
}

const fmt = (v: number, d = 2) => v.toFixed(d)

/** Every issue per bin id. */
export function binIssues(bins: readonly Bin[], grid: RepeatGrid | null): Map<number, BinIssue[]> {
  const out = new Map<number, BinIssue[]>()
  const add = (id: number, i: BinIssue) => out.set(id, [...(out.get(id) ?? []), i])
  for (const b of bins) {
    const bad = invalidReason(b)
    if (bad) add(b.id, { kind: 'invalid', message: bad })
  }
  const byLabel = new Map<string, Bin[]>()
  for (const b of bins) {
    const k = b.label.trim().toLowerCase()
    if (k) byLabel.set(k, [...(byLabel.get(k) ?? []), b])
  }
  for (const group of byLabel.values())
    if (group.length > 1)
      for (const b of group)
        add(b.id, {
          kind: 'duplicate_label',
          message: `Label “${b.label.trim()}” is used by ${group.length} bins.`,
          others: group.filter((o) => o !== b).map((o) => o.id),
        })
  for (const [a, b] of overlappingPairs(bins)) {
    const amount =
      Math.min(a.base_size + a.bin_buffer, b.base_size + b.bin_buffer) - Math.max(a.base_size - a.bin_buffer, b.base_size - b.bin_buffer)
    add(a.id, { kind: 'overlap', message: `Window overlaps bin ${b.label} by ${fmt(amount)} bp.`, others: [b.id] })
    add(b.id, { kind: 'overlap', message: `Window overlaps bin ${a.label} by ${fmt(amount)} bp.`, others: [a.id] })
  }
  if (grid) {
    const tol = gridTolerance(grid.repeat)
    for (const b of bins) {
      const p = gridPosition(grid, b.base_size)
      if (Math.abs(p.offset) > tol)
        add(b.id, {
          kind: 'off_grid',
          message: `${fmt(Math.abs(p.offset))} bp ${p.offset < 0 ? 'below' : 'above'} the repeat grid (${fmt(p.expected)} bp). Often a frequent stutter or −1 bp peak rather than an allele.`,
        })
    }
  }
  return out
}

/** Issues that block saving (the engine would refuse them). */
export function blockingIssues(issues: ReadonlyMap<number, BinIssue[]>): BinIssue[] {
  return [...issues.values()].flat().filter((i) => i.kind === 'invalid' || i.kind === 'duplicate_label')
}

/** Sizes sorted ascending, for counting peaks per window by binary search. */
export function sortedSizes(sizes: ArrayLike<number>): Float64Array {
  const a = Float64Array.from(sizes as ArrayLike<number>)
  a.sort()
  return a
}

function lowerBound(a: Float64Array, v: number): number {
  let lo = 0
  let hi = a.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (a[m]! < v) lo = m + 1
    else hi = m
  }
  return lo
}

function upperBound(a: Float64Array, v: number): number {
  let lo = 0
  let hi = a.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (a[m]! <= v) lo = m + 1
    else hi = m
  }
  return lo
}

/** Peaks inside each bin's window now (center ± buffer, inclusive). */
export function liveCounts(sorted: Float64Array, bins: readonly Bin[]): Map<number, number> {
  const m = new Map<number, number>()
  for (const b of bins) m.set(b.id, upperBound(sorted, b.base_size + b.bin_buffer) - lowerBound(sorted, b.base_size - b.bin_buffer))
  return m
}

/** Move bins (all, or `ids`) onto the grid. Auto labels follow the center. */
export function snapToGrid(bins: readonly Bin[], grid: RepeatGrid, ids?: ReadonlySet<number>): Bin[] {
  return bins.map((b) => (ids && !ids.has(b.id) ? b : moveBin(b, gridPosition(grid, b.base_size).expected)))
}

/** Set the buffer of bins (all, or `ids`). */
export function setAllBuffers(bins: readonly Bin[], buffer: number, ids?: ReadonlySet<number>): Bin[] {
  return bins.map((b) => (ids && !ids.has(b.id) ? b : setBuffer(b, buffer)))
}

/** Bins with fewer than `min` peaks in their window. */
export function binsBelow(bins: readonly Bin[], counts: ReadonlyMap<number, number>, min: number): Bin[] {
  return bins.filter((b) => (counts.get(b.id) ?? 0) < min)
}
