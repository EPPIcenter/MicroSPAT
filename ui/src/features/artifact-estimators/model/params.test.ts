import { describe, expect, it } from 'vitest'
import type { ArtifactParams, BinParams } from '@/api/bindings'
import { defaultsOf, schemaFields } from '@/components/form/schema'
import { artifactEstimatorParams, binEstimatorParams } from '@/params/schemas'

// What the engine returns for a new estimator (get_project_locus_params).
const engineBins: BinParams = { min_peak_frequency: 10, default_bin_buffer: 0.75 }
const engineArtifact: ArtifactParams = {
  max_secondary_relative_peak_height: 0.4,
  min_artifact_peak_frequency: 10,
  min_artifact_run_fraction: 0.5,
  seed: 0,
  error_estimator: 'densest_half',
}

describe('estimator parameter schemas', () => {
  it('use the engine keys and defaults', () => {
    expect(defaultsOf(binEstimatorParams)).toEqual(engineBins)
    expect(defaultsOf(artifactEstimatorParams)).toEqual(engineArtifact)
  })
  it('explain every field', () => {
    for (const f of [...schemaFields(binEstimatorParams), ...schemaFields(artifactEstimatorParams)])
      expect(f.help?.length ?? 0).toBeGreaterThan(40)
  })
})
