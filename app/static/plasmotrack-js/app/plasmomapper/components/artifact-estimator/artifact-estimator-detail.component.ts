import { Component, OnInit } from '@angular/core';
import { RouteParams, Router } from '@angular/router-deprecated';

import { SectionHeaderComponent } from '../layout/section-header.component';

import { ArtifactEstimatorProject } from '../../services/artifact-estimator-project/artifact-estimator-project.model';
import { ArtifactEstimatorProjectService } from '../../services/artifact-estimator-project/artifact-estimator-project.service';

@Component({
    selector: 'pm-artifact-estimator-detail',
    template: `
    <div *ngIf="selectedProject">
        <pm-section-header [header]="navHeader" [navItems]="navItems"></pm-section-header>
        <div class="row col-sm-6">
            <form>
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
                <button class="btn btn-default" (click)="saveProject()" [ngClass]="{disabled: !selectedProject.isDirty}">Save</button>
                <button class="btn btn-warning" (click)="deleteProject()">Delete</button>
                <pm-progress-bar *ngIf="savingProject" [fullLabel]="'Saving Project...'"></pm-progress-bar>
                <pm-progress-bar *ngIf="deletingProject" [fullLabel]="'Deleting Project...'"></pm-progress-bar>
                <span class="label label-danger">{{saveProjectError}}</span>
                <span class="label label-danger">{{deleteProjectError}}</span>
            </form>
        </div>
    </div>
    `,
    styleUrls: ['app/plasmomapper/styles/forms.css'],
    directives: [SectionHeaderComponent]
})
export class ArtifactEstimatorDetailComponent implements OnInit {
    private navItems;
    private navHeader
    private saveProjectError: string;
    private deleteProjectError: string;

    private deletingProject = false;
    private savingProject = false;
    
    public selectedProject: ArtifactEstimatorProject
    
    constructor(
        private _artifactEstimatorProjectService: ArtifactEstimatorProjectService,
        private _routeParams: RouteParams,
        private _router: Router 
    ){}
    
    private getProject() {
        this._artifactEstimatorProjectService.getArtifactEstimatorProject(+this._routeParams.get('project_id'))
            .subscribe(
                project => {                    
                    this.selectedProject = project;
                    this.navHeader = this.selectedProject.title + " Details";
                    this.navItems = [
                        {
                            label: 'Details',
                            click: () => this.goToLink('ArtifactEstimatorDetail', {project_id: this.selectedProject.id}),
                            active: true
                        },
                        {
                            label: 'Loci',
                            click: () => this.goToLink('ArtifactEstimatorLocusList', {project_id: this.selectedProject.id})
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
        if(!this.savingProject && !this.deletingProject) {
            this.saveProjectError = null;
            this.savingProject = true;
            if(this.selectedProject.isDirty) {
                this._artifactEstimatorProjectService.updateArtifactEstimatorProject(this.selectedProject)
                    .subscribe(
                        proj => {
                            this.savingProject = false
                            this.selectedProject.copyFromObj(proj);
                        },
                        err => this.saveProjectError = err
                    )
            }
        }
        
    }
    
    private deleteProject() {
        if(!this.savingProject && !this.deletingProject){
            this.deleteProjectError = null;
            this.deletingProject = true;
            this._artifactEstimatorProjectService.deleteArtifactEstimatorProject(this.selectedProject.id)
                .subscribe(
                    () => this.goToLink('ArtifactEstimatorList'),
                    err => this.deleteProjectError = err
            )
        }
    }
    
    private onChanged(e) {
        this.selectedProject.isDirty = true;
    }
    
    
    ngOnInit(){
        this.getProject();
    }
}