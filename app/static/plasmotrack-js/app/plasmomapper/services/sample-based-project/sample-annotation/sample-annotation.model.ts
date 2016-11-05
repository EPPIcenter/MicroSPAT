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