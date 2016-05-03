import { Component, OnInit } from 'angular2/core';
import { Router } from 'angular2/router';

import { SectionHeaderComponent } from '../layout/section-header.component'

import { GenotypingProjectService } from '../../services/genotyping-project/genotyping-project.service'
import { LocusSetService } from '../../services/locus-set/locus-set.service';
import { ArtifactEstimatorProjectService } from '../../services/artifact-estimator-project/artifact-estimator-project.service';
import { BinEstimatorProjectService } from '../../services/bin-estimator-project/bin-estimator-project.service';

import { GenotypingProject } from '../../services/genotyping-project/genotyping-project.model'
import { LocusSet } from '../../services/locus-set/locus-set.model';
import { ArtifactEstimatorProject } from '../../services/artifact-estimator-project/artifact-estimator-project.model';
import { BinEstimatorProject } from '../../services/bin-estimator-project/bin-estimator-project.model';

@Component({
    selector: 'genotyping-project-list',
    template: `
    <div class="row">
        <pm-section-header [header]="'Genotyping Projects'"></pm-section-header>
    </div>
    <div class="row">
        <div *ngFor="#err of constructorErrors">
            <span class="label label-danger">{{err}}</span>
            <br/>
        </div>
        <span class="label label-danger">{{deleteProjectError}}</span>
    </div>
    <div class="row main-container">
        <div class="table-responsive list-panel col-sm-6">
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
                    <tr *ngFor="#project of genotypingProjects" (click)="gotoDetail(project.id)">
                        <td>{{project.title}}</td>
                        <td>{{project.creator}}</td>
                        <td>{{project.description}}</td>
                        <td>{{project.last_updated | date: "fullDate"}}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="col-sm-5">
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title">New Project</h3>
                </div>
                <div class="panel-body">
                    <form (ngSubmit)="submitNewProject()">
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
                            <input type="text" class="form-control" required [(ngModel)]="newProject.description">
                        </div>
                        <div class="form-group">
                            <label>Locus Set</label>
                            <select (change)="locusSetChange($event)" [(ngModel)]="newProject.locus_set_id" required class="form-control">
                                <option *ngFor="#locusSet of locusSets" value={{locusSet.id}}>{{locusSet.label}}</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Artifact Estimator</label>
                            <select [(ngModel)]="newProject.artifact_estimator_id" required class="form-control" [disabled]="artifactEstimatorsDisabled">
                                <option *ngFor="#artifactEstimator of validArtifactEstimators" value={{artifactEstimator.id}}>{{artifactEstimator.title}}</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Bin Set</label>
                            <select [(ngModel)]="newProject.bin_estimator_id" required class="form-control" [disabled]="binEstimatorsDisabled">
                                <option *ngFor="#binEstimator of validBinEstimators" value={{binEstimator.id}}>{{binEstimator.title}}</option>
                            </select>
                        </div>
                        
                        <button type="submit" class="btn btn-default" [ngClass]="{disabled: isSubmitting}">Save</button>
                    </form>
                    <span class="label label-danger">{{newProjectError}}</span>
                </div>
            </div>
        </div>
    </div>
    `,
    directives: [SectionHeaderComponent]
})
export class GenotypingProjectListComponent implements OnInit {
    private genotypingProjects: GenotypingProject[] = [];
    private constructorErrors: string[] = []
    private newProjectError: string;
    private deleteProjectError: string;
    private newProject: GenotypingProject;
    private locusSets: LocusSet[];
    private artifactEstimators: ArtifactEstimatorProject[];
    private validArtifactEstimators: ArtifactEstimatorProject[] = [];
    private artifactEstimatorsDisabled = true;
    private binEstimators: BinEstimatorProject[] = [];
    private validBinEstimators: BinEstimatorProject[] = [];
    private binEstimatorsDisabled = true;
    private sortingParam = 'last_updated';
    private reversed = false;
    private isSubmitting = false;
    
    constructor(
        private _genotypingProjectService: GenotypingProjectService,
        private _locusSetService: LocusSetService,
        private _artifactEstimatorService: ArtifactEstimatorProjectService,
        private _binEstimatorService: BinEstimatorProjectService,
        private _router: Router
        ) {
            this.newProject = new GenotypingProject();
        }
    
    getProjects() {
        this._genotypingProjectService.getProjects()
            .subscribe(
                projects => {
                    this.genotypingProjects = projects;
                    this.sortProjects();
                },
                error => this.constructorErrors.push(error)
            );
    }
    
    deleteProject(id) {
        this.deleteProjectError = null;
        this._genotypingProjectService.deleteProject(id)
            .subscribe(
                () => this.getProjects(),
                (err) => this.deleteProjectError = err
            )
    }
    
    gotoDetail(project_id: number) {
        this._router.navigate(['GenotypingProjectDetail', {project_id: project_id}]);
    }
    
    sortProjects() {
        this.genotypingProjects.sort((a, b) => {
            if(a[this.sortingParam] > b[this.sortingParam]) {
                return 1
            } else if (a[this.sortingParam] < b[this.sortingParam]) {
                return -1
            } else {
                return 0
            }
        })
        if(this.reversed) {
            this.genotypingProjects.reverse();
        }
    }
   
    
    submitNewProject() {
        this.newProjectError = null;
        this.isSubmitting = true;
        this._genotypingProjectService.createProject(this.newProject).subscribe(
            () => {
                this.isSubmitting = false;
                this.getProjects()
            },
            (err) => {
                this.isSubmitting = false;
                this.newProjectError = err;
            }
        )
        
    }
    
    locusSetChange(e) {
        let locus_set_id = +e.target.value;
        
        this.artifactEstimatorsDisabled = true;
        this.binEstimatorsDisabled = true;
        this.validArtifactEstimators = [];
        this.validBinEstimators = [];
        
        this.artifactEstimators.forEach((artifactEstimator) => {            
            if(artifactEstimator.locus_set_id == locus_set_id) {
                console.log(artifactEstimator);
                console.log(locus_set_id);
                this.validArtifactEstimators.push(artifactEstimator)
            }
        });
        
        this.binEstimators.forEach((binEstimator) => {
            console.log(binEstimator);
            console.log(locus_set_id);
            if(binEstimator.locus_set_id == locus_set_id) {
                this.validBinEstimators.push(binEstimator)
            }
        });
        
        if(this.validArtifactEstimators.length > 0) {
            this.artifactEstimatorsDisabled = false;
        }
        
        if(this.validBinEstimators.length > 0) {
            this.binEstimatorsDisabled = false;
        }
        
    }
    
    ngOnInit() {
        this._locusSetService.getLocusSets().subscribe(
                (locus_sets) => this.locusSets = locus_sets,
                (err) => this.constructorErrors.push(err)
            )
        this._artifactEstimatorService.getArtifactEstimatorProjects().subscribe(
            (artifact_estimators) => this.artifactEstimators = artifact_estimators,
            (err) => this.constructorErrors.push(err)
        )
        this._binEstimatorService.getBinEstimatorProjects().subscribe(
            (bin_estimators) => this.binEstimators = bin_estimators,
            (err) => this.constructorErrors.push(err)
        )
        this.getProjects();
    }
}