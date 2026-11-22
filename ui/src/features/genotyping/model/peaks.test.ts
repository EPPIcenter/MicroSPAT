import { describe, expect, it } from 'vitest'
import type { GenotypingParams, Peak } from '@/api/bindings'
import { makePeak } from '@/api/helpers'
import {
  autoCalled,
  callContext,
  classifyPeak,
  isLowProbabilityCall,
  narrowMissOf,
  numberedPeaks,
  peakReasons,
  type CallContext,
} from './peaks'

const G: GenotypingParams = {
  soft_artifact_sd_limit: 6,
  hard_artifact_sd_limit: 0,
  offscale_threshold: 32000,
  bleedthrough_filter_limit: 2,
  measured_pullup: true,
  pullup_sd_limit: 4,
  crosstalk_filter_limit: 2,
  reject_spectral_breakdown: false,
  relative_peak_height_limit: 0.01,
  absolute_peak_height_limit: 300,
  failure_threshold: 500,
  probability_threshold: 0.9,
  bootstrap_probability_threshold: 0.99,
}
const ctx = (alleles: number[], o: Partial<CallContext> = {}): CallContext => ({
  alleles: new Set(alleles),
  failed: false,
  manualCuration: false,
  params: G,
  ...o,
})
const pk = (p: Partial<Peak>) =>
  makePeak({ index: 1, size: 200, height: 1000, relative_height: 0.5, bin_id: 7, bin_label: '200', in_bin: true, ...p })

describe('classifyPeak', () => {
  it('called peaks are called; a minor allele on a stutter position is still called when taller than expected', () => {
    // D1-SHOW-1 at PfY1: 1174 RFU at 203 with 626 ± 367 expected from the 206 allele.
    const minor = pk({ height: 1174, artifact_contribution: 626, artifact_error: 367, probability: 0.937 })
    expect(classifyPeak(minor, ctx([7]))).toBe('called')
    expect(isLowProbabilityCall(minor, ctx([7]))).toBe(true)
  })
  it('names the most specific rejection', () => {
    expect(classifyPeak(pk({ flags: { artifact: true, bleedthrough: true } as Peak['flags'], bleedthrough_ratio: 4.6 }), ctx([]))).toBe(
      'flagged',
    )
    expect(classifyPeak(pk({ flags: { artifact: true, below_relative_threshold: true } as Peak['flags'] }), ctx([]))).toBe('below')
    // Explained by stutter of a big peak: artifact.
    expect(classifyPeak(pk({ height: 900, artifact_contribution: 700, flags: { artifact: true } as Peak['flags'] }), ctx([]))).toBe(
      'artifact',
    )
    // Too low on its own (no artifact expected): below, not "artifact".
    expect(classifyPeak(pk({ height: 120, flags: { artifact: true } as Peak['flags'] }), ctx([]))).toBe('below')
    expect(classifyPeak(pk({ bin_id: null, bin_label: null, in_bin: false }), ctx([]))).toBe('out-of-bin')
    expect(classifyPeak(pk({ in_bin: false }), ctx([]))).toBe('out-of-bin')
    expect(classifyPeak(pk({ probability: 0.5, artifact_contribution: 800, artifact_error: 100 }), ctx([]))).toBe('candidate')
  })
  it('marks manual changes against the automatic rule', () => {
    const art = pk({ height: 900, artifact_contribution: 700, flags: { artifact: true } as Peak['flags'] })
    expect(classifyPeak(art, ctx([7], { manualCuration: true }))).toBe('manual-on')
    const good = pk({})
    expect(classifyPeak(good, ctx([], { manualCuration: true }))).toBe('manual-off')
    expect(classifyPeak(good, ctx([7], { manualCuration: true }))).toBe('called')
  })
  it('auto rule: nothing in a failed run; probability or the soft SD limit after the pass', () => {
    expect(autoCalled(pk({}), ctx([], { failed: true }))).toBe(false)
    expect(autoCalled(pk({ probability: 0.5, artifact_contribution: 0, artifact_error: 10 }), ctx([]))).toBe(true) // 100 SD above
    expect(autoCalled(pk({ probability: 0.5, artifact_contribution: 800, artifact_error: 100 }), ctx([]))).toBe(false)
  })
})

describe('narrow misses and reasons', () => {
  it('matches the engine narrow miss to its peak (same bin, size to 2 decimals) and explains it', () => {
    const r = {
      alleles: [],
      flags: { failure: false, offscale: false, spectral: false, manual_curation: false },
      narrow_misses: [{ bin_id: 7, label: '200', size: 200.12, height: 410, reason: 'artifact' as const, value: 264, limit: 300 }],
    }
    const c = { ...callContext(r, G) }
    const hit = pk({ size: 200.1234, height: 410, artifact_contribution: 146, flags: { artifact: true } as Peak['flags'] })
    expect(narrowMissOf(hit, c)?.label).toBe('200')
    expect(narrowMissOf(pk({ size: 199.5 }), c)).toBeNull()
    expect(peakReasons(hit, c).join(' ')).toContain('Narrow miss: 36 RFU below the calling limit after expected stutter')
  })
  it('explains in words with numbers', () => {
    const r = peakReasons(pk({ height: 900, artifact_contribution: 700, flags: { artifact: true } as Peak['flags'] }), ctx([]))
    expect(r.join(' ')).toContain('900 − 700 expected = 200 RFU, below 300')
    expect(peakReasons(pk({ probability: 0.95 }), ctx([7])).join(' ')).toMatch(/does not count toward MOI/)
    const pu = peakReasons(
      pk({
        height: 1100,
        pullup_contribution: 950,
        pullup_error: 60,
        bleedthrough_ratio: 7,
        flags: { bleedthrough: true } as Peak['flags'],
      }),
      ctx([], { platePullUp: [{ source: 'blue', target: 'green', fraction: 0.144, spread: 0.01, peaks: 100 }] }),
    )
    expect(pu.join(' ')).toContain('1,100 RFU sits within 4 SD of expected pull-up (950 ± 60 RFU; plate leak: blue 14.4%; bound 1,190 RFU)')
    const afterArtPu = peakReasons(
      pk({
        height: 1300,
        artifact_contribution: 200,
        pullup_contribution: 950,
        pullup_error: 60,
        bleedthrough_ratio: 7,
        flags: { bleedthrough: true } as Peak['flags'],
      }),
      ctx([]),
    )
    expect(afterArtPu.join(' ')).toContain('1,100 RFU after artifact sits within 4 SD of expected pull-up (950 ± 60 RFU; bound 1,190 RFU)')
    const fb = peakReasons(
      pk({
        height: 500,
        pullup_contribution: 20,
        pullup_error: 10,
        bleedthrough_ratio: 6,
        fallback_bleedthrough_ratio: 6,
        flags: { bleedthrough: true } as Peak['flags'],
      }),
      ctx([]),
    )
    expect(fb.join(' ')).toContain('unmeasured other dye in the well is 6.00×')
  })
  it('numbers binned peaks in the locus range by size', () => {
    const ps = [
      pk({ size: 210, index: 3 }),
      pk({ size: 203, index: 2 }),
      pk({ size: 150, index: 1 }),
      pk({ size: 205, bin_id: null, index: 4 }),
    ]
    expect(numberedPeaks(ps, [200, 230]).map((p) => p.index)).toEqual([2, 3])
  })
})
