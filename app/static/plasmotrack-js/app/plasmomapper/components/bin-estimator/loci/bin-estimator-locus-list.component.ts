import { Component, OnInit } from '@angular/core';
import { RouteParams, Router } from '@angular/router-deprecated';

import { LocusPipe } from '../../../pipes/locus.pipe';

import { SectionHeaderComponent } from '../../layout/section-header.component';
import { ProgressBarComponent } from '../../layout/progress-bar.component';

import { LocusParametersListComponent } from '../../project/locus-parameters-list.component';
import { CommonLocusParametersDetailComponent } from '../../project/common-locus-parameters-detail.component';
import { LocusParametersDetailComponent } from '../../project/locus-parameters-detail.component';

import { D3BinEstimatorPlot } from '../locus-bin/d3-bin-plot.component';

import { GenotypingProjectService } from '../../../services/genotyping-project/genotyping-project.service';
import { ArtifactEstimatorProjectService } from '../../../services/artifact-estimator-project/artifact-estimator-project.service';

import { Bar } from '../../d3/bar.model';

import { Bin } from '../../../services/bin-estimator-project/locus-bin-set/bin/bin.model';
import { Locus } from '../../../services/locus/locus.model';
import { LocusService } from '../../../services/locus/locus.service';
import { BinEstimatorLocusParameters } from '../../../services/bin-estimator-project/locus-parameters/bin-estimator-locus-parameters.model'
import { ChannelAnnotation } from '../../../services/project/channel-annotation/channel-annotation.model';

import { BinEstimatorProject } from '../../../services/bin-estimator-project/bin-estimator-project.model';
import { BinEstimatorProjectService } from '../../../services/bin-estimator-project/bin-estimator-project.service';

@Component({
    selector: 'pm-bin-estimator-locus-list',
    pipes: [LocusPipe],
    template: `
    <pm-section-header [header]="header" [navItems]="navItems"></pm-section-header>
    <div class="row">
        <div class="col-sm-4">
            <div class="panel panel-default">
                <div (click)="locusParamsCollapsed = !locusParamsCollapsed" class="panel-heading">
                    <div *ngIf="selectedLocusParameter" class="h3 panel-title">
                        <span>{{selectedLocusParameter.locus_id | locus | async}}</span>
                        <span *ngIf="locusParamsCollapsed" class="glyphicon glyphicon-menu-right pull-right"></span>
                        <span *ngIf="!locusParamsCollapsed" class="glyphicon glyphicon-menu-down pull-right"></span>
                    </div>
                    <div *ngIf="!selectedLocusParameter" class="h3 panel-title">
                        <span>Select a Locus</span>
                    </div>
                </div>
                <div *ngIf="!locusParamsCollapsed" class="panel-body">
                    <pm-locus-parameter-list class="list-panel" [(locusParameters)]="locusParameters" (locusClicked)="selectLocus($event)">
                    </pm-locus-parameter-list>
                    <form *ngIf="selectedLocusParameter">
                        <pm-common-locus-parameter-detail [(locusParameter)]="selectedLocusParameter"></pm-common-locus-parameter-detail>
                        <div class="row">
                            <div class="col-sm-12">
                                <h4>Bin Estimator Settings</h4>
                                <div class="col-sm-6">
                                    <div class="form-group">
                                        <label>Min. Peak Frequency</label>
                                        <input class="form-control input-sm" (change)="locusParamsChanged()" type="number" required step="1" min="1" [(ngModel)]="selectedLocusParameter.min_peak_frequency">
                                    </div>
                                    <div class="form-group">
                                        <label>Default Bin Buffer</label>
                                        <input class="form-control input-sm" (change)="locusParamsChanged()" type="number" required step="any" [(ngModel)]="selectedLocusParameter.default_bin_buffer">
                                    </div>
                                </div>
                            </div>
                        </div>
                        <button type="submit" class="btn btn-default" (click)="saveLocusParams(selectedLocusParameter)" [ngClass]="{disabled: isSubmitting}">Save and Analyze</button>
                    </form>
                    <br>
                    <div>
                        <pm-progress-bar *ngIf="isSubmitting" [fullLabel]="'Saving and Analyzing Locus... This May Take A While'"></pm-progress-bar>
                        <pm-progress-bar *ngIf="savingBins" [fullLabel]="'Saving Bins... This May Take A While'"></pm-progress-bar>
                    </div>
                </div>
            </div>
        </div>
        <div *ngIf="selectedLocusChannelAnnotations && selectedLocus" class="col-sm-8">
            <pm-d3-bin-estimator-locus-plot (binsSaved)="saveBins($event)" [(project)]="selectedProject" [(bins)]="selectedBins" [(locus)]="selectedLocus" [(annotations)]="selectedLocusChannelAnnotations"></pm-d3-bin-estimator-locus-plot>
        </div>
    </div>
    `,
    directives: [SectionHeaderComponent, LocusParametersListComponent, LocusParametersDetailComponent, D3BinEstimatorPlot, CommonLocusParametersDetailComponent, ProgressBarComponent]
})
export class BinEstimatorLocusListComponent {
    private selectedProject: BinEstimatorProject;
    private locusParameters: BinEstimatorLocusParameters[] = [];
    private selectedLocusParameter: BinEstimatorLocusParameters;
    private selectedLocus: Locus;
    private selectedLocusChannelAnnotations: ChannelAnnotation[] = [];
    private selectedBins: Bin[];
    private errorMessage: string;

    private isSubmitting: boolean = false;
    private selectingLocus: boolean = false;
    private savingBins: boolean = false;

    private locusParamsCollapsed = false;
    
    private navItems;
    private header;
    
    constructor(
        private _binEstimatorProjectService: BinEstimatorProjectService,
        private _artifactEstimatorProjectService: ArtifactEstimatorProjectService,
        private _genotypingProjectService: GenotypingProjectService,
        private _routeParams: RouteParams,
        private _router: Router,
        private _locusService: LocusService
    ){}
    
    getProject() {
        let id = +this._routeParams.get('project_id');
        this._binEstimatorProjectService.getBinEstimatorProject(id)
            .subscribe(
                proj => {
                    this.selectedProject = proj;
                    this.loadLocusParameters();
                    this.initNav();
                    
                    this.header = this.selectedProject.title + " Loci"
                }
            )
    }

    private initNav() {
        this.navItems = [
                        {
                            label: 'Details',
                            click: () => this.goToLink('BinEstimatorDetail', {project_id: this.selectedProject.id}),
                            active: false
                        },
                        {
                            label: 'Loci',
                            click: () => this.goToLink('BinEstimatorLocusList', {project_id: this.selectedProject.id}),
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
    
    private getLocusChannelAnnotations(){
        this._binEstimatorProjectService.getLocusChannelAnnotations(this.selectedLocusParameter.project_id, this.selectedLocusParameter.locus_id)
            .subscribe(
                channel_annotations => {                    
                    this.selectedLocusChannelAnnotations = channel_annotations;
                },
                err => this.errorMessage = err
            )
    }
    
    private selectLocus(locus_id: number) {
        // this.selectedLocus = null;
        if(!this.isSubmitting && !this.selectingLocus) {
            this.selectedLocusParameter = null;
            this.selectedLocusChannelAnnotations = [];
            this.selectedBins = [];
            this.selectedLocus = null;
            if(locus_id != -1) {
                this.selectingLocus = true;
                this._locusService.getLocus(locus_id).subscribe(
                    locus => {
                        this.selectedLocus = locus;
                        this.selectedLocusParameter = this.selectedProject.locus_parameters.get(locus_id);
                        if(this.selectedProject.locus_bin_sets.has(this.selectedLocus.id)){
                            this.selectedProject.locus_bin_sets.get(this.selectedLocus.id).bins.forEach((bin) => {
                                console.log(bin);
                                this.selectedBins.push(bin);
                            });
                        }
                        this.getLocusChannelAnnotations();
                    },
                    err => this.errorMessage = err,
                    () => {
                        this.selectingLocus = false;
                    }
                )
            } else {
                let lp = new BinEstimatorLocusParameters();
                lp.initialize();
                this.selectedLocusParameter = lp;
            }
        }
       
    }
    
    private locusParamsSaved() {
        this.getLocusChannelAnnotations();
    }
    
    private locusParamsChanged() {
        this.selectedLocusParameter.isDirty = true;
    }
    
    private saveLocusParams(locusParameter: BinEstimatorLocusParameters) {
        if(!this.isSubmitting && !this.selectingLocus) {
            this.isSubmitting = true;
            if(locusParameter.id) {
                this._binEstimatorProjectService.saveLocusParameters(locusParameter).subscribe(
                    (locusParam: BinEstimatorLocusParameters) => {
                        this._binEstimatorProjectService.clearCache(locusParam.project_id);
                        this._binEstimatorProjectService.getBinEstimatorProject(locusParam.project_id)
                            .subscribe(
                                proj => {
                                    this._genotypingProjectService.binEstimatorChanged(proj.id);
                                    this._artifactEstimatorProjectService.binEstimatorChanged(proj.id);
                                    this.selectedProject = proj;
                                    this.loadLocusParameters();
                                    this.selectedLocusParameter = locusParam;
                                    this.selectLocus(locusParam.locus_id);
                                },
                                err => {
                                    throw err;
                                }
                            )
                    },
                    (error) => {
                        this.errorMessage = error
                    },
                    () => {
                        this.isSubmitting = false;
                    }
                )
            } else {
                this._binEstimatorProjectService.batchApplyLocusParameters(locusParameter, this.selectedProject.id).subscribe(
                    () => {
                        this._binEstimatorProjectService.clearCache(this.selectedProject.id);
                        this._binEstimatorProjectService.getBinEstimatorProject(this.selectedProject.id)
                            .subscribe(
                                proj => {
                                    this._genotypingProjectService.binEstimatorChanged(proj.id);
                                    this._artifactEstimatorProjectService.binEstimatorChanged(proj.id);
                                    this.selectedProject = proj;
                                    this.loadLocusParameters();
                                }
                            ),
                            err => {
                                toastr.error(err);
                            }
                    },
                    err => {
                        toastr.error(err);
                    },
                    () => {
                        this.isSubmitting = false;
                    }
                )
            }
            
        }
    }

    private saveBins(bins) {
        if(!this.savingBins) {
            this.savingBins = true;
            this.selectedBins = bins; 
            this._binEstimatorProjectService.createOrUpdateBins(this.selectedProject, this.selectedLocus.id, this.selectedBins, "Bins Saved")
                .subscribe(res => {
                    this._binEstimatorProjectService.clearCache(this.selectedProject.id);
                    this._binEstimatorProjectService.getBinEstimatorProject(this.selectedProject.id)
                        .subscribe(
                            proj => {
                                let locusParam = this.selectedLocusParameter;
                                this._genotypingProjectService.binEstimatorChanged(proj.id);
                                this._artifactEstimatorProjectService.binEstimatorChanged(proj.id);
                                this.selectedProject = proj;
                                this.loadLocusParameters();
                                this.selectedLocusParameter = this.locusParameters.filter((lps) => {
                                    return lps.id === locusParam.id;
                                })[0];
                                this.selectLocus(locusParam.locus_id);
                            },
                            err => {
                                throw err;
                            },
                            () => {
                                this.savingBins = false;
                            }
                    )
            });
        }

    }

    ngOnInit() {
        this.getProject();
    }
}