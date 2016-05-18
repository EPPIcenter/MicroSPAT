import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router-deprecated';

import { SectionHeaderComponent } from '../layout/section-header.component';

import { BinEstimatorProjectService } from '../../services/bin-estimator-project/bin-estimator-project.service';
import { BinEstimatorProject } from '../../services/bin-estimator-project/bin-estimator-project.model';

import { LocusSetService } from '../../services/locus-set/locus-set.service';
import { LocusSet } from '../../services/locus-set/locus-set.model';

@Component({
    selector: 'pm-bin-estimator-list',
    template: `
    <div class="row">
        <pm-section-header [header]="'Bin Estimator Projects'"></pm-section-header>
    </div>
    <div class="row">
        <div *ngFor="#err of consttructorErrors">
            <span class="label label-danger">{{err}}</span>
            <br/>
        </div>
    </div>
    <div class="row main-container">
        <div class="table-responsive list-panel col-sm-4">
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
                    <tr *ngFor="#project of binEstimatorProjects" (click)="gotoDetail(project.id)">
                        <td>{{project.title}}</td>
                        <td>{{project.creator}}</td>
                        <td>{{project.description}}</td>
                        <td>{{project.last_updated | date: "fullDate"}}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="col-sm-6">
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title">New Bin Estimator</h3>
                </div>
                <div class="panel-body">
                    <form (ngSubmit)="submitNewProject()">
                        <div class="form-group">
                            <label>Title</label>
                            <input type="text" class="form-control" required [(ngModel)]="newBinEstimatorProject.title">
                        </div>
                        <div class="form-group">
                            <label>Creator</label>
                            <input type="text" class="form-control" [(ngModel)]="newBinEstimatorProject.creator">
                        </div>
                        <div class="form-group">
                            <label>Description</label>
                            <input type="text" class="form-control" [(ngModel)]="newBinEstimatorProject.description">
                        </div>
                        <div class="form-group">
                            <label>Locus Set</label>
                            <select [(ngModel)]="newBinEstimatorProject.locus_set_id" required class="form-control">
                                <option *ngFor="#locusSet of locusSets" value={{locusSet.id}}>{{locusSet.label}}</option>
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
    directives: [SectionHeaderComponent]
})
export class BinEstimatorListComponent implements OnInit {
    private binEstimatorProjects: BinEstimatorProject[];
    private locusSets: LocusSet[];
    private newBinEstimatorProject: BinEstimatorProject;
    private newProjectError: string;
    private constructorErrors: string[] = [];
    
    private sortingParam = 'title';
    private reversed = false;
    
    private isSubmitting = false;
    
    constructor(
        private _binEstimatorProjectService: BinEstimatorProjectService,
        private _locusSetService: LocusSetService,
        private _router: Router
    ) {
    }
    
    loadNewBinEstimator() {
        this.newBinEstimatorProject = new BinEstimatorProject();
    }
    
    getProjects() {
        this._binEstimatorProjectService.getBinEstimatorProjects()
            .subscribe(
                projects => {
                    this.binEstimatorProjects = projects;
                    this.sortProjects()
                },
                error => this.constructorErrors.push(error)
            )
    }
    
    getLocusSets(){
        this._locusSetService.getLocusSets()
            .subscribe(
                locusSets => {
                    this.locusSets = locusSets;
                },
                error => this.constructorErrors.push(error)
            )
    }
    
    gotoDetail(id: number) {
        this._router.navigate(['BinEstimatorDetail', {project_id: id}])
    }
    
    submitNewProject() {
        this.newProjectError = null;
        this.isSubmitting = true;
        this._binEstimatorProjectService.createBinEstimatorProject(this.newBinEstimatorProject).subscribe(
            () => {
                this.isSubmitting = false;
                this.getProjects();
            },
            err => {
                this.isSubmitting = false;
                this.newProjectError = err;
            }
        )
    }
    
    sortProjects() {
        this.binEstimatorProjects.sort((a, b) => {
            if(a[this.sortingParam] > b[this.sortingParam]) {
                return 1
            } else if (a[this.sortingParam] < b[this.sortingParam]) {
                return -1
            } else {
                return 0
            }
        })
        if(this.reversed) {
            this.binEstimatorProjects.reverse();
        }
    }
    
    ngOnInit() {
        this.loadNewBinEstimator();
        this.getProjects();
        this.getLocusSets();
    }
}