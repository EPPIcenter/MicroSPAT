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
import { LocusArtifactEstimator } from './locus-artifact-estimator/locus-artifact-estimator.model';
import { ArtifactEstimatorLocusParameters } from './locus-parameters/artifact-estimator-locus-parameters.model';

export class ArtifactEstimatorProject extends Project {
    bin_estimator_id: number;
    locus_artifact_estimators: Map<number, LocusArtifactEstimator>;
    locus_parameters: Map<number, ArtifactEstimatorLocusParameters>;
    
    fillFromJSON(obj) {
        super.fillFromJSON(obj);

        let lp = new Map<number, ArtifactEstimatorLocusParameters>();
        
        for(let key in obj.locus_parameters) {
            let new_lp = new ArtifactEstimatorLocusParameters()
            new_lp.fillFromJSON(obj.locus_parameters[key]);
            lp.set(parseInt(key), new_lp);
        }
        this.locus_parameters = lp;
        
        let la = new Map<number, LocusArtifactEstimator>();
        for(let key in obj.locus_artifact_estimators) {
            let new_la = new LocusArtifactEstimator();
            new_la.fillFromJSON(obj.locus_artifact_estimators[key]);
            la.set(parseInt(key), new_la);
        }
        this.locus_artifact_estimators = la;
    }
}