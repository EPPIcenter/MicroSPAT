import { ProjectLocusParams } from '../project/locus-params';

export interface GenotypingLocusParams extends ProjectLocusParams {
  soft_artifact_sd_limit: number;
  hard_artifact_sd_limit: number;
  offscale_threshold: number;
  bleedthrough_filter_limit: number;
  crosstalk_filter_limit: number;
  relative_peak_height_limit: number;
  absolute_peak_height_limit: number;
  failure_threshold: number;
  probability_threshold: number;
  bootstrap_probability_threshold: number;
  genotyping_parameters_stale: boolean;
}
