/// <reference path="./../../../../typings/browser.d.ts" />
import { Component, ElementRef, OnChanges } from 'angular2/core';
import { Well } from '../../services/well/well.model';
import { Plate } from '../../services/plate/plate.model';
import { LadderService } from '../../services/ladder/ladder.service';
import { Square } from '../d3/square.model';

import { D3WellPlotComponent } from './d3-well-plot.component';

@Component({
    inputs: ['plate', 'wellSelector'],
    selector: 'pm-d3-plate-ladder-detail',
    template: `
        <pm-d3-well-plot style="height: 100%" (wellSelected)="wellSelector($event)" [squares]="squares" [wellArrangement]="wellArrangement" [label]="'Ladder'"></pm-d3-well-plot>
    `,
    directives: [D3WellPlotComponent]
})
export class D3PlateLadderDetailComponent implements OnChanges {
    
    private squares: Square[];
    private wellArrangement: number;
    private errorMessages: string[] = [];
    public wellSelector: (number);
    public plate: Plate;
    public renderHandle: () => void;
    
    constructor(
        private _ladderService: LadderService
    ){}
    
    ngOnChanges() {
        
        this.squares = [];
        this.wellArrangement = this.plate.well_arrangement;
        
        this.plate.wells.forEach((well: Well, well_label: string) => {
            let color: string
            this._ladderService.getLadder(well.ladder_id).subscribe(
                ladder => {
                    if(!well.sizing_quality) {
                        color = "#f0ad4e";
                    } else if(well.sizing_quality < ladder.sq_limit) {
                        color = "#5cb85c";
                    } else {
                        color = "#d9534f";
                    }
                    
                    this.squares.push({
                        'well_label': well.well_label,
                        'color': color,
                        'id': well.id
                    })
                },
                err => {
                    console.error(err)
                    this.errorMessages.push(err)
                }
            )
            
        })

    }
}