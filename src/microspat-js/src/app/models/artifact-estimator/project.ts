import { SampleBasedProject } from '../project/sample-based-project';

export interface ArtifactEstimatorProject extends SampleBasedProject {
  locus_artifact_estimators: string[];
}
