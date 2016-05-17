import { DatabaseItem } from '../../DatabaseItem';
import { TimeStamped } from '../../TimeStamped';

import { Sample } from '../../sample/sample.model';
import { SampleLocusAnnotation } from './locus-annotation/sample-locus-annotation.model';

export class SampleAnnotation extends DatabaseItem implements TimeStamped {
    // sample_id: number;
    sample: Sample;
    project_id: number;
    moi: number;
    last_updated: Date;
    locus_annotations: Map<number, SampleLocusAnnotation>
    
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
        
        if(obj.sample != null) {
            this.sample = new Sample()
            this.sample.fillFromJSON(obj.sample);
        }
    }
}