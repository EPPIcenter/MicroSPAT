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

import { Observable }       from 'rxjs/Observable';

import { Component, OnInit } from '@angular/core';
import { SectionHeaderComponent } from '../layout/section-header.component';
import { ProgressBarComponent } from '../layout/progress-bar.component';

import { CapitalizePipe } from '../../pipes/capitalize.pipe';

import { Ladder } from '../../services/ladder/ladder.model';
import { LadderService } from '../../services/ladder/ladder.service';


@Component({
    selector: 'pm-ladder-list',
    template: `
    <br>
    <div class="row main-container">
        <div class="col-sm-5">
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title">Ladders</h3>
                </div>
                <div class="panel-body">
                    <div *ngIf="loadingLadders">
                        <pm-progress-bar [label]="'Ladders'"></pm-progress-bar>
                    </div>
                    <div *ngIf="!loadingLadders">
                        <div class="table-responsive list-panel">
                            <span class="label label-danger">{{ladderListError}}</span>
                            <table class="table table-striped table-hover table-condensed">
                                <thead>
                                    <tr>
                                        <th (click)="sortingParam='label'; reversed=!reversed; sortLadders()">Label</th>
                                        <th (click)="sortingParam='color'; reversed=!reversed; sortLadders()">Color</th>
                                        <th>Bases</th>
                                        <th (click)="sortingParam='sq_limit'; reversed=!reversed; sortLadders()">SQ Limit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr *ngFor="let ladder of ladders" (click)="selectLadder(ladder)" [ngClass]="{warning: ladder.isDirty}">
                                        <td>{{ladder.label}}</td>
                                        <td>{{ladder.color | capitalize}}</td>
                                        <td>{{ladder.base_sizes.join(", ")}}</td>
                                        <td>{{ladder.sq_limit}}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-sm-7">
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 *ngIf="!newLadder.id" class="panel-title">New Ladder</h3>
                    <h3 *ngIf="newLadder.id" class="panel-title">Edit Ladder: {{newLadder.label}}</h3>
                </div>
                <div class="panel-body">
                    <form>
                        <div class="col-sm-6">
                            <div class="form-group">
                                <label>Label</label>
                                <input type="text" class="form-control" required [(ngModel)]="newLadder.label" (change)="onChanged()">
                            </div>
                            <div class="form-group">
                                <label>Bases (Comma Separated)</label>
                                <input type="text" class="form-control" required [(ngModel)]="baseSizesString" (change)="onChanged()">
                            </div>
                            <div class="form-group">
                                <label>SQ Flagging Limit</label>
                                <input type="number" class="form-control" required [(ngModel)]="newLadder.sq_limit" (change)="onChanged()">
                            </div>
                            <div class="form-group">
                                <label>SQ Unusable Limit</label>
                                <input type="number" class="form-control" required [(ngModel)]="newLadder.unusable_sq_limit" (change)="onChanged()">
                            </div>
                            <div class="form-group">
                                <label>Base Size Precision</label>
                                <input type="number" class="form-control" required [(ngModel)]="newLadder.base_size_precision" (change)="onChanged()">
                            </div>
                            <div class="form-group">
                                <label>Index Overlap</label>
                                <input type="number" class="form-control" required [(ngModel)]="newLadder.index_overlap" (change)="onChanged()">
                            </div>
                            <div class="form-group">
                                <label>Min. Run Time</label>
                                <input type="number" class="form-control" required [(ngModel)]="newLadder.min_time" (change)="onChanged()">
                            </div>
                             <div class="form-group">
                                <label>Max. Peak Height</label>
                                <input type="number" class="form-control" required [(ngModel)]="newLadder.max_peak_height" (change)="onChanged()">
                            </div>
                            <div class="form-group">
                                <label>Min. Peak Height</label>
                                <input type="number" class="form-control" required [(ngModel)]="newLadder.min_peak_height" (change)="onChanged()">
                            </div>
                            <div class="form-group">
                                <label>Outlier Limit</label>
                                <input type="number" class="form-control" required [(ngModel)]="newLadder.outlier_limit" (change)="onChanged()">
                            </div>
                            <button class="btn btn-default" (click)="saveLadder()" [ngClass]="{disabled: isSubmitting}">Save</button>
                            <button class="btn btn-default" (click)="resetLadder()" [ngClass]="{disabled: !newLadder.id}">Clear Ladder</button>

                        </div>
                        <div class="col-sm-6">
                            <div class="form-group">
                                <label>Maximum Missing Peak Count</label>
                                <input type="number" class="form-control" required [(ngModel)]="newLadder.maximum_missing_peak_count" (change)="onChanged()">
                            </div>
                            <div class="form-group">
                                <div class="checkbox">
                                    <label> <input type="checkbox" [(ngModel)]="newLadder.remove_outliers" (change)="onChanged()">  <span class="h6"> Remove Outliers </span> </label>
                                </div>
                                <div class="checkbox">
                                    <label> <input type="checkbox" [(ngModel)]="newLadder.allow_bleedthrough" (change)="onChanged()"> <span class="h6"> Allow Bleedthrough </span> </label>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Color</label>
                                <select [(ngModel)]="newLadder.color" required class="form-control">
                                    <option value="red">Red</option>
                                    <option value="green">Green</option>
                                    <option value="blue">Blue</option>
                                    <option value="yellow">Yellow</option>
                                    <option value="orange">Orange</option>
                                </select>
                            </div>
                            <h4>Scanning Parameters</h4>
                            <div class="form-group">
                                <label>Maxima Window</label>
                                <input type="number" class="form-control" required [(ngModel)]="newLadder.maxima_window" (change)="onChanged()">
                            </div>
                            <div class="form-group">
                                <label>Scanning Method</label>
                                <select [(ngModel)]="newLadder.scanning_method" class="form-control">
                                    <option value="relmax">Relative Maximum</option>
                                    <option value="cwt">Continuous Wavelet Transform</option>
                                </select>
                            </div>
                            <div *ngIf="newLadder.scanning_method == 'cwt'">
                                <div class="form-group">
                                    <label>CWT Min Width</label>
                                    <input class="form-control input-sm" type="number" required step="1" min="0" [(ngModel)]="newLadder.cwt_min_width" (change)="onChanged()">
                                </div>
                                <div class="form-group">
                                    <label>CWT Max Width</label>
                                    <input class="form-control input-sm" type="number" required step="1" min="0" [(ngModel)]="newLadder.cwt_max_width" (change)="onChanged()">
                                </div>
                                <div class="form-group">
                                    <label>Min Signal to Noise Ratio</label>
                                    <input class="form-control input-sm" type="number" required step="any" min="0" [(ngModel)]="newLadder.min_snr" (change)="onChanged()">
                                </div>
                                <div class="form-group">
                                    <label>Noise Percentile</label>
                                    <input class="form-control input-sm" type="number" required step="any" min="0" [(ngModel)]="newLadder.noise_perc" (change)="onChanged()">
                                </div>
                                <div class="form-group">
                                    <label>Gap Threshold</label>
                                    <input class="form-control input-sm" type="number" required step="1" min="0" [(ngModel)]="newLadder.gap_threshold" (change)="onChanged()">
                                </div>
                            </div>
                            <div *ngIf="newLadder.scanning_method == 'relmax'">
                                <div class="form-group">
                                    <label>Relative Maximum Window</label>
                                    <input class="form-control input-sm" type="number" required step="1" min="0" [(ngModel)]="newLadder.argrelmax_window" (change)="onChanged()">
                                </div>
                                <div class="form-group">
                                    <label>Smoothing Window</label>
                                    <input class="form-control input-sm" type="number" required step="1" min="0" [(ngModel)]="newLadder.trace_smoothing_window" (change)="onChanged()">
                                </div>
                                <div class="form-group">
                                    <label>Smoothing Order</label>
                                    <input class="form-control input-sm" type="number" required step="1" min="0" [(ngModel)]="newLadder.trace_smoothing_order" (change)="onChanged()">
                                </div>
                                <div class="form-group">
                                    <label>Tophat Factor</label>
                                    <input class="form-control input-sm" type="number" required step="any" min="0" [(ngModel)]="newLadder.tophat_factor" (change)="onChanged()">
                                </div>
                            </div>
                        </div>
                    </form>
                    <span class="label label-danger">{{newLadderError}}</span>
                </div>
            </div>
        </div>
    </div>
        
    `,
    pipes: [CapitalizePipe],
    directives: [SectionHeaderComponent, ProgressBarComponent]
})
export class LadderListComponent implements OnInit {
    private ladders: Ladder[];
    private constructorErrors: string[] = []
    private newLadderError: string;
    private ladderListError: string;
    private newLadder: Ladder;
    private baseSizesString: string;
    
    private reversed = false;
    private sortingParam = 'label';
    
    private isSubmitting: boolean;

    private loadingLadders = false;

    constructor(
        private _ladderService: LadderService
    ){
        this.resetLadder();
    }

    getLadders() {
        this.loadingLadders = true
        this._ladderService.getLadders().subscribe(
            ladders => {
                this.loadingLadders = false;
                this.ladders = ladders;
                this.sortLadders();
            },
            err => this.constructorErrors.push(err)
        )
    }

    resetLadder() {
        this.baseSizesString = null;
        this.newLadder = new Ladder();
        this.newLadder.sq_limit = 1;
        this.newLadder.unusable_sq_limit = 10;
        this.newLadder.base_size_precision = 2;
        this.newLadder.index_overlap = 15;
        this.newLadder.min_time = 1200;
        this.newLadder.max_peak_height = 12000;
        this.newLadder.min_peak_height = 200;
        this.newLadder.outlier_limit = 3;
        this.newLadder.maximum_missing_peak_count = 5;
        this.newLadder.allow_bleedthrough = true;
        this.newLadder.remove_outliers = true;
        this.newLadder.scanning_method = 'relmax';
        this.newLadder.maxima_window = 10;
        this.newLadder.argrelmax_window = 6;
        this.newLadder.trace_smoothing_window = 11;
        this.newLadder.trace_smoothing_order = 7;
        this.newLadder.tophat_factor = .005;
        this.newLadder.cwt_min_width = 4;
        this.newLadder.cwt_max_width = 15;
        this.newLadder.min_snr = 3;
        this.newLadder.noise_perc = 13;
    }

    sortLadders() {
        if(this.reversed) {
            this.ladders.sort((a, b) => {
                if(a[this.sortingParam] > b[this.sortingParam]) {
                    return 1;
                } else if(a[this.sortingParam] < b[this.sortingParam]){
                    return -1;
                } else {
                    return 0;
                }
            })
        } else {
            this.ladders.sort((a, b) => {
                if(a[this.sortingParam] > b[this.sortingParam]) {
                    return -1;
                } else if(a[this.sortingParam] < b[this.sortingParam]){
                    return 1;
                } else {
                    return 0;
                }
            })
        }
        
    }

    removeLadder(id) {
    }

    selectLadder(ladder: Ladder) {
        this.baseSizesString = ladder.base_sizes.join(", ");
        this.newLadder = ladder;
    }

    parseBaseSizeString(baseSizeString) {
        let baseSizes = [];
        baseSizes = baseSizeString.replace(/[^\d,-]/g, '').split(",").map(Number);
        return baseSizes
    }


    saveLadder() {
        if(!this.isSubmitting) {
            this.isSubmitting = true;
            this.newLadder.base_sizes = this.parseBaseSizeString(this.baseSizesString);
            let method: (ladder: Ladder) => Observable<Ladder>;
            
            if(!this.newLadder.id) {
                method = this._ladderService.createLadder;  
            } else {
                method = this._ladderService.updateLadder;
            }
            
            method(this.newLadder).subscribe(
                    ladder => {
                        this.getLadders();
                        this.resetLadder();
                    },
                    err => {
                        this.newLadderError = err;
                    },
                    () => {
                        this.isSubmitting = false;
                    }
                );
        }
    }

    onChanged() {
        if(!this.newLadder.isDirty) {
            this.newLadder.isDirty = true;
        }
    }

    ngOnInit() {
        this.getLadders();
    }
}