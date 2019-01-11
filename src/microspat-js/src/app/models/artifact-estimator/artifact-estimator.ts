import { AnnotatedPeak } from './../project/peak';
import { ArtifactEquation } from 'app/models/artifact-estimator/artifact-equation';
import { BaseModel } from '../base';

export interface ArtifactEstimator extends BaseModel {
  label: string;
  artifact_distance: number;
  artifact_distance_buffer: number;
  locus_artifact_estimator: string;
  artifact_equations: string[] | ArtifactEquation[];
  peak_data: AnnotatedPeak[];
}
