import { SampleBasedProject } from '../project/sample-based-project';
import { ArtifactEstimating } from '../artifact-estimator/artifact-estimating';
import { BinEstimating } from '../bin-estimator/bin-estimating';
import { QuantificationBiasEstimating } from '../quantification-bias-estimator/quantification-bias-estimating';

export interface GenotypingProject extends SampleBasedProject, ArtifactEstimating, BinEstimating, QuantificationBiasEstimating {

}
