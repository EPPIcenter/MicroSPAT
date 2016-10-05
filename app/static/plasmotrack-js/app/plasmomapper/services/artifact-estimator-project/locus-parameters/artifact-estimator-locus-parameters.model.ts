import { LocusParameters } from '../../project/locus-parameters/locus-parameters.model';

export class ArtifactEstimatorLocusParameters extends LocusParameters { 
    max_secondary_relative_peak_height: number;
    min_artifact_peak_frequency: number;
    artifact_estimator_parameters_stale: boolean;

    initialize() {
        super.initialize();
        
        this.max_secondary_relative_peak_height = .4;
        this.min_artifact_peak_frequency = 10;
    }
}