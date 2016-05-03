import { DatabaseItem } from '../DatabaseItem';

export class Sample extends DatabaseItem {
    barcode: string;
    designation: string;
    last_updated: Date;
    
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