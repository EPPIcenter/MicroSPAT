import { Component, OnInit } from 'angular2/core';
import { Router } from 'angular2/router';

import { SectionHeaderComponent } from '../layout/section-header.component'

import { Plate } from '../../services/plate/plate.model';
import { PlateService } from '../../services/plate/plate.service';

import { Ladder } from '../../services/ladder/ladder.model';
import { LadderService } from '../../services/ladder/ladder.service';

import { PlateDetailComponent } from './d3-plate-detail.component';

@Component({
    selector: 'pm-plate-list',
    template: `
    <pm-section-header [header]="'Plates'"></pm-section-header>
    <div class="row main-container">
        <div class="col-sm-5">
            <div class="row">
                <div class="col-sm-12">
                    <div class="panel panel-default">
                        <div (click)="showNewPlate = !showNewPlate" class="panel-heading">
                            <h3 class="panel-title">New Plate
                            <span *ngIf="!showNewPlate" class="glyphicon glyphicon-menu-right pull-right"></span>
                            <span *ngIf="showNewPlate" class="glyphicon glyphicon-menu-down pull-right"></span>
                            </h3>
                        </div>
                        <div *ngIf="showNewPlate" class="panel-body">
                            <form>
                                <div class="form-group">
                                    <input type="file" (change)="fileChangeEvent($event)" placeholder="Upload file..." multiple />
                                </div>
                                <div class="form-group">
                                    <label>Ladder</label>
                                    <select required [(ngModel)]="ladder_id" class="form-control">
                                        <option *ngFor="#ladder of ladders" value={{ladder.id}}>{{ladder.label}}</option>
                                    </select>
                                </div>
                                <button class="btn btn-primary" type="button" (click)="upload()">Upload</button>
                            </form>
                            <span *ngIf="uploading" class="label label-info">Uploading Files...</span>
                            <span *ngIf="uploadComplete" class="label label-success">Upload Successful</span>
                            <span class="label label-danger">{{newPlateError}}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="row table-responsive list-panel">
                <div class="col-sm-12">
                    <div class="panel panel-default">
                        <div class="panel-body">
                            <table class="table table-striped table-hover table-condensed">
                                <thead>
                                    <tr>
                                        <th (click)="sortingParam='label'; reversed=!reversed; sortPlates()">Label</th>
                                        <th (click)="sortingParam='date_processed'; reversed=!reversed; sortPlates()">Date Processed</th>
                                        <th (click)="sortingParam='date_run'; reversed=!reversed; sortPlates()">Date Run</th>
                                        <th (click)="sortingParam='ce_machine'; reversed=!reversed; sortPlates()">CE Machine</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr [ngClass]="{success: plate.id==selectedPlate?.id}" *ngFor="#plate of plates" (click)="selectPlate(plate.id)">
                                        <td>{{plate.label}}</td>
                                        <td>{{plate.date_processed | date: "shortDate"}}</td>
                                        <td>{{plate.date_run | date: "shortDate"}}</td>
                                        <td>{{plate.ce_machine}}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-sm-7">
            <div class="row">
                <div *ngIf="selectedPlate">
                    <pm-d3-plate-detail [plate]="selectedPlate"></pm-d3-plate-detail>
                </div>  
            </div>            
        </div>
    </div>
    `,
    directives: [SectionHeaderComponent, PlateDetailComponent]
})
export class PlateListComponent implements OnInit {
    public plates: Plate[] = [];
    public ladders: Ladder[] = [];
    public errorMessages: string[] = [];
    public newPlateError: string;
    public filesToUpload: File[] = [];
    public ladder_id: number;
    public selectedPlate: Plate;
    
    private reversed = false;
    private sortingParam = 'label';
    private showNewPlate = true;
    private showSelectedPlate = true;

    private uploading = false;
    private uploadComplete = false;
    
     
    constructor(
        private _plateService: PlateService,
        private _router: Router,
        private _ladderService: LadderService
    ) {}
    
    getPlates() {
        console.log("Getting Plates");
        this._plateService.getPlates()
            .subscribe(
                plates => {
                    this.plates = plates;
                    this.sortPlates();
                },
                error => this.errorMessages.push(error)
            )
    }
    
    sortPlates() {
        this.plates.sort((a, b) => {
            if(a[this.sortingParam] < b[this.sortingParam]) {
                return 1
            } else if (a[this.sortingParam] > b[this.sortingParam]) {
                return -1
            } else {
                return 0
            }
        })
        if(this.reversed) {
            this.plates.reverse();
        }
    }
    
    getLadders() {
        this._ladderService.getLadders()
            .subscribe(
                ladders => this.ladders = ladders,
                error => this.errorMessages.push(error)
            )
    }
    
    selectPlate(id: number) {
        this.showNewPlate = false;
        this._plateService.getPlate(id).subscribe(
            plate => this.selectedPlate = plate,
            err => this.errorMessages.push(err)
        )
    }
    
    fileChangeEvent(fileInput: any){
        this.filesToUpload = <Array<File>> fileInput.target.files;
    }
    
    upload() {
        this.newPlateError = null;
        this.uploading = true;
        this.uploadComplete = false
        console.log(this.filesToUpload);
        console.log(this.ladder_id);
        this._plateService.postPlates(this.filesToUpload, {'ladder_id': this.ladder_id}).subscribe(
            plates => {
                console.log(plates);
                this.selectedPlate = plates[0];
            }, 
            error => {
                this.newPlateError = error
                this.uploading = false;
            },
            () => {
                this.getPlates();
                this.uploading = false;
                this.uploadComplete = true;
            }
        )
    }
    
    ngOnInit() {
        this.getPlates();
        this.getLadders();
    }
}