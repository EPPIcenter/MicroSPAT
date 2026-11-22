import { describe, expect, it } from 'vitest'
import { genotypingParams, scanningParams, ALL_PARAM_SCHEMAS } from '@/params/schemas'
import { defaultsOf, dirtyKeys, formatNumber, nonDefaultKeys, parseNumber, validateField, validateValues, withDefaults, type ParamSchema } from './schema'

const schema: ParamSchema = {
  id: 't',
  sections: [
    {
      fields: [
        { key: 'n', kind: 'number', label: 'N', default: 5, min: 0, max: 10, integer: true },
        { key: 'x', kind: 'number', label: 'X', default: null, nullable: true },
        { key: 's', kind: 'text', label: 'S', default: '', required: true },
        { key: 'm', kind: 'select', label: 'M', default: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
        { key: 'only_b', kind: 'number', label: 'B only', default: 1, min: 0, visibleWhen: (v) => v.m === 'b' },
      ],
    },
  ],
}

describe('schema values', () => {
  it('defaults and merging', () => {
    expect(defaultsOf(schema)).toEqual({ n: 5, x: null, s: '', m: 'a', only_b: 1 })
    expect(withDefaults(schema, { n: 7, unknown: 3 } as never)).toEqual({ n: 7, x: null, s: '', m: 'a', only_b: 1 })
  })
  it('validates bounds, integers, required, options', () => {
    const v = { n: 11.5, x: null, s: '', m: 'z', only_b: 1 }
    expect(validateValues(schema, v)).toEqual({ n: 'Must be a whole number', s: 'Required', m: 'Choose an option' })
    expect(validateField(schema.sections[0]!.fields[0]!, 11, v)).toBe('Must be ≤ 10')
    expect(validateField(schema.sections[0]!.fields[0]!, NaN, v)).toBe('Must be a number')
    expect(validateField(schema.sections[0]!.fields[0]!, null, v)).toBe('Required')
  })
  it('skips hidden fields', () => {
    expect(validateValues(schema, { n: 1, x: null, s: 'a', m: 'a', only_b: -5 })).toEqual({})
    expect(validateValues(schema, { n: 1, x: null, s: 'a', m: 'b', only_b: -5 })).toEqual({ only_b: 'Must be ≥ 0' })
  })
  it('dirty and non-default keys', () => {
    const saved = defaultsOf(schema)
    expect(dirtyKeys(schema, { ...saved, n: 6 }, saved)).toEqual(['n'])
    expect(dirtyKeys(schema, { ...saved, n: 5.0000000000001 }, saved)).toEqual([])
    expect(nonDefaultKeys(schema, { ...saved, s: 'x' })).toEqual(['s'])
  })
  it('parses number text', () => {
    expect(parseNumber('')).toBeNull()
    expect(parseNumber(' 1,000 ')).toBe(1000)
    expect(parseNumber('1e')).toBeNaN()
    expect(parseNumber('-0.5')).toBe(-0.5)
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
  })
})

describe('shipped schemas', () => {
  it('have unique keys and valid defaults', () => {
    for (const s of ALL_PARAM_SCHEMAS) {
      const keys = s.sections.flatMap((x) => x.fields.map((f) => f.key))
      expect(new Set(keys).size).toBe(keys.length)
      const errs = validateValues(s, defaultsOf(s))
      // Ladder label and sizes are required and have no default.
      if (s.id !== 'ladder') expect(errs).toEqual({})
    }
  })
  it('cross-field rules', () => {
    const d = defaultsOf(scanningParams)
    expect(validateValues(scanningParams, { ...d, smoothing_window: 6 })).toHaveProperty('smoothing_window')
    expect(validateValues(scanningParams, { ...d, smoothing_order: 11 })).toHaveProperty('smoothing_order')
    expect(validateValues(genotypingParams, { ...defaultsOf(genotypingParams), probability_threshold: 1.2 })).toHaveProperty('probability_threshold')
  })
})
