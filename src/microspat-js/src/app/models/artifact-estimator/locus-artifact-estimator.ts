import { Locus } from './../locus/locus';
import { BaseModel } from '../base';

export interface LocusArtifactEstimator extends BaseModel {
  locus: string | Locus;
  project: string;
  artifact_estimators: string[];
}
