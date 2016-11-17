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
import { Router } from '@angular/router-deprecated';

import { SectionHeaderComponent } from '../layout/section-header.component';
import { ProgressBarComponent } from '../layout/progress-bar.component';

import { Sample } from '../../services/sample/sample.model';
import { SampleService } from '../../services/sample/sample.service';

@Component({
    selector: 'pm-sample-list',
    template: `
    <br>
    <div class="row main-container">
        <div class="col-sm-6">
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title">Samples</h3>
                </div>
                <div class="panel-body">
                    <div *ngIf="loadingSamples">
                        <pm-progress-bar [label]="'Samples'"></pm-progress-bar>
                    </div>
                    <div *ngIf="!loadingSamples" class="table-repsonsive list-panel">
                        <table class="table table-striped table-hover table-condensed">
                            <thead>
                                <tr>
                                    <th (click)="sortingParam='barcode'; reversed=!reversed; sortSamples()">Barcode</th>
                                    <th (click)="sortingParam='designation'; reversed=!reversed; sortSamples()">Designation</th>
                                    <th (click)="sortingParam='last_updated'; reversed=!reversed; sortSamples()">Last Updated</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr *ngFor="let sample of samples" (click)="selectSample(sample.id)">
                                    <td>{{sample.barcode}}</td>
                                    <td>{{sample.designation}}</td>
                                    <td>{{sample.last_updated | date: "shortDate"}}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
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
    directives: [SectionHeaderComponent, ProgressBarComponent]
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

    private loadingSamples = false;
    
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
        this.loadingSamples = true;
        this._sampleService.getSamples()
            .subscribe(
                samples => {
                    this.loadingSamples = false;
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