/**
 * Conversion between the engine's `LadderSpec` and the flat values of the
 * `ladderParams` schema (nested scanning fields are `scanning.<field>`).
 */
import type { LadderSpec, ScanParams } from '@/api/bindings'
import { defaultsOf, type ParamValues } from '@/components/form/schema'
import { ladderParams } from '@/params/schemas'

const SCAN_PREFIX = 'scanning.'

/** Flat form values of a spec's fitting parameters. */
export function specToValues(spec: LadderSpec): ParamValues {
  const out: ParamValues = {}
  for (const key of Object.keys(defaultsOf(ladderParams))) {
    const v = key.startsWith(SCAN_PREFIX) ? spec.scanning[key.slice(SCAN_PREFIX.length) as keyof ScanParams] : spec[key as keyof LadderSpec]
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') out[key] = v
  }
  return out
}

/** A spec from form values plus the fields the form does not hold. */
export function valuesToSpec(
  values: ParamValues,
  rest: Pick<LadderSpec, 'base_sizes' | 'color'>,
  base: LadderSpec = DEFAULT_SPEC,
): LadderSpec {
  const spec: LadderSpec = { ...base, scanning: { ...base.scanning }, base_sizes: rest.base_sizes, color: rest.color }
  const top = spec as unknown as Record<string, unknown>
  const scan = spec.scanning as unknown as Record<string, unknown>
  for (const [key, v] of Object.entries(values)) {
    if (v === null) continue
    if (key.startsWith(SCAN_PREFIX)) scan[key.slice(SCAN_PREFIX.length)] = v
    else top[key] = v
  }
  return spec
}

/** HD ROX 400 on red with default parameters: the engine's `LadderSpec::default()`. */
export const DEFAULT_SPEC: LadderSpec = {
  base_sizes: [50, 60, 90, 100, 120, 150, 160, 180, 190, 200, 220, 240, 260, 280, 290, 300, 320, 340, 360, 380, 400],
  color: 'red',
  sq_flag_limit: 1,
  sq_unusable_limit: 2,
  base_size_precision: 2,
  index_overlap: 5,
  min_time: 1200,
  max_peak_height: 24000,
  min_peak_height: 200,
  min_relative_height: 0.25,
  maximum_missing_peak_count: 5,
  allow_bleedthrough: true,
  scanning: { maxima_window: 10, relmax_window: 6, smoothing_window: 11, smoothing_order: 7, tophat_factor: 0.005 },
}

/** Keys whose change only takes effect after re-sizing plates (everything except the quality limits). */
export function needsResize(changed: readonly string[]): boolean {
  return changed.some((k) => k !== 'sq_flag_limit' && k !== 'sq_unusable_limit' && k !== 'label')
}

/** "HD ROX 400 copy", "HD ROX 400 copy 2", … not in `taken` (case-insensitive). */
export function copyLabel(label: string, taken: readonly string[]): string {
  const lower = new Set(taken.map((t) => t.toLowerCase()))
  const base = `${label} copy`
  if (!lower.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) if (!lower.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`
}
