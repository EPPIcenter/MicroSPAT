import { Component, Output, ElementRef, OnInit, EventEmitter, OnDestroy } from 'angular2/core';

import { LocusArtifactEstimator } from '../../../services/artifact-estimator-project/locus-artifact-estimator/locus-artifact-estimator.model';
import { ArtifactEstimator } from '../../../services/artifact-estimator-project/locus-artifact-estimator/artifact-estimator/artifact-estimator.model';
import { ArtifactEstimatorProjectService } from '../../../services/artifact-estimator-project/artifact-estimator-project.service';
import { ArtifactEquation } from '../../../services/artifact-estimator-project/locus-artifact-estimator/artifact-estimator/artifact-equation/artifact-equation.model';
import { Bin } from '../../../services/bin-estimator-project/locus-bin-set/bin/bin.model';
import { Locus } from '../../../services/locus/locus.model';
import { ChannelAnnotation } from '../../../services/project/channel-annotation/channel-annotation.model';

import { D3Canvas } from '../../d3/canvas';
import { CanvasConfig } from '../../d3/canvas-config.model';
import { Bar } from '../../d3/bar.model';
import { Circle } from '../../d3/circle.model';
import { Line } from '../../d3/line.model';

import * as d3 from 'd3';

@Component({
    inputs: ['bins', 'locus', 'artifactEstimator'],
    selector: 'pm-d3-artifact-estimator-panel',
    template: `
    <div style="height:100%" id="plot-container"></div>
    `
})
export class D3ArtifactEstimatorPanel implements OnInit, OnDestroy {
    private bins: Bin[]
    private locus: Locus;
    private artifactEstimator: ArtifactEstimator;
    
    private canvasConfig: CanvasConfig;
    private canvas: D3Canvas;
    private bars: Bar[];
    private circles: Circle[];
    private lines: Line[];
    private max_height: number
    
    constructor(
        private _elementRef: ElementRef,
        private _artifactEstimatorProjectService: ArtifactEstimatorProjectService
    ){}
    
    findRange() {
        this.max_height = 1;
    }
    
    createBars() {
        this.bars = [];
        if(this.bins) {
            this.bins.forEach(bin => {
                let bar = {
                    color: '#4292D1',
                    opacity: .6,
                    center: bin.base_size,
                    half_width: bin.bin_buffer,
                    height: this.max_height
                }
                this.bars.push(bar);
            })
        }
    }
    
    createCircles() {
        this.circles = [];
        this.artifactEstimator.peak_data.forEach(peak => {
            let circle = {
                center: <[number, number]> [peak['peak_size'], peak['relative_peak_height']],
                radius: 2,
                color: 'red',
                opacity: 1
            }
            this.circles.push(circle);
        })
    }
    
    createLines() {
        this.lines = [];
        this.artifactEstimator.artifact_equations.forEach(artifactEquation => {
            let line = {
                slope: artifactEquation.slope,
                intercept: artifactEquation.intercept,
                start: artifactEquation.start_size,
                end: artifactEquation.end_size,
                color: '#5CB85C'
            }
            let sd_line = {
                slope: artifactEquation.slope,
                intercept: artifactEquation.intercept + (artifactEquation.sd * 3),
                start: artifactEquation.start_size,
                end: artifactEquation.end_size,
                color: '#4292D1'
            }
            this.lines.push(line, sd_line);
        })
        
    }
    
    ngOnInit(){        
        this.findRange();
        this.createBars();
        this.createCircles();
        this.createLines();
        this.render();
    }
    
    render() {
        this.canvasConfig = {
            container: d3.select(this._elementRef.nativeElement).select("#plot-container"),
            backgroundColor: '#252830',
            domain: [this.locus.min_base_length, this.locus.max_base_length],
            range: [-.1, this.max_height * 1.1],
            click_handler: this.addBreakpoint.bind(this)
        }
        this.canvas = new D3Canvas(this.canvasConfig);
        this.canvas.addBars(this.bars);
        this.canvas.addCircles(this.circles);
        this.lines.forEach(line => this.canvas.addLine(line));
    }
    
    addBreakpoint(x_coord: number) {
        this._artifactEstimatorProjectService.addBreakpoint(this.artifactEstimator.id, x_coord)
            .subscribe(
                aes => {
                    this.artifactEstimator.copyFromObj(aes)
                    this.ngOnInit();
                },
                err => console.log(err)
            )
        console.log("Adding Breakpoint at ", x_coord);
    }
    
    ngOnChanges() {
        this.ngOnInit();
    }
    
    ngOnDestroy(){
        
    }
    
}