import { BaseModel } from '../base';

export interface ArtifactEstimator extends BaseModel {
  label: string;
  artifact_distance: number;
  artifact_distance_buffer: number;
  locus_artifact_estimator: string;
  artifact_equations: string[];
  peak_data: {}[];
}
