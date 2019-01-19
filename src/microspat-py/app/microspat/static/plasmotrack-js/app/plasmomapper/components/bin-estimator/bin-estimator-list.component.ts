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

import { BinEstimatorProjectService } from '../../services/bin-estimator-project/bin-estimator-project.service';
import { BinEstimatorProject } from '../../services/bin-estimator-project/bin-estimator-project.model';

import { LocusSetService } from '../../services/locus-set/locus-set.service';
import { LocusSet } from '../../services/locus-set/locus-set.model';

@Component({
    selector: 'pm-bin-estimator-list',
    template: `
    <div class="row">
        <div *ngFor="let err of constructorErrors">
            <span class="label label-danger">{{err}}</span>
            <br/>
        </div>
    </div>
    <br>
    <div class="row main-container">
        <div class="col-sm-6">
            <div class="panel panel-default">
                <div class="panel-heading">
                    <h3 class="panel-title">Bin Estimator Projects</h3>
                </div>
                <div class="panel-body">
                    <div *ngIf="loadingProjects">
                        <pm-progress-bar [label]="'Bin Estimators'"></pm-progress-bar>
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
                                <tr *ngFor="let project of binEstimatorProjects" (click)="gotoDetail(project.id)">
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
                                <option *ngFor="let locusSet of locusSets" value={{locusSet.id}}>{{locusSet.label}}</option>
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
export class BinEstimatorListComponent implements OnInit {
    private binEstimatorProjects: BinEstimatorProject[];
    private locusSets: LocusSet[];
    private newBinEstimatorProject: BinEstimatorProject;
    private newProjectError: string;
    private constructorErrors: string[] = [];
    
    private sortingParam = 'title';
    private reversed = false;
    
    private isSubmitting = false;

    private loadingProjects = false;
    
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
        this.loadingProjects = true;
        this._binEstimatorProjectService.getBinEstimatorProjects()
            .subscribe(
                projects => {
                    this.loadingProjects = false;
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
        if(!this.isSubmitting) {
            this.newProjectError = null;
            this.isSubmitting = true;
            this._binEstimatorProjectService.createBinEstimatorProject(this.newBinEstimatorProject).subscribe(
                () => {
                    this.getProjects();
                },
                err => {
                    this.newProjectError = err;
                },
                () => {
                    this.isSubmitting = false;
                }
            )
        }
        
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