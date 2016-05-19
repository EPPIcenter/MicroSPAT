import { Component, ElementRef, OnChanges, EventEmitter, Output } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { D3Canvas } from '../d3/canvas';
import { CanvasConfig } from '../d3/canvas-config.model';
import { Bar } from '../d3/bar.model';
import { Trace } from '../d3/trace.model';
import { Circle } from '../d3/circle.model';


import { SampleLocusAnnotation } from '../../services/sample-based-project/sample-annotation/locus-annotation/sample-locus-annotation.model';
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
    inputs: ['locusAnnotation', 'bins'],
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
        console.log(this.locusAnnotation);
        console.log(this.bins);
        
        for(let k in this.locusAnnotation.alleles) {
            let b = this.bins.get(+k)
            let bar = {
                opacity: .6,
                center: b.base_size,
                half_width: b.bin_buffer,
                height: this.max_height,
                id: +k,
                color: null
            }
            
            if(this.locusAnnotation.alleles[k]) {
                bar.color = '#C96310'
            } else {
                bar.color = '#4292D1'
            }
            
            this.bars.push(bar);
        }
    }
    
    private barClicked(bar: Bar){
        console.log(bar);
        this.locusAnnotation.alleles[bar.id] = !this.locusAnnotation.alleles[bar.id];
        this.locusAnnotation.isDirty = true;
        this.render();
    }
    
    private createTrace(){
        this.trace = null;
        console.log(this.well, this.channel);
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
            if(peak['flags']['artifact']) {
                color = 'yellow';
            }
            
            if(peak['flags']['crosstalk'] || peak['flags']['bleedthrough']){
                color = 'green';
            }
            
            if(peak['flags']['below_relative_threshold']) {
                color = 'yellow';
            }
            
            if(!peak['in_bin']){
                color = 'red';
            }
            
            let p = {
                center: [<number> peak['peak_size'], <number> peak['peak_height']],
                radius: 6,
                color: color,
                opacity: 1,
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
        console.log(this.canvasConfig);
        this.canvas = new D3Canvas(this.canvasConfig);
        this.canvas.addBars(this.bars, this.barClicked.bind(this));
        this.canvas.addTrace(this.trace);
        this.canvas.addCircles(this.circles, this.selectPeak.bind(this));
    }
    
    private getWell(channel: Channel) {
        return this._wellService.getWell(channel.well_id)
            .map(well => {
                console.log("Getting Well");
                this.well = well;
                return channel;
            });
    }
    
    private getLocus(channel: Channel) {
        console.log("Getting Locus");
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
                break;
            }
        }
    }
    
    render(){
        
        let channelObs = this._channelService.getChannel(this.locusAnnotation.reference_channel_id).map(
            channel => {
                this.channel = channel;
                return channel;
            }
        )
        
        let wellObs = channelObs.concatMap(
            channel => {
                console.log(channel);
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
        if(this.locusAnnotation.reference_run_id) {
            this.selectedPeak = null;
            this.render();
        }
    }
}