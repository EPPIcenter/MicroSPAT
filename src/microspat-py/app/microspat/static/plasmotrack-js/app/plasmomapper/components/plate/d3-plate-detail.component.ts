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

import { Component, ElementRef, OnChanges, OnInit, SimpleChange, ViewChild, Output, EventEmitter } from '@angular/core';
import { Well } from '../../services/well/well.model';
import { Plate } from '../../services/plate/plate.model';
import { Channel } from '../../services/channel/channel.model';
import { Ladder } from '../../services/ladder/ladder.model';
import { LadderService } from '../../services/ladder/ladder.service';
import { PlateService } from '../../services/plate/plate.service';
import { WellService } from '../../services/well/well.service';
import { ChannelService } from '../../services/channel/channel.service';

import { Router } from '@angular/router-deprecated';

import { ProgressBarComponent } from '../layout/progress-bar.component';

import { D3PlateLadderDetailComponent } from './d3-plate-ladder-detail.component';
import { D3LadderEditorComponent } from './d3-ladder-editor.component';
import { D3PlateChannelDetailComponent } from './d3-plate-channel-detail.component';
import { D3WellViewerComponent } from './d3-well-viewer.component';

@Component({
    inputs: ['plate'],
    selector: 'pm-d3-plate-detail',
    template: `
    <div class="panel panel-default">
        <div (click)="showSelectedPlate = !showSelectedPlate" class="panel-heading">
            <h3 class="panel-title">{{plate.label}}
            <span *ngIf="!showSelectedPlate" class="glyphicon glyphicon-menu-right pull-right"></span>
            <span *ngIf="showSelectedPlate" class="glyphicon glyphicon-menu-down pull-right"></span>
            </h3>
        </div>
        <div *ngIf="showSelectedPlate" class="panel-body">
            <div class="row" style="height: 20vh; padding-bottom: 1vh">
                <div class="col-sm-5" style="height:100%">
                    <pm-d3-plate-ladder-detail [plate]="plate" [wellSelector]="selectWell" [selectedWell]="selectedWell"></pm-d3-plate-ladder-detail>
                </div>
                <div class="col-sm-4" style="height:100%">
                    <pm-d3-plate-channel-detail [plate]="plate" [wellSelector]="selectWell"></pm-d3-plate-channel-detail>
                </div>
                <div class="col-sm-3">
                    <form>
                        <div class="form-group">
                            <input type="file" (change)="fileChangeEvent($event)" placeholder="Upload file..."/>
                        </div>
                        <div class="checkbox">
                            <label>
                                <input type="checkbox" [(ngModel)]='createSamplesIfNotExists'>
                                Create Samples If They Don't Exist
                            </label>
                        </div>
                        <a class="btn btn-primary btn-block btn-xs" [ngClass]="{disabled: recalculatingLadder || uploading}" (click)="upload()">Upload Plate Map</a>
                        <div class="btn-group" style="width:100%">
                            <button [ngClass]="{disabled: recalculatingLadder || uploading}" type="button" class="btn btn-info btn-block btn-xs dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                Recalculate Ladder <span class="glyphicon glyphicon-chevron-down pull-right"></span>
                            </button>
                            <ul class="dropdown-menu" style="width:100%">
                                <li *ngFor="let ladder of ladders"><a (click)="recalculatePlateLadder(plate.id, ladder.id)">{{ladder.label}}</a></li>
                            </ul>
                        </div>
                        <a class="btn btn-warning btn-block btn-xs" type="button" (click)="deletePlate.emit(plate.id)" [ngClass]="{disabled: uploading || recalculatingLadder}">Delete Plate</a>
                    </form>
                    <br>
                    <div *ngIf="uploading">
                        <pm-progress-bar [fullLabel]="'Uploading Plate Map...'"></pm-progress-bar>
                    </div>
                    <div *ngIf="recalculatingLadder">
                        <pm-progress-bar [fullLabel]="'Recalculating Ladder...'"></pm-progress-bar>
                    </div>
                    <span class="label label-danger">{{plateMapError}}</span>
                </div>
            </div>
            <div *ngIf="selectedWell">
                <br>
                <div class="row" style="padding-top: 1vh">
                    <pm-d3-ladder-editor (ladderRecalculated)="ladderRecalculated($event)" [well]="selectedWell"></pm-d3-ladder-editor>
                </div>
                <br>
                <div class="row" style="padding-top: 1vh">
                    <pm-d3-well-viewer [well]="selectedWell"></pm-d3-well-viewer>
                </div>
            <div>
        <div>
    </div>
    `,
    directives: [D3PlateLadderDetailComponent, D3LadderEditorComponent, D3PlateChannelDetailComponent, D3WellViewerComponent, ProgressBarComponent]
})
export class PlateDetailComponent implements OnInit {
    public plate: Plate;
    public selectedWell: Well;
    public ladderChannel: Channel;
    public selectWell: (number);
    public filesToUpload: File[] = [];
    private showSelectedPlate = true;
    private uploading = false;
    private recalculatingLadder = false;
    private plateMapError: string;
    private files: any
    private ladders: Ladder[] = [];
    private createSamplesIfNotExists = false;
    
    
    constructor(
        private _plateService: PlateService,
        private _wellService: WellService,
        private _ladderService: LadderService,
        private _channelService: ChannelService,
        private _router: Router
    ){}

    @ViewChild(D3PlateLadderDetailComponent) ladderDetail: D3PlateLadderDetailComponent;
    @Output() deletePlate = new EventEmitter();
    
    wellSelector(id: number) {
        if(!this.recalculatingLadder){
            this._wellService.getWell(id).subscribe(
                well => {
                    this.selectedWell = well;
                    this.ladderDetail.render();
                }
            )
        }
    }
    
    fileChangeEvent(fileInput: any){        
        this.filesToUpload = <Array<File>> fileInput.target.files;
    }
    
    upload(){
        if(!this.uploading) {
            this.plateMapError = null;
            this.uploading = true;
            this._plateService.postPlateMap(this.filesToUpload, this.plate.id, this.createSamplesIfNotExists)
                .subscribe(
                    plate => {
                        this.plate = plate;
                        toastr.success("Plate Map Uploaded");
                    },
                    err => {
                        this.uploading = false;
                        this.plateMapError = err
                    },
                    () => {
                        this.uploading = false;
                    }
                );
        }
    }
    
    recalculateLadder(well: Well) {
        this._wellService.recalculateLadder(well.id, well.ladder_peak_indices)
        .subscribe(null,null,() => this._wellService.getWell(well.id).subscribe(
            new_well => {
                this.selectedWell = new_well;
            },null,
            () => {
                this._plateService.clearPlateFromCache(this.plate.id);
                this._plateService.getPlate(this.plate.id).subscribe(
                    plate => this.plate = plate
                )
            }
        ))
    }

    recalculatePlateLadder(plate_id: number, ladder_id: number) {
        if(!this.recalculatingLadder) {
            this.recalculatingLadder = true;
            this._plateService.recalculateLadder(plate_id, ladder_id)
                .subscribe(
                    plate => {
                        this.plate = plate;
                    },
                    err => {
                        // console.log(err);
                        this.plateMapError = err;
                    },
                    () => {
                        this.recalculatingLadder = false;
                    }
                )
        }        
    }
    
    ngOnInit() {
        this.selectWell = this.wellSelector.bind(this);
        this._ladderService.getLadders().subscribe(
            ladders => {
                this.ladders = ladders;
            },
            err => this.plateMapError = err
        )
    }
    
    ngOnChanges() {
        this.selectedWell = null;
        this.ladderChannel = null;
    }
    
    ladderRecalculated(well: Well) {
        this.recalculateLadder(well)
    }
}