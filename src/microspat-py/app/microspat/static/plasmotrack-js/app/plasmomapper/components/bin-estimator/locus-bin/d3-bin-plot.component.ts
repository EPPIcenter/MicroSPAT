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

import { Component, Output, ElementRef, OnInit, EventEmitter, OnDestroy } from '@angular/core';

import { Bin } from '../../../services/bin-estimator-project/locus-bin-set/bin/bin.model';
import { Locus } from '../../../services/locus/locus.model';
import { ChannelAnnotation } from '../../../services/project/channel-annotation/channel-annotation.model';

import { BinEstimatorProject } from '../../../services/bin-estimator-project/bin-estimator-project.model';
import { BinEstimatorProjectService } from '../../../services/bin-estimator-project/bin-estimator-project.service';

import { D3Canvas } from '../../d3/canvas';
import { CanvasConfig } from '../../d3/canvas-config.model';
import { Bar } from '../../d3/bar.model';
import { Circle } from '../../d3/circle.model';

import * as d3 from 'd3';

@Component({
    inputs: ['project','bins', 'locus', 'annotations', 'clickBin', 'selectedBin'],
    selector: 'pm-d3-bin-estimator-locus-plot',
    template:`
    <div class="panel panel-default">
        <div class="panel-heading">
            <div class="h3 panel-title">
                <span *ngIf="locus">{{locus.label}} Bins</span>
            </div>
        </div>
        <div class="panel-body">
            <div style="height:35vh" id="plot-container"></div>
            <br>
            <div>
                <div *ngIf="selectedBin" class="col-sm-6">
                    <form>
                        <span *ngIf="selectedBin.isDirty" class="label label-primary">Edited</span>
                        <div class="form-group">
                            <label>Label</label>
                            <input class="form-control input-sm" [(ngModel)]="selectedBin.label">
                        </div>
                        <div class="form-group">
                            <label>Bin Center</label>
                            <input class="form-control input-sm" required step=".05" min="0" type="number" (change)="createBars(); render()" [(ngModel)]="selectedBin.base_size">
                        </div>
                        <div class="form-group">
                            <label>Bin Buffer</label>
                            <input class="form-control input-sm" required step=".05" min="0" type="number" (change)="createBars(); render()" [(ngModel)]="selectedBin.bin_buffer">
                        </div>
                    </form>
                    <button (click)="deleteBin()" class="btn btn-default">Delete Bin</button>
                </div>
                <div class="col-sm-6 pull-right">
                    <button (click)="saveChanges()" class="btn btn-default">Save All Changes</button>
                    <button (click)="undoChanges()" class="btn btn-default">Undo All Changes</button>
                </div>
            </div>
        </div>    
    </div>
    `
})
export class D3BinEstimatorPlot implements OnInit, OnDestroy{
    private __bins: Bin[] = [];
    private bins: Bin[];
    private locus: Locus;
    private annotations: ChannelAnnotation[];
    private project: BinEstimatorProject;
    
    private canvasConfig: CanvasConfig;
    private canvas: D3Canvas;
    private bars: Bar[];
    private circles: Circle[];
    private max_peak;

    public selectedBin: Bin;
    
    @Output() 
    binsSaved = new EventEmitter();
    
    constructor(
        private _elementRef: ElementRef,
        private _binEstimatorProjectService: BinEstimatorProjectService
    ){}
    
    private findRange() {
        this.max_peak = 0;
        this.annotations.forEach((annotation) => {
            annotation.annotated_peaks.forEach((peak) => {
                if(peak['peak_height'] > this.max_peak) {
                    this.max_peak = peak['peak_height'];
                }
            })
        })
    }
    
    private createBars() {
        this.bars = []
        if(this.bins) {
            this.bins.forEach((bin) => {
                let bar = {
                    color: '#4292D1',
                    opacity: .6,
                    center: bin.base_size,
                    half_width: bin.bin_buffer,
                    height: 1,
                    id: bin._global_id
                }
                if(this.selectedBin && this.selectedBin._global_id === bin._global_id) {
                    bar.color = "#C96310";
                }
                
                this.bars.push(bar);
            })
        }
    }
    
    private createCircles(){
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
        this.bins.forEach((b) => {
            this.__bins.push(b);
        })
    }
    
    private render() {
        if(this.locus) {
            this.canvasConfig = {
                container: d3.select(this._elementRef.nativeElement).select("#plot-container"),
                backgroundColor: '#252830',
                domain: [this.locus.min_base_length, this.locus.max_base_length],
                range: [-.1, 1.1],
                contextMenu: [
                    {
                        title: "Add Bin",
                        action: (x, y) => {
                            this.addBin(x);
                        }
                    }
                ]
            }
            this.canvas = new D3Canvas(this.canvasConfig);            
            this.canvas.addBars(this.bars, (bar) => {
                this.selectBin(bar.id);
                this.createBars();
                this.render();
            });
            this.canvas.addCircles(this.circles);
        }
    }

    private selectBin(id: Number) {
        this.selectedBin = this.bins.filter((bin) => {
            return bin._global_id === id;
        })[0];
    }

    private addBin(bin_center: number) {
        bin_center = +bin_center.toFixed(2);
        let bin = new Bin();
        bin.copyFromObj({
            base_size: bin_center,
            label: Math.round(bin_center).toString(),
            bin_buffer: .75,
            id: undefined
        })
        bin.isDirty = true;
        this.bins.push(bin);
        this.selectedBin
        this.createBars();
        this.render();
    }

    private deleteBin() {
        this.bins = this.bins.filter((b) => {
            return this.selectedBin._global_id !== b._global_id;
        })
        this.selectedBin = null;
        this.createBars();
        this.render();
    }

    private undoChanges() {
        this.bins = [];
        this.__bins.forEach((bin) => {
            if(bin.id > 0) {
                bin.restore();
                this.bins.push(bin);
            }
        })
        
        if(!(this.selectedBin.id > 0)) {
            this.selectedBin = null;
        }
        
        this.createBars();
        this.render();
    }

    private saveChanges() {
        this.binsSaved.emit(this.bins);
    }
    
    ngOnChanges(changes) {
        this.findRange();
        this.createBars();
        this.createCircles();
        if(this.bins.length > 0){
            this.selectBin(this.bins.reduce((prev, curr) => {
                if(prev.base_size < curr.base_size) {
                    return prev;
                } else {
                    return curr;
                }
            })._global_id);
        }
        
        if(changes['bins']) {
            this.__bins = [];
            this.selectedBin = null;
            this.bins.forEach((b) => {
                this.__bins.push(b);
            })
        }
        
        this.render();        

    }
    
    ngOnDestroy(){
        
    }
}