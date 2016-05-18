import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router-deprecated';

import { SectionHeaderComponent } from '../layout/section-header.component';

import { Sample } from '../../services/sample/sample.model';
import { SampleService } from '../../services/sample/sample.service';

@Component({
    selector: 'pm-sample-list',
    template: `
    <pm-section-header [header]="'Samples'"></pm-section-header>
    <div class="row main-container">
        <div class="table-repsonsive list-panel col-sm-6">
            <table class="table table-striped table-hover table-sm">
                <thead>
                    <tr>
                        <th (click)="sortingParam='barcode'; reversed=!reversed; sortSamples()">Barcode</th>
                        <th (click)="sortingParam='designation'; reversed=!reversed; sortSamples()">Designation</th>
                        <th (click)="sortingParam='last_updated'; reversed=!reversed; sortSamples()">Last Updated</th>
                    </tr>
                </thead>
                <tbody>
                    <tr *ngFor="#sample of samples" (click)="selectSample(sample.id)">
                        <td>{{sample.barcode}}</td>
                        <td>{{sample.designation}}</td>
                        <td>{{sample.last_updated | date: "shortDate"}}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="col-sm-6">
            <div class="row">
                <div class="panel panel-default">
                    <div class="panel-heading">
                        <h3 class="panel-title">New Samples</h3>
                    </div>
                    <div class="panel-body">
                        <form>
                            <div class="form-group">
                                <input type="file" (change)="fileChangeEvent($event)" placeholder="Upload file..." multiple/>
                            </div>
                            <button class="btn btn-primary" type="button" (click)="upload()">Upload</button>
                        </form>
                        <span *ngIf="uploading" class="label label-info">Uploading File...</span>
                        <span *ngIf="uploadComplete" class="label label-success">Upload Successful</span>
                        <span class="label label-danger">{{newSampleError}}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `,
    directives: [SectionHeaderComponent]
})
export class SampleListComponent implements OnInit {
    public samples: Sample[] = [];
    public errorMessages: string[] = [];
    public newSampleError: string;
    public filesToUpload: File[] = [];
    public selectedSample: Sample;
    
    private uploading = false;
    private uploadComplete = false;
    
    private sortingParam = 'barcode';
    private reversed = false;
    
    constructor(
        private _sampleService: SampleService,
        private _router: Router
    ){}
    
    sortSamples() {
        this.samples.sort((a, b) => {
            if(a[this.sortingParam] < b[this.sortingParam]) {
                return 1
            } else if (a[this.sortingParam] > b[this.sortingParam]) {
                return -1
            } else {
                return 0
            }
        })
        if(this.reversed) {
            this.samples.reverse();
        }
    }
    
    getSamples() {
        this._sampleService.getSamples()
            .subscribe(
                samples => {
                    this.samples = samples;
                    this.sortSamples();
                },
                err => this.errorMessages.push(err)
            );
    }
    
    selectSample(id: number) {
        this._sampleService.getSample(id)
            .subscribe(
                sample => this.selectedSample = sample,
                err => this.errorMessages.push(err)
            )
    }
    
    fileChangeEvent(fileInput: any){
        this.filesToUpload = <Array<File>> fileInput.target.files;
    }
    
    upload() {
        this.newSampleError = null;
        this.uploading = true;
        this.uploadComplete = false;
        this._sampleService.postSamples(this.filesToUpload)
            .subscribe(
                samples => {
                    this.selectedSample = samples[0]
                },
                err => {
                    this.newSampleError = err;
                    this.uploading = false;
                },
                () => {
                    this.getSamples();
                    this.uploading = false;
                    this.uploadComplete = true;
                }
            )
    }
    
    ngOnInit() {
        this.getSamples();
    }
}