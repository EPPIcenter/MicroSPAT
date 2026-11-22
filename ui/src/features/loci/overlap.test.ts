import { describe, expect, it } from 'vitest'
import { assignLanes, findOverlaps, niceTicks, overlapIndex, sizeDomain, type RangeItem } from './overlap'

const L = (id: number, color: RangeItem['color'], min: number, max: number): RangeItem => ({
  id,
  label: `L${id}`,
  color,
  min_base_length: min,
  max_base_length: max,
})

describe('findOverlaps', () => {
  it('finds overlaps only within a dye', () => {
    const items = [L(1, 'blue', 70, 135), L(2, 'blue', 120, 180), L(3, 'green', 100, 140), L(4, 'blue', 230, 300)]
    const o = findOverlaps(items)
    expect(o).toHaveLength(1)
    expect([o[0]!.a.id, o[0]!.b.id]).toEqual([1, 2])
    expect([o[0]!.from, o[0]!.to]).toEqual([120, 135])
  })
  it('does not count ranges that only touch', () => {
    expect(findOverlaps([L(1, 'blue', 70, 135), L(2, 'blue', 135, 200)])).toEqual([])
  })
  it('finds a range nested in another and chains', () => {
    const o = findOverlaps([L(1, 'red', 100, 300), L(2, 'red', 150, 160), L(3, 'red', 250, 350)])
    expect(o.map((x) => [x.a.id, x.b.id])).toEqual([
      [1, 2],
      [1, 3],
    ])
    const idx = overlapIndex(o)
    expect(idx.get(1)).toEqual(['L2', 'L3'])
    expect(idx.get(3)).toEqual(['L1'])
  })
})

describe('assignLanes', () => {
  it('puts non-overlapping ranges in one lane and overlapping in separate lanes', () => {
    const r = assignLanes([L(1, 'blue', 70, 135), L(2, 'blue', 135, 200), L(3, 'blue', 120, 180)])
    expect(r.lanes).toBe(2)
    expect(r.lane.get(1)).toBe(0)
    expect(r.lane.get(3)).toBe(1)
    expect(r.lane.get(2)).toBe(0)
  })
  it('has one lane when empty', () => {
    expect(assignLanes([]).lanes).toBe(1)
  })
})

describe('axis helpers', () => {
  it('pads and rounds the domain', () => {
    expect(sizeDomain([L(1, 'blue', 70, 135), L(2, 'red', 380, 450)])).toEqual([50, 470])
    expect(sizeDomain([])).toEqual([50, 500])
  })
  it('makes round ticks', () => {
    expect(niceTicks(50, 470, 8)).toEqual([100, 200, 300, 400])
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100])
  })
})
