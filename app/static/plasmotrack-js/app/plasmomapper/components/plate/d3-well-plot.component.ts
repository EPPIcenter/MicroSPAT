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


import { Component, Output, ElementRef, OnChanges, EventEmitter, OnDestroy } from '@angular/core';

import { Square } from '../d3/square.model';

import * as d3 from 'd3'


@Component({
    inputs: ['squares', 'wellArrangement', 'label'],
    selector: 'pm-d3-well-plot',
    template: `
    <h3 class="span label label-success">{{label}}</h3>
    <div style="height:100%" id="plot-container"></div>
    `
})
export class D3WellPlotComponent implements OnChanges, OnDestroy{
    @Output() wellSelected = new EventEmitter();
    
    private rowIndexMapping = {
                        'A': 0,
                        'B': 1,
                        'C': 2,
                        'D': 3,
                        'E': 4,
                        'F': 5,
                        'G': 6,
                        'H': 7,
                        'I': 8,
                        'J': 9,
                        'K': 10,
                        'L': 11,
                        'M': 12,
                        'N': 13,
                        'O': 14,
                        'P': 15
    };
    private rowLength: number;
    private colLength: number;
    private rowPadding: number = 1;
    private colPadding: number = 1;
    
    public squares: Square[];
    public wellArrangement: number;
    public label: string;
    
    constructor(
        private _elementRef: ElementRef
    ){}
    
    getRowIndex(well_label: string) {
        return this.rowIndexMapping[well_label.slice(0, 1)];
    }
    
    getColIndex(well_label: string) {
        return +well_label.slice(1) - 1;
    }
    
    ngOnDestroy(){
        d3.select(this._elementRef.nativeElement).select("#plot-container").select("*").remove()   
    }
    
    render() {
        d3.select(this._elementRef.nativeElement).select("#plot-container").select("*").remove()
        if(this.wellArrangement == 96) {
            this.rowLength = 12;
            this.colLength = 8;
        } else {
            this.rowLength = 24;
            this.colLength = 16;
        }
        
        let canvas = d3.select(this._elementRef.nativeElement).select("#plot-container").append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .style("background-color", "#252830")
            
        let full_width = parseInt(canvas.style('width'));
        let full_height = parseInt(canvas.style('height'));
        let width = full_width - ((this.rowLength + 1) * this.rowPadding);
        let height = full_height - ((this.colLength + 1) * this.colPadding);
        
        canvas.selectAll('rect')
            .data(this.squares)
            .enter().append('rect')
            .attr("x", d => this.getColIndex(d.well_label) * (full_width/this.rowLength) + this.rowPadding)
            .attr("y", d => this.getRowIndex(d.well_label) * (full_height/this.colLength) + this.colPadding)
            .attr("width", width / this.rowLength)
            .attr("height", height / this.colLength)
            .attr("stroke", d => {
                if(d.border) {
                    return d.border;
                } else {
                    return "black";
                }
            })
            .attr("stroke-width", d=> {
                if(d.border) {
                    return 4;
                } else {
                    return 0;
                }
            })
            .attr("fill", d => d.color)
            .on('click', d => {
                this.wellSelected.emit(d.id);
            })
    }
    
    ngOnChanges() {
        d3.select(this._elementRef.nativeElement).select("#plot-container").select("*").remove();
        this.render();
    }
}