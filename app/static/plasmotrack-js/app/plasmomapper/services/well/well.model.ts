// MicroSPAT is a collection of tools for the analysis of Capillary Electrophoresis Data
// Copyright (C) 2016  Maxwell Murphy

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

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