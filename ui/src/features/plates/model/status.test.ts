import { describe, expect, it } from 'vitest'
import type { ChannelSummary, PlateDetail, PlateSummary, RunSummary, WellSummary } from '@/api/bindings'
import { dyeSignal, fmtRunDate, ladderWells, locusStats, plateHealth, problemWells, signalDyes, signalWells } from './status'

function run(p: Partial<RunSummary> & Pick<RunSummary, 'locus_id' | 'locus_label'>): RunSummary {
  return {
    id: 1,
    sample_id: 1,
    sample_barcode: 'S1',
    designation: 'sample',
    max_signal: 1000,
    contaminated: false,
    locus_contaminated: false,
    ...p,
  }
}

function well(label: string, p: Partial<WellSummary> = {}, channels: ChannelSummary[] = []): WellSummary {
  return {
    id: label.charCodeAt(0) * 100 + Number(label.slice(1)),
    label,
    sample_name: `F-${label}`,
    sizing: 'good',
    sizing_quality: 0.1,
    sizing_error: null,
    manual_ladder: false,
    offscale_count: 0,
    channels,
    ...p,
  }
}

function plate(p: Partial<PlateSummary> = {}): PlateSummary {
  return {
    id: 1,
    label: 'P1',
    run_date: '2026-03-18T09:30:00',
    instrument: null,
    instrument_model: null,
    plate_size: 96,
    ladder_id: 1,
    ladder_label: 'ROX',
    imported_at: '2026-11-21T00:00:00Z',
    source: null,
    well_count: 96,
    sizing: { good: 96, flagged: 0, unusable: 0, failed: 0 },
    has_plate_map: true,
    run_count: 0,
    contaminated_loci: [],
    quality: null,
    ...p,
  }
}

describe('plate health', () => {
  it('is ok when every well sized', () => {
    expect(plateHealth(plate())).toEqual({ tone: 'ok', text: 'all good' })
  })
  it('warns about a few failures, alarms on many or on contamination', () => {
    expect(plateHealth(plate({ sizing: { good: 94, flagged: 1, unusable: 0, failed: 1 } }))).toEqual({ tone: 'warn', text: '1 failed, 1 flagged' })
    expect(plateHealth(plate({ sizing: { good: 80, flagged: 0, unusable: 6, failed: 10 } })).tone).toBe('danger')
    expect(plateHealth(plate({ contaminated_loci: ['PfB1'] })).tone).toBe('danger')
  })
  it('formats run dates without the seconds', () => {
    expect(fmtRunDate('2026-03-18T09:30:00')).toBe('2026-03-18 09:30')
    expect(fmtRunDate(null)).toBe('–')
  })
})

describe('ladder view', () => {
  const wells = [
    well('A01'),
    well('A02', { sizing: 'flagged', sizing_quality: 1.4 }),
    well('A03', { sizing: 'failed', sizing_quality: null, sizing_error: 'only 7 usable ladder peaks' }),
    well('A04', { sizing: 'unusable', sizing_quality: 4.2, manual_ladder: true }),
  ]
  it('lists wells to check in plate order', () => {
    expect(problemWells(wells)).toEqual(['A02', 'A03', 'A04'])
  })
  it('colors by state, explains failures and marks hand edits and drafts', () => {
    const g = ladderWells(wells, { drafts: new Set([wells[1]!.id]) })
    expect(g.A01!.color).toBe('var(--c-ok)')
    expect(g.A01!.marker).toBeUndefined()
    expect(g.A03!.glyph).toBe('×')
    expect(g.A03!.detail).toEqual(['Failed: no ladder fit', 'only 7 usable ladder peaks'])
    expect(g.A04!.marker?.label).toBe('Ladder edited by hand')
    expect(g.A02!.marker?.label).toBe('Unsaved ladder edit')
    expect(g.A01!.label).toBe('F-A01')
  })
})

describe('signal view', () => {
  const blue = (runs: RunSummary[], max: number | null = 5000): ChannelSummary => ({ id: 1, color: 'blue', max_signal: max, runs })
  const green = (runs: RunSummary[], max: number | null = 3000): ChannelSummary => ({ id: 2, color: 'green', max_signal: max, runs })
  const red = (max: number | null = 900): ChannelSummary => ({ id: 3, color: 'red', max_signal: max, runs: [] })

  it('takes the highest run signal of the dye, or one locus', () => {
    const w = well('A01', {}, [blue([run({ locus_id: 1, locus_label: 'B1', max_signal: 800 }), run({ locus_id: 2, locus_label: 'B2', max_signal: 4000 })])])
    expect(dyeSignal(w, 'blue', true, null)).toBe(4000)
    expect(dyeSignal(w, 'blue', true, 1)).toBe(800)
  })

  it('tells "no signal" (null) from "no data" (undefined)', () => {
    const sized = well('A01', {}, [blue([run({ locus_id: 1, locus_label: 'B1', max_signal: null })]), green([])])
    expect(dyeSignal(sized, 'blue', true, null)).toBeNull()
    expect(dyeSignal(sized, 'green', true, null)).toBeUndefined() // dye not assigned
    expect(dyeSignal(sized, 'yellow', true, null)).toBeUndefined() // no channel
    const failed = well('A02', { sizing: 'failed', sizing_quality: null }, [blue([run({ locus_id: 1, locus_label: 'B1', max_signal: null })], null)])
    expect(dyeSignal(failed, 'blue', true, null)).toBeUndefined()
    expect(dyeSignal(failed, 'blue', false, null)).toBeUndefined()
  })

  it('uses the whole sized range without a plate map', () => {
    expect(dyeSignal(well('A01', {}, [blue([], 7000)]), 'blue', false, null)).toBe(7000)
  })

  const detail: PlateDetail = {
    plate: plate(),
    loci: [
      { locus_id: 1, label: 'B1', color: 'blue', run_count: 2, contaminated: true },
      { locus_id: 3, label: 'G1', color: 'green', run_count: 2, contaminated: false },
    ],
    wells: [
      well('A01', {}, [blue([run({ locus_id: 1, locus_label: 'B1', max_signal: 6000 })]), green([run({ locus_id: 3, locus_label: 'G1', max_signal: 50 })]), red()]),
      well('H12', {}, [
        blue([run({ locus_id: 1, locus_label: 'B1', max_signal: 1800, designation: 'negative_control', contaminated: true })]),
        green([run({ locus_id: 3, locus_label: 'G1', max_signal: 20, designation: 'negative_control' })]),
        red(),
      ]),
      well('A03', { sizing: 'failed', sizing_quality: null }, [blue([run({ locus_id: 1, locus_label: 'B1', max_signal: null })], null), green([run({ locus_id: 3, locus_label: 'G1', max_signal: null })], null), red(null)]),
    ],
  }

  it('shows the dyes of the plate map, never the ladder', () => {
    expect(signalDyes(detail, 'red')).toEqual(['blue', 'green'])
    expect(signalDyes({ ...detail, loci: [] }, 'red')).toEqual(['blue', 'green'])
  })

  it('stripes per dye, single value per locus, and marks negative controls', () => {
    const all = signalWells(detail, { ladderColor: 'red', locusId: null })
    expect(all.A01!.dyes).toEqual([
      { color: 'blue', value: 6000 },
      { color: 'green', value: 50 },
    ])
    expect(all.H12!.marker?.label).toMatch(/Contaminated negative control \(B1\)/)
    expect(all.A03!.dyes?.every((d) => d.value === undefined)).toBe(true)
    const one = signalWells(detail, { ladderColor: 'red', locusId: 3 })
    expect(one.A01!.value).toBe(50)
    expect(one.A01!.dyes).toBeUndefined()
    expect(one.H12!.marker?.label).toBe('Negative control')
  })

  it('summarizes each locus', () => {
    const s = locusStats(detail)
    expect(s[0]).toMatchObject({ label: 'B1', median: (6000 + 1800) / 2, none: 0, unsized: 1, contaminated: true })
    expect(s[1]).toMatchObject({ label: 'G1', median: 35, none: 2, unsized: 1 })
  })
})
