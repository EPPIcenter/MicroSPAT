import { describe, expect, it } from 'vitest'
import { allWells, colWells, moveWell, normalizeWell, parseWell, rowWells, wellLabel, wellRect } from './layout'
import { rampColor, signalBand, signalColor, signalPosition } from './colors'

describe('plate layout', () => {
  it('labels and parses wells', () => {
    expect(wellLabel(0, 0)).toBe('A01')
    expect(wellLabel(15, 23)).toBe('P24')
    expect(parseWell('h12')).toEqual({ row: 7, col: 11 })
    expect(normalizeWell('B3')).toBe('B03')
    expect(parseWell('Q01')).toBeNull()
    expect(parseWell('A25')).toBeNull()
  })
  it('counts wells per format', () => {
    expect(allWells(96)).toHaveLength(96)
    expect(allWells(384)).toHaveLength(384)
    expect(rowWells(96, 1)).toHaveLength(12)
    expect(colWells(384, 0)).toHaveLength(16)
  })
  it('selects rectangles in any drag direction', () => {
    expect(wellRect('C05', 'B03')).toEqual(['B03', 'B04', 'B05', 'C03', 'C04', 'C05'])
    expect(wellRect('A01', 'A01')).toEqual(['A01'])
  })
  it('moves and clamps at the plate edge', () => {
    expect(moveWell(96, 'A01', -1, 0)).toBe('A01')
    expect(moveWell(96, 'H12', 0, 1)).toBe('H12')
    expect(moveWell(96, 'B02', 1, 1)).toBe('C03')
  })
})

describe('signal scale', () => {
  it('bands', () => {
    expect(signalBand(null)).toBe('none')
    expect(signalBand(50)).toBe('none')
    expect(signalBand(500)).toBe('low')
    expect(signalBand(5000)).toBe('good')
    expect(signalBand(20000)).toBe('high')
    expect(signalBand(32000)).toBe('off')
  })
  it('position is monotonic and clamped', () => {
    expect(signalPosition(10)).toBe(0)
    expect(signalPosition(1e6)).toBe(1)
    expect(signalPosition(1000)).toBeLessThan(signalPosition(5000))
  })
  it('null is "no signal", undefined is "no data"', () => {
    expect(signalColor(null)).toBe('var(--scale-none)')
    expect(signalColor(undefined)).toBe('var(--c-surface-3)')
    expect(signalColor(5000)).toContain('color-mix')
  })
})

describe('ramp colors', () => {
  const vars = ['--a', '--b', '--c']
  it('hits the stops and mixes between them', () => {
    expect(rampColor(0, vars)).toBe('var(--a)')
    expect(rampColor(0.5, vars)).toBe('var(--b)')
    expect(rampColor(1, vars)).toBe('var(--c)')
    expect(rampColor(2, vars)).toBe('var(--c)')
    expect(rampColor(0.25, vars)).toBe('color-mix(in oklab, var(--a) 50%, var(--b))')
  })
})
