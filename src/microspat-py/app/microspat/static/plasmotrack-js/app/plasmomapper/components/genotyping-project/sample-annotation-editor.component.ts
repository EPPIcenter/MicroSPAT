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

import { Component, ElementRef, OnChanges, EventEmitter, Output } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { D3Canvas } from '../d3/canvas';
import { CanvasConfig } from '../d3/canvas-config.model';
import { Bar } from '../d3/bar.model';
import { Trace } from '../d3/trace.model';
import { Circle } from '../d3/circle.model';


import { SampleLocusAnnotation } from '../../services/sample-based-project/sample-annotation/locus-annotation/sample-locus-annotation.model';
import { ChannelAnnotation } from '../../services/project/channel-annotation/channel-annotation.model';
import { GenotypingProject } from '../../services/genotyping-project/genotyping-project.model';
import { Channel } from '../../services/channel/channel.model';
import { ChannelService } from '../../services/channel/channel.service';
import { Well } from '../../services/well/well.model';
import { WellService } from '../../services/well/well.service';
import { Locus } from '../../services/locus/locus.model';
import { LocusService } from '../../services/locus/locus.service';
import { Bin } from '../../services/bin-estimator-project/locus-bin-set/bin/bin.model';

import * as d3 from 'd3';

@Component({
    inputs: ['locusAnnotation', 'bins', 'channelAnnotation'],
    selector: 'pm-d3-sample-annotation-editor',
    template: `
    <div class="col-sm-9" style="height: 100%">
        <div id="plot-container" style="height: 100%"></div>
    </div>
    <div class="col-sm-3">
        <div class="table-responseive">
            <table class="table table-striped table-condensed">
                <tbody>
                    <tr *ngIf="well">
                        <td>SQ</td>
                        <td>{{well.sizing_quality | number}}</td>
                    </tr>
                    <tr *ngIf="selectedPeak">
                        <td>Height</td>
                        <td>{{selectedPeak['peak_height']}}</td>
                    </tr>
                    <tr *ngIf="selectedPeak">
                        <td>Size</td>
                        <td>{{selectedPeak['peak_size'] | number}}</td>
                    </tr>
                    <tr *ngIf="selectedPeak">
                        <td>Artifact Contribution</td>
                        <td>{{selectedPeak['artifact_contribution'] | number}}</td>
                    </tr>
                    <tr *ngIf="selectedPeak">
                        <td>Artifact Error</td>
                        <td>{{selectedPeak['artifact_error'] | number}}</td>
                    </tr>
                    <tr *ngIf="selectedPeak">
                        <td>Bleedthrough</td>
                        <td>{{selectedPeak['bleedthrough_ratio'] | number}}</td>
                    </tr>
                    <tr *ngIf="selectedPeak">
                        <td>Crosstalk</td>
                        <td>{{selectedPeak['crosstalk_ratio'] | number}}</td>
                    </tr>
                    <tr *ngIf="selectedPeak">
                        <td>Probability</td>
                        <td>{{selectedPeak['probability'] | number}}</td>
                    </tr>
                    <tr *ngIf="selectedPeak">
                        <td>Relative Peak Height</td>
                        <td>{{selectedPeak['relative_peak_height'] | number}}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
    `
})
export class D3SampleAnnotationEditor implements OnChanges {
    public locusAnnotation: SampleLocusAnnotation;
    public channelAnnotation: ChannelAnnotation;
    public bins: Map<number, Bin>;
    
    private selectedPeak: Object;
    
    private errorMessage: string;
     
    private channel: Channel;
    private locus: Locus;
    private well: Well;
    
    private canvasConfig: CanvasConfig;
    private canvas: D3Canvas;
    private trace: Trace;
    private bars: Bar[];
    private circles: Circle[];
    private max_height: number
    
    // @Output() binToggled = new EventEmitter();
    
    constructor(
        private _elementRef: ElementRef,
        private _channelService: ChannelService,
        private _wellService: WellService,
        private _locusService: LocusService
    ){}
   
    private findMaxHeight() {
        this.max_height = 300
        this.locusAnnotation.annotated_peaks.forEach(peak => {
            if(peak['peak_height'] > this.max_height) {
                this.max_height = peak['peak_height']
            }
        })
    }
    
    private createBars(){
        this.bars = [];
        let keys = this.bins.keys();
        
        while(true) {
            let e = keys.next();
            if(e.done) {
                break;
            } else {
                let k = e.value;
            
                let b = this.bins.get(+k)
                let bar = {
                    opacity: .6,
                    center: b.base_size,
                    half_width: b.bin_buffer,
                    height: this.max_height,
                    id: +k,
                    color: null
                }
                
                if(this.locusAnnotation.alleles[+k]) {
                    bar.color = '#C96310'
                } else {
                    bar.color = '#4292D1'
                }
                
                this.bars.push(bar);
            }            
        }
    }
    
    private barClicked(bar: Bar){
        this.locusAnnotation.alleles[bar.id] = !this.locusAnnotation.alleles[bar.id];
        this.locusAnnotation.isDirty = true;
        this.render();
    }
    
    private createTrace(){
        this.trace = null;
        let data = d3.zip(this.well.base_sizes, this.channel.data);
        let trace = {
            data: data,
            color: '#5cb85c',
            display: true
        }
        this.trace = trace;
    }
    
    private createCircles(){
        this.circles = [];
        this.locusAnnotation.annotated_peaks.forEach(peak => {
            let color = 'blue';
            let outline = null;
            
            if(this.selectedPeak && peak['peak_index'] == this.selectedPeak['peak_index']){
                outline = 'white';
            }

            if(peak['flags']['artifact']) {
                color = 'yellow';
            }
            
            else if(peak['flags']['crosstalk'] || peak['flags']['bleedthrough']){
                color = 'green';
            }
            
            else if(peak['flags']['below_relative_threshold']) {
                color = 'yellow';
            }
            
            else if(!peak['in_bin']){
                color = 'red';
            }
            
            let p = {
                center: [<number> peak['peak_size'], <number> peak['peak_height']],
                radius: 6,
                color: color,
                opacity: 1,
                outline: outline,
                id: peak['peak_index']
            }
            this.circles.push(p);
        })
    }
    
    private createCanvas() {
        this.canvas = null;
        this.canvasConfig = null
        this.canvasConfig = {
            container: d3.select(this._elementRef.nativeElement).select("#plot-container"),
            backgroundColor: '#252830',
            domain: [this.locus.min_base_length, this.locus.max_base_length],
            range: [-100, this.max_height * 1.1]
        }
        this.canvas = new D3Canvas(this.canvasConfig);
        this.canvas.addBars(this.bars, this.barClicked.bind(this));
        this.canvas.addTrace(this.trace);
        if(this.locusAnnotation && this.locusAnnotation.reference_channel_id === this.channelAnnotation.channel_id) {
            this.canvas.addCircles(this.circles, this.selectPeak.bind(this));    
        };
        
    }
    
    private getWell(channel: Channel) {
        return this._wellService.getWell(channel.well_id)
            .map(well => {
                this.well = well;
                return channel;
            });
    }
    
    private getLocus(channel: Channel) {
        return this._locusService.getLocus(channel.locus_id)
            .map(locus => {
                this.locus = locus;
                return channel;
            })
    }
    
    private selectPeak(index: number) {
        for (var peak_index = 0; peak_index < this.locusAnnotation.annotated_peaks.length; peak_index++) {
            var peak = this.locusAnnotation.annotated_peaks[peak_index];
            if (peak['peak_index'] == index) {
                this.selectedPeak = peak;
                this.render();
                break;
            }
        }
    }
    
    render(){
        
        // let channelObs = this._channelService.getChannel(this.locusAnnotation.reference_channel_id).map(
        let channelObs = this._channelService.getChannel(this.channelAnnotation.channel_id).map(
            channel => {
                this.channel = channel;
                return channel;
            }
        )
        
        let wellObs = channelObs.concatMap(
            channel => {
                return this._wellService.getWell(channel.well_id)
                    .map(well => {
                        this.well = well
                        return well
                    })
            }
        )
        
        let locusObs = channelObs.concatMap(
            channel => {
                return this._locusService.getLocus(channel.locus_id)
                    .map(locus => {
                        this.locus = locus
                        return locus
                    })
                }
        )
        
        Observable.concat(locusObs, wellObs).subscribe(
            () => {
                if(this.well && this.locus && this.channel) {
                    this.findMaxHeight();
                    this.createBars();
                    this.createTrace();
                    this.createCircles();
                    this.createCanvas();
                }
                
            }
        )
    }
    
    ngOnChanges() {
        if(this.locusAnnotation) {
            this.selectedPeak = null;
            this.render();
        }
    }
}