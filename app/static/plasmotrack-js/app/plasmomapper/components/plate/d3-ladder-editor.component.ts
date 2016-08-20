import { Component, ElementRef, OnChanges, OnInit, Output, EventEmitter, OnDestroy } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { Well } from '../../services/well/well.model';
import { Plate } from '../../services/plate/plate.model';
import { Channel } from '../../services/channel/channel.model';
import { Ladder } from '../../services/ladder/ladder.model';
import { LadderService } from '../../services/ladder/ladder.service';
import { WellService } from '../../services/well/well.service';
import { ChannelService } from '../../services/channel/channel.service';

import * as d3 from 'd3'

@Component({
    inputs: ['well'],
    selector: 'pm-d3-ladder-editor',
    template:`
    <div class="col-sm-9" style="height: 25vh">
        <div style="height: 100%">
            <div id="ladder-container" style="height: 100%"></div>
        </div>
    </div>
    <div class="col-sm-3">
        <a (click)="recalculateLadder()" [ngClass]="{disabled: !well.isDirty}" class="btn btn-primary btn-block">Recalculate Ladder</a>
        <a (click)="clearPeaks()" class="btn btn-warning btn-block">Clear Peaks</a>
        <a [ngClass]="{disabled: !well.isDirty}" (click)="undo()" class="btn btn-info btn-block">Undo Changes</a>
        <h3 class="span12 label label-info">SQ: {{well.sizing_quality | number}}</h3>
        <h3 class="span12 label label-success">Well: {{well.well_label}}</h3>
        <span class="label label-danger" *ngFor='let err of errorMessages'>{{err}}</span>
    </div>
    `
})
export class D3LadderEditorComponent implements OnChanges, OnDestroy{
    public ladderChannel: Channel
    public ladder: Ladder
    public well: Well
    public errorMessages: string[] = []
   
   @Output() ladderRecalculated = new EventEmitter();
   @Output() peaksCleared = new EventEmitter();
   @Output() undoChanges = new EventEmitter();
    
    constructor(
        private _wellService: WellService,
        private _ladderService: LadderService,
        private _channelService: ChannelService,
        private _elementRef: ElementRef
    ){}
    
    clearPeaks() {
        this.well.ladder_peak_indices = [];
        this.well.isDirty = true;
        this.render();
    }
    
    undo() {
        this._wellService.clearWellFromCache(this.well.id);
        this._wellService.getWell(this.well.id).subscribe(
            well => {
                this.well.copyFromObj(well);
                this.render();
            },
            err => this.errorMessages.push(err)
        );
    }
    
    recalculateLadder() {
        this.ladderRecalculated.emit(this.well);
    }
    
    ngOnDestroy(){
        d3.select(this._elementRef.nativeElement).select("#ladder-container").select("*").remove();
    }
    
    render() {        
        d3.select(this._elementRef.nativeElement).select("#ladder-container").select("*").remove();
        
        let max_i = null;
        let windowSize = 25;
        
        let canvas = d3.select(this._elementRef.nativeElement).select("#ladder-container")
                        .append('svg')
                        .attr("width", '100%')
                        .attr("height", "100%")
                        .style("background-color", "#252830");
        
        let fullWidth = parseInt(canvas.style("width"));
        let fullHeight = parseInt(canvas.style("height"));
        
        let x = d3.scale.linear()
                    .domain([0, this.ladderChannel.data.length])
                    .range([0, fullWidth]);
        
        let y = d3.scale.linear()
                    .domain([-200, d3.max(this.ladderChannel.data) * 1.2 + 25])
                    .range([fullHeight, 0]);
        
        let xAxis = d3.svg.axis().scale(x).tickSize(-fullHeight);
        let yAxisLeft = d3.svg.axis().scale(y).ticks(8).orient('left');
        
        let line = d3.svg.line()
                        .x(d => x(d[0]))
                        .y(d => y(d[1]));
        
        let __this = this;
        let mouseMove = function() {
            let x0 = x.invert(d3.mouse(this)[0])
            let i = d3.round(x0);
            let searchWindow = __this.ladderChannel.data.slice(i - windowSize, i + windowSize)
            
            max_i = searchWindow.indexOf(d3.max(searchWindow)) + i - windowSize;
            
            focus.attr("transform", "translate(" + x(max_i) + "," + y(__this.ladderChannel.data[max_i]) + ")")
        }
        
        let click = () => {
            if(this.well.ladder_peak_indices.indexOf(max_i) == -1) {
                this.well.ladder_peak_indices.push(max_i);
            } else {
                this.well.ladder_peak_indices.splice(this.well.ladder_peak_indices.indexOf(max_i), 1);
            }
            this.well.isDirty = true;
            refresh_peaks();
        }
        
        canvas.append("svg:g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + (fullHeight - 15) + ")")
            .style("font-size", 8)
            .call(xAxis)
        
        canvas.append("svg:g")
            .attr("class", "y axis")
            .attr("transform", "translate(35, 0)")
            .style("font-size", 8)
            .call(yAxisLeft)
            
       let r = <[number, number][]> d3.zip(d3.range(this.ladderChannel.data.length), this.ladderChannel.data)
        canvas.append("svg:path")
            .attr("d", line(r))
            .style("stroke", "#5cb85c")
            .style("fill", "none")
            .style("stroke-width", 1.5)
        
        let focus = canvas.append("svg:g")
                        .attr("class", "focus")
                        .style("display", "none");
        
        focus.append("circle").attr("r", 4.5);
        
        let refresh_peaks = () => {
            let peak = canvas.selectAll(".peak")
                        .data(this.well.ladder_peak_indices, function(d) {return d})
                        
            let new_peaks = peak.enter().append("svg:g")
                                .attr("class", "peak")
                                .attr("transform", (d) => {
                                    return "translate(" + x(d) + "," + y(this.ladderChannel.data[d]) + ")";
                                });
            new_peaks.append("circle")
            new_peaks.append("text")
            
            peak.selectAll("circle")
                .attr("r", 4.5)
                .style("fill", "steelblue");
                
            peak.selectAll("text")
                .text((d) => {return this.well.base_sizes[d];})
                .attr("y", -9)
                .attr("dy", ".35em")
                .style("fill", "white")
                .style("font-size", 8)
                .style("font", "Helvetica");
            
            peak.exit().remove();
        }
        
        refresh_peaks();
        
        canvas.append("rect")
            .attr("class", "overlay")
            .attr("width", fullWidth)
            .attr("height", fullHeight)
            .on("mouseover", function() {focus.style("display", null); })
            .on("mouseout", function() {focus.style("disply", "none"); })
            .on("mousemove", mouseMove)
            .on("click", click);
                        
    }
    
    
    private getLadderChannel = (ladder: Ladder) => {
        return this._channelService.getChannel(this.well.channels.get(ladder.color).id);
    }
    
    ngOnChanges(){
        d3.select(this._elementRef.nativeElement).select("#ladder-container").select("*").remove()
        if(this.well) {
            this._ladderService.getLadder(this.well.ladder_id)
                .concatMap(this.getLadderChannel)
                .subscribe(
                    (channel) => {
                        this.ladderChannel = <Channel> channel;
                        this.render()
                    },
                    (err) => this.errorMessages.push(err)
                )
        }
    }
}