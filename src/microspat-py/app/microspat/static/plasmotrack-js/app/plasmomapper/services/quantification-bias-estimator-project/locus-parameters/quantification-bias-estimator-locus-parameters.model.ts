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