import { describe, expect, it } from 'vitest'
import type { ArtifactEquation } from '@/api/bindings'
import { breakpointsOf, className, signed, sortClasses } from './classes'
import { callingHeights, callingSentence, expectation, expectedSentence, fitWarnings, segmentAt, slopeText } from './expected'

describe('distance class names', () => {
  it('names whole repeats in plain words with bp', () => {
    expect(className(-3, 3).label).toBe('−1 repeat (−3.0 bp)')
    expect(className(-3, 3).description).toMatch(/^Stutter: one repeat shorter/)
    expect(className(-5.99, 3).label).toBe('−2 repeats (−6.0 bp)')
    expect(className(-5.99, 3).description).toMatch(/^Double stutter/)
    expect(className(4.005, 4).label).toBe('+1 repeat (+4.0 bp)')
    expect(className(4.005, 4).description).toMatch(/^Forward stutter/)
    expect(className(-2.95, 3).repeats).toBe(-1)
    expect(className(12, 4).label).toBe('+3 repeats (+12.0 bp)')
  })
  it('names other distances in bp, and the global class', () => {
    expect(className(-1.02, 4).label).toBe('−1.0 bp')
    expect(className(-1.02, 4).description).toMatch(/A-addition/)
    expect(className(-1.6, 3).repeats).toBeNull()
    expect(className(null, 3)).toMatchObject({ label: 'Global (background)', global: true })
  })
  it('sorts −1, +1, −2 … and global last', () => {
    const e = (d: number | null) => ({ artifact_distance: d })
    expect(sortClasses([e(null), e(-6), e(3), e(-3)], 3).map((x) => x.artifact_distance)).toEqual([-3, 3, -6, null])
  })
  it('formats signs', () => {
    expect(signed(-0.04)).toBe('0.0')
    expect(signed(2.5)).toBe('+2.5')
  })
})

const eq = (start: number, end: number, slope: number, intercept: number, sd: number, n = 100, r2 = 0.8): ArtifactEquation => ({
  segment: { start_size: start, end_size: end, method: 'theil_sen', error: 'mad' },
  fit: { slope, intercept, sd, r_squared: r2 },
  n_points: n,
})

describe('expected stutter', () => {
  const fit = { slope: 0.001, intercept: -0.115, sd: 0.012 }
  it('translates a fit into RFU at a parent size and height', () => {
    const e = expectation(fit, 200, 10000)
    expect(e.expected).toBeCloseTo(850)
    expect(e.sd).toBeCloseTo(120)
    expect(e.clamped).toBe(false)
    expect(expectation(fit, 200, 10000).ratio).toBeCloseTo(0.085)
    expect(expectedSentence(className(-3, 3), -3, fit, 200, 10000)).toBe(
      'At 200 bp, a 10,000 RFU parent is expected to produce a stutter peak at 197.0 bp of 850 ± 120 RFU.',
    )
  })
  it('clamps a negative line at zero, as the engine does', () => {
    const e = expectation(fit, 100, 10000)
    expect(e).toMatchObject({ expected: 0, clamped: true })
    expect(expectedSentence(className(-3, 3), -3, fit, 100, 5000)).toMatch(/of 0 ± 60 RFU \(the fitted line is below zero/)
  })
  it('describes the global class as background on every other peak', () => {
    expect(expectedSentence(className(null, 3), null, { slope: 0, intercept: 0.01, sd: 0.004 }, 150, 8000)).toBe(
      'At 150 bp, a 8,000 RFU main peak is expected to add 80 ± 32 RFU of background to every other peak of the run.',
    )
  })
  it('gives the heights at which genotyping keeps and calls such a peak', () => {
    const e = expectation(fit, 200, 10000)
    expect(callingHeights(e).keep).toBeCloseTo(1050)
    expect(callingHeights(e).sure).toBeCloseTo(1570)
    expect(callingSentence(className(-3, 3), e)).toMatch(/flagged as artifact below 1,050 RFU .* above 1,570 RFU \(6 SD\)/)
  })
  it('finds the segment of a size like the engine (closed ranges, a breakpoint belongs to the lower segment)', () => {
    const eqs = [eq(70, 100, 0, 0.05, 0.01), eq(100, 135, 0, 0.08, 0.01)]
    expect(segmentAt(eqs, 100)).toBe(eqs[0])
    expect(segmentAt(eqs, 100.01)).toBe(eqs[1])
    expect(segmentAt(eqs, 70)).toBe(eqs[0])
    expect(segmentAt(eqs, 69.99)).toBeUndefined()
    expect(breakpointsOf({ equations: eqs })).toEqual([100])
  })
  it('flags noisy, sparse, negative and worse-than-flat fits', () => {
    expect(fitWarnings(eq(200, 260, 0.001, -0.1, 0.01))).toEqual([])
    const bad = fitWarnings(eq(70, 135, 0.00036, -0.00832, 0.05185, 8, -0.08))
    expect(bad.map((w) => w.text.split(' ')[0])).toEqual(['Only', 'Noisy:', 'R²'])
    const neg = fitWarnings(eq(230, 300, 0.00141, -0.25866, 0.0106))
    expect(neg).toEqual([])
    expect(fitWarnings(eq(150, 200, 0.002, -0.35, 0.01)).at(-1)!.text).toBe('The line is below zero below 175 bp: no artifact is expected there.')
    expect(slopeText(0.00158)).toBe('+0.158 % per bp')
  })
})
