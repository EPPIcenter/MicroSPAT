import { LocusParameters } from '../../project/locus-parameters/locus-parameters.model';

export class GenotypingLocusParameters extends LocusParameters {
    soft_artifact_sd_limit: number;
    hard_artifact_sd_limit: number;
    offscale_threshold: number;
    bleedthrough_filter_limit: number;
    crosstalk_filter_limit: number;
    relative_peak_height_limit: number;
    absolute_peak_height_limit: number;
    failure_threshold: number;
}