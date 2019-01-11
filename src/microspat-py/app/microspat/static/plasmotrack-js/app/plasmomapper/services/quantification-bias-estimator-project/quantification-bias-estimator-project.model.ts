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

import { SampleBasedProject } from '../sample-based-project/sample-based-project.model';
import { QuantificationBiasEstimatorLocusParameters } from './locus-parameters/quantification-bias-estimator-locus-parameters.model';

export class QuantificationBiasEstimatorProject extends SampleBasedProject {
    locus_parameters: Map<number, QuantificationBiasEstimatorLocusParameters>;

    fillFromJSON(obj) {
        super.fillFromJSON(obj);

        let lp = new Map<number, QuantificationBiasEstimatorLocusParameters>();

        for(let key in obj.locus_parameters) {
            let new_lp = new QuantificationBiasEstimatorLocusParameters();
            new_lp.fillFromJSON(obj.locus_parameters[key]);
            lp.set(parseInt(key), new_lp);
        }
        
        this.locus_parameters = lp;       
    }
}