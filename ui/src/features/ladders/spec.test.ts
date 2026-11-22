import { describe, expect, it } from 'vitest'
import { defaultsOf, schemaFields } from '@/components/form/schema'
import { ladderParams } from '@/params/schemas'
import { copyLabel, DEFAULT_SPEC, needsResize, specToValues, valuesToSpec } from './spec'

describe('ladder spec conversion', () => {
  it('schema keys cover every fitting field of LadderSpec', () => {
    const keys = schemaFields(ladderParams).map((f) => f.key)
    const expected = [
      ...Object.keys(DEFAULT_SPEC).filter((k) => !['base_sizes', 'color', 'scanning'].includes(k)),
      ...Object.keys(DEFAULT_SPEC.scanning).map((k) => `scanning.${k}`),
    ]
    expect(new Set(keys)).toEqual(new Set(expected))
  })
  it('schema defaults equal the engine defaults', () => {
    expect(defaultsOf(ladderParams)).toEqual(specToValues(DEFAULT_SPEC))
  })
  it('round-trips a spec', () => {
    const spec = { ...DEFAULT_SPEC, min_time: 900, scanning: { ...DEFAULT_SPEC.scanning, relmax_window: 4 } }
    const v = specToValues(spec)
    expect(v['scanning.relmax_window']).toBe(4)
    expect(valuesToSpec(v, { base_sizes: spec.base_sizes, color: 'orange' })).toEqual({ ...spec, color: 'orange' })
  })
  it('knows which changes need re-sizing', () => {
    expect(needsResize(['sq_flag_limit', 'sq_unusable_limit'])).toBe(false)
    expect(needsResize(['min_time'])).toBe(true)
  })
  it('makes unique copy labels', () => {
    expect(copyLabel('HD400', ['HD400'])).toBe('HD400 copy')
    expect(copyLabel('HD400', ['HD400', 'hd400 copy', 'HD400 copy 2'])).toBe('HD400 copy 3')
  })
})
