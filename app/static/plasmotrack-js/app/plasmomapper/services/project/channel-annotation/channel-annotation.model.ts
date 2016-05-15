import { DatabaseItem } from '../../DatabaseItem';
import { TimeStamped } from '../../TimeStamped';
import { Channel } from '../../channel/channel.model';

export class ChannelAnnotation extends DatabaseItem implements TimeStamped {
    last_updated: Date;
    channel: Channel;
    project_id: number;
    annotated_peaks: Object[];
    peak_indices: number[];
    
    fillFromJSON(obj) {
        this.isDirty = false;
        for(let p in obj) {
            this[p] = obj[p];
        }
    }
}