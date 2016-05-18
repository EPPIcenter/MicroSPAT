import { Component, Output, ElementRef, OnInit, EventEmitter, OnDestroy } from '@angular/core';

import { Bin } from '../../../services/bin-estimator-project/locus-bin-set/bin/bin.model';
import { Locus } from '../../../services/locus/locus.model';
import { ChannelAnnotation } from '../../../services/project/channel-annotation/channel-annotation.model';

import { D3Canvas } from '../../d3/canvas';
import { CanvasConfig } from '../../d3/canvas-config.model';
import { Bar } from '../../d3/bar.model';
import { Circle } from '../../d3/circle.model';

import * as d3 from 'd3';

@Component({
    inputs: ['bins', 'locus', 'annotations'],
    selector: 'pm-d3-bin-estimator-locus-plot',
    template:`
    <div style="height:100%" id="plot-container"></div>
    `
})
export class D3BinEstimatorPlot implements OnInit, OnDestroy{
    private bins: Bin[];
    private locus: Locus;
    private annotations: ChannelAnnotation[];
    
    private canvasConfig: CanvasConfig;
    private canvas: D3Canvas;
    private bars: Bar[];
    private circles: Circle[];
    private max_peak;
    
    @Output() binSelected = new EventEmitter();
    
    constructor(
        private _elementRef: ElementRef
    ){}
    
    findRange() {
        this.max_peak = 0;
        this.annotations.forEach((annotation) => {
            annotation.annotated_peaks.forEach((peak) => {
                if(peak['peak_height'] > this.max_peak) {
                    this.max_peak = peak['peak_height'];
                }
            })
        })
    }
    
    createBars() {
        this.bars = []
        if(this.bins) {
            this.bins.forEach((bin) => {
            let bar = {
                color: '#4292D1',
                opacity: .6,
                center: bin.base_size,
                half_width: bin.bin_buffer,
                height: 1
            }
            console.log(bar);
            
            this.bars.push(bar);
        })
        }
    }
    
    createCircles(){
        this.circles = [];
        this.annotations.forEach((annotation) => {
            annotation.annotated_peaks.forEach((peak) => {
                let circle = {
                    center: <[number, number]> [peak['peak_size'], peak['relative_peak_height']],
                    radius: 2,
                    color: 'red',
                    opacity: 1
                }
                this.circles.push(circle);
            })
        })
    }
    
    ngOnInit(){
        this.findRange();
        this.createBars();
        this.createCircles();
        this.render();
    }
    
    render() {
        this.canvasConfig = {
            container: d3.select(this._elementRef.nativeElement).select("#plot-container"),
            backgroundColor: '#252830',
            domain: [this.locus.min_base_length, this.locus.max_base_length],
            range: [-.1, 1.1]
        }
        this.canvas = new D3Canvas(this.canvasConfig);
        console.log(this.bars);
        
        this.canvas.addBars(this.bars);
        this.canvas.addCircles(this.circles);
    }
    
    ngOnChanges() {
        
        this.ngOnInit();
        
    }
    
    ngOnDestroy(){
        
    }
}