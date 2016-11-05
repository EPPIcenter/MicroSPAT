import { Component, OnChanges, SimpleChange, DoCheck, Input, OnInit, Output, EventEmitter } from '@angular/core';
import { FORM_DIRECTIVES } from '@angular/common';
import { LocusParameters } from '../../services/project/locus-parameters/locus-parameters.model';
import { LocusPipe } from '../../pipes/locus.pipe';
import { SectionHeaderComponent } from '../layout/section-header.component';

import { ProjectService } from '../../services/project/project.service';

@Component({
    selector: 'pm-locus-parameter-detail',
    pipes: [LocusPipe],
    inputs: ['locusParameter', 'saveResolved'],
    directives: [FORM_DIRECTIVES],
    styleUrls:['app/plasmomapper/styles/forms.css'],
    template: `
    <div class="panel panel-default">
        <div class="panel-heading">
            <h3 class="panel-title">{{locusParameter.locus_id | locus | async}} Parameters</h3>
        </div>
        <div class="panel-body">
            <form (ngSubmit)="onSubmit(locusParameter.locus_id)">
                <div class="col-sm-6">
                    <h4>Scanning Parameters</h4>
                    <div class="form-group">
                        <label>Scanning Method</label>
                        <select (change)="onChanged()" [(ngModel)]="locusParameter.scanning_method" class="form-control">
                            <option value="cwt">Continuous Wavelet Transform</option>
                            <option value="relmax">Relative Maximum</option>
                        </select>
                    </div>
                    <div *ngIf="locusParameter.scanning_method == 'cwt'">
                        <div class="form-group">
                            <label>CWT Min Width</label>
                            <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="locusParameter.cwt_min_width" ngControl="cwt_min_width">
                        </div>
                        <div class="form-group">
                            <label>CWT Max Width</label>
                            <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="locusParameter.cwt_max_width" ngControl="cwt_max_width">
                        </div>
                        <div class="form-group">
                            <label>Min Signal to Noise Ratio</label>
                            <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" [(ngModel)]="locusParameter.min_snr" ngControl="min_snr">
                        </div>
                        <div class="form-group">
                            <label>Noise Percentile</label>
                            <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" [(ngModel)]="locusParameter.noise_perc" ngControl="noise_perc">
                        </div>
                    </div>
                    <div *ngIf="locusParameter.scanning_method == 'relmax'">
                        <div class="form-group">
                            <label>Relative Maximum Window</label>
                            <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="locusParameter.argrelmax_window" ngControl="argrelmax_window">
                        </div>
                        <div class="form-group">
                            <label>Smoothing Window</label>
                            <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="locusParameter.trace_smoothing_window" ngControl="trace_smoothing_window">
                        </div>
                        <div class="form-group">
                            <label>Smoothing Order</label>
                            <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="locusParameter.trace_smoothing_order" ngControl="trace_smoothing_order">
                        </div>
                        <div class="form-group">
                            <label>Tophat Factor</label>
                            <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" [(ngModel)]="locusParameter.tophat_factor" ngControl="tophat_factor">
                        </div>
                    </div>
                </div>
                <div class="col-sm-6">
                    <h4>Filter Parameters</h4>
                    <div class="form-group">
                        <label>Maxima Window</label>
                        <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="locusParameter.maxima_window">
                    </div>
                    <div class="form-group">
                        <label>Min Peak Height</label>
                        <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="locusParameter.min_peak_height">
                    </div>
                    <div class="form-group">
                        <label>Max Peak Height</label>
                        <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="locusParameter.max_peak_height">
                    </div>
                    <div class="form-group">
                        <label>Min Peak Height Ratio</label>
                        <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" [(ngModel)]="locusParameter.min_peak_height_ratio">
                    </div>
                    <div class="form-group">
                        <label>Max Bleedthrough Ratio</label>
                        <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" [(ngModel)]="locusParameter.max_bleedthrough">
                    </div>
                    <div class="form-group">
                        <label>Max Crosstalk Ratio</label>
                        <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" [(ngModel)]="locusParameter.max_crosstalk">
                    </div>
                    <div class="form-group">
                        <label>Min Peak Distance</label>
                        <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" [(ngModel)]="locusParameter.min_peak_distance">
                    </div>
                    <button type="submit" class="btn btn-default" [ngClass]="{disabled: !saveResolved}">Save and Analyze</button>
                    <span *ngIf="!saveResolved" class="label label-info">Saving and Analyzing Locus...This May Take A While...</span>
                </div>
            </form>
        </div>
    </div>   
    `
})
export class LocusParametersDetailComponent {
    public locusParameter: LocusParameters;

    public saveResolved = false;
    
    @Output() saveClicked = new EventEmitter();
     
    // @Output() locusParamsSaved = new EventEmitter();
    
    constructor(
        private _projectService: ProjectService
    ){}
    
    onChanged(e) {
        this.locusParameter.isDirty = true
    }
    
    onSubmit(id: number) {
        this.saveClicked.emit(id);
    }
            
    ngOnChanges(changes: {[param: string]: SimpleChange}) {

    }
    
}