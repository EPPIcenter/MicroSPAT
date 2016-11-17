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