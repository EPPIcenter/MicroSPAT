import { LocusParameters } from '../../project/locus-parameters/locus-parameters.model';

export class QuantificationBiasEstimatorLocusParameters extends LocusParameters {
    beta: number;
    sd: number;
    r_squared: number;
    offscale_threshold: number;
    min_bias_quantifier_peak_height: number;
    min_bias_quantifier_peak_proportion: number;
    quantification_bias_estimator_parameters_stale: boolean;

    initialize() {
        super.initialize();
        this.offscale_threshold = 32000;
        this.min_bias_quantifier_peak_height = 1000;
        this.min_bias_quantifier_peak_proportion = .25;
    }
}