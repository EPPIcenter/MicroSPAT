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

import { SectionHeaderComponent } from '../layout/section-header.component';
import { ProgressBarComponent } from '../layout/progress-bar.component';

import { BinEstimatorProject } from '../../services/bin-estimator-project/bin-estimator-project.model';
import { BinEstimatorProjectService } from '../../services/bin-estimator-project/bin-estimator-project.service';

@Component({
    selector: 'pm-bin-estimator-detail',
    template: `
    <div *ngIf="selectedProject">
        <pm-section-header [header]="navHeader" [navItems]="navItems"></pm-section-header>
        <div class="row col-sm-6">
            <form (ngSubmit)="saveProject()">
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" (keyup)="onChanged()" class="form-control" required [(ngModel)]="selectedProject.title">
                </div>
                <div class="form-group">
                    <label>Creator</label>
                    <input type="text" (keyup)="onChanged()" class="form-control" [(ngModel)]="selectedProject.creator">
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <input type="text" (keyup)="onChanged()" class="form-control" [(ngModel)]="selectedProject.description">
                </div>
                <pm-progress-bar *ngIf="deletingProject" [fullLabel]="'Deleting Bin Estimator...'"></pm-progress-bar>
                <button type="submit" class="btn btn-default" [ngClass]="{disabled: !selectedProject.isDirty}">Save</button>
                <button class="btn btn-warning" (click)="deleteProject()">Delete</button>
                <span class="label label-danger">{{saveProjectError}}</span>
                <span class="label label-danger">{{deleteProjectError}}</span>
            </form>
        </div>
    </div>
    `,
    styleUrls:['app/plasmomapper/styles/forms.css'],
    directives: [SectionHeaderComponent, ProgressBarComponent]
})
export class BinEstimatorDetailComponent implements OnInit{
    private navItems;
    private navHeader: string
    private saveProjectError: string;
    private deleteProjectError: string;

    private deletingProject = false;
    
    public selectedProject: BinEstimatorProject;
    
    
    constructor(
        private _binEstimatorProjectService: BinEstimatorProjectService,
        private _routeParams: RouteParams,
        private _router: Router
    ){}
    
    private getProject() {
        this._binEstimatorProjectService.getBinEstimatorProject(+this._routeParams.get('project_id'))
            .subscribe(
                project => {
                    this.selectedProject = project;
                    this.navHeader = this.selectedProject.title + " Details";
                    this.navItems = [
                        {
                            label: 'Details',
                            click: () => this.goToLink('BinEstimatorDetail', {project_id: this.selectedProject.id}),
                            active: true
                        },
                        {
                            label: 'Loci',
                            click: () => this.goToLink('BinEstimatorLocusList', {project_id: this.selectedProject.id}),
                            active: false
                        }
                    ]
                }
            )
    }
    
    private goToLink(dest: string, params?: Object) {
        let link = [dest, params]
        this._router.navigate(link);
    }
    
    private saveProject() {
        this.saveProjectError = null;
        if(this.selectedProject.isDirty) {
            this._binEstimatorProjectService.updateBinEstimatorProject(this.selectedProject)
                .subscribe(
                    proj => {
                        this.selectedProject.copyFromObj(proj);
                    },
                    err => this.saveProjectError = err
                )
        }
    }
    
    private deleteProject() {
        this.deleteProjectError = null;
        this.deletingProject = true;
        this._binEstimatorProjectService.deleteBinEstimatorProject(this.selectedProject.id)
            .subscribe(
                () => this.goToLink('BinEstimatorList'),
                err => this.deleteProjectError = err
            )
    }
    
    private onChanged(e) {
        this.selectedProject.isDirty = true;
    }
    
    
    ngOnInit(){
        this.getProject();
    }
}