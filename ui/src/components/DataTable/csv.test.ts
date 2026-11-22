import { describe, expect, it } from 'vitest'
import { csvField, toCsv } from './csv'
import { compareValues } from './DataTable'

describe('csv', () => {
  it('quotes when needed', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField(null)).toBe('')
    expect(csvField(NaN)).toBe('')
    expect(csvField(1.5)).toBe('1.5')
  })
  it('builds a document', () => {
    expect(toCsv(['a', 'b'], [[1, 'x,y'], [null, true]])).toBe('a,b\n1,"x,y"\n,true\n')
  })
})

describe('compareValues', () => {
  it('numbers, natural strings, nullish last', () => {
    expect([3, null, 1, 2].sort(compareValues)).toEqual([1, 2, 3, null])
    expect(['P10', 'P2', 'P1'].sort(compareValues)).toEqual(['P1', 'P2', 'P10'])
  })
})
