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
    genotyping_parameters_stale: boolean;
    probability_threshold: number;
    bootstrap_probability_threshold: number;

    initialize() {
        super.initialize();
        
        this.soft_artifact_sd_limit = 6;
        this.hard_artifact_sd_limit = 0;
        this.offscale_threshold = 32000;
        this.bleedthrough_filter_limit = 2;
        this.crosstalk_filter_limit = 2;
        this.relative_peak_height_limit = .01;
        this.absolute_peak_height_limit = 50;
        this.failure_threshold = 500;
        this.probability_threshold = 0;
        this.bootstrap_probability_threshold = 0;
    }
}