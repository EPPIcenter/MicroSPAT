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