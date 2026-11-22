import { describe, expect, it } from 'vitest'
import type { Issue, PlateQuality, QualityLimits, WellQuality } from '@/api/bindings'
import {
  crosstalkLevel,
  crosstalkRows,
  findLeak,
  fmtFraction,
  fmtIssueValue,
  groupValues,
  issuesForWell,
  ladderBadness,
  limitsSentence,
  measureScale,
  noiseBadness,
  pullUpDyes,
  pullUpLevel,
  qualityLabel,
  qualityRank,
  qualityWells,
  separationBadness,
  sortIssues,
  summarize,
} from './quality'

const LIMITS: QualityLimits = {
  pull_up_warning: 0.08,
  pull_up_problem: 0.2,
  crosstalk_warning: 0.0275,
  crosstalk_problem: 1 / 30,
  crosstalk_saturated_warning: 0.05,
  crosstalk_saturated_problem: 0.1,
  low_ladder_fraction: 0.25,
  weak_signal_rfu: 500,
  noisy_factor: 2.5,
  unseparated_min_peaks: 2,
  spectral_deviation_limit: 0.03,
  ladder_fade_limit: 0.2,
  weak_plate_fraction: 0.1,
  saturation_info_fraction: 0.25,
  control_height_limit: 300,
}

function issue(p: Partial<Issue>): Issue {
  return { kind: 'weak_injection', severity: 'info', title: 'T', message: 'M', wells: [], values: [], ...p }
}

function well(label: string, p: Partial<WellQuality> = {}): WellQuality {
  return {
    well: label,
    capillary: 1,
    sizing_quality: 0.1,
    plate_error: 0.1,
    ladder_height: 4000,
    ladder_fade: 0.9,
    signal: 5000,
    offscale_points: 0,
    dyes: [
      { color: 'blue', noise_sd: 8, baseline: 0, offscale_points: 0, max_signal: 5000, tall_peaks: 2, breakdown_peaks: 0, copy_peaks: 0 },
      { color: 'green', noise_sd: 12, baseline: 0, offscale_points: 0, max_signal: 3000, tall_peaks: 1, breakdown_peaks: 0, copy_peaks: 0 },
    ],
    tall_peaks: 3,
    breakdowns: 0,
    copies: 0,
    breakdown_fraction: 0,
    ladder_leaks: [],
    spectral_deviation: 0.001,
    flags: [],
    ...p,
  }
}

describe('summaries', () => {
  it('labels counts in words', () => {
    expect(qualityLabel(null)).toBe('Not checked')
    expect(qualityLabel({ problems: 0, warnings: 0, infos: 0, worst: null, outdated: false })).toBe('No issues')
    expect(qualityLabel({ problems: 1, warnings: 0, infos: 1, worst: 'problem', outdated: false })).toBe('1 problem, 1 note')
    expect(qualityLabel({ problems: 0, warnings: 2, infos: 3, worst: 'warning', outdated: false })).toBe('2 warnings, 3 notes')
  })

  it('ranks worse plates higher, unchecked lowest', () => {
    const s = (problems: number, warnings: number, infos: number) => ({ problems, warnings, infos, worst: null, outdated: false })
    const ranks = [null, s(0, 0, 0), s(0, 0, 3), s(0, 1, 0), s(1, 0, 0), s(2, 0, 0)].map(qualityRank)
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
  })

  it('summarizes issues', () => {
    expect(summarize([issue({ severity: 'warning' }), issue({ severity: 'info' })])).toEqual({ problems: 0, warnings: 1, infos: 1, worst: 'warning', outdated: false })
    expect(summarize([]).worst).toBeNull()
  })

  it('sorts issues worst first, keeping the order within a severity', () => {
    const list = [issue({ title: 'a' }), issue({ title: 'b', severity: 'problem' }), issue({ title: 'c' }), issue({ title: 'd', severity: 'warning' })]
    expect(sortIssues(list).map((i) => i.title)).toEqual(['b', 'd', 'a', 'c'])
  })
})

describe('numbers', () => {
  it('formats fractions and issue values', () => {
    expect(fmtFraction(0.0004)).toBe('0.04%')
    expect(fmtFraction(0.04)).toBe('4.0%')
    expect(fmtFraction(-0.012)).toBe('-1.2%')
    expect(fmtFraction(null)).toBe('–')
    expect(fmtIssueValue({ value: 0.14, unit: 'percent' })).toBe('14.0%')
    expect(fmtIssueValue({ value: 1234.6, unit: 'rfu' })).toBe('1,235 RFU')
    expect(fmtIssueValue({ value: 1.234, unit: 'bp' })).toBe('1.23 bp')
    expect(fmtIssueValue({ value: 6, unit: 'count' })).toBe('6')
  })

  it('finds the issues of a well and groups values by well', () => {
    const a = issue({ wells: ['F06'], severity: 'problem', values: [{ label: 'x', value: 1, unit: 'count', well: 'F06' }, { label: 'y', value: 2, unit: 'count' }] })
    const b = issue({ wells: ['A01'] })
    expect(issuesForWell([b, a], 'F06')).toEqual([a])
    expect(groupValues(a).map((g) => g.well)).toEqual([null, 'F06'])
  })
})

describe('pull-up and crosstalk', () => {
  const q: Pick<PlateQuality, 'pull_up' | 'crosstalk'> = {
    pull_up: [
      { source: 'green', target: 'blue', fraction: -0.01, spread: 0.001, peaks: 100 },
      { source: 'blue', target: 'green', fraction: 0.14, spread: 0.002, peaks: 95 },
      { source: 'red', target: 'blue', fraction: null, spread: null, peaks: 3 },
    ],
    crosstalk: [
      { distance: 2, saturated: false, fraction: 0.007, spread: null, peaks: 300 },
      { distance: 1, saturated: true, fraction: null, spread: null, peaks: 8 },
      { distance: 1, saturated: false, fraction: 0.011, spread: null, peaks: 400 },
    ],
  }

  it('lists dyes in dye order and finds leaks', () => {
    expect(pullUpDyes(q)).toEqual(['blue', 'green', 'red'])
    expect(findLeak(q, 'blue', 'green')?.fraction).toBe(0.14)
    expect(findLeak(q, 'blue', 'red')).toBeUndefined()
  })

  it('compares with the default limits', () => {
    expect(pullUpLevel(0.04, LIMITS)).toBe('ok')
    expect(pullUpLevel(-0.3, LIMITS)).toBe('ok')
    expect(pullUpLevel(0.14, LIMITS)).toBe('warning')
    expect(pullUpLevel(0.25, LIMITS)).toBe('problem')
    expect(pullUpLevel(null, LIMITS)).toBeNull()
    expect(crosstalkLevel({ fraction: 0.011, saturated: false, distance: 1 }, LIMITS)).toBe('ok')
    expect(crosstalkLevel({ fraction: 0.03, saturated: false, distance: 1 }, LIMITS)).toBe('warning')
    expect(crosstalkLevel({ fraction: 0.04, saturated: false, distance: 2 }, LIMITS)).toBe('problem')
    expect(crosstalkLevel({ fraction: 0.04, saturated: false, distance: 3 }, LIMITS)).toBe('warning')
    expect(crosstalkLevel({ fraction: 0.04, saturated: true, distance: 1 }, LIMITS)).toBe('ok')
  })

  it('pairs crosstalk rows by distance', () => {
    const rows = crosstalkRows(q)
    expect(rows.map((r) => r.distance)).toEqual([1, 2])
    expect(rows[0]!.normal?.fraction).toBe(0.011)
    expect(rows[0]!.saturated?.peaks).toBe(8)
    expect(rows[1]!.saturated).toBeNull()
  })

  it('states how measured pull-up and fixed crosstalk apply', () => {
    expect(limitsSentence(LIMITS)).toContain('measured pull-up automatically')
    expect(limitsSentence(LIMITS)).toContain('above 8%')
    expect(limitsSentence(LIMITS)).toContain('above 20%')
    expect(limitsSentence(LIMITS)).toContain('crosstalk uses the fixed limit up to 3.3% (10% next to off-scale peaks; warning above 2.75%)'.replace('crosstalk', 'Crosstalk'))
  })
})

describe('grid measures', () => {
  it('scores ladder height against the plate median', () => {
    expect(ladderBadness(5000, 4000)).toBe(0)
    expect(ladderBadness(2000, 4000)).toBeCloseTo(0.5)
    expect(ladderBadness(1000, 4000)).toBe(1)
    expect(ladderBadness(null, 4000)).toBeNull()
  })

  it('scores noise against the typical noise', () => {
    expect(noiseBadness(10, 10)).toBe(0)
    expect(noiseBadness(25, 10)).toBe(1)
    expect(noiseBadness(18.75, 10)).toBeCloseTo(0.5)
  })

  it('scores separation by breakdowns or ladder pull-up', () => {
    expect(separationBadness({ breakdowns: 0, spectral_deviation: 0.001, tall_peaks: 5 })).toBe(0)
    expect(separationBadness({ breakdowns: 1, spectral_deviation: 0.001, tall_peaks: 5 })).toBe(0.5)
    expect(separationBadness({ breakdowns: 6, spectral_deviation: 0.0004, tall_peaks: 13 })).toBe(1)
    expect(separationBadness({ breakdowns: 0, spectral_deviation: 0.04, tall_peaks: 5 })).toBe(1)
    expect(separationBadness({ breakdowns: 0, spectral_deviation: null, tall_peaks: 0 })).toBeNull()
  })

  it('builds grid data with "!" on flagged wells', () => {
    const report = { ladder_height: 4000, limits: LIMITS, wells: [well('A01'), well('F06', { breakdowns: 6, flags: ['unseparated_dyes'] }), well('H01', { ladder_height: null, flags: ['low_ladder', 'weak_injection'] })] }
    const sep = qualityWells(report, measureScale('separation', report))
    expect(sep.F06?.glyph).toBe('!')
    expect(sep.A01?.glyph).toBeNull()
    expect(sep.F06?.detail).toContain('Dyes not separated')
    expect(sep.F06?.color).toBe('var(--scale-none)')
    expect(sep.A01?.color).toBe('var(--scale-good)')
    const ladder = qualityWells(report, measureScale('ladder_height', report))
    expect(ladder.H01?.glyph).toBe('!')
    expect(ladder.H01?.detail?.[0]).toBe('Ladder height: no ladder')
    expect(measureScale('ladder_height', report).explanation).toContain('4,000 RFU')
    expect(measureScale('noise', report).explanation).toContain('Typical on this plate: 12 RFU')
    expect(measureScale('ladder_height', report).short).toContain('weak under 25% of it')
    // The report's limits drive the scale: a stricter breakdown count turns one breakdown red.
    const strict = { ...report, limits: { ...LIMITS, unseparated_min_peaks: 1 } }
    expect(measureScale('separation', strict).color(well('B01', { breakdowns: 1 }))).toBe('var(--scale-none)')
    expect(measureScale('separation', report).color(well('B01', { breakdowns: 1 }))).not.toBe('var(--scale-none)')
  })
})
