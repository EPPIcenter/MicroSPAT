import { describe, expect, it } from 'vitest'
import type { Sample } from '@/api/bindings'
import { previewSampleCsv, splitCsvLine } from './samplesCsv'

const s = (id: number, barcode: string): Sample => ({ id, barcode, designation: 'sample', run_count: 1, plate_count: 1 })
const samples = [s(1, 'D1-S001'), s(2, 'D1-S002'), s(3, 'D1-S003')]

describe('previewSampleCsv', () => {
  it('matches barcodes case-insensitively and reports unknown, duplicate and already-added ones', () => {
    const p = previewSampleCsv('﻿Site,Barcode\nA,d1-s001\nA,D1-S002\nB,NOPE-9\nB,D1-S001\nC,D1-S003\n', samples, new Set([3]))
    expect(p.error).toBeNull()
    expect(p.matched.map((x) => x.id)).toEqual([1, 2])
    expect(p.already.map((x) => x.id)).toEqual([3])
    expect(p.unknown).toEqual(['NOPE-9'])
    expect(p.duplicates).toEqual(['D1-S001'])
    expect(p.rows).toBe(5)
  })
  it('reads a bare list of barcodes, and semicolon or tab separated files', () => {
    expect(previewSampleCsv('D1-S001\nD1-S002\n', samples, new Set()).matched).toHaveLength(2)
    expect(previewSampleCsv('Barcode;Note\nD1-S002;x\n', samples, new Set()).matched.map((x) => x.id)).toEqual([2])
    expect(previewSampleCsv('Note\tBarcode\nx\tD1-S003\n', samples, new Set()).matched.map((x) => x.id)).toEqual([3])
  })
  it('explains a missing Barcode column and an empty file', () => {
    expect(previewSampleCsv('Sample,Plate\nx,y\n', samples, new Set()).error).toMatch(/Barcode/)
    expect(previewSampleCsv('  \n', samples, new Set()).error).toMatch(/empty/)
  })
  it('splits quoted fields', () => {
    expect(splitCsvLine('"a, b",c,"d ""e"""', ',')).toEqual(['a, b', 'c', 'd "e"'])
  })
})
