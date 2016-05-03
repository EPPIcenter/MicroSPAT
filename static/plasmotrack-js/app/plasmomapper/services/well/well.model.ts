import { DatabaseItem } from '../DatabaseItem';
import { TimeStamped } from '../TimeStamped';
import { Flaggable } from '../Flaggable';

import { Channel } from '../channel/channel.model';

export class Well extends DatabaseItem implements TimeStamped, Flaggable {
    plate_id: number;
    well_label: string;
    sizing_quality: number;
    last_updated: Date;
    offscale_indices: number[];
    ladder_id: number;
    fsa_hash: string;
    channels: Map<string, Channel>
    base_sizes: number[];
    ladder_peak_indices: number[];
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
        
        let ch = new Map<string, Channel>();
        for(let key in obj.channels) {
            let new_ch = new Channel();
            new_ch.fillFromJSON(obj.channels[key]);
            ch.set(key, new_ch);
        }
        this.channels = ch;
    }

}