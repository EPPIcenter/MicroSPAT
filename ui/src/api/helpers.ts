/**
 * Small helpers over the generated engine types (`./bindings`). The types
 * themselves are generated from Rust; never hand-mirror them here.
 */
import type { Color, Peak, PeakFlags } from './bindings'

export const COLORS: readonly Color[] = ['blue', 'green', 'yellow', 'red', 'orange']

export function anyFlag(f: PeakFlags): boolean {
  return f.below_relative_threshold || f.bleedthrough || f.crosstalk || f.spectral || f.artifact
}

export const EMPTY_FLAGS: PeakFlags = {
  below_relative_threshold: false,
  bleedthrough: false,
  crosstalk: false,
  spectral: false,
  artifact: false,
}

/** Build a Peak with defaults, as serde's `#[serde(default)]` would. */
export function makePeak(p: Partial<Peak> & Pick<Peak, 'index'>): Peak {
  return {
    size: 0,
    height: 0,
    raw_height: 0,
    area: 0,
    relative_height: 0,
    bleedthrough_ratio: 0,
    crosstalk_ratio: 0,
    spectral_dip_ratio: 0,
    pullup_contribution: null,
    pullup_error: null,
    fallback_bleedthrough_ratio: 0,
    bin_id: null,
    bin_label: null,
    in_bin: false,
    artifact_contribution: 0,
    artifact_error: 0,
    probability: null,
    relative_quantification: null,
    corrected_relative_quantification: null,
    true_proportion: null,
    ...p,
    flags: { ...EMPTY_FLAGS, ...p.flags },
  }
}
