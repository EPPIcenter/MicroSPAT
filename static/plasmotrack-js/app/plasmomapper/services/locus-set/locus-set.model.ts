import { DatabaseItem } from '../DatabaseItem';

import { Locus } from '../locus/locus.model';

export class LocusSet extends DatabaseItem {
    label: string;
    loci: Map<number, Locus>;
    
    fillFromJSON(obj) {
        this.isDirty = false;
        for(let p in obj) {
            this[p] = obj[p];
        }
        
        let l = new Map<number, Locus>();
        for(let key in obj.loci) {
            let new_l = new Locus();
            new_l.fillFromJSON(obj.loci[key]);
            l.set(parseInt(key), new_l);
        }
        this.loci = l;
    }
}