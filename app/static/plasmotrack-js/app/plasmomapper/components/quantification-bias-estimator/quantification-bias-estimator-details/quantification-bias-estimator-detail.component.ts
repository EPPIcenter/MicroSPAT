import { Component, OnInit } from '@angular/core';
import { RouteParams, Router } from '@angular/router-deprecated';

import { SectionHeaderComponent } from '../../layout/section-header.component';
import { ProgressBarComponent } from '../../layout/progress-bar.component';

import { QuantificationBiasEstimatorProject } from '../../../services/quantification-bias-estimator-project/quantification-bias-estimator-project.model';
import { QuantificationBiasEstimatorProjectService } from '../../../services/quantification-bias-estimator-project/quantification-bias-estimator-project.service';

import { BinEstimatorProjectService } from '../../../services/bin-estimator-project/bin-estimator-project.service';


@Component({
    selector: 'pm-quantification-bias-estimator-detail',
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
                <button type="submit" class="btn btn-default" [ngClass]="{disabled: !selectedProject.isDirty}" (click)="saveProject()">Save</button>
                <button class="btn btn-warning" (click)="deleteProject()">Delete</button>
                <pm-progress-bar *ngIf="savingProject" [fullLabel]="'Saving Project...'"></pm-progress-bar>
                <pm-progress-bar *ngIf="deletingProject" [fullLabel]="'Deleting Project...'"></pm-progress-bar>
            </form>
        </div>
    </div>
    `,
    styleUrls: ['app/plasmomapper/styles/forms.css'],
    directives: [SectionHeaderComponent, ProgressBarComponent]
})
export class QuantificationBiasEstimatorProjectDetailComponent implements OnInit {
    private navItems;
    private navHeader: string;
    private deletingProject = false;
    private savingProject = false;

    private selectedProject: QuantificationBiasEstimatorProject;

    constructor(
        private _quantificationBiasEstimatorProjectService: QuantificationBiasEstimatorProjectService,
        private _routeParams: RouteParams,
        private _router: Router,
        private _binService: BinEstimatorProjectService
    ){
        console.log("BIN ESTIMATOR SERVICE", this._binService)
    }

    getProject() {
        this._quantificationBiasEstimatorProjectService.getProject(+this._routeParams.get('project_id')).subscribe(
            project => {
                this.selectedProject = project;
                this.navHeader = this.selectedProject.title + " Details";
                this.navItems = [
                    {
                        label: 'Details',
                        click: () => this.goToLink('QuantificationBiasEstimatorProjectDetail', {project_id: this.selectedProject.id}),
                        active: true
                    },
                    {
                        label: 'Samples',
                        click: () => this.goToLink('QuantificationBiasEstimatorProjectSampleList', {project_id: this.selectedProject.id}),
                        active: false
                    },
                    {
                        label: 'Loci',
                        click: () => this.goToLink('QuantificationBiasEstimatorProjectLocusList', {project_id: this.selectedProject.id}),
                        active: false
                    }
                ]
            }
        )
    }

    private goToLink(dest: String, params?: Object) {
      let link = [dest, params];
      this._router.navigate(link);
    }

    saveProject() {
        if(this.selectedProject.isDirty) {
            this.savingProject = true;
            this._quantificationBiasEstimatorProjectService.updateProject(this.selectedProject).subscribe(
                project => {
                    this.selectedProject.copyFromObj(project);
                },
                err => toastr.error(err),
                () => this.savingProject = false
            )
        }
    }

    deleteProject() {
        this.deletingProject = true;
        this._quantificationBiasEstimatorProjectService.deleteProject(this.selectedProject.id).subscribe(
            () => this.goToLink('GenotypingProjectList'),
            err => toastr.error(err),
            () => this.deletingProject = false
        )
    }

    onChanged(e) {
        this.selectedProject.isDirty = true;
    }
    
    ngOnInit() {
        this.getProject();
    }
}