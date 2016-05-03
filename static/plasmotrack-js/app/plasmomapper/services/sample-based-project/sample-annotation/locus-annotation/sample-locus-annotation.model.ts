import { DatabaseItem } from '../../../DatabaseItem';
import { TimeStamped } from '../../../TimeStamped';

export class SampleLocusAnnotation extends DatabaseItem implements TimeStamped {
    sample_annotations_id: number;
    locus_id: number;
    annotated_peaks: Object[];
    last_updated: Date;
    alleles: Object;
    reference_run_id: number;
    reference_channel_id: number;
    flags: Object;
    comments: string;
    
    fillFromJSON(obj) {
        this.isDirty = false;
        for(let p in obj) {
            this[p] = obj[p];
        }
        if(obj.last_updated != null) {
            this.last_updated = new Date(obj.last_updated);
        }
    }
}