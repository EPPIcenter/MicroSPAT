import { describe, expect, it } from 'vitest'
import { headerKey, parseCsv, toCsvText } from './csv'

describe('parseCsv', () => {
  it('reads quoted fields, doubled quotes and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ])
  })
  it('handles a BOM, a missing final newline and empty fields', () => {
    expect(parseCsv('\uFEFFa,,c\n1,2')).toEqual([
      ['a', '', 'c'],
      ['1', '2'],
    ])
  })
  it('round-trips through toCsvText', () => {
    const rows = [
      ['Label', 'Note'],
      ['P,1', 'a "b"'],
    ]
    expect(parseCsv(toCsvText(rows))).toEqual(rows)
  })
  it('normalizes headers like the engine', () => {
    expect(headerKey('Min. Base Length')).toBe('minbaselength')
    expect(headerKey(' Nucleotide_Repeat-Length ')).toBe('nucleotiderepeatlength')
  })
})
