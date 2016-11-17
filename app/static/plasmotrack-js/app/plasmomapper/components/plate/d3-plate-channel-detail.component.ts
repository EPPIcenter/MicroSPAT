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

import { Component, ElementRef, OnChanges, OnInit, Output, EventEmitter } from '@angular/core';
import { Well } from '../../services/well/well.model';
import { Plate } from '../../services/plate/plate.model';
import { Channel } from '../../services/channel/channel.model';
import { Ladder } from '../../services/ladder/ladder.model';
import { LadderService } from '../../services/ladder/ladder.service';
import { WellService } from '../../services/well/well.service';
import { ChannelService } from '../../services/channel/channel.service';
import { Square } from '../d3/square.model';

import * as d3 from 'd3'

import { D3WellPlotComponent } from './d3-well-plot.component';

@Component({
    inputs: ['plate', 'wellSelector'],
    selector: 'pm-d3-plate-channel-detail',
    template:`
    <pm-d3-well-plot style="height:50%; padding:1vh" class="col-sm-4" *ngFor="let channelSet of channelSets" (wellSelected) = "wellSelector($event)" [wellArrangement]="wellArrangement" [squares]="channelSet[1]" [label]="channelSet[0]"></pm-d3-well-plot>
    `,
    directives: [D3WellPlotComponent]
})
export class D3PlateChannelDetailComponent implements OnChanges {
    public plate: Plate
    public wellSelector: (number);
    
    private wellArrangement: number;
    private channelSets: [string, Square[]][];
    
    constructor(
        
    ){}
    
    color_scale = d3.scale.linear()
                        .domain([0, 3000, 34000])
                        .range(['#d9534f', '#5cb85c', '#4292D1']);
                        
    ngOnChanges() {
        this.channelSets = [];
        this.wellArrangement = this.plate.well_arrangement
        let channel_map = new Map<string, Square[]>();
        this.plate.wells.forEach((well: Well, well_label: string) => {
            well.channels.forEach((channel: Channel, color: string) => {
                if(!channel_map.has(color)) {
                    channel_map.set(color, []);
                }
                channel_map.get(color).push({
                    'well_label': well_label,
                    'color': this.color_scale(channel.max_data_point),
                    'id': well.id
                })
            })
        })
        
        channel_map.forEach((channelSet: Square[], color:string) => {
            this.channelSets.push([color, channelSet]);
        })
    }
    
}