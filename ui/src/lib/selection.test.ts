import { describe, expect, it } from 'vitest'
import { clickSelect, orderSelection, rangeBetween, selectGroup, type SelectionState } from './selection'

const order = ['a', 'b', 'c', 'd', 'e']
const range = (x: string, y: string) => rangeBetween(order, x, y)
const empty: SelectionState = { selected: [], anchor: null }

describe('clickSelect', () => {
  it('plain click selects one and sets the anchor', () => {
    expect(clickSelect({ selected: ['a', 'b'], anchor: 'a' }, 'c', {}, 'multi', range)).toEqual({ selected: ['c'], anchor: 'c' })
  })
  it('shift-click selects the range from the anchor, either direction', () => {
    const s = clickSelect(empty, 'b', {}, 'multi', range)
    expect(clickSelect(s, 'd', { shift: true }, 'multi', range).selected).toEqual(['b', 'c', 'd'])
    expect(clickSelect(s, 'a', { shift: true }, 'multi', range).selected).toEqual(['a', 'b'])
  })
  it('repeated shift-clicks keep the original anchor', () => {
    let s = clickSelect(empty, 'b', {}, 'multi', range)
    s = clickSelect(s, 'e', { shift: true }, 'multi', range)
    s = clickSelect(s, 'c', { shift: true }, 'multi', range)
    expect(s).toEqual({ selected: ['b', 'c'], anchor: 'b' })
  })
  it('toggle adds and removes', () => {
    let s = clickSelect(empty, 'a', {}, 'multi', range)
    s = clickSelect(s, 'c', { toggle: true }, 'multi', range)
    expect(s.selected).toEqual(['a', 'c'])
    s = clickSelect(s, 'a', { toggle: true }, 'multi', range)
    expect(s.selected).toEqual(['c'])
  })
  it('single mode ignores modifiers', () => {
    expect(clickSelect({ selected: ['a'], anchor: 'a' }, 'c', { shift: true, toggle: true }, 'single', range).selected).toEqual(['c'])
  })
  it('none mode changes nothing', () => {
    expect(clickSelect(empty, 'a', {}, 'none', range)).toBe(empty)
  })
})

describe('groups and order', () => {
  it('selectGroup replaces, or toggles the group in/out', () => {
    expect(selectGroup({ selected: ['a'], anchor: 'a' }, ['c', 'd'], false).selected).toEqual(['c', 'd'])
    expect(selectGroup({ selected: ['a'], anchor: 'a' }, ['c', 'd'], true).selected).toEqual(['a', 'c', 'd'])
    expect(selectGroup({ selected: ['a', 'c', 'd'], anchor: 'a' }, ['c', 'd'], true).selected).toEqual(['a'])
  })
  it('orderSelection sorts by display order and drops missing ids', () => {
    expect(orderSelection(order, ['d', 'x', 'a'])).toEqual(['a', 'd'])
  })
})
