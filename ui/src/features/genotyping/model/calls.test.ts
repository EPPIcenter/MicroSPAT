import { describe, expect, it } from 'vitest'
import type { CallRow } from '@/api/bindings'
import { buildCallView, describeFilters, dropReason, filterCalls, narrowMissText, NO_FILTERS, sortCalls } from './calls'

const row = (id: number, barcode: string, alleles: string[], o: Partial<CallRow> = {}): CallRow => ({
  sample_id: id,
  barcode,
  designation: 'sample',
  reference_run_id: id * 10,
  alleles: alleles.map((l) => ({ bin_id: 100 + Number(l), label: l })).sort((a, b) => a.bin_id - b.bin_id),
  flags: { failure: false, offscale: false, spectral: false, manual_curation: false },
  moi: alleles.length || null,
  comment: null,
  peak_count: 5,
  max_height: 1000 * id,
  ...o,
})

// D1-SHOW-1 at PfY1, as the engine returns it.
const show1: CallRow = {
  ...row(93, 'D1-SHOW-1', []),
  alleles: [
    { bin_id: 76, label: '203', size: 203.39, proportion: 0.0795, corrected_proportion: 0.079, probability: 0.9366 },
    { bin_id: 77, label: '206', size: 206.38, proportion: 0.9205, corrected_proportion: 0.921, probability: 1 },
  ],
  moi: 1,
  min_probability: 0.9366,
  plate_label: 'DEMO-1',
  well_label: 'D01',
  run_count: 1,
  reviewed: false,
  narrow_misses: [{ bin_id: 79, label: '212', size: 212.43, height: 410, reason: 'artifact', value: 264, limit: 300 }],
}

describe('buildCallView', () => {
  it('takes every allele with its share from the row; five alleles show five chips', () => {
    const v = buildCallView(row(1, 'S1', ['203', '206', '209', '212', '215']))
    expect(v.chips.map((c) => c.label)).toEqual(['203', '206', '209', '212', '215'])
    const s = buildCallView(show1, { biasCorrected: true })
    expect(s.chips[0]).toMatchObject({
      label: '203',
      size: 203.39,
      share: 0.079,
      corrected: true,
      probability: 0.9366,
      lowProbability: true,
    })
    expect(buildCallView(show1).chips[0]).toMatchObject({ share: 0.0795, corrected: false })
    expect(s).toMatchObject({ well: 'D01', plate: 'DEMO-1', runCount: 1, reviewed: false })
  })
  it('collects concerns; a reviewed call has them but does not need attention', () => {
    const s = buildCallView(show1)
    expect(s.concerns).toEqual(['1 low-probability call', '1 narrow miss'])
    expect(s.needsAttention).toBe(true)
    expect(buildCallView({ ...show1, reviewed: true })).toMatchObject({
      needsAttention: false,
      concerns: ['1 low-probability call', '1 narrow miss'],
    })
    expect(buildCallView(show1, { bootstrapThreshold: 0.9 }).lowProbability).toBe(0)
    expect(buildCallView(row(2, 'NTC', ['203'], { designation: 'negative_control' })).concerns).toContain('negative control with alleles')
    expect(
      buildCallView(
        row(3, 'NTC2', [], {
          designation: 'negative_control',
          flags: { failure: true, offscale: false, spectral: false, manual_curation: false },
        }),
      ).concerns,
    ).toEqual([])
    expect(buildCallView(row(4, 'S4', [], { reference_run_id: null })).concerns).toEqual(['no usable run'])
    const broken = buildCallView(
      row(5, 'S5', ['203'], { flags: { failure: false, offscale: false, spectral: true, manual_curation: false } }),
    )
    expect(broken).toMatchObject({ spectral: true, concerns: ['spectral breakdown'], needsAttention: true })
    expect(
      filterCalls([broken, buildCallView(row(6, 'S6', ['203']))], { ...NO_FILTERS, flags: ['spectral'] }).map((v) => v.row.sample_id),
    ).toEqual([5])
  })
  it('describes narrow misses with the margin in words', () => {
    expect(narrowMissText(show1.narrow_misses![0]!)).toBe('36 RFU below the calling limit after expected stutter (264 of 300 RFU)')
    expect(narrowMissText({ bin_id: 1, label: '206', size: 206.3, height: 827, reason: 'probability', value: 0.8534, limit: 0.9 })).toBe(
      'probability 0.853, threshold 0.9',
    )
  })
})

describe('filterCalls and sortCalls', () => {
  const views = [
    buildCallView(row(1, 'D1-S10', ['203', '206'], { well_label: 'B01', reviewed: true })),
    buildCallView(
      row(2, 'D1-S2', ['206'], {
        flags: { failure: false, offscale: false, spectral: false, manual_curation: true },
        comment: 'check',
        well_label: 'A02',
        run_count: 3,
      }),
    ),
    buildCallView(row(3, 'D1-S1', [], { flags: { failure: true, offscale: false, spectral: false, manual_curation: false } })),
    buildCallView(row(4, 'D1-S3', ['200', '203', '206', '209'], { well_label: 'A01', narrow_misses: show1.narrow_misses })),
  ]
  it('filters by flags (AND), review state, allele count and text', () => {
    expect(filterCalls(views, { ...NO_FILTERS, flags: ['failed'] }).map((v) => v.row.sample_id)).toEqual([3])
    expect(filterCalls(views, { ...NO_FILTERS, flags: ['curated', 'commented'] }).map((v) => v.row.sample_id)).toEqual([2])
    expect(filterCalls(views, { ...NO_FILTERS, flags: ['unreviewed'] }).map((v) => v.row.sample_id)).toEqual([2, 3, 4])
    expect(filterCalls(views, { ...NO_FILTERS, flags: ['attention'] }).map((v) => v.row.sample_id)).toEqual([3, 4])
    expect(filterCalls(views, { ...NO_FILTERS, flags: ['narrow'] }).map((v) => v.row.sample_id)).toEqual([4])
    expect(filterCalls(views, { ...NO_FILTERS, flags: ['multi-run'] }).map((v) => v.row.sample_id)).toEqual([2])
    expect(filterCalls(views, { ...NO_FILTERS, alleles: '2+' }).map((v) => v.row.sample_id)).toEqual([1, 4])
    expect(filterCalls(views, { ...NO_FILTERS, alleles: '0' }).map((v) => v.row.sample_id)).toEqual([3])
    expect(filterCalls(views, { ...NO_FILTERS, text: '209' }).map((v) => v.row.sample_id)).toEqual([4])
    expect(filterCalls(views, { ...NO_FILTERS, text: 'CHECK' }).map((v) => v.row.sample_id)).toEqual([2])
    expect(filterCalls(views, { ...NO_FILTERS, text: 'a01' }).map((v) => v.row.sample_id)).toEqual([4])
    expect(describeFilters({ text: ' D1 ', flags: ['attention', 'narrow'], alleles: '2+' })).toBe(
      'needs attention, narrow misses, 2 or more alleles, matching “D1”',
    )
  })
  it('sorts naturally by barcode, by allele count, by well (column-major), with missing values last', () => {
    expect(sortCalls(views, { key: 'barcode', desc: false }).map((v) => v.row.barcode)).toEqual(['D1-S1', 'D1-S2', 'D1-S3', 'D1-S10'])
    expect(sortCalls(views, { key: 'alleles', desc: true }).map((v) => v.row.sample_id)).toEqual([4, 1, 2, 3])
    expect(sortCalls(views, { key: 'well', desc: false }).map((v) => v.row.sample_id)).toEqual([4, 1, 2, 3])
    expect(sortCalls(views, { key: 'well', desc: true }).map((v) => v.row.sample_id)).toEqual([2, 1, 4, 3])
    expect(
      sortCalls(views, { key: 'attention', desc: true })
        .slice(0, 2)
        .map((v) => v.row.sample_id)
        .sort((a, b) => a - b),
    ).toEqual([3, 4])
  })
})

describe('dropped review marks', () => {
  it('says why a mark the engine reports dropped no longer holds', () => {
    expect(dropReason(row(1, 'A', ['203'], { reviewed: true }))).toBeNull()
    expect(dropReason({ ...row(1, 'A', ['203', '206'], { reviewed: false }), review_dropped: true })).toContain(
      'changed since it was reviewed',
    )
    const byHand = { ...row(2, 'B', ['206']), review_dropped: true }
    expect(dropReason({ ...byHand, flags: { ...byHand.flags, manual_curation: true } })).toContain('changed by hand')
    expect(buildCallView({ ...row(3, 'C', []), review_dropped: true }).dropped).not.toBeNull()
  })
})
