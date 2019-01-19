import { BaseModel } from '../base';
import { ProjectLocusParams } from '../project/locus-params';

export interface ArtifactEstimatorLocusParams extends ProjectLocusParams {
  max_secondary_relative_peak_height: number;
  min_artifact_peak_frequency: number;
  artifact_estimator_parameters_stale: boolean;
}
