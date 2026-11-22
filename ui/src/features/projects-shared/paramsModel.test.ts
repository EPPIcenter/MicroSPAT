import { describe, expect, it } from 'vitest'
import type { LocusParams, LocusSet, ProjectSummary } from '@/api/bindings'
import { defaultsOf, validateValues } from '@/components/form/schema'
import { genotypingParams } from '@/params/schemas'
import { linkCandidates } from './compat'
import { KINDS } from './kinds'
import { changedByGroup, combinedSchema, flattenParams, paramGroupsFor, partialParams } from './paramsModel'

const engine: LocusParams = {
  scan: { maxima_window: 10, relmax_window: 6, smoothing_window: 11, smoothing_order: 7, tophat_factor: 0.005 },
  filter: { min_peak_height: 0, max_peak_height: 40000, min_peak_height_ratio: 0, max_bleedthrough: 10, max_crosstalk: 100, min_peak_distance: 2.2 },
  genotyping: {
    soft_artifact_sd_limit: 6,
    hard_artifact_sd_limit: 0,
    offscale_threshold: 32000,
    bleedthrough_filter_limit: 5,
    measured_pullup: true,
    pullup_sd_limit: 4,
    crosstalk_filter_limit: 30,
    reject_spectral_breakdown: false,
    relative_peak_height_limit: 0.01,
    absolute_peak_height_limit: 200,
    failure_threshold: 500,
    probability_threshold: 0.8,
    bootstrap_probability_threshold: 0.99,
  },
}

describe('locus parameter forms', () => {
  const groups = paramGroupsFor('genotyping')
  const schema = combinedSchema(groups)
  it('schema keys match every engine field of scan, filter and genotyping', () => {
    const flat = flattenParams(engine, groups)
    const engineKeys = Object.entries(engine).flatMap(([g, sec]) => Object.keys(sec as object).map((k) => `${g}.${k}`)).sort()
    expect(Object.keys(flat).sort()).toEqual(engineKeys)
    expect(schema.sections.flatMap((s) => s.fields.map((f) => f.key)).sort()).toEqual(engineKeys)
  })
  it('defaults equal the engine defaults for a genotyping project', () => {
    expect(defaultsOf(schema)).toEqual(flattenParams(engine, groups))
  })
  it('sends only changed keys, nested', () => {
    const v = { ...flattenParams(engine, groups), 'filter.min_peak_height': 150, 'genotyping.absolute_peak_height_limit': 250 }
    expect(partialParams(v, ['filter.min_peak_height', 'genotyping.absolute_peak_height_limit'])).toEqual({
      filter: { min_peak_height: 150 },
      genotyping: { absolute_peak_height_limit: 250 },
    })
    expect(changedByGroup(['filter.a', 'filter.b', 'scan.c'])).toEqual({ filter: 2, scan: 1 })
  })
  it('cross-field rules still see their own group after prefixing', () => {
    const v = { ...defaultsOf(schema), 'scan.smoothing_window': 6 }
    expect(validateValues(schema, v)).toHaveProperty(['scan.smoothing_window'])
    expect(validateValues(schema, { ...defaultsOf(schema), 'scan.smoothing_order': 11 })).toHaveProperty(['scan.smoothing_order'])
    expect(validateValues(genotypingParams, defaultsOf(genotypingParams))).toEqual({})
  })
  it('the kind section comes first', () => {
    expect(paramGroupsFor('bin_estimator').map((g) => g.key)).toEqual(['bins', 'filter', 'scan'])
  })
})

describe('linkCandidates', () => {
  const proj = (id: number, kind: ProjectSummary['kind'], set: number, stale = 0): ProjectSummary => ({
    id, kind, title: `P${id}`, description: '', locus_set_id: set, locus_set_label: `S${set}`, bin_estimator: null, artifact_estimator: null, quant_bias_estimator: null,
    all_samples: true, sample_count: 1, locus_count: 2, current_loci: 2 - stale, stale_loci: stale, unanalyzed_loci: 0, probabilities: null, created_at: '', updated_at: '',
  })
  const sets: LocusSet[] = [{ id: 1, label: 'A', locus_ids: [1, 2] }, { id: 2, label: 'B', locus_ids: [1] }, { id: 3, label: 'C', locus_ids: [1, 2, 3] }]
  const link = KINDS.genotyping.links[0]!
  it('accepts estimators covering the locus set, explains the others, and puts compatible first', () => {
    const c = linkCandidates(link, [proj(1, 'bin_estimator', 2), proj(2, 'bin_estimator', 3, 1), proj(3, 'artifact_estimator', 1)], sets, 1, new Map([[2, 'PfY1']]))
    expect(c.map((x) => [x.project.id, x.ok])).toEqual([[2, true], [1, false]])
    expect(c[1]!.note).toContain('PfY1')
    expect(c[0]!.note).toMatch(/not current/)
  })
})
