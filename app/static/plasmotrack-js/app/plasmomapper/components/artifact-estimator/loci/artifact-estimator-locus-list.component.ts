import { Component, OnInit } from '@angular/core';
import { RouteParams, Router } from '@angular/router-deprecated';
import { FORM_DIRECTIVES } from '@angular/common';

import { LocusPipe } from '../../../pipes/locus.pipe';
import { SectionHeaderComponent } from '../../layout/section-header.component';

import { LocusParametersListComponent } from '../../project/locus-parameters-list.component';
import { CommonLocusParametersDetailComponent } from '../../project/common-locus-parameters-detail.component';

import { Bin } from '../../../services/bin-estimator-project/locus-bin-set/bin/bin.model';
import { BinEstimatorProject } from '../../../services/bin-estimator-project/bin-estimator-project.model';
import { BinEstimatorProjectService } from '../../../services/bin-estimator-project/bin-estimator-project.service';

import { Locus } from '../../../services/locus/locus.model';
import { LocusService } from '../../../services/locus/locus.service';
import { ChannelAnnotation } from '../../../services/project/channel-annotation/channel-annotation.model';

import { ArtifactEstimatorProject } from '../../../services/artifact-estimator-project/artifact-estimator-project.model';
import { ArtifactEstimatorProjectService } from '../../../services/artifact-estimator-project/artifact-estimator-project.service';
import { ArtifactEstimatorLocusParameters } from '../../../services/artifact-estimator-project/locus-parameters/artifact-estimator-locus-parameters.model';
import { ArtifactEstimator } from '../../../services/artifact-estimator-project/locus-artifact-estimator/artifact-estimator/artifact-estimator.model';

import { D3ArtifactEstimatorPanel } from '../locus-artifact-estimator/d3-artifact-estimator-panel.component';

@Component({
    selector: 'pm-artifact-estimator-locus-list',
    pipes: [LocusPipe],
    template: `
    <pm-section-header [header]="header" [navItems]="navItems"></pm-section-header>
    <div class="row">
        <div *ngIf="selectedProject" class="col-sm-1">
            <pm-locus-parameter-list class="list-panel" [(locusParameters)]="locusParameters" (locusClicked)="selectLocus($event)">
            </pm-locus-parameter-list>
        </div>
        <div *ngIf="selectedLocusParameter" class="col-sm-4">
                <div class="panel panel-default">
                    <div class="panel-heading">
                        <h3 class="panel-title">{{selectedLocusParameter.locus_id | locus | async}} Parameters</h3>
                    </div>
                    <div class="panel-body">
                        <form (ngSubmit)="saveLocusParams(selectedLocusParameter.locus_id)">
                            <pm-common-locus-parameter-detail [(locusParameter)]="selectedLocusParameter"></pm-common-locus-parameter-detail>
                            <div class="col-sm-6">
                                <h4>Artifact Estimator Settings</h4>
                                <div class="form-group">
                                    <label>Max Secondary Relative Peak Height</label>
                                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" max="1" [(ngModel)]="selectedLocusParameter.max_secondary_relative_peak_height">
                                </div>
                                <div class="form-group">
                                    <label>Min Artifact Peak Frequency</label>
                                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="selectedLocusParameter.min_artifact_peak_frequency">
                                </div>
                                <button type="submit" class="btn btn-default" [ngClass]="{disabled: isSubmitting}">Save and Analyze</button>
                            <span *ngIf="isSubmitting" class="label label-info">Saving and Analyzing Locus...This May Take A While...</span>
                            </div>
                        </form>
                    </div>
                </div>
        </div>
        <div *ngIf="selectedLocus" class="col-sm-6">
            <div *ngIf="selectedArtifactEstimator" class="row" style="height: 35vh">
                <pm-d3-artifact-estimator-panel [(bins)]="selectedBins" [(locus)]="selectedLocus" [(artifactEstimator)]="selectedArtifactEstimator"></pm-d3-artifact-estimator-panel>
            </div>
            <div class="row">
                <div class="panel panel-default">
                    <div class="panel-heading">
                        <h3 class="panel-title">Artifact Estimator</h3>
                    </div>
                    <div class="panel-body">
                        <div class="row">
                            <div class="form-group col-sm-3">
                                <label>Artifact Distance</label>
                                <select (change)="selectArtifactEstimator($event)" class="form-control">
                                    <option *ngFor="#artifactEstimator of artifactEstimators" value={{artifactEstimator.id}}>{{artifactEstimator.artifact_distance | number}}     {{artifactEstimator.peak_data.length}}</option>
                                </select>
                            </div>
                        </div>
                        <div class="row">
                            <div class="btn-group">
                                <button type="button" class="btn btn-warning" (click)="deleteArtifactEstimator()">Delete Estimator</button>
                                <button type="button" class="btn btn-warning" (click)="clearBreakpoints()">Clear Breakpoints</button>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    </div>
    `,
    directives: [SectionHeaderComponent, LocusParametersListComponent, CommonLocusParametersDetailComponent, D3ArtifactEstimatorPanel, FORM_DIRECTIVES]
})
export class ArtifactEstimatorLocusListComponent implements OnInit {
    private selectedProject: ArtifactEstimatorProject;
    private selectedBinEstimator: BinEstimatorProject;
    private locusParameters: ArtifactEstimatorLocusParameters[] = [];
    private selectedLocusParameter: ArtifactEstimatorLocusParameters;
    private selectedLocus: Locus;
    private selectedBins: Bin[];
    // private selectedLocusChannelAnnotations: ChannelAnnotation[];
    private artifactEstimators: ArtifactEstimator[];
    private selectedArtifactEstimator: ArtifactEstimator;
    private errorMessage: string;
    private isSubmitting: boolean = false;
    
    private navItems
    private header;
    
    constructor(
        private _artifactEstimatorProjectService: ArtifactEstimatorProjectService,
        private _binEstimatorProjectService: BinEstimatorProjectService,
        private _routeParams: RouteParams,
        private _router: Router,
        private _locusService: LocusService
    ){}
    
    private getBinEstimator = (proj: ArtifactEstimatorProject) => { 
        return this._binEstimatorProjectService.getBinEstimatorProject(proj.bin_estimator_id);
    }
    
    getProject() {
        let id = +this._routeParams.get('project_id');            
        this._artifactEstimatorProjectService.getArtifactEstimatorProject(id)
            .map(proj => {
                    this.selectedProject = proj;
                    this.loadLocusParameters();
                    this.header = this.selectedProject.title = " Loci"
                    this.navItems = [
                        {
                            label: 'Details',
                            click: () => this.goToLink('ArtifactEstimatorDetail', {project_id: this.selectedProject.id}),
                            active: false
                        },
                        {
                            label: 'Loci',
                            click: () => this.goToLink('ArtifactEstimatorLocusList', {project_id: this.selectedProject.id}),
                            active: true
                        }
                    ]
                    return proj;
            })
            .concatMap(this.getBinEstimator)
            .subscribe(
                binEstimator => this.selectedBinEstimator = <BinEstimatorProject> binEstimator,
                err => this.errorMessage = err
            )
    }
    
    private loadLocusParameters() {
        this.locusParameters = [];
        this.selectedProject.locus_parameters.forEach((locus_param, id) => {
            this.locusParameters.push(locus_param);
        });
    }
    
    private goToLink(dest: String, params: Object) {
        let link = [dest, params];
        this._router.navigate(link);
    }
    
    private selectLocus(locus_id: number) {
        this.selectedLocus = null;
        this.selectedLocusParameter = null;
        this.selectedBins = null;
        this.selectedArtifactEstimator = null;
        this.artifactEstimators = [];
        if(!this.isSubmitting) {
            this._locusService.getLocus(locus_id).subscribe(
                locus => {
                    this.selectedLocus = locus;
                    this.selectedLocusParameter = this.selectedProject.locus_parameters.get(locus_id);
                    if(this.selectedBinEstimator.locus_bin_sets.has(this.selectedLocus.id)) {
                        this.selectedBins = this.selectedBinEstimator.locus_bin_sets.get(this.selectedLocus.id).bins;
                    }
                    
                    if(this.selectedProject.locus_artifact_estimators.has(this.selectedLocus.id)) {
                        this.artifactEstimators = this.selectedProject.locus_artifact_estimators.get(this.selectedLocus.id).artifact_estimators;
                        if(this.artifactEstimators) {
                            this.selectedArtifactEstimator = this.artifactEstimators[0];
                        }
                    }
                },
                err => this.errorMessage = err
            )
            
        }
    }
    
    private selectArtifactEstimator(e) {
        let artifactEstimatorId = +e.target.value;
        this.artifactEstimators.forEach(artifactEstimator => {
            if(artifactEstimator.id == artifactEstimatorId) {
                this.selectedArtifactEstimator = artifactEstimator;
            }
        })
    }
    
    private saveLocusParams(id: number) {
        let locusParameter = this.selectedProject.locus_parameters.get(id);
        if(locusParameter.isDirty || locusParameter.filter_parameters_stale || locusParameter.scanning_parameters_stale) {
            this.isSubmitting = true;
            this._artifactEstimatorProjectService.saveLocusParameters(locusParameter).subscribe(
            locusParam => {
                this._artifactEstimatorProjectService.clearCache(locusParam.project_id);
                this.getProject();
                this.selectLocus(locusParam.locus_id);
                this.isSubmitting = false;
            },
            error => this.errorMessage = error
            )
        }
    }
    
    private deleteArtifactEstimator() {
        this._artifactEstimatorProjectService.deleteArtifactEstimator(this.selectedArtifactEstimator.id)
            .subscribe(
                () => {
                    let _ : ArtifactEstimator[] = [];
                    this.artifactEstimators.forEach((artifactEstimator, i) => {
                      if(artifactEstimator.id != this.selectedArtifactEstimator.id) {
                          _.push(artifactEstimator);
                      }
                    })
                    this.selectedProject.locus_artifact_estimators.get(this.selectedLocus.id).artifact_estimators = _;
                    this.artifactEstimators = _;
                    if(this.artifactEstimators.length > 0) {                        
                        this.selectedArtifactEstimator = this.artifactEstimators[0];
                    };
                },
                err => this.errorMessage = err
            )
    }
    
    private clearBreakpoints() {
        this._artifactEstimatorProjectService.clearArtifactEstimatorBreakpoints(this.selectedArtifactEstimator.id)
            .subscribe(
                aes => {
                    console.log(aes);
                    this.selectedArtifactEstimator.copyFromObj(aes);
                },
                err => this.errorMessage = err
            )
    }
    
    onChanged(e) {
        this.selectedLocusParameter.isDirty = true
    }
    
    ngOnInit() {
        this.getProject();
    }
    
}

