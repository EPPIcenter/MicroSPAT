import { Component, OnChanges, SimpleChange, DoCheck, Input, OnInit, Output, EventEmitter } from 'angular2/core';
import { FORM_DIRECTIVES } from 'angular2/common';
import { LocusParameters } from '../../services/project/locus-parameters/locus-parameters.model';

@Component({
    selector: 'pm-common-locus-parameter-detail',

    inputs: ['locusParameter'],
    directives: [FORM_DIRECTIVES],
    styleUrls:['app/plasmomapper/styles/forms.css'],
    template: `
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
                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="locusParameter.cwt_min_width">
                </div>
                <div class="form-group">
                    <label>CWT Max Width</label>
                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="locusParameter.cwt_max_width">
                </div>
                <div class="form-group">
                    <label>Min Signal to Noise Ratio</label>
                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" [(ngModel)]="locusParameter.min_snr">
                </div>
                <div class="form-group">
                    <label>Noise Percentile</label>
                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" [(ngModel)]="locusParameter.noise_perc">
                </div>
            </div>
            <div *ngIf="locusParameter.scanning_method == 'relmax'">
                <div class="form-group">
                    <label>Relative Maximum Window</label>
                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="locusParameter.argrelmax_window">
                </div>
                <div class="form-group">
                    <label>Smoothing Window</label>
                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="locusParameter.trace_smoothing_window">
                </div>
                <div class="form-group">
                    <label>Smoothing Order</label>
                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="locusParameter.trace_smoothing_order">
                </div>
                <div class="form-group">
                    <label>Tophat Factor</label>
                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" [(ngModel)]="locusParameter.tophat_factor">
                </div>
                <div class="form-group">
                    <label>Maxima Window</label>
                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="locusParameter.maxima_window">
                </div>
            </div>
        </div>
        <div class="col-sm-6">
            <h4>Filter Parameters</h4>
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
        </div> 
    `
})
export class CommonLocusParametersDetailComponent {
    public locusParameter: LocusParameters;

    // public saveResolved = false;
    
    // @Output() saveClicked = new EventEmitter();
     
    // @Output() locusParamsSaved = new EventEmitter();
    
    constructor(
    ){
        console.log("Creating Detail Component");
    }
    
    onChanged(e) {
        this.locusParameter.isDirty = true
    }
    
    // onSubmit(id: number) {
    //     this.saveClicked.emit(id);
    // }
            
    // ngOnChanges(changes: {[param: string]: SimpleChange}) {

    // }
    
}