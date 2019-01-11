import { SampleBasedProject } from '../project/sample-based-project';
import { ArtifactEstimating } from '../artifact-estimator/artifact-estimating';
import { BinEstimating } from '../bin-estimator/bin-estimating';

export interface QuantificationBiasEstimatorProject extends SampleBasedProject, ArtifactEstimating, BinEstimating {

}
