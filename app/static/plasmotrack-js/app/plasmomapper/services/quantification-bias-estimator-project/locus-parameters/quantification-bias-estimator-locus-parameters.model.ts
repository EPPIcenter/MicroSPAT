import { LocusParameters } from '../../project/locus-parameters/locus-parameters.model';

export class QuantificationBiasEstimatorLocusParameters extends LocusParameters {
    beta: number;
    quantification_bias_estimator_parameters_stale: boolean;
}