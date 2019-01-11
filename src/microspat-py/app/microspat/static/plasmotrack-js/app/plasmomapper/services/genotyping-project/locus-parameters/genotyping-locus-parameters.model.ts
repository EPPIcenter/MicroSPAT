// MicroSPAT is a collection of tools for the analysis of Capillary Electrophoresis Data
// Copyright (C) 2016  Maxwell Murphy

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

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
        this.absolute_peak_height_limit = 300;
        this.failure_threshold = 500;
        this.probability_threshold = 0.9;
        this.bootstrap_probability_threshold = 0.99;
    }
}