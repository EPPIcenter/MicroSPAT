import { DatabaseItem } from '../DatabaseItem';
import { Colored } from '../Colored';

export class Locus extends DatabaseItem implements Colored {
    label: string;
    max_base_length: number;
    min_base_length: number;
    nucleotide_repeat_length: number;
    locus_metadata: Object;
    color: string;
    
    fillFromJSON(obj) {
        this.isDirty = false;
        for(let p in obj) {
            this[p] = obj[p];
        }
    }
}