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
import { RouteParams, Router } from '@angular/router-deprecated';

import { SectionHeaderComponent } from '../../layout/section-header.component';
import { ProgressBarComponent } from '../../layout/progress-bar.component';

import { ArtifactEstimatorProject } from '../../../services/artifact-estimator-project/artifact-estimator-project.model';
import { ArtifactEstimatorProjectService } from '../../../services/artifact-estimator-project/artifact-estimator-project.service';
import { SampleAnnotation } from '../../../services/sample-based-project/sample-annotation/sample-annotation.model';

interface AssociatedSample {
    id: number;
    barcode: string;
    last_updtaed: Date;
}

@Component({
    selector: 'artifact-estimator-sample-list',
    template: `
        <pm-section-header [header]="header" [navItems]="navItems"></pm-section-header>
        <div *ngIf="selectedProject" class="row">
            <div class="col-sm-6">
                <div class="row">
                    <div class="col-sm-12">
                        <div class="panel panel-default">
                            <div class="panel-heading">
                                <h6 class="panel-title">Add Samples</h6>
                            </div>
                            <div class="panel-body">
                                <form>
                                    <div class="form-group">
                                        <input type="file" (change)="fileChangeEvent($event)" placeholder="Upload file..." />
                                    </div>
                                    <button class="btn btn-primary" type="button" (click)="upload()">Upload</button>
                                </form>
                                <br>
                                <pm-progress-bar *ngIf="uploading" [fullLabel]="'Uploading File...'"></pm-progress-bar>
                                <span class="label label-danger">{{uploadError}}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,
    directives: [SectionHeaderComponent, ProgressBarComponent]
})

export class ArtifactEstimatorSampleListComponent implements OnInit {
    // <div class="col-sm-12">
    //                     <div class="panel panel-default">
    //                             <div class="panel-heading">
    //                                 <div class="h3 panel-title">
    //                                     <span>Samples</span>
    //                                 </div>
    //                             </div>
    //                             <div class="panel-body">
    //                                 <div class="table-responsive" style="overflow: auto; height:80vh">
    //                                     <table class="table table-striped table-hover table-condensed">
    //                                         <thead>
    //                                             <tr>
    //                                                 <th>Barcode</th>
    //                                                 <th>Last Updated</th>
    //                                             </tr>
    //                                         </thead>
    //                                         <tbody>
    //                                             <tr *ngFor="let sample_annotation of _sampleAnnotations" (click)="selectSample(sample_annotation)" [ngClass]="{success:sample_annotation.sample.id==selectedSample?.id}">
    //                                                 <td>{{sample_annotation.sample.barcode}}</td>
    //                                                 <td>{{sample_annotation.last_updtaed | date: "fullDate"}}</td>
    //                                             </tr>
    //                                         </tbody>
    //                                     </table>
    //                                 </div>
    //                             </div>
    //                         </div>
    //                     </div>
    //                 </div>
    public selectedProject: ArtifactEstimatorProject;
    private associatedSamples: AssociatedSample[];
    private header: string;
    private navItems;
    private _sampleAnnotations: SampleAnnotation[] = [];

    private sampleFileCSV: File[] = [];
    private uploading = false;
    private uploadComplete = false;

    private uploadError: string;


    constructor(
        private _artifactEstimatorService: ArtifactEstimatorProjectService,
        private _routeParams: RouteParams,
        private _router: Router
    ){}

    public ngOnInit() {
        this.getProject();
    }

    getProject() {
        this.selectedProject = null;
        this.associatedSamples = [];
        this._artifactEstimatorService.getArtifactEstimatorProject(+this._routeParams.get('project_id'))
            .map(project => {
                this.selectedProject = project;
                this.header = this.selectedProject.title + " Samples"
                this.navItems = [
                    {
                        label: 'Details',
                        click: () => this.goToLink('ArtifactEstimatorDetail', {project_id: this.selectedProject.id}),
                        active: false
                    },
                    {
                        label: 'Samples',
                        click: () => this.goToLink('ArtifactEstimatorSampleList', {project_id: this.selectedProject.id}),
                        active: true
                    },
                    {
                        label: 'Loci',
                        click: () => this.goToLink('ArtifactEstimatorLocusList', {project_id: this.selectedProject.id}),
                        active: false
                    }
                ]
                project.sample_annotations.forEach(sampleAnnotation => {
                    this._sampleAnnotations.push(sampleAnnotation);
                });
                return project;
            })
            .subscribe(
                null,
                err => toastr.error(err)
            )
    }
    
    fileChangeEvent(fileInput: any){
        this.sampleFileCSV = <Array<File>> fileInput.target.files;
    };

    private goToLink(dest: String, params: Object) {
        let link = [dest, params];
        this._router.navigate(link);
    }

    upload() {
        if(!this.uploading) {
            this.uploading = true;
            this.uploadComplete = false
            this._artifactEstimatorService.setSamples(this.sampleFileCSV, this.selectedProject.id).subscribe(
                project => {
                    this.selectedProject = project;
                    this._sampleAnnotations = [];
                    project.sample_annotations.forEach(sampleAnnotation => {
                        this._sampleAnnotations.push(sampleAnnotation);
                    });
                    toastr.success("Succesfully Uploaded Sample List");
                }, 
                error => {
                    this.uploadError = error;
                    this.uploading = false;
                },
                () => {
                    this.uploading = false;
                }
            )
        }
    }
    
}