import { ProjectLocusParams } from '../project/locus-params';

export interface QuantificationBiasEstimatorLocusParams extends ProjectLocusParams {
  beta: number;
  sd: number;
  r_squared: number;
  offscale_threshold: number;
  min_bias_quantifier_peak_height: number;
  min_bias_quantifier_peak_proportion: number;
  quantification_bias_parameters_stale: boolean;
}
