import { describe, expect, it } from 'vitest'
import { makePeak } from '@/api/helpers'
import { autoYMax, axisToBp, bpToAxis, computeBounds, defaultDomain, markerRfu, peakStateOf, toTracePeaks, type TraceSeries } from './model'

const sizes = Float64Array.from({ length: 101 }, (_, i) => -10 + i * 5) // -10..490 bp
const data = Float64Array.from({ length: 101 }, (_, i) => (i === 40 ? 1000 : i === 90 ? 5000 : 10))
const s: TraceSeries = { id: 'blue', color: 'blue', data, baseSizes: sizes }

describe('trace model', () => {
  it('bounds clip extrapolated negative sizes', () => {
    expect(computeBounds([s], 'bp')).toEqual([0, 490])
    expect(computeBounds([s], 'index')).toEqual([0, 100])
  })
  it('converts bp <-> index via the primary series', () => {
    expect(bpToAxis(190, 'index', s)).toBe(40)
    expect(axisToBp(40, 'index', s)).toBe(190)
    expect(bpToAxis(190, 'bp', s)).toBe(190)
    expect(bpToAxis(190, 'index', { ...s, baseSizes: null })).toBeNull()
  })
  it('auto y fits only visible data', () => {
    expect(autoYMax([s], 'bp', [150, 250])).toBeCloseTo(1120)
    expect(autoYMax([s], 'bp', [0, 490])).toBeCloseTo(5600)
    expect(autoYMax([s], 'bp', [150, 250], [3000])).toBeCloseTo(3360)
  })
  it('default domain pads the locus range', () => {
    const d = defaultDomain([0, 490], 'bp', [150, 250], s)
    expect(d[0]).toBeCloseTo(142)
    expect(d[1]).toBeCloseTo(258)
    expect(defaultDomain([0, 490], 'bp', null, s)).toEqual([0, 490])
  })
  it('maps peak flags to states, flags first', () => {
    expect(peakStateOf(makePeak({ index: 1, in_bin: true }))).toBe('called')
    expect(peakStateOf(makePeak({ index: 1, in_bin: true, flags: { artifact: true } as never }))).toBe('artifact')
    expect(peakStateOf(makePeak({ index: 1, flags: { crosstalk: true } as never }))).toBe('flagged')
    expect(peakStateOf(makePeak({ index: 1, flags: { below_relative_threshold: true } as never }))).toBe('below')
    expect(peakStateOf(makePeak({ index: 1 }))).toBe('candidate')
    expect(peakStateOf(makePeak({ index: 1, flags: { artifact: true } as never }), { manual: 'on' })).toBe('manual-on')
  })
  it('toTracePeaks carries labels and details', () => {
    const [p] = toTracePeaks([
      makePeak({
        index: 7,
        size: 170.1,
        height: 900,
        bin_id: 2,
        bin_label: '170',
        in_bin: true,
        relative_height: 0.12,
        artifact_contribution: 300,
        artifact_error: 50,
        pullup_contribution: 120,
        pullup_error: 25,
        probability: 0.97,
      }),
    ])
    expect(p).toMatchObject({ index: 7, size: 170.1, label: '170', state: 'called' })
    expect(p!.detail!.join(' ')).toContain('artifact 300 ± 50 RFU')
    expect(p!.detail!.join(' ')).toContain('expected pull-up 120 ± 25 RFU')
  })
  it('puts markers on the raw apex and keeps the analysis height for the readout', () => {
    const [p] = toTracePeaks([makePeak({ index: 7, height: 900, raw_height: 1150 })])
    expect(p).toMatchObject({ height: 900, apex: 1150 })
    expect(markerRfu(p!)).toBe(1150)
    // Peaks stored before raw heights existed: their height was the raw value.
    const [old] = toTracePeaks([makePeak({ index: 7, height: 900 })])
    expect(markerRfu(old!)).toBe(900)
    expect(markerRfu({ id: 1, index: 1, size: 1, height: 40, state: 'candidate' })).toBe(40)
  })
})
