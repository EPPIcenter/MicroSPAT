import { describe, expect, it } from 'vitest'
import type { Settings } from '@/api/bindings'
import { defaultsOf, nonDefaultKeys, validateValues } from '@/components/form/schema'
import { settingsToValues, valuesToUpdate, workspaceSettingsSchema } from './model'

const ENGINE_DEFAULTS: Settings = {
  contamination_limit: 500,
  quality_limits: {
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
  },
}

describe('settingsToValues', () => {
  it('shows engine defaults as the schema defaults', () => {
    const v = settingsToValues(ENGINE_DEFAULTS)
    expect(v.crosstalk_problem).toBe(3.33)
    expect(v.crosstalk_warning).toBe(2.75)
    expect(v.pull_up_warning).toBe(8)
    expect(v.contamination_limit).toBe(500)
    expect(v.noisy_factor).toBe(2.5)
    expect(nonDefaultKeys(workspaceSettingsSchema, v)).toEqual([])
  })

  it('preserves percentages with more than two decimal places across round-trips', () => {
    const edited: Settings = {
      ...ENGINE_DEFAULTS,
      quality_limits: { ...ENGINE_DEFAULTS.quality_limits, crosstalk_warning: 0.02755 },
    }
    expect(settingsToValues(edited).crosstalk_warning).toBe(2.755)
  })
})

describe('valuesToUpdate', () => {
  it('sends only the dirty keys, converting percentages', () => {
    const values = { ...defaultsOf(workspaceSettingsSchema), contamination_limit: 800, pull_up_warning: 10, noisy_factor: 3 }
    expect(valuesToUpdate(values, ['contamination_limit', 'pull_up_warning', 'noisy_factor'])).toEqual({
      contamination_limit: 800,
      quality_limits: { pull_up_warning: 0.1, noisy_factor: 3 },
    })
  })

  it('leaves quality limits out when only the contamination limit changed', () => {
    const values = { ...defaultsOf(workspaceSettingsSchema), contamination_limit: 900 }
    expect(valuesToUpdate(values, ['contamination_limit'])).toEqual({ contamination_limit: 900 })
  })

  it('sends the exact default for crosstalk problem', () => {
    const values = { ...defaultsOf(workspaceSettingsSchema), pull_up_warning: 9 }
    const update = valuesToUpdate(values, ['crosstalk_problem', 'pull_up_warning'])
    expect(update.quality_limits?.crosstalk_problem).toBe(1 / 30)
  })

  it('resets when every value is back at its default', () => {
    expect(valuesToUpdate(defaultsOf(workspaceSettingsSchema), ['pull_up_warning', 'contamination_limit'])).toEqual({ reset_defaults: true })
  })
})

describe('validation', () => {
  const errorsWith = (patch: Record<string, number>) => validateValues(workspaceSettingsSchema, { ...defaultsOf(workspaceSettingsSchema), ...patch })

  it('accepts the defaults', () => {
    expect(errorsWith({})).toEqual({})
  })

  it('requires problem limits at or above warning limits', () => {
    expect(errorsWith({ pull_up_problem: 5 }).pull_up_problem).toBe('Must be ≥ the warning limit')
    expect(errorsWith({ crosstalk_problem: 2 }).crosstalk_problem).toBe('Must be ≥ the warning limit')
    expect(errorsWith({ crosstalk_saturated_problem: 4 }).crosstalk_saturated_problem).toBe('Must be ≥ the warning limit')
  })

  it('enforces bounds', () => {
    expect(errorsWith({ noisy_factor: 1 }).noisy_factor).toBeTruthy()
    expect(errorsWith({ unseparated_min_peaks: 0 }).unseparated_min_peaks).toBeTruthy()
  })
})
