import { describe, expect, it } from 'vitest'
import { decimate, interpAt, invertInterp, localMaxIndex, lowerBound, nearestIndex, rangeMax, visibleRange } from './decimate'

describe('visibleRange', () => {
  it('index axis pads one point each side', () => {
    expect(visibleRange(null, 1000, 100.5, 200.2)).toEqual([99, 202])
    expect(visibleRange(null, 1000, -10, 5000)).toEqual([0, 1000])
  })
  it('bp axis uses binary search', () => {
    const xs = Float64Array.from({ length: 1000 }, (_, i) => i * 0.5)
    const [i0, i1] = visibleRange(xs, 1000, 100, 150)
    expect(xs[i0]).toBeLessThan(100)
    expect(xs[i1 - 1]).toBeGreaterThan(150)
    expect(i1 - i0).toBe(103)
  })
  it('falls back to everything when xs is not monotonic', () => {
    expect(visibleRange([0, 2, 1, 3], 4, 1, 2)).toEqual([0, 4])
  })
})

describe('decimate', () => {
  it('passes sparse data through', () => {
    const ys = [1, 2, 3]
    const d = decimate(ys, null, 0, 3, (x) => x * 10, 500)
    expect(d.count).toBe(3)
    expect(Array.from(d.points)).toEqual([0, 1, 10, 2, 20, 3])
  })
  it('keeps at most 4 points per pixel column and preserves extremes', () => {
    const n = 100_000
    const ys = new Float64Array(n)
    for (let i = 0; i < n; i++) ys[i] = Math.sin(i / 7)
    ys[54_321] = 50 // a one-point spike must survive
    ys[12_345] = -40
    const width = 500
    const d = decimate(ys, null, 0, n, (x) => (x / n) * width, width)
    expect(d.count).toBeLessThanOrEqual(width * 4 + 4)
    let max = -Infinity
    let min = Infinity
    for (let k = 0; k < d.count; k++) {
      max = Math.max(max, d.points[2 * k + 1]!)
      min = Math.min(min, d.points[2 * k + 1]!)
    }
    expect(max).toBe(50)
    expect(min).toBe(-40)
  })
  it('emits points in index order within a column', () => {
    const ys = [0, 5, -5, 1, 0, 0, 0, 0]
    // all 8 points land in one column of a 1px plot
    const d = decimate(ys, null, 0, 8, () => 0.5, 1)
    expect(Array.from({ length: d.count }, (_, k) => d.points[2 * k + 1])).toEqual([0, 5, -5, 0])
  })
})

describe('index helpers', () => {
  const xs = [10, 20, 30, 40]
  it('lowerBound', () => {
    expect(lowerBound(xs, 25)).toBe(2)
    expect(lowerBound(xs, 5)).toBe(0)
    expect(lowerBound(xs, 45)).toBe(4)
  })
  it('nearestIndex', () => {
    expect(nearestIndex(xs, 4, 24)).toBe(1)
    expect(nearestIndex(xs, 4, 26)).toBe(2)
    expect(nearestIndex(null, 4, 2.6)).toBe(3)
  })
  it('interpAt / invertInterp round-trip', () => {
    expect(interpAt(xs, 1.5)).toBe(25)
    expect(invertInterp(xs, 25)).toBe(1.5)
  })
  it('localMaxIndex snaps to the apex', () => {
    const ys = [0, 1, 3, 9, 4, 1, 0]
    expect(localMaxIndex(ys, 1, 3)).toBe(3)
    expect(localMaxIndex(ys, 6, 1)).toBe(5)
  })
  it('rangeMax', () => {
    expect(rangeMax([1, 7, 3], 0, 3)).toBe(7)
    expect(rangeMax([1, 7, 3], 2, 3)).toBe(3)
    expect(rangeMax([], 0, 0)).toBe(0)
  })
})
