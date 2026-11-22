/**
 * Workspace settings as a parameter schema. The engine stores shares as
 * fractions (0.08); the form shows them as percentages (8).
 */
import type { QualityLimits, Settings, UpdateQualityLimitsParams, UpdateSettingsParams } from '@/api/bindings'
import { nonDefaultKeys, type ParamSchema, type ParamValue, type ParamValues } from '@/components/form/schema'

const atLeast = (key: string) => (v: ParamValue, values: ParamValues) => {
  const other = values[key]
  return typeof v === 'number' && typeof other === 'number' && v < other ? 'Must be ≥ the warning limit' : null
}

export const workspaceSettingsSchema: ParamSchema = {
  id: 'workspace-settings',
  sections: [
    {
      title: 'Negative controls',
      fields: [
        {
          kind: 'number',
          key: 'contamination_limit',
          label: 'Contamination limit',
          unit: 'RFU',
          default: 500,
          min: 0,
          max: 100000,
          integer: true,
          step: 50,
          help: 'Negative controls with signal above this mark their locus on the plate as contaminated. Applies immediately to plate and sample views.',
        },
        {
          kind: 'number',
          key: 'control_height_limit',
          label: 'Control peak calling limit',
          unit: 'RFU',
          default: 300,
          min: 10,
          max: 100000,
          step: 50,
          help: 'Peaks above this height in negative-control wells are checked for crosstalk or pull-up and flagged if unexplained.',
        },
      ],
    },
    {
      title: 'Spectral separation',
      fields: [
        {
          kind: 'number',
          key: 'unseparated_min_peaks',
          label: 'Breakdown peaks',
          unit: 'peaks',
          default: 2,
          min: 1,
          max: 50,
          integer: true,
          step: 1,
          help: 'Minimum tall peaks at a spectral breakdown before a capillary is flagged as having unseparated dyes.',
        },
        {
          kind: 'number',
          key: 'spectral_deviation_limit',
          label: 'Ladder pull-up deviation',
          unit: '%',
          default: 3,
          min: 0.5,
          max: 50,
          step: 0.5,
          help: 'Maximum difference between a capillary’s ladder pull-up and the plate median before its dyes are flagged as not separated.',
        },
      ],
    },
    {
      title: 'Pull-up and crosstalk alerts',
      fields: [
        {
          kind: 'number',
          key: 'pull_up_warning',
          label: 'Pull-up warning',
          unit: '%',
          default: 8,
          min: 0.5,
          max: 100,
          step: 1,
          help: 'Plate pull-up above this marks the dye pair as unusual in quality reports.',
        },
        {
          kind: 'number',
          key: 'pull_up_problem',
          label: 'Pull-up problem',
          unit: '%',
          default: 20,
          min: 0.5,
          max: 100,
          step: 1,
          validate: atLeast('pull_up_warning'),
          help: 'Plate pull-up above this flags a stale spectral calibration problem.',
        },
        {
          kind: 'number',
          key: 'crosstalk_warning',
          label: 'Crosstalk warning',
          unit: '%',
          default: 2.75,
          min: 0.1,
          max: 100,
          step: 0.25,
          help: 'Normal crosstalk into neighboring capillaries above this raises a warning.',
        },
        {
          kind: 'number',
          key: 'crosstalk_problem',
          label: 'Crosstalk problem',
          unit: '%',
          default: 3.33,
          min: 0.1,
          max: 100,
          step: 0.1,
          validate: atLeast('crosstalk_warning'),
          help: 'Normal crosstalk within 2 capillaries above this raises a problem (exceeds the default fixed limit of 30).',
        },
        {
          kind: 'number',
          key: 'crosstalk_saturated_warning',
          label: 'Off-scale crosstalk warning',
          unit: '%',
          default: 5,
          min: 0.1,
          max: 100,
          step: 0.5,
          help: 'Crosstalk from off-scale peaks above this raises a warning.',
        },
        {
          kind: 'number',
          key: 'crosstalk_saturated_problem',
          label: 'Off-scale crosstalk problem',
          unit: '%',
          default: 10,
          min: 0.1,
          max: 100,
          step: 0.5,
          validate: atLeast('crosstalk_saturated_warning'),
          help: 'Crosstalk from off-scale peaks within 2 capillaries above this raises a problem.',
        },
      ],
    },
    {
      title: 'Injection, ladder, noise, and saturation',
      fields: [
        {
          kind: 'number',
          key: 'low_ladder_fraction',
          label: 'Low ladder fraction',
          unit: '%',
          default: 25,
          min: 1,
          max: 100,
          step: 5,
          help: 'Wells whose median ladder height falls below this share of the plate median are marked low ladder.',
        },
        {
          kind: 'number',
          key: 'weak_signal_rfu',
          label: 'Weak sample signal',
          unit: 'RFU',
          default: 500,
          min: 0,
          max: 100000,
          step: 50,
          help: 'Low-ladder wells whose strongest sample signal stays under this are flagged as weak injections.',
        },
        {
          kind: 'number',
          key: 'weak_plate_fraction',
          label: 'Weak plate share',
          unit: '%',
          default: 10,
          min: 1,
          max: 100,
          step: 5,
          help: 'Share of weak wells on a plate from which a plate-wide weak injection problem is raised.',
        },
        {
          kind: 'number',
          key: 'ladder_fade_limit',
          label: 'Ladder fade limit',
          unit: '%',
          default: 20,
          min: 1,
          max: 100,
          step: 5,
          help: 'Minimum ratio of the last third of ladder peaks to the first third before flagging ladder fading.',
        },
        {
          kind: 'number',
          key: 'noisy_factor',
          label: 'Noisy multiplier',
          unit: '×',
          default: 2.5,
          min: 1.1,
          max: 20,
          step: 0.5,
          help: 'Dyes whose baseline noise SD exceeds this multiple of the plate median are flagged as noisy.',
        },
        {
          kind: 'number',
          key: 'saturation_info_fraction',
          label: 'Off-scale note threshold',
          unit: '%',
          default: 25,
          min: 1,
          max: 100,
          step: 5,
          help: 'Share of wells with off-scale scans from which the plate report adds an off-scale note.',
        },
      ],
    },
  ],
}

type LimitKey = keyof QualityLimits

/** Limits stored as fractions and shown as percentages. */
const PERCENT_KEYS: readonly LimitKey[] = [
  'spectral_deviation_limit',
  'pull_up_warning',
  'pull_up_problem',
  'crosstalk_warning',
  'crosstalk_problem',
  'crosstalk_saturated_warning',
  'crosstalk_saturated_problem',
  'low_ladder_fraction',
  'weak_plate_fraction',
  'ladder_fade_limit',
  'saturation_info_fraction',
]

/** Limits stored and shown as plain numbers. */
const DIRECT_KEYS: readonly LimitKey[] = ['control_height_limit', 'unseparated_min_peaks', 'weak_signal_rfu', 'noisy_factor']

const isPercent = (k: string): k is LimitKey => (PERCENT_KEYS as readonly string[]).includes(k)
const isDirect = (k: string): k is LimitKey => (DIRECT_KEYS as readonly string[]).includes(k)

const toPercent = (v: number) => (Math.abs(v - 1 / 30) < 1e-9 ? 3.33 : Number((v * 100).toPrecision(10)))

/** Form values for the engine's settings. */
export function settingsToValues(s: Settings): ParamValues {
  const out: ParamValues = { contamination_limit: s.contamination_limit }
  for (const k of DIRECT_KEYS) out[k] = s.quality_limits[k]
  for (const k of PERCENT_KEYS) out[k] = toPercent(s.quality_limits[k])
  return out
}

/**
 * The update for edited form values: only the `dirty` keys, or a reset when
 * every value is back at its default.
 */
export function valuesToUpdate(values: ParamValues, dirty: readonly string[]): UpdateSettingsParams {
  if (nonDefaultKeys(workspaceSettingsSchema, values).length === 0) return { reset_defaults: true }
  const out: UpdateSettingsParams = {}
  const limits: UpdateQualityLimitsParams = {}
  for (const key of dirty) {
    const v = Number(values[key])
    if (key === 'contamination_limit') out.contamination_limit = v
    else if (key === 'crosstalk_problem' && Math.abs(v - 3.33) < 1e-9) limits.crosstalk_problem = 1 / 30
    else if (isPercent(key)) limits[key] = v / 100
    else if (isDirect(key)) limits[key] = v
  }
  if (Object.keys(limits).length > 0) out.quality_limits = limits
  return out
}
