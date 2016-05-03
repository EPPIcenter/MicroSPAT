import { DatabaseItem } from '../DatabaseItem';
import { TimeStamped } from '../TimeStamped';
import { Flaggable } from '../Flaggable';

import { Well } from '../well/well.model';

export class Plate extends DatabaseItem implements TimeStamped, Flaggable {
    label: string;
    creator: string;
    date_processed: Date;
    date_run: Date;
    well_arrangement: number;
    ce_machine: string;
    plate_hash: string;
    last_updated: Date;
    flags: Object;
    comments: string;
    wells: Map<string, Well>
    
    fillFromJSON(obj) {
        this.isDirty = false;
        for(let p in obj) {
            this[p] = obj[p];
        }
        
        if(obj.date_processed != null) {
            this.date_processed = new Date(obj.date_processed);
        }
        
        if(obj.date_run != null) {
            this.date_run = new Date(obj.date_run);
        }
        
        if(obj.last_updated != null) {
            this.last_updated = new Date(obj.last_updated);
        }
        
        let w = new Map<string, Well>();
        for(let key in obj.wells) {
            let new_w = new Well();
            new_w.fillFromJSON(obj.wells[key]);
            w.set(key, new_w);
        }
        this.wells = w;
    }
}