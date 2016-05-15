import { DatabaseItem } from '../../DatabaseItem';
import { Bin } from './bin/bin.model';

export class LocusBinSet extends DatabaseItem {
    locus_id: number;
    project_id: number;
    bins: Map<number, Bin>;
    
    fillFromJSON(obj) {
        this.isDirty = false;
        for(let p in obj) {
            this[p] = obj[p];
        }
        
        let b = new Map<number, Bin>();
        for(let key in obj.bins) {
            let new_b = new Bin();
            new_b.fillFromJSON(obj.bins[key]);
            b.set(parseInt(key), new_b)
        }
        this.bins = b;
    }
    
}