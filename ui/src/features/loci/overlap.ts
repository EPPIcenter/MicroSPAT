/**
 * Where loci sit along the size axis, per dye. Two loci on the same dye with
 * overlapping size ranges are a problem: a peak in the shared range cannot be
 * assigned to one locus, which is how peaks get mis-assigned.
 */
import type { Color } from '@/api/bindings'

export interface RangeItem {
  id: number
  label: string
  color: Color
  min_base_length: number
  max_base_length: number
}

export interface Overlap {
  a: RangeItem
  b: RangeItem
  color: Color
  /** Shared range in bp. */
  from: number
  to: number
}

/** Pairs of loci on the same dye whose ranges share more than an endpoint. */
export function findOverlaps(items: readonly RangeItem[]): Overlap[] {
  const out: Overlap[] = []
  const byDye = new Map<Color, RangeItem[]>()
  for (const it of items) byDye.set(it.color, [...(byDye.get(it.color) ?? []), it])
  for (const [color, list] of byDye) {
    const sorted = [...list].sort((x, y) => x.min_base_length - y.min_base_length || x.max_base_length - y.max_base_length)
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i]!
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j]!
        if (b.min_base_length >= a.max_base_length) break
        out.push({ a, b, color, from: b.min_base_length, to: Math.min(a.max_base_length, b.max_base_length) })
      }
    }
  }
  return out
}

/** Map of locus id → labels of the loci it overlaps. */
export function overlapIndex(overlaps: readonly Overlap[]): Map<number, string[]> {
  const m = new Map<number, string[]>()
  const add = (id: number, label: string) => m.set(id, [...(m.get(id) ?? []), label])
  for (const o of overlaps) {
    add(o.a.id, o.b.label)
    add(o.b.id, o.a.label)
  }
  return m
}

/**
 * Lane per item so that items in one lane do not overlap (greedy interval
 * partitioning by start). Returns lane by id and the number of lanes.
 */
export function assignLanes(items: readonly RangeItem[]): { lane: Map<number, number>; lanes: number } {
  const sorted = [...items].sort((x, y) => x.min_base_length - y.min_base_length || x.max_base_length - y.max_base_length)
  const ends: number[] = []
  const lane = new Map<number, number>()
  for (const it of sorted) {
    let k = ends.findIndex((e) => e <= it.min_base_length)
    if (k < 0) {
      k = ends.length
      ends.push(it.max_base_length)
    } else ends[k] = it.max_base_length
    lane.set(it.id, k)
  }
  return { lane, lanes: Math.max(1, ends.length) }
}

/** A rounded size axis covering every range, with some room on either side. */
export function sizeDomain(items: readonly RangeItem[], fallback: [number, number] = [50, 500]): [number, number] {
  if (items.length === 0) return fallback
  const lo = Math.min(...items.map((i) => i.min_base_length))
  const hi = Math.max(...items.map((i) => i.max_base_length))
  const pad = Math.max(10, (hi - lo) * 0.04)
  return [Math.max(0, Math.floor((lo - pad) / 10) * 10), Math.ceil((hi + pad) / 10) * 10]
}

/** Round tick values for an axis. */
export function niceTicks(lo: number, hi: number, target = 8): number[] {
  const span = hi - lo
  if (!(span > 0)) return [lo]
  const raw = span / target
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toPrecision(10))
  return out
}
