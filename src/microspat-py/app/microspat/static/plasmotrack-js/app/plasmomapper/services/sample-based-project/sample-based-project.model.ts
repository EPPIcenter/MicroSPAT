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
import { SampleAnnotation } from './sample-annotation/sample-annotation.model';

export class SampleBasedProject extends Project {
    bin_estimator_id: number;
    sample_annotations: Map<number, SampleAnnotation>;
    
    fillFromJSON(obj) {
        super.fillFromJSON(obj);
        if(obj.sample_annotations != null) {
            let sa = new Map<number, SampleAnnotation>();
            for(let key in obj.sample_annotations) {
                let new_sa = new SampleAnnotation();
                new_sa.fillFromJSON(obj.sample_annotations[key]);
                sa.set(parseInt(key), new_sa);
            }
            this.sample_annotations = sa;
        }
        // let c = <Object[]> obj.sample_annotations;
        // this.sample_annotations = c.map((obj) => {
        //     let new_obj = new SampleAnnotation();
        //     new_obj.fillFromJSON(obj);
        //     return new_obj;
        // })
    }
}