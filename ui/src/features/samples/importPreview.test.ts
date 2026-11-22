import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/features/loci/csv'
import { parseDesignation, previewSamplesCsv, rowsToCreateCsv } from './importPreview'

describe('parseDesignation', () => {
  it('accepts the engine synonyms', () => {
    expect(parseDesignation('')).toBe('sample')
    expect(parseDesignation(' NTC ')).toBe('negative_control')
    expect(parseDesignation('Negative Control')).toBe('negative_control')
    expect(parseDesignation('pos')).toBe('positive_control')
    expect(parseDesignation('+')).toBe('positive_control')
    expect(parseDesignation('blank')).toBeNull()
  })
})

describe('previewSamplesCsv', () => {
  it('classifies rows as create, existing or invalid', () => {
    const p = previewSamplesCsv('Barcode,Designation\nS1,\nS2,neg\ns1,sample\nOLD-1,\nS3,maybe\n,neg\n', new Set(['old-1']))
    expect(p.rows.map((r) => [r.line, r.status])).toEqual([
      [2, 'create'],
      [3, 'create'],
      [4, 'invalid'],
      [5, 'existing'],
      [6, 'invalid'],
    ])
    expect(p.rows[1]!.designation).toBe('negative_control')
    expect(p.rows[2]!.problem).toMatch(/line 2/)
    expect([p.create, p.existing, p.invalid]).toEqual([2, 1, 2])
  })
  it('reads a plain list of barcodes', () => {
    const p = previewSamplesCsv('A-1\nA-2\n\nA-3', new Set())
    expect(p.headerError).toBeNull()
    expect(p.rows.map((r) => r.barcode)).toEqual(['A-1', 'A-2', 'A-3'])
    expect(p.rows[0]!.line).toBe(1)
  })
  it('needs a Barcode column when there are several columns', () => {
    expect(previewSamplesCsv('Name,Kind\nA,neg', new Set()).headerError).toMatch(/Barcode column/)
  })
  it('writes only the rows to create', () => {
    const p = previewSamplesCsv('barcode,designation\nA,pos\nB,zzz\n', new Set())
    expect(parseCsv(rowsToCreateCsv(p))).toEqual([
      ['Barcode', 'Designation'],
      ['A', 'positive_control'],
    ])
  })
})
