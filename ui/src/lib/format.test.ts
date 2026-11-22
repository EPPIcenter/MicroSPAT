import { describe, expect, it } from 'vitest'
import { countOf, plural } from './format'

describe('plural', () => {
  it('uses the singular only for exactly one', () => {
    expect(plural(1, 'plate')).toBe('plate')
    expect(plural(0, 'plate')).toBe('plates')
    expect(plural(2, 'plate')).toBe('plates')
  })
  it('takes irregular plurals', () => {
    expect(plural(1, 'locus', 'loci')).toBe('locus')
    expect(plural(6, 'locus', 'loci')).toBe('loci')
    expect(plural(3, 'locus set')).toBe('locus sets')
  })
  it('formats counts with separators', () => {
    expect(countOf(1, 'locus', 'loci')).toBe('1 locus')
    expect(countOf(0, 'sample')).toBe('0 samples')
    expect(countOf(12345, 'sample')).toBe('12,345 samples')
  })
})
