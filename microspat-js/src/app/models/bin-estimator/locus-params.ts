import { ProjectLocusParams } from '../project/locus-params';

export interface BinEstimatorLocusParams extends ProjectLocusParams {
  min_peak_frequency: number;
  default_bin_buffer: number;
  bin_estimator_parameters_stale: number;
}
