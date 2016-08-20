import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router-deprecated';

import { SectionHeaderComponent } from '../layout/section-header.component';
import { ProgressBarComponent } from '../layout/progress-bar.component';

import { ArtifactEstimatorProjectService } from '../../services/artifact-estimator-project/artifact-estimator-project.service';
import { ArtifactEstimatorProject } from '../../services/artifact-estimator-project/artifact-estimator-project.model';

import { BinEstimatorProjectService } from '../../services/bin-estimator-project/bin-estimator-project.service';
import { BinEstimatorProject } from '../../services/bin-estimator-project/bin-estimator-project.model'

import { LocusSetService } from '../../services/locus-set/locus-set.service';
import { LocusSet } from '../../services/locus-set/locus-set.model';

@Component({
    selector: 'pm-artifact-estimator-list',
    template: `
    <div class="row">
        <pm-section-header [header]="'Artifact Estimator Projects'"></pm-section-header>
    </div>
    <div class="row">
        <div *ngFor="let err of constructorErrors">
            <span class="label label-danger">{{err}}</span>
            <br/>
        </div>
    </div>
    <div class="row main-container">
        <div class="col-sm-6">
            <div class="panel panel-default">
                <div class="panel-body">
                    <div *ngIf="loadingProjects">
                        <pm-progress-bar [label]="'Artifact Estimators'"></pm-progress-bar>
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
                                <tr *ngFor="let project of artifactEstimatorProjects" (click)="gotoDetail(project.id)">
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
                    <h3 class="panel-title">New Artifact Estimator</h3>
                </div>
                <div class="panel-body">
                    <form (ngSubmit)="submitNewProject()">
                        <div class="form-group">
                            <label>Title</label>
                            <input type="text" class="form-control" required [(ngModel)]="newArtifactEstimatorProject.title">
                        </div>
                        <div class="form-group">
                            <label>Creator</label>
                            <input type="text" class="form-control" [(ngModel)]="newArtifactEstimatorProject.creator">
                        </div>
                        <div class="form-group">
                            <label>Description</label>
                            <input type="text" class="form-control" [(ngModel)]="newArtifactEstimatorProject.description">
                        </div>
                        <div class="form-group">
                            <label>Locus Set</label>
                            <select (change)="locusSetChange($event)" [(ngModel)]="newArtifactEstimatorProject.locus_set_id" required class="form-control">
                                <option *ngFor="let locusSet of locusSets" value={{locusSet.id}}>{{locusSet.label}}</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Bin Set</label>
                            <select [(ngModel)]="newArtifactEstimatorProject.bin_estimator_id" required class="form-control" [disabled]="binEstimatorsDisabled">
                                <option *ngFor="let binEstimator of validBinEstimators" value={{binEstimator.id}}>{{binEstimator.title}}</option>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-default" [ngClass]="{disabled: isSubmitting}">Save</button>
                        <span *ngIf="isSubmitting" class="label label-info">Saving to Server...</span>
                        <span class="label label-danger">{{newProjectError}}</span>
                    </form>
                    
                </div>
            </div>
        </div>
    </div>
    `,
    directives: [SectionHeaderComponent, ProgressBarComponent]
})
export class ArtifactEstimatorListComponent implements OnInit {
    private artifactEstimatorProjects: ArtifactEstimatorProject[];
    private newArtifactEstimatorProject: ArtifactEstimatorProject;
    private locusSets: LocusSet[];
    private binEstimatorsDisabled = true;
    private binEstimators: BinEstimatorProject[] = [];
    private validBinEstimators: BinEstimatorProject[] = [];
    private newProjectError: string;
    private constructorErrors: string[] = [];
    private sortingParam = 'title';
    private reversed = false;
    
    private isSubmitting = false;

    private loadingProjects = false;
    
    constructor(
        private _artifactEstimatorProjectService: ArtifactEstimatorProjectService,
        private _locusSetService: LocusSetService,
        private _binEstimatorService: BinEstimatorProjectService,
        private _router: Router
    ){}
    
    loadNewArtifactEstimator(){
        this.newArtifactEstimatorProject = new ArtifactEstimatorProject();
    }
    
    getProjects(){
        this.loadingProjects = true;
        this._artifactEstimatorProjectService.getArtifactEstimatorProjects()
            .subscribe(
                projects => {
                    this.loadingProjects = false;
                    this.artifactEstimatorProjects = projects;
                    this.sortProjects();
                }
            ),
            error => this.constructorErrors.push(error)
    }
    
    getLocusSets(){
        this._locusSetService.getLocusSets()
            .subscribe(
                locusSets => this.locusSets = locusSets
            ),
            error => this.constructorErrors.push(error)
    }
    
    getBinEstimators() {
        this._binEstimatorService.getBinEstimatorProjects()
            .subscribe(
                bin_estimators => this.binEstimators = bin_estimators,
                err => this.constructorErrors.push(err)
            )
    }
    
    submitNewProject() {
        this.newProjectError = null;
        this.isSubmitting = true;
        this._artifactEstimatorProjectService.createArtifactEstimatorProject(this.newArtifactEstimatorProject)
            .subscribe(
                () => {
                    this.isSubmitting = false;
                    this.loadNewArtifactEstimator();
                    this.getProjects();
                },
                err => {
                    this.isSubmitting = false;
                    this.newProjectError = err;
                }
            )
    }
    
    locusSetChange(e) {
        let locus_set_id = +e.target.value;
        
        this.binEstimatorsDisabled= true;
        this.validBinEstimators = [];
        
        this.binEstimators.forEach((binEstimator) => {
            if(binEstimator.locus_set_id == locus_set_id) {
                this.validBinEstimators.push(binEstimator)
            }
        })
        
        if(this.validBinEstimators.length > 0) {
            this.binEstimatorsDisabled = false;
        }
    }
    
    gotoDetail(id: number) {
        this._router.navigate(['ArtifactEstimatorDetail', {project_id: id}]);
    }
    
    sortProjects() {
        this.artifactEstimatorProjects.sort((a, b) => {
            if(a[this.sortingParam] > b[this.sortingParam]) {
                return 1
            } else if (a[this.sortingParam] < b[this.sortingParam]) {
                return -1
            } else {
                return 0
            }
        })
        if(this.reversed) {
            this.artifactEstimatorProjects.reverse();
        }
    }
    
    ngOnInit() {
        this.loadNewArtifactEstimator();
        this.getProjects();
        this.getLocusSets();
        this.getBinEstimators();
    }
    
}