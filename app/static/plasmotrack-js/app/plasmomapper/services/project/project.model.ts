import { DatabaseItem } from '../DatabaseItem';
import { TimeStamped } from '../TimeStamped';
import { ChannelAnnotation } from './channel-annotation/channel-annotation.model'
import { LocusParameters } from './locus-parameters/locus-parameters.model';

export class Project extends DatabaseItem implements TimeStamped {
    title: string;
    date: Date;
    creator: string;
    description: string;
    last_updated: Date;
    locus_set_id: number;
    // channel_annotations: ChannelAnnotation[];
    locus_parameters: Map<number, LocusParameters>;
    
    fillFromJSON(obj) {
        this.isDirty = false;
        for(let p in obj) {
            this[p] = obj[p];
        }
        
        if(obj.date != null){
            this.date = new Date(obj.date);    
        }
        
        if(obj.last_updated != null) {
            this.last_updated = new Date(obj.last_updated);
        }
        
        // let c = <Object[]> obj.channel_annotations;
        // this.channel_annotations = c.map((obj) => {
        //     let new_obj = new ChannelAnnotation();
        //     new_obj.fillFromJSON(obj);
        //     return new_obj;
        // });
        
        let lp = new Map<number, LocusParameters>();
        
        for(let key in obj.locus_parameters) {
            let new_lp = new LocusParameters();
            new_lp.fillFromJSON(obj.locus_parameters[key]);
            lp.set(parseInt(key), new_lp);
        }
        this.locus_parameters = lp;
    }
}