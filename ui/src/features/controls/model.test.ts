import { describe, expect, it } from 'vitest'
import type { Bin, Control } from '@/api/bindings'
import { alleleIssues, allelesSet, changedAlleles, copyLabel, deletedBins, draftOf, filterBins, isNoneQuery } from './model'

const bin = (id: number, label: string, size: number): Bin => ({ id, label, base_size: size, bin_buffer: 0.75, peak_count: 10 })
const BINS = [bin(1, '200', 200.3), bin(2, '203', 203.4), bin(3, '206', 206.4), bin(4, '230', 230.1), bin(5, '1203', 1203)]

const control: Control = {
  id: 1,
  label: '3D7',
  bin_estimator_id: 9,
  bin_estimator_title: 'Demo bins',
  alleles: [
    { locus_id: 1, locus_label: 'A', bin_id: 2, bin_label: '203' },
    { locus_id: 2, locus_label: 'B', bin_id: null, bin_label: null },
  ],
  mixture_count: 0,
}

describe('allele search', () => {
  it('ranks an exact label, then prefixes, then sizes within 2 bp', () => {
    expect(filterBins(BINS, '203').map((b) => b.label)).toEqual(['203', '1203'])
    expect(filterBins(BINS, '20').map((b) => b.label)).toEqual(['200', '203', '206', '1203'])
    expect(filterBins(BINS, '205').map((b) => b.label)).toEqual(['206', '203'])
    expect(filterBins(BINS, '').map((b) => b.id)).toEqual([1, 2, 3, 4, 5])
    expect(filterBins(BINS, 'zz')).toEqual([])
  })
  it('knows the words for no allele', () => {
    expect(isNoneQuery(' None ')).toBe(true)
    expect(isNoneQuery('-')).toBe(true)
    expect(isNoneQuery('20')).toBe(false)
  })
})

describe('controls', () => {
  it('counts loci with an allele', () => expect(allelesSet(control)).toEqual({ set: 1, total: 2 }))
  it('names a copy that is free', () => {
    expect(copyLabel('3D7', ['3D7'])).toBe('3D7 copy')
    expect(copyLabel('3D7', ['3D7', '3d7 COPY', '3D7 copy 2'])).toBe('3D7 copy 3')
  })
  it('sends only changed alleles, or every set allele for a new control', () => {
    const d = draftOf(control)
    d.set(2, 4)
    expect(changedAlleles(d, control)).toEqual([{ locus_id: 2, bin_id: 4 }])
    d.set(1, null)
    expect(changedAlleles(d, control)).toEqual([
      { locus_id: 1, bin_id: null },
      { locus_id: 2, bin_id: 4 },
    ])
    expect(
      changedAlleles(
        new Map([
          [1, 2],
          [2, null],
        ]),
        null,
      ),
    ).toEqual([{ locus_id: 1, bin_id: 2 }])
  })
  it('flags missing alleles, vanished bins and bins that are not current', () => {
    const issues = alleleIssues(
      new Map([
        [1, 99],
        [2, null],
        [3, 3],
      ]),
      [
        { locus_id: 1, label: 'A', binsState: 'current' },
        { locus_id: 2, label: 'B', binsState: 'current' },
        { locus_id: 3, label: 'C', binsState: 'stale' },
      ],
      new Map([
        [1, BINS],
        [3, BINS],
      ]),
    )
    expect(issues.map((i) => [i.locusId, i.level])).toEqual([
      [1, 'danger'],
      [2, 'warn'],
      [3, 'warn'],
    ])
  })
  it('tells a deleted allele bin from one never set', () => {
    const issues = alleleIssues(
      new Map([
        [1, null],
        [2, null],
      ]),
      [
        { locus_id: 1, label: 'A', binsState: 'current' },
        { locus_id: 2, label: 'B', binsState: 'current' },
      ],
      new Map([[1, BINS]]),
      deletedBins({
        alleles: [{ locus_id: 1, locus_label: 'A', bin_id: null, bin_label: null, deleted_bin: { label: '210', base_size: 210.4 } }],
      }),
    )
    expect(issues.map((i) => [i.locusId, i.kind])).toEqual([
      [1, 'deleted'],
      [2, 'missing'],
    ])
    expect(issues[0]!.text).toContain('210 (210.40 bp) was deleted')
  })
})
