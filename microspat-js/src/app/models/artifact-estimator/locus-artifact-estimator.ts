import { BaseModel } from '../base';

export interface LocusArtifactEstimator extends BaseModel {
  locus: string;
  project: string;
  artifact_estimators: string[];
}
