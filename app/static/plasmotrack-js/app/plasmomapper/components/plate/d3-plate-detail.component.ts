import { Component, ElementRef, OnChanges, OnInit, SimpleChange } from '@angular/core';
import { Well } from '../../services/well/well.model';
import { Plate } from '../../services/plate/plate.model';
import { Channel } from '../../services/channel/channel.model';
import { LadderService } from '../../services/ladder/ladder.service';
import { PlateService } from '../../services/plate/plate.service';
import { WellService } from '../../services/well/well.service';
import { ChannelService } from '../../services/channel/channel.service';

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
                <div class="col-sm-5" style="height: 100%">
                    <pm-d3-plate-ladder-detail [plate]="plate" [wellSelector]="selectWell"></pm-d3-plate-ladder-detail>
                </div>
                <div class="col-sm-4" style="height:100%">
                    <pm-d3-plate-channel-detail [plate]="plate" [wellSelector]="selectWell"></pm-d3-plate-channel-detail>
                </div>
                <div class="col-sm-3">
                    <form>
                        <div class="form-group">
                            <input type="file" (change)="fileChangeEvent($event)" placeholder="Upload file..."/>
                        </div>
                        <button class="btn btn-primary" type="button" [ngClass]="{disabled: uploading}" (click)="upload()">Upload Plate Map</button>
                    </form>
                    <br>
                    <div *ngIf="uploading">
                        <pm-progress-bar [fullLabel]="'Uploading Plate Map...'"></pm-progress-bar>
                    </div>
                    <span class="label label-danger">{{plateMapError}}</span>
                </div>
            </div>
            <div *ngIf="selectedWell">
                <div class="row" style="padding-top: 1vh">
                    <pm-d3-ladder-editor (ladderRecalculated)="ladderRecalculated($event)" [well]="selectedWell"></pm-d3-ladder-editor>
                </div>
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
    private plateMapError: string;
    private files: any
    
    constructor(
        private _plateService: PlateService,
        private _wellService: WellService,
        private _ladderService: LadderService,
        private _channelService: ChannelService
    ){}
    
    wellSelector(id: number) {
        this._wellService.getWell(id).subscribe(
            well => {
                this.selectedWell = well;
            }
        )
    }
    
    fileChangeEvent(fileInput: any){        
        this.filesToUpload = <Array<File>> fileInput.target.files;
    }
    
    upload(){
        if(!this.uploading) {
            this.plateMapError = null;
            this.uploading = true;
            this._plateService.postPlateMap(this.filesToUpload, this.plate.id)
                .subscribe(
                    plate => {
                        this.plate = plate;
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
    
    ngOnInit() {
        this.selectWell = this.wellSelector.bind(this);
    }
    
    ngOnChanges() {
        this.selectedWell = null;
        this.ladderChannel = null;
    }
    
    ladderRecalculated(well: Well) {
        this.recalculateLadder(well)
    }
}