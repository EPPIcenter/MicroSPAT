/** Mock workspace settings (`pnpm dev:mock`, `?mock`), starting at the engine defaults. */
import type { QualityLimits, Settings, UpdateSettingsParams } from '@/api/bindings'
import { registerMocks } from '@/api/mock/registry'
import { RpcError } from '@/api/transport'

function defaults(): Settings {
  return {
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
}

let settings = defaults()

const clone = (s: Settings): Settings => ({ ...s, quality_limits: { ...s.quality_limits } })

/** Allowed range of each limit, as stored (fractions for shares). */
const RANGES: Record<keyof QualityLimits, [number, number]> = {
  pull_up_warning: [0.005, 1],
  pull_up_problem: [0.005, 1],
  crosstalk_warning: [0.001, 1],
  crosstalk_problem: [0.001, 1],
  crosstalk_saturated_warning: [0.001, 1],
  crosstalk_saturated_problem: [0.001, 1],
  low_ladder_fraction: [0.01, 1],
  weak_signal_rfu: [0, 100000],
  noisy_factor: [1.1, 20],
  unseparated_min_peaks: [1, 50],
  spectral_deviation_limit: [0.005, 0.5],
  ladder_fade_limit: [0.01, 1],
  weak_plate_fraction: [0.01, 1],
  saturation_info_fraction: [0.01, 1],
  control_height_limit: [10, 100000],
}

function check(s: Settings): void {
  const bad = (msg: string) => new RpcError('invalid_params', msg)
  if (!Number.isFinite(s.contamination_limit) || s.contamination_limit < 0 || s.contamination_limit > 100000)
    throw bad('Contamination limit must be between 0 and 100000 RFU')
  const q = s.quality_limits
  for (const [key, [lo, hi]] of Object.entries(RANGES) as [keyof QualityLimits, [number, number]][]) {
    const v = q[key]
    if (!Number.isFinite(v) || v < lo - 1e-12 || v > hi + 1e-12) throw bad(`${key} must be between ${lo} and ${hi}`)
  }
  if (!Number.isInteger(q.unseparated_min_peaks)) throw bad('unseparated_min_peaks must be a whole number')
  const pairs: [keyof QualityLimits, keyof QualityLimits][] = [
    ['pull_up_problem', 'pull_up_warning'],
    ['crosstalk_problem', 'crosstalk_warning'],
    ['crosstalk_saturated_problem', 'crosstalk_saturated_warning'],
  ]
  for (const [problem, warning] of pairs) if (q[problem] < q[warning]) throw bad(`${problem} must be at least ${warning}`)
}

registerMocks({
  get_settings: () => clone(settings),
  update_settings: (params, ctx) => {
    const p = (params ?? {}) as UpdateSettingsParams
    const next = p.reset_defaults ? defaults() : clone(settings)
    if (p.contamination_limit !== undefined) next.contamination_limit = p.contamination_limit
    if (p.quality_limits) {
      for (const [k, v] of Object.entries(p.quality_limits)) {
        if (v !== undefined && k in next.quality_limits) next.quality_limits[k as keyof QualityLimits] = v
      }
    }
    check(next)
    settings = next
    ctx.changed('settings')
    ctx.changed('plates')
    ctx.changed('samples')
    return clone(settings)
  },
})
