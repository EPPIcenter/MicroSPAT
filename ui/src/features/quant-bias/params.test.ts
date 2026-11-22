import { describe, expect, it } from 'vitest'
import type { LocusParams } from '@/api/bindings'
import { defaultsOf } from '@/components/form/schema'
import { combinedSchema, flattenParams, paramGroupsFor } from '@/features/projects-shared/paramsModel'
import { quantBiasParams } from '@/params/schemas'

// A quantification-bias estimator's effective parameters as the engine returns them (defaults).
const engine: LocusParams = {
  scan: { maxima_window: 10, relmax_window: 6, smoothing_window: 11, smoothing_order: 7, tophat_factor: 0.005 },
  filter: {
    min_peak_height: 0,
    max_peak_height: 40000,
    min_peak_height_ratio: 0,
    max_bleedthrough: 10,
    max_crosstalk: 100,
    min_peak_distance: 2.2,
  },
  quant_bias: { min_peak_height: 1000, min_true_proportion: 0.25, offscale_threshold: 32000 },
}

describe('quantification-bias parameters', () => {
  const groups = paramGroupsFor('quant_bias_estimator')
  it('schema keys are the engine QuantBiasParams fields', () => {
    expect(quantBiasParams.sections.flatMap((s) => s.fields.map((f) => f.key)).sort()).toEqual(Object.keys(engine.quant_bias!).sort())
    const flat = flattenParams(engine, groups)
    expect(Object.keys(defaultsOf(combinedSchema(groups))).sort()).toEqual(Object.keys(flat).sort())
  })
  it('defaults equal the engine defaults', () => {
    expect(defaultsOf(quantBiasParams)).toEqual(engine.quant_bias)
  })
})
