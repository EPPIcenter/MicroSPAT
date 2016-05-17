import { DatabaseItem } from '../DatabaseItem';
import { TimeStamped } from '../TimeStamped';
import { Flaggable } from '../Flaggable';

export class Channel extends DatabaseItem implements TimeStamped, Flaggable {
    well_id: number;
    wavelength: number;
    data: Array<number>;
    sample_id: number;
    locus_id: number;
    last_updated: Date;
    flags: Object;
    comments: string;
    max_data_point: number;
    
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