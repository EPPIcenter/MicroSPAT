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

import { Component, OnInit, ViewChild } from '@angular/core';
import { RouteParams, Router } from '@angular/router-deprecated';
import { FORM_DIRECTIVES } from '@angular/common';

import { LocusPipe } from '../../../pipes/locus.pipe';
import { SectionHeaderComponent } from '../../layout/section-header.component';
import { ProgressBarComponent } from '../../layout/progress-bar.component';

import { LocusParametersListComponent } from '../../project/locus-parameters-list.component';
import { CommonLocusParametersDetailComponent } from '../../project/common-locus-parameters-detail.component';

import { Bin } from '../../../services/bin-estimator-project/locus-bin-set/bin/bin.model';
import { BinEstimatorProject } from '../../../services/bin-estimator-project/bin-estimator-project.model';
import { BinEstimatorProjectService } from '../../../services/bin-estimator-project/bin-estimator-project.service';

import { GenotypingProjectService } from '../../../services/genotyping-project/genotyping-project.service';

import { Locus } from '../../../services/locus/locus.model';
import { LocusService } from '../../../services/locus/locus.service';
import { ChannelAnnotation } from '../../../services/project/channel-annotation/channel-annotation.model';

import { ArtifactEstimatorProject } from '../../../services/artifact-estimator-project/artifact-estimator-project.model';
import { ArtifactEstimatorProjectService } from '../../../services/artifact-estimator-project/artifact-estimator-project.service';
import { ArtifactEstimatorLocusParameters } from '../../../services/artifact-estimator-project/locus-parameters/artifact-estimator-locus-parameters.model';
import { ArtifactEstimator } from '../../../services/artifact-estimator-project/locus-artifact-estimator/artifact-estimator/artifact-estimator.model';
import { ArtifactEquationParameterSet } from '../../../services/artifact-estimator-project/locus-artifact-estimator/artifact-estimator/artifact-equation/artifact-equation-parameter-set.model';

import { D3ArtifactEstimatorPanel } from '../locus-artifact-estimator/d3-artifact-estimator-panel.component';

@Component({
    selector: 'pm-artifact-estimator-locus-list',
    pipes: [LocusPipe],
    template: `
    <pm-section-header [header]="header" [navItems]="navItems"></pm-section-header>
    <div class="row">
        <div  class="col-sm-4">
                <div class="panel panel-default">
                    <div class="panel-heading">
                        <h3 *ngIf="selectedLocusParameter" class="panel-title">{{selectedLocusParameter.locus_id | locus | async}} Parameters</h3>
                        <h3 *ngIf="!selectedLocusParameter" class="panel-title">Select a Locus</h3>
                    </div>
                    <div class="panel-body">
                        <pm-locus-parameter-list [(locusParameters)]="locusParameters" (locusClicked)="selectLocus($event)">
                        </pm-locus-parameter-list>
                        <form *ngIf="selectedLocusParameter">
                            <pm-common-locus-parameter-detail [(locusParameter)]="selectedLocusParameter"></pm-common-locus-parameter-detail>
                            <div class="row">
                                <div class="col-sm-12">
                                    <h4>Artifact Estimator Settings</h4>
                                    <div class="col-sm-6">
                                        <div class="form-group">
                                            <label>Max Secondary Relative Peak Height</label>
                                            <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" max="1" [(ngModel)]="selectedLocusParameter.max_secondary_relative_peak_height">
                                        </div>
                                        <div class="form-group">
                                            <label>Min Artifact Peak Frequency</label>
                                            <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="selectedLocusParameter.min_artifact_peak_frequency">
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button type="submit" class="btn btn-default" (click)="saveLocusParams(selectedLocusParameter)" [ngClass]="{disabled: isSubmitting}">Save and Analyze</button>
                        </form>
                        <br>
                        <div>
                            <pm-progress-bar *ngIf="isSubmitting" [fullLabel]="'Saving and Analyzing Locus... This May Take A While'"></pm-progress-bar>
                        </div>
                    </div>
                </div>
        </div>
        <div *ngIf="selectedLocus && artifactEstimators.length > 0" class="col-sm-8">
            <div class="row">
                <div class="panel panel-default">
                    <div class="panel-heading">
                        <h3 class="panel-title">{{selectedLocusParameter.locus_id | locus | async}} Artifact Estimator</h3>
                    </div>
                    <div class="panel-body">
                        <div *ngIf="selectedArtifactEstimator" style="height: 35vh">
                            <pm-d3-artifact-estimator-panel [(bins)]="selectedBins" [(locus)]="selectedLocus" [(artifactEstimator)]="selectedArtifactEstimator"></pm-d3-artifact-estimator-panel>
                        </div>
                        <div *ngIf="loadingEstimators">
                            <pm-progress-bar [label]="'Artifact Estimators'"></pm-progress-bar>
                        </div>
                        <div *ngIf="!loadingEstimators">
                            <form>
                                <div class="row">
                                    <div class="form-group col-sm-3">
                                        <label>Artifact Distance</label>
                                        <select (change)="selectArtifactEstimator($event)" class="form-control">
                                            <option *ngFor="let artifactEstimator of artifactEstimators" value={{artifactEstimator.id}}>{{artifactEstimator.label}}     {{artifactEstimator.peak_data.length}}</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="col-sm-12">
                                        <button class="btn btn-warning" (click)="deleteArtifactEstimator()">Delete Estimator</button>
                                        <button class="btn btn-warning" (click)="clearBreakpoints()">Clear Breakpoints</button>
                                        <button class="btn btn-info" (click)="recalculateArtifactEquations()">Recalculate Equations</button>
                                        <div *ngIf="deletingEstimator">
                                            <pm-progress-bar [fullLabel]="'Deleting Estimator...'"></pm-progress-bar>
                                        </div>
                                    </div>
                                </div>
                            </form>
                            <br>
                            <div *ngIf="selectedArtifactEstimator">
                                <div *ngFor="let ae of selectedArtifactEstimator.artifact_equations">
                                    <div class="panel panel-primary">
                                        <div class="panel-body">
                                            <div class="col-sm-4">
                                                <h5>Start Size: <small>{{ae.start_size | number}}</small></h5>
                                                <h5>End Size: <small>{{ae.end_size | number}}</small></h5>
                                            </div>
                                            <div class="col-sm-4">
                                                <h5>Slope: <small>{{ae.slope | number}}</small></h5>
                                                <h5>Intercept: <small>{{ae.intercept | number}}</small></h5>
                                            </div>
                                            <div class="col-sm-4">
                                                <div class="form-group">
                                                <label>Method</label>
                                                <select [(ngModel)]="ae.method" required class="form-control">
                                                    <option value="LSR">LSR</option>
                                                    <option value="TSR">TSR</option>
                                                    <option value="RANSAC">RANSAC</option>
                                                    <option value="no_slope">No Slope</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    </div>
    `,
    directives: [SectionHeaderComponent, LocusParametersListComponent, CommonLocusParametersDetailComponent, D3ArtifactEstimatorPanel, FORM_DIRECTIVES, ProgressBarComponent]
})
export class ArtifactEstimatorLocusListComponent implements OnInit {
    private selectedProject: ArtifactEstimatorProject;
    private selectedBinEstimator: BinEstimatorProject;
    private locusParameters: ArtifactEstimatorLocusParameters[] = [];
    private selectedLocusParameter: ArtifactEstimatorLocusParameters;
    private selectedLocus: Locus;
    private selectedBins: Bin[];
    // private selectedLocusChannelAnnotations: ChannelAnnotation[];
    private artifactEstimators: ArtifactEstimator[] = [];
    private selectedArtifactEstimator: ArtifactEstimator;
    private errorMessage: string;
    private isSubmitting: boolean = false;
    private selectingLocus: boolean = false;

    private loadingEstimators = false;
    private deletingEstimator = false;

    private static possibleMethods = ['TSR', 'LSR', 'RANSAC', 'no_slope'];
    
    private navItems
    private header;

    private method_names = {
        TSR: 'TSR',
        LSR: 'LSR',
        RANSAC: 'RANSAC',
        no_slope: 'No Slope'
    }

    @ViewChild(D3ArtifactEstimatorPanel) artEstimatorPanel: D3ArtifactEstimatorPanel;
    
    constructor(
        private _genotypingProjectService: GenotypingProjectService,
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
            .map(project => {
                    this.selectedProject = project;
                    this.initNav();
                    this.loadLocusParameters();
                    this.header = this.selectedProject.title + " Loci"
                    return project;
            })
            .concatMap(this.getBinEstimator)
            .subscribe(
                binEstimator => this.selectedBinEstimator = <BinEstimatorProject> binEstimator,
                err => this.errorMessage = err
            )
    }

    private initNav() {
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
        if(!this.isSubmitting && !this.selectingLocus) {
            this.selectedLocus = null;
            this.selectedLocusParameter = null;
            this.selectedBins = null;
            this.selectedArtifactEstimator = null;
            this.artifactEstimators = [];            
            if(locus_id != -1) {
                this.loadingEstimators = true;
                this.selectingLocus = true;
                this._locusService.getLocus(locus_id).subscribe(
                    locus => {
                        this.selectedLocus = locus;
                        this.selectedLocusParameter = this.selectedProject.locus_parameters.get(locus_id);
                        if(this.selectedBinEstimator.locus_bin_sets.has(this.selectedLocus.id)) {
                            let tmp_bins = [];
                            this.selectedBinEstimator.locus_bin_sets.get(this.selectedLocus.id).bins.forEach((bin) => {
                                tmp_bins.push(bin);
                            })
                            this.selectedBins = tmp_bins;
                        }
                        
                        if(this.selectedProject.locus_artifact_estimators.has(this.selectedLocus.id)) {
                            this.artifactEstimators = this.selectedProject.locus_artifact_estimators.get(this.selectedLocus.id).artifact_estimators;
                            if(this.artifactEstimators) {
                                this.selectedArtifactEstimator = this.artifactEstimators[0];
                            }
                        }
                    },
                    err => this.errorMessage = err,
                    () => {
                        this.loadingEstimators = false;
                        this.selectingLocus = false;
                    }
                )
            } else {
                let lp = new ArtifactEstimatorLocusParameters();
                lp.initialize();
                this.selectedLocusParameter = lp;
            }   
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

    private recalculateArtifactEquations() {
        if(!this.isSubmitting) {
            let artifact_equations = this.selectedArtifactEstimator.artifact_equations
            console.log(this.selectedArtifactEstimator);
            this.isSubmitting = true;
            let artifact_equation_parameter_sets = artifact_equations.map((ae) => {
                console.log(ae);
                let p: ArtifactEquationParameterSet = {
                    start_size: ae.start_size,
                    end_size: ae.end_size,
                    method: ae.method
                }
                return p;
            })
            console.log(artifact_equation_parameter_sets);
            this._artifactEstimatorProjectService.recalculateArtifactEquations(this.selectedArtifactEstimator.id, artifact_equation_parameter_sets)
                .subscribe(
                    aes => {
                        this.selectLocus(this.selectedLocus.id);
                        let selected_estimator = this.artifactEstimators.filter(estimator => {
                            return estimator.id === aes.id;
                        })[0];
                        selected_estimator.copyFromObj(aes);
                        this.selectedArtifactEstimator = selected_estimator;
                        this.artEstimatorPanel.rerender();
                        toastr.success("Artifact Equations Recalculated");
                    },
                    err => {
                        this.errorMessage = err;
                    },
                    () => {
                        this.isSubmitting = false;
                        console.log("FINALLY");
                    }
                )

        }
    }
    
    private saveLocusParams(locusParameter: ArtifactEstimatorLocusParameters) {
        if(!this.isSubmitting) {
            this.isSubmitting = true;
            if(locusParameter.id) {
                this._artifactEstimatorProjectService.saveLocusParameters(locusParameter).subscribe(
                    (locusParam: ArtifactEstimatorLocusParameters) => {
                        this._artifactEstimatorProjectService.clearCache(locusParam.project_id);
                        this._artifactEstimatorProjectService.getArtifactEstimatorProject(locusParam.project_id)
                            .subscribe(proj => {
                                this._genotypingProjectService.artifactEstimatorChanged(proj.id);
                                this.selectedProject = proj;
                                this.loadLocusParameters();
                                this.selectedLocusParameter = locusParam;
                                this.selectLocus(locusParam.locus_id);
                                toastr.success("Parameters Saved");
                            })
                    },
                    error => {
                        this.errorMessage = error;
                    }, 
                    () => {
                        this.isSubmitting = false;
                    }
                )
            } else {
                this._artifactEstimatorProjectService.batchApplyLocusParameters(locusParameter, this.selectedProject.id).subscribe(
                    () => {
                        this._artifactEstimatorProjectService.clearCache(this.selectedProject.id)
                        this._artifactEstimatorProjectService.getArtifactEstimatorProject(this.selectedProject.id)
                            .subscribe(proj => {
                                this._genotypingProjectService.artifactEstimatorChanged(proj.id);
                                this.selectedProject = proj;
                                this.loadLocusParameters();
                                toastr.success("Parameters Saved");
                                })
                        },
                        error => {
                            this.errorMessage = error;
                        }, 
                        () => {
                            this.isSubmitting = false;
                        }
                )
            }
        }
        
    }
    
    private deleteArtifactEstimator() {
        if(!this.deletingEstimator) {
            this.deletingEstimator = true;
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
                    toastr.success("Artifact Estimator Deleted");
                },
                err => toastr.error(err),
                () => this.deletingEstimator = false
            )
        }
    }
    
    private clearBreakpoints() {
        if(!this.isSubmitting) {
            this._artifactEstimatorProjectService.clearArtifactEstimatorBreakpoints(this.selectedArtifactEstimator.id)
                .subscribe(
                    aes => {
                        this.selectLocus(this.selectedLocus.id);
                        let selected_estimator = this.artifactEstimators.filter(estimator => {
                            return estimator.id === aes.id;
                        })[0];
                        selected_estimator.copyFromObj(aes);
                        this.selectedArtifactEstimator = selected_estimator;
                        this.artEstimatorPanel.rerender();
                        toastr.success("Breakpoints Cleared");
                        // this.selectedArtifactEstimator = aes;
                    },
                    err => this.errorMessage = err
                ),
                () => {
                    this.isSubmitting = false;
                }
        }
        
    }
    
    onChanged(e) {
        this.selectedLocusParameter.isDirty = true
    }
    
    ngOnInit() {
        this.getProject();
    }
    
}

