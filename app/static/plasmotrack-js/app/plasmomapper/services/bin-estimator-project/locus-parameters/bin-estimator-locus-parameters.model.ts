import { LocusParameters } from '../../project/locus-parameters/locus-parameters.model';

export class BinEstimatorLocusParameters extends LocusParameters {
    min_peak_frequency: number;
    default_bin_buffer: number;
    bin_estimator_parameters_stale: boolean;

    initialize() {
        super.initialize();
        
        this.min_peak_frequency = 10;
        this.default_bin_buffer = .75;
    }
}