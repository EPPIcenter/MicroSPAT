import { Component, ElementRef, OnChanges, OnInit, Output, EventEmitter } from '@angular/core';
import { Well } from '../../services/well/well.model';
import { Plate } from '../../services/plate/plate.model';
import { Channel } from '../../services/channel/channel.model';
import { Ladder } from '../../services/ladder/ladder.model';
import { LadderService } from '../../services/ladder/ladder.service';
import { WellService } from '../../services/well/well.service';
import { ChannelService } from '../../services/channel/channel.service';
import { LocusService } from '../../services/locus/locus.service';

import { D3Canvas } from '../d3/canvas';
import { CanvasConfig } from '../d3/canvas-config.model';
import { Trace } from '../d3/trace.model';

import { CapitalizePipe } from '../../pipes/capitalize.pipe';

import * as d3 from 'd3'

interface ZoomWindow {
    label: string;
    min: number;
    max: number;
}

@Component({
    inputs: ['well'],
    selector: 'pm-d3-well-viewer',
    pipes: [CapitalizePipe],
    template: `
    <div class="col-sm-9" style="height: 25vh">
        <div style="height: 100%">
            <div id="plot-container" style="height: 100%"></div>
        </div>
    </div>
    <div class="col-sm-3" style="height: 25vh">
        <div class="row">
            <div class="btn-group-vertical">
                <button (click)="zoomIn()" type="button" class="btn btn-info btn-xs"><span class="glyphicon glyphicon-plus"></span></button>
                <button (click)="zoomOut()" type="button" class="btn btn-info btn-xs"><span class="glyphicon glyphicon-minus"></span></button>
            </div>
        </div>
        <br>
        <div class="row">
            <div class="btn-group">
                <button type="button" class="btn btn-default btn-xs" *ngFor="let trace of traces" (click)="trace.display = !trace.display; render();">{{trace.color_label | capitalize}}</button>
            </div>
        </div>
        <br>
        <div class="row">
            <div class="form-group">
                <select (change)="setZoomWindow($event)" class="form-control">
                    <option *ngFor="let zoomWindow of zoomWindows; let i = index" value={{i}}>{{zoomWindow.label}}</option>
                </select>
            </div>
        </div>
    </div>
    `
})
export class D3WellViewerComponent implements OnChanges {
    private canvasConfig: CanvasConfig;
    private canvas: D3Canvas;
    private well: Well;
    private base_sizes: number[];
    private traces: Trace[] = [];
    private errorMessages: string[] = [];
    
    private range_max = 0;
    private range_min = -200;
    private domain_max = 0;
    private domain_min = 0;
    
    private zoomWindows: ZoomWindow[];
    
    constructor(
        private _elementRef: ElementRef,
        private _channelService: ChannelService,
        private _wellService: WellService,
        private _ladderService: LadderService,
        private _locusService: LocusService
    ){}
    
    private COLORMAP = {
        'blue': '#00D5FF',
        'red': 'red',
        'green': 'green',
        'yellow': 'yellow'
    }
    
    
    zoomIn() {
        this.range_max = this.range_max * 0.9;
        this.render();
    }
    
    zoomOut() {
        this.range_max = this.range_max * 1.1;
        this.render()
    }
    
    setDomain(min_base_size: number, max_base_size: number) {
        this.domain_min = min_base_size;
        this.domain_max = max_base_size;
        this.render();
    }
    
    render() {
        this.canvasConfig = {
            container: d3.select(this._elementRef.nativeElement).select("#plot-container"),
            backgroundColor: "#252830",
            domain: [this.domain_min, this.domain_max],
            range: [this.range_min, this.range_max]
        }
        this.canvas = new D3Canvas(this.canvasConfig);
        this.traces.forEach((trace: Trace) =>{
            if(trace.display) {
                this.canvas.addTrace(trace);    
            }
        })
    }
    
    getZoomWindow(locus_id: number) {
        this._locusService.getLocus(locus_id).subscribe(
            locus => this.zoomWindows.push({
                label: locus.label + " (" + locus.color + ")",
                min: locus.min_base_length,
                max: locus.max_base_length
            })
        )
    }
    
    setZoomWindow(e) {
        let i = e.target.value;
        let zoomWindow = this.zoomWindows[i];
        this.setDomain(zoomWindow.min, zoomWindow.max);
    }
    
    ngOnChanges(){
        this.traces = [];
        this.zoomWindows = []
        this.base_sizes = null;
        this._wellService.getWell(this.well.id).subscribe(
            well => {
                this.base_sizes = well.base_sizes;
                this.zoomWindows = [{
                    label: 'No Zoom',
                    min: this.base_sizes[0],
                    max: this.base_sizes[this.base_sizes.length - 1]
                }]
                this.setDomain(this.zoomWindows[0].min, this.zoomWindows[0].max);
                this._ladderService.getLadder(well.ladder_id).subscribe(
                    ladder => {
                        well.channels.forEach((channel: Channel, color: string) => {
                            this._channelService.getChannel(channel.id).subscribe(
                                new_channel => {
                                    if (channel.locus_id) {
                                        this.getZoomWindow(channel.locus_id)    
                                    }
                                    let data: [number , number][];
                                    if (well.sizing_quality < ladder.sq_limit) {
                                        data = <[number, number][]> d3.zip(this.base_sizes, new_channel.data);
                                        this.domain_max = d3.max(this.base_sizes);
                                    } else {
                                        data = <[number, number][]> d3.zip(d3.range(new_channel.data.length), new_channel.data);
                                        this.domain_max = new_channel.data.length;
                                    }
                                    this.range_max = d3.max([d3.max(new_channel.data), this.range_max])
                                    let trace = {
                                        data: data,
                                        color: this.COLORMAP[color],
                                        display: true,
                                        color_label: color
                                    }
                                    this.traces.push(trace)
                                    this.render();
                                })
                            })
                    })
                },
            err => this.errorMessages.push(err),
            () => {
            })
    }
}