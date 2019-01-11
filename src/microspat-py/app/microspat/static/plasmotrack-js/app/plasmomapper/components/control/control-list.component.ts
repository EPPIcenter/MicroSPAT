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

import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { SectionHeaderComponent } from '../layout/section-header.component';
import { ProgressBarComponent } from '../layout/progress-bar.component';

import { CapitalizePipe } from '../../pipes/capitalize.pipe';
import { LocusPipe } from '../../pipes/locus.pipe';

import { Control } from '../../services/control/control.model';
import { ControlService } from '../../services/control/control.service';

import { BinEstimatorProject } from '../../services/bin-estimator-project/bin-estimator-project.model';
import { BinEstimatorProjectService } from '../../services/bin-estimator-project/bin-estimator-project.service';

import { LocusBinSet } from '../../services/bin-estimator-project/locus-bin-set/locus-bin-set.model';

@Component({
    selector: 'pm-control-list',
    template: `
    <br>
    <div class="row main-container">
        <div class="col-sm-3">
            <div class=" panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title">Controls</h3>
                </div>
                <div (click)="clearControl()" class="panel-body">
                    <div *ngIf="loadingControls">
                        <pm-progress-bar [label]="'Controls'"></pm-progress-bar>
                    </div>
                    <div *ngIf="!loadingControls" class="table-responsive list-panel">
                        <table class="table table-striped table-hover table-condensed">
                            <thead>
                                <tr>
                                    <th>Barcode</th>
                                    <th>Bin Estimator</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr (click)="selectControl(control, $event)" *ngFor="let control of controls" [ngClass]="{'success': selectedControl?.id == control.id, 'warning': control.isDirty && selectedControl?.id !== control.id}">
                                    <td>{{control.barcode}}</td>
                                    <td>{{control.bin_estimator.title}}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-sm-9">
            <div class="row">
                <div class="col-sm-12">
                    <div class="panel panel-default">
                        <div class="panel-heading">
                            <h3 *ngIf="!selectedControl?.id" class="panel-title">New Control</h3>
                            <h3 *ngIf="selectedControl?.id" class="panel-title">Edit Control</h3>
                        </div>
                        <div class="panel-body">
                            <div class="row">
                                <div class="col-sm-6">
                                    <div class="form-group">
                                        <label>Barcode</label>
                                        <input type="text" class="form-control" required [(ngModel)]="selectedControl.barcode">
                                    </div>
                                </div>
                                <div class="col-sm-6">
                                    <div class="form-group">
                                        <label>Bin Estimator</label>
                                        <select required class="form-control" [(ngModel)]="selectedControl.bin_estimator_id" (change)="changeSelectedBinEstimator($event.target.value)">
                                            <option *ngFor="let be of binEstimators" value={{be.id}}>{{be.title}}</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div *ngIf="selectedBinEstimator" class="col-sm-12">
                    <div class="panel panel-default">
                        <div class="panel-heading">
                            <h3 class="panel-title">Allele Calls</h3>
                        </div>
                        <div class="panel-body">
                            <div class="row">
                                <div *ngFor="let lbs of locusBinSets" class="col-sm-2">
                                    <div class="form-group">
                                        <label>{{lbs.locus_id | locus | async}}</label>
                                        <select class="form-control" [(ngModel)]="selectedControl.alleles[lbs.locus_id]" (change)="setAllele(lbs.locus_id, $event.target.value)">
                                            <option value=null>Unknown</option>
                                            <option *ngFor="let b of lbs.bins" [value]="b.id">{{b.label}}</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div class="row">
                                <div class="btn-group col-sm-6">
                                    <button class="btn btn-default" (click)="saveControl()">Save Control</button>
                                    <button class="btn btn-default" [ngClass]="{'disabled': !selectedControl?.id}" (click)="deleteControl()">Delete Control</button>
                                </div>
                            </div>
                            <div class="row">
                                <div class="col-sm-6 col-sm-offset-3">
                                    <div *ngIf="savingControl">
                                        <pm-progress-bar [fullLabel]="'Saving Control...'"></pm-progress-bar>
                                    </div>
                                    <div *ngIf="deletingControl">
                                        <pm-progress-bar [fullLabel]="'Deleting Control...'"></pm-progress-bar>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `,
    pipes: [CapitalizePipe, LocusPipe],
    directives: [SectionHeaderComponent, ProgressBarComponent]
})
export class ControlListComponent implements OnInit {
    private controls: Control[];
    private selectedControl: Control;
    private loadingControls: boolean = false;
    private savingControl: boolean = false;
    private deletingControl: boolean = false;

    private selectedBinEstimator: BinEstimatorProject;
    private binEstimators: BinEstimatorProject[];
    
    private locusBinSets = [];
    private loadingBinEstimator: boolean = false;

    constructor(private _controlService: ControlService, private _binEstimatorService: BinEstimatorProjectService) {
        this.selectedControl = new Control();
        this.selectedControl.alleles = {};
    }

    getControls() {
        this.loadingControls = true;
        this._controlService.getControls().subscribe(
            controls => {
                this.controls = controls;
            },
            err => toastr.error(err),
            () => {
                this.loadingControls = false;
            }
        )
    }

    getBinEstimators() {
        this._binEstimatorService.getBinEstimatorProjects().subscribe(
            (be) => this.binEstimators = be,
            err => toastr.error(err) 
        )
    }

    changeSelectedBinEstimator(id) {
        this.setBinEstimator(id);
    }

    selectControl(control: Control, event: Event) {
        event.stopPropagation();
        this.selectedControl = control;
        this.setBinEstimator(control.bin_estimator_id);
    }

    clearControl() {
        this.selectedControl = new Control();
        this.selectedControl.alleles = {};
        this.locusBinSets = [];
        this.selectedBinEstimator = null;
    }

    setAllele(locus_id, bin_id) {
        this.selectedControl.alleles[locus_id] = bin_id;
        this.selectedControl.isDirty = true;
    }


    setBinEstimator(id) {
        if(!this.loadingBinEstimator) {
            this.loadingBinEstimator = true;
            this._binEstimatorService.getBinEstimatorProject(id).subscribe(
                (be) => {
                    this.locusBinSets = [];
                    this.selectedBinEstimator = be;
                    if(this.selectedControl.bin_estimator_id !== this.selectedBinEstimator.id) {
                        this.selectedControl.isDirty = true;
                        this.selectedControl.alleles = {};
                        this.selectedControl.bin_estimator_id = this.selectedBinEstimator.id;
                        this.selectedBinEstimator.locus_bin_sets.forEach(
                            (lbs, i) => {
                                this.selectedControl.alleles[lbs.locus_id] = null;
                            }
                        )
                    }

                    this.selectedBinEstimator.locus_bin_sets.forEach(
                        (lbs, i) => {
                            let locus_bin_set = {
                                locus_id: lbs.locus_id,
                                bins: []
                            };

                            lbs.bins.forEach(
                                (b, j) => {
                                    locus_bin_set.bins.push({
                                        id: b.id,
                                        label: b.label,
                                        size: b.base_size
                                    })
                                }
                            )

                            locus_bin_set.bins.sort((a,b) => {
                                return a.size > b.size ? 1 : -1;
                            })
                            
                            this.locusBinSets.push(locus_bin_set);
                        }
                    )
                },
                err => toastr.error(err),
                () => this.loadingBinEstimator = false
            )
        }
    }

    saveControl() {
        if(!this.savingControl && !this.deletingControl) {
            this.savingControl = true;
            
            let m: Function;
            
            if(this.selectedControl.id) {
                m = this._controlService.updateControl;
            } else {
                m = this._controlService.createControl;
            }

            m(this.selectedControl).subscribe(
                (ctrl) => {
                    this.getControls();
                    this.selectedControl = ctrl;
                    toastr.success("Saved " + ctrl.barcode);
                },
                (err) => toastr.error(err),
                () => this.savingControl = false
            );
        }   
    }

    deleteControl() {
        if(!this.savingControl && this.selectedControl.id && !this.deletingControl) {
            this.deletingControl = true;
            
            this._controlService.deleteControl(this.selectedControl.id).subscribe(
                () => {
                    toastr.success("Deleted " + this.selectedControl.barcode)
                    this.getControls();
                    this.clearControl();
                },
                err => toastr.error(err),
                () => this.deletingControl = false
            )
        }
    }

    ngOnInit() {
        this.getControls();
        this.getBinEstimators();
    }
}