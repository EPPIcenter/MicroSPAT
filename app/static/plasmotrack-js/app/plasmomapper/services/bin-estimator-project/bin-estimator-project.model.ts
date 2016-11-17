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

import { Project } from '../project/project.model';
import { LocusBinSet } from './locus-bin-set/locus-bin-set.model';
import { BinEstimatorLocusParameters } from './locus-parameters/bin-estimator-locus-parameters.model';

export class BinEstimatorProject extends Project {
    locus_bin_sets: Map<number, LocusBinSet>;
    locus_parameters: Map<number, BinEstimatorLocusParameters>;
    
    fillFromJSON(obj) {
        super.fillFromJSON(obj);
        
        let lp = new Map<number, BinEstimatorLocusParameters>();
        
        for(let key in obj.locus_parameters) {
            let new_lp = new BinEstimatorLocusParameters();
            new_lp.fillFromJSON(obj.locus_parameters[key]);
            lp.set(parseInt(key), new_lp);
        }
        this.locus_parameters = lp;
        
        let lb = new Map<number, LocusBinSet>();
        for(let key in obj.locus_bin_sets) {
            let new_lb = new LocusBinSet();
            new_lb.fillFromJSON(obj.locus_bin_sets[key]);
            lb.set(parseInt(key), new_lb);
        }
        this.locus_bin_sets = lb;
    }
}