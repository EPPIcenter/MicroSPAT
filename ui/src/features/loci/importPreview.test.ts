import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'
import { previewLociCsv, validRowsCsv } from './importPreview'

const HEADER = 'Label,Min. Base Length,Max. Base Length,Nucleotide Repeat Length,Color'

describe('previewLociCsv', () => {
  it('accepts valid rows in any column order and case', () => {
    const p = previewLociCsv('color,LABEL,nucleotide repeat length,max base length,min base length\nBlue,PfX,3,150,100\n', [])
    expect(p.headerError).toBeNull()
    expect(p.valid).toBe(1)
    expect(p.rows[0]!.locus).toEqual({ label: 'PfX', color: 'blue', min_base_length: 100, max_base_length: 150, nucleotide_repeat_length: 3 })
  })
  it('reports a missing header column', () => {
    const p = previewLociCsv('Label,Min,Max\nA,1,2', [])
    expect(p.headerError).toMatch(/Nucleotide Repeat Length/)
    expect(p.rows).toHaveLength(0)
  })
  it('rejects bad numbers, colors, ranges, repeats, existing and repeated labels', () => {
    const csv = [
      HEADER,
      'A,100,150,3,blue',
      'B,abc,150,3,blue',
      'C,100,150,3,purple',
      'D,150,100,3,green',
      'E,100,150,0,green',
      'pfb1,100,150,3,red',
      'a,200,250,3,red',
      ',100,150,3,red',
      '',
    ].join('\n')
    const p = previewLociCsv(csv, ['PfB1'])
    expect(p.rows.map((r) => r.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 9])
    const problems = Object.fromEntries(p.rows.map((r) => [r.line, r.problems.join('; ')]))
    expect(problems[2]).toBe('')
    expect(problems[3]).toMatch(/Min. Base Length "abc" is not a number/)
    expect(problems[4]).toMatch(/Color "purple"/)
    expect(problems[5]).toMatch(/0 ≤ min < max/)
    expect(problems[6]).toMatch(/Repeat length/)
    expect(problems[7]).toMatch(/already exists/)
    expect(problems[8]).toMatch(/Same label as line 2/)
    expect(problems[9]).toMatch(/Label is empty/)
    expect(p.valid).toBe(1)
    expect(p.rejected).toBe(7)
  })
  it('writes only valid rows for import', () => {
    const p = previewLociCsv(`${HEADER}\nA,100,150,3,Blue\nB,x,1,1,blue\n`, [])
    expect(parseCsv(validRowsCsv(p))).toEqual([HEADER.split(','), ['A', '100', '150', '3', 'blue']])
  })
  it('says when there are no rows', () => {
    expect(previewLociCsv(`${HEADER}\n\n`, []).headerError).toMatch(/no rows/)
  })
})
