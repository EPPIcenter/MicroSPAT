import { Component, OnInit } from '@angular/core';
import { SectionHeaderComponent } from '../layout/section-header.component';
import { ProgressBarComponent } from '../layout/progress-bar.component';

import { CapitalizePipe } from '../../pipes/capitalize.pipe';

import { Control } from '../../services/control/control.model';
import { ControlService } from '../../services/control/control.service';

import { }
// import { CotnrolDetailComponent }

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
                <div (click)="clearControl($event)" class="panel-body">
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
                                <tr (click)="selectControl(control, $event)" *ngFor="let control of controls" [ngClass]="{'success': selectedControl?.id == control.id}">
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
                                        <input type="text" class="form-control" required>
                                    </div>
                                </div>
                                <div class="col-sm-6">
                                    <div class="form-group">
                                        <label>Bin Estimator</label>
                                        <select required class="form-control">
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-sm-12">
                    <div class="panel panel-default">
                        <div class="panel-heading">
                            <h3 class="panel-title">Allele Calls</h3>
                        </div>
                        <div class="panel-body">
                            <div *ngFor="let plot of plots" class="col-sm-3">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `,
    pipes: [CapitalizePipe],
    directives: [SectionHeaderComponent, ProgressBarComponent]
})
export class ControlListComponent implements OnInit {
    private controls: Control[];
    private selectedControl: Control;
    private loadingControls: boolean = false;
    private plots: any[];

    constructor(private _controlService: ControlService) {

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

    selectControl(control, event: Event) {
        event.stopPropagation();
        this.selectedControl = control;  
    }

    clearControl(event) {
        this.selectedControl = null;
    }


    setBinEstimator(id) {

    }

    ngOnInit() {
        this.getControls();
    }
}