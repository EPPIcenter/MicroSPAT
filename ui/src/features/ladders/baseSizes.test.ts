import { describe, expect, it } from 'vitest'
import { checkSizes, formatSizeList, parseSizeList, sortEntries } from './baseSizes'

describe('parseSizeList', () => {
  it('splits on commas, whitespace, newlines and semicolons', () => {
    expect(parseSizeList('50, 60,90\n100\t120; 150').values).toEqual([50, 60, 90, 100, 120, 150])
  })
  it('keeps decimals and reports junk tokens', () => {
    const r = parseSizeList('35.5, 50, bp, 75x, 100')
    expect(r.values).toEqual([35.5, 50, 100])
    expect(r.invalid).toEqual(['bp', '75x'])
  })
  it('ignores empty input', () => {
    expect(parseSizeList('  ,, ')).toEqual({ values: [], invalid: [] })
  })
})

describe('checkSizes', () => {
  it('accepts a valid increasing list', () => {
    const r = checkSizes(['50', '60', '90', '100'])
    expect(r.sizes).toEqual([50, 60, 90, 100])
    expect(r.listError).toBeNull()
  })
  it('needs at least four sizes', () => {
    expect(checkSizes(['50', '60', '90']).listError).toMatch(/at least 4/)
  })
  it('flags non-positive and unparsable entries', () => {
    const r = checkSizes(['0', '-5', 'abc', '100', '200', '300'])
    expect(r.entryErrors).toEqual({ 0: 'Must be positive', 1: 'Must be positive', 2: 'Not a number' })
    expect(r.sizes).toBeNull()
  })
  it('flags duplicates and decreasing entries by position', () => {
    const r = checkSizes(['50', '60', '60', '55', '100'])
    expect(r.entryErrors[2]).toMatch(/Duplicate of 60/)
    expect(r.entryErrors[3]).toMatch(/Smaller than 60/)
    expect(r.listError).toMatch(/increasing/)
  })
  it('ignores blank entries', () => {
    expect(checkSizes(['50', '', '60', '70', '80']).sizes).toEqual([50, 60, 70, 80])
  })
})

describe('sortEntries', () => {
  it('sorts, drops duplicates and invalid entries', () => {
    expect(sortEntries(['100', '50', '', 'x', '50', '-1', '75.5'])).toEqual(['50', '75.5', '100'])
  })
  it('formats without float noise', () => {
    expect(formatSizeList([0.1 + 0.2, 50])).toBe('0.3, 50')
  })
})
