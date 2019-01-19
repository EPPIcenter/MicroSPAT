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

import { DatabaseItem } from '../../DatabaseItem';
import { TimeStamped } from '../../TimeStamped';

import { Sample } from '../../sample/sample.model';
import { SampleLocusAnnotation } from './locus-annotation/sample-locus-annotation.model';
import { ControlSampleAssociation } from './control-sample-association.model';
import { Control } from '../../control/control.model';

export class SampleAnnotation extends DatabaseItem implements TimeStamped {
    // sample_id: number;
    sample: Sample;
    project_id: number;
    moi: number;
    last_updated: Date;
    locus_annotations: Map<number, SampleLocusAnnotation>;
    // assigned_controls: {[id: number]: ControlSampleAssociation} = {};

    
    fillFromJSON(obj) {
        this.isDirty = false;
        for(let p in obj) {
            this[p] = obj[p];
        }
        
        if(obj.last_updated != null) {
            this.last_updated = new Date(obj.last_updated);
        }
        
        let la = new Map<number, SampleLocusAnnotation>();
        
        for(let key in obj.locus_annotations) {
            let new_la = new SampleLocusAnnotation();
            new_la.fillFromJSON(obj.locus_annotations[key]);
            la.set(parseInt(key), new_la);
        }
        this.locus_annotations = la;

        
        // TODO: Implement this
        // obj.assigned_controls.forEach((csa) => {
        //     let new_csa = new ControlSampleAssociation();
        //     let new_control = new Control();
        //     new_control.fillFromJSON(csa.control)
        //     new_csa.control = new_control;
        //     new_csa.proportion = csa.proportion;
            
        // })


        if(obj.sample != null) {
            this.sample = new Sample()
            this.sample.fillFromJSON(obj.sample);
        }
    }
}