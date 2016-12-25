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

import { QuantificationBiasEstimatorProjectService } from '../../services/quantification-bias-estimator-project/quantification-bias-estimator-project.service'
import { LocusSetService } from '../../services/locus-set/locus-set.service';
import { BinEstimatorProjectService } from '../../services/bin-estimator-project/bin-estimator-project.service';
import { ArtifactEstimatorProjectService } from '../../services/artifact-estimator-project/artifact-estimator-project.service';

import { QuantificationBiasEstimatorProject } from '../../services/quantification-bias-estimator-project/quantification-bias-estimator-project.model'
import { LocusSet } from '../../services/locus-set/locus-set.model';
import { BinEstimatorProject } from '../../services/bin-estimator-project/bin-estimator-project.model';
import { ArtifactEstimatorProject } from '../../services/artifact-estimator-project/artifact-estimator-project.model';

@Component({
    selector: 'quantification-bias-estimator-project-list',
    template: `
    <br>
    <div class="row main-container">
        <div class="col-sm-6">
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title">Quantification Bias Estimator Projects</h3>
                </div>
                <div class="panel-body">
                    <div *ngIf="loadingProjects">
                        <pm-progress-bar [label]="'Projects'"></pm-progress-bar>
                    </div>
                    <div *ngIf="!loadingProjects" class="table-responsive list-panel">
                        <table class="table table-striped table-hover table-condensed">
                            <thead>
                                <tr>
                                    <th (click)="sortingParam='title'; reversed=!reversed; sortProjects()">Title</th>
                                    <th>Creator</th>
                                    <th>Description</th>
                                    <th (click)="sortingParam='last_updated'; reversed=!reversed; sortProjects()">Last Updated</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr *ngFor="let project of projects" (click)="gotoDetail(project.id)">
                                    <td>{{project.title}}</td>
                                    <td>{{project.creator}}</td>
                                    <td>{{project.description}}</td>
                                    <td>{{project.last_updated | date: "fullDate"}}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-sm-6">
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title">New Project</h3>
                </div>
                <div class="panel-body">
                    <form>
                        <div class="form-group">
                            <label>Title</label>
                            <input type="text" class="form-control" required [(ngModel)]="newProject.title">
                        </div>
                        <div class="form-group">
                            <label>Creator</label>
                            <input type="text" class="form-control" [(ngModel)]="newProject.creator">
                        </div>
                        <div class="form-group">
                            <label>Description</label>
                            <input type="text" class="form-control" [(ngModel)]="newProject.description">
                        </div>
                        <div class="form-group">
                            <label>Locus Set</label>
                            <select (change)="locusSetChange($event)" [(ngModel)]="newProject.locus_set_id" required class="form-control" [disabled]="loadingArtifactEstimators || loadingBinEstimators">
                                <option *ngFor="let locusSet of locusSets" value={{locusSet.id}}>{{locusSet.label}}</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Bin Set</label>
                            <select (change)="binSetChange($event)" [(ngModel)]="newProject.bin_estimator_id" required class="form-control" [disabled]="binEstimatorsDisabled">
                                <option *ngFor="let binEstimator of validBinEstimators" value={{binEstimator.id}}>{{binEstimator.title}}</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Artifact Estimator (Optional)</label>
                            <select [(ngModel)]="newProject.artifact_estimator_id" class="form-control" [disabled]="artifactEstimatorsDisabled">
                                <option value={{null}}>None</option>
                                <option *ngFor="let artifactEstimator of validArtifactEstimators" value={{artifactEstimator.id}}>{{artifactEstimator.title}}</option>
                            </select>
                        </div>
                        <button class="btn btn-default" [ngClass]="{disabled: isSubmitting}" (click)="submitNewProject()">Save</button>
                    </form>
                </div>
            </div>
        </div>
    </div>
    `,
    directives: [SectionHeaderComponent, ProgressBarComponent]
})
export class QuantificationBiasEstimatorProjectListComponent implements OnInit {
    private projects: QuantificationBiasEstimatorProject[] = [];
    private newProject: QuantificationBiasEstimatorProject;
    private locusSets: LocusSet[] = [];
    private binEstimators: BinEstimatorProject[] = [];
    private validBinEstimators: BinEstimatorProject[] = [];
    private artifactEstimators: ArtifactEstimatorProject[] = [];
    private validArtifactEstimators: ArtifactEstimatorProject[] = [];
    private binEstimatorsDisabled = true;
    private artifactEstimatorsDisabled = true;
    private sortingParam = 'last_updated';
    private reversed = false;
    private isSubmitting = false;

    private loadingProjects = false;
    private loadingBinEstimators = false;
    private loadingArtifactEstimators = false;

    constructor(
        private _qbeProjectService: QuantificationBiasEstimatorProjectService,
        private _locusSetService: LocusSetService,
        private _binEstimatorService: BinEstimatorProjectService,
        private _artifactEstimatorService: ArtifactEstimatorProjectService,
        private _router: Router
    ) {
        this.newProject = new QuantificationBiasEstimatorProject();
    }

    getProjects() {
        this._locusSetService.getLocusSets().subscribe(
            locus_sets => this.locusSets = locus_sets,
            err => toastr.error(err)
        );

        this.loadingBinEstimators = true;
        this._binEstimatorService.getBinEstimatorProjects().subscribe(
            bin_estimators => this.binEstimators = bin_estimators,
            err => toastr.error(err),
            () => this.loadingBinEstimators = false
        );

        this._artifactEstimatorService.getArtifactEstimatorProjects().subscribe(
            art_estimators => {
                this.artifactEstimators = art_estimators;
            },
            err => toastr.error(err),
            () => this.loadingArtifactEstimators = false
        )

        this.loadingProjects = true;
        this._qbeProjectService.getProjects().subscribe(
            projects => {
                this.projects = projects;
                this.sortProjects();
            },
            err => toastr.error(err),
            () =>  this.loadingProjects = false
        )
    }

    gotoDetail(project_id: number) {
        this._router.navigate(['QuantificationBiasEstimatorProjectDetail', {project_id: project_id}])
    }

    sortProjects() {
        this.projects.sort((a, b) => {
            if(a[this.sortingParam] > b[this.sortingParam]) {
                return 1
            } else if (a[this.sortingParam] < b[this.sortingParam]) {
                return -1
            } else {
                return 0
            }
        })
        if(this.reversed) {
            this.projects.reverse();
        }
    }

    submitNewProject() {
        this.isSubmitting = true;
        this._qbeProjectService.createProject(this.newProject).subscribe(
            () => {
                this.newProject = new QuantificationBiasEstimatorProject();
                this.getProjects();
            },
            err => {
                toastr.error(err);
            },
            () => {
                this.isSubmitting = false;
            }
        )
    }

    locusSetChange(e) {
        let locus_set_id = +e.target.value;
        this.binEstimatorsDisabled = true;
        this.validBinEstimators = [];
        
        this.binEstimators.forEach((binEstimator) => {
            if(binEstimator.locus_set_id == locus_set_id) {
                let all_clean = true;
                binEstimator.locus_parameters.forEach((lp) => {
                    if(lp.filter_parameters_stale || lp.scanning_parameters_stale) {
                        all_clean = false;
                    }
                })
                if(all_clean) {
                    this.validBinEstimators.push(binEstimator);
                }
            }
        });

        if(this.validBinEstimators.length > 0) {
            this.binEstimatorsDisabled = false;
        }

    }

    binSetChange(e) {
        let bin_set_id = +e.target.value;
        this.artifactEstimatorsDisabled = true;
        this.validArtifactEstimators = [];

        console.log(bin_set_id);
        
        this.artifactEstimators.forEach(artifactEstimator => {
            console.log(artifactEstimator);
            
            console.log(bin_set_id === artifactEstimator.bin_estimator_id);
            
            if(+artifactEstimator.bin_estimator_id === bin_set_id) {
                let all_clean = true;
                artifactEstimator.locus_parameters.forEach(lp => {
                    if(lp.filter_parameters_stale || lp.scanning_parameters_stale) {
                        all_clean = false;
                    }
                })
                if(all_clean) {
                    this.validArtifactEstimators.push(artifactEstimator);
                }
            }
        });

        if(this.validArtifactEstimators.length > 0) {
            this.artifactEstimatorsDisabled = false;
        }


    }

    ngOnInit() {
        this.getProjects();
    }
}