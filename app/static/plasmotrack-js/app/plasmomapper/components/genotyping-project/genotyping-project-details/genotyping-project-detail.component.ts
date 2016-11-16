import { Component, OnInit } from '@angular/core';
import { RouteParams, Router } from '@angular/router-deprecated';

import { SectionHeaderComponent } from '../../layout/section-header.component'

import { ProgressBarComponent } from '../../layout/progress-bar.component';

import { GenotypingProject } from '../../../services/genotyping-project/genotyping-project.model';
import { GenotypingProjectService } from '../../../services/genotyping-project/genotyping-project.service';

@Component({
    selector: 'pm-genotyping-project-detail',
    template: `
    <div *ngIf="selectedProject">
        <pm-section-header [header]="navHeader" [navItems]="navItems"></pm-section-header>
        <div class="row col-sm-6">
            <form >
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" (keyup)="onChanged()" class="form-control" required
                        [(ngModel)] = "selectedProject.title">
                </div>
                <div class="form-group">
                    <label>Creator</label>
                    <input type="text" (keyup)="onChanged()" class="form-control"
                        [(ngModel)] = "selectedProject.creator">
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <input type="text" (keyup)="onChanged()" class="form-control"
                        [(ngModel)] = "selectedProject.description">
                </div>
                <button type="submit" class="btn btn-default" [ngClass]="{disabled: !selectedProject.isDirty}" (click)="saveProject()">Save</button>
                <button class="btn btn-warning" (click)="deleteProject()">Delete</button>
                <button class="btn btn-default" [ngClass]="{disabled: gettingAlleles}" (click)="getAlleles()">Save Called Alleles</button>
                <button class="btn btn-default" [ngClass]="{disabled: gettingAlleles}" (click)="getDominantAlleles()">Save Dominant Alleles</button>
                <pm-progress-bar *ngIf="gettingAlleles" [fullLabel]="'Collecting Allele Data...'"></pm-progress-bar>
                <pm-progress-bar *ngIf="savingProject" [fullLabel]="'Saving Project...'"></pm-progress-bar>
                <pm-progress-bar *ngIf="deletingProject" [fullLabel]="'Deleting Project...'"></pm-progress-bar>
                <span class="label label-danger">{{saveProjectError}}</span>
                <span class="label label-danger">{{deleteProjectError}}</span>
            </form>
        </div>
    </div>
    `,
    styleUrls:['app/plasmomapper/styles/forms.css'],
    directives: [SectionHeaderComponent, ProgressBarComponent]
})

export class GenotypingProjectDetailComponent implements OnInit {
    private navItems;
    private navHeader: string;
    private saveProjectError: string;
    private deleteProjectError: string
    
    public selectedProject: GenotypingProject;

    private savingProject = false;
    private deletingProject = false;
    private gettingAlleles = false;
    
    constructor(
        private _genotypingProjectService: GenotypingProjectService,
        private _routeParams: RouteParams,
        private _router: Router
        ){}
    
    getProject() {
        this._genotypingProjectService.getProject(+this._routeParams.get('project_id'))
                .subscribe((project) => {
                    
                    this.selectedProject = project;
                    this.navHeader = this.selectedProject.title + " Details";
                    this.navItems = [
                        {
                            label: 'Details',
                            click: () => this.goToLink('GenotypingProjectDetail', {project_id: this.selectedProject.id}),
                            active: true
                        },
                        {
                            label: 'Samples',
                            click: () => this.goToLink('GenotypingProjectSampleList', {project_id: this.selectedProject.id}),
                            active: false
                        },
                        {
                            label: 'Loci',
                            click: () => this.goToLink('GenotypingProjectLocusList', {project_id: this.selectedProject.id}),
                            active: false
                        }
                    ]
                })
    }
    
    private goToLink(dest: String, params?: Object) {
      let link = [dest, params];
      this._router.navigate(link);
    }
    
    saveProject() {
        if(this.selectedProject.isDirty) {
            this.saveProjectError = null;
            this.savingProject = true;
            this._genotypingProjectService.updateProject(this.selectedProject).subscribe(
                (project) => {
                    this.selectedProject.copyFromObj(project);
                },
                err => toastr.error(err),
                () => this.savingProject = false
            )
        }
    }
    
    deleteProject() {
        this.deleteProjectError = null;
        this.deletingProject = true;
        this._genotypingProjectService.deleteProject(this.selectedProject.id).subscribe(
            () => this.goToLink('GenotypingProjectList'),
            err => toastr.error(err),
            () => this.deletingProject = false
        )
    }

    getAlleles() {
        if(!this.gettingAlleles) {
            this.gettingAlleles = true;
            this._genotypingProjectService.getAlleles(this.selectedProject.id).subscribe(
                null,
                err => toastr.error(err),
                () => this.gettingAlleles = false
            )
        }
    }
    
    getDominantAlleles() {
        if(!this.gettingAlleles) {
            this.gettingAlleles = true;
            this._genotypingProjectService.getDominantAlleles(this.selectedProject.id).subscribe(
                null,
                err => toastr.error(err),
                () => this.gettingAlleles = false
            )
        }
    }

    
    
    onChanged(e) {
        this.selectedProject.isDirty = true;
    }
    
    ngOnInit() {
        this.getProject();
    }
}