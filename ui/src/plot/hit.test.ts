import { describe, expect, it } from 'vitest'
import { hitBand, nearestPoint, nearestX } from './hit'

describe('nearestPoint', () => {
  const pts = [
    { px: 10, py: 10 },
    { px: 20, py: 10 },
    { px: 100, py: 100 },
  ]
  it('finds the closest within radius', () => {
    expect(nearestPoint(pts, 18, 11, 6)).toBe(1)
    expect(nearestPoint(pts, 50, 50, 6)).toBe(-1)
  })
  it('prefers the later (topmost) point on ties', () => {
    expect(nearestPoint(pts, 15, 10, 6)).toBe(1)
  })
  it('nearestX ignores y', () => {
    expect(nearestX([10, 50, 90], 47, 5)).toBe(1)
    expect(nearestX([10, 50, 90], 70, 5)).toBe(-1)
  })
})

describe('hitBand', () => {
  const bands = [
    { lo: 100, hi: 120 },
    { lo: 118, hi: 160 },
  ]
  it('edges win over bodies', () => {
    expect(hitBand(bands, 119, 3)).toEqual({ index: 0, part: 'right' })
    expect(hitBand(bands, 101, 3)).toEqual({ index: 0, part: 'left' })
  })
  it('body hit picks the narrowest band', () => {
    expect(
      hitBand(
        [
          { lo: 0, hi: 100 },
          { lo: 40, hi: 60 },
        ],
        50,
        2,
      ),
    ).toEqual({ index: 1, part: 'body' })
  })
  it('selected band wins overlapping bodies', () => {
    expect(
      hitBand(
        [
          { lo: 0, hi: 100 },
          { lo: 40, hi: 60 },
        ],
        50,
        2,
        0,
      ),
    ).toEqual({ index: 0, part: 'body' })
  })
  it('misses outside every band', () => {
    expect(hitBand(bands, 300)).toBeNull()
  })
})
