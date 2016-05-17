import { Component, OnInit } from 'angular2/core';
import { RouteParams, Router } from 'angular2/router';

import { LocusPipe } from '../../../pipes/locus.pipe';

import { SectionHeaderComponent } from '../../layout/section-header.component';

import { LocusParametersListComponent } from '../../project/locus-parameters-list.component';
import { CommonLocusParametersDetailComponent } from '../../project/common-locus-parameters-detail.component';
import { LocusParametersDetailComponent } from '../../project/locus-parameters-detail.component';

import { D3BinEstimatorPlot } from '../locus-bin/d3-bin-plot.component';

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
        <div *ngIf="selectedProject" class="col-sm-1">
            <pm-locus-parameter-list class="list-panel" [(locusParameters)]="locusParameters" (locusClicked)="selectLocus($event)">
            </pm-locus-parameter-list>
        </div>
        <div *ngIf="selectedLocusParameter" class="col-sm-4">
            <div class="row">
                <div class="panel panel-default">
                    <div (click)="locusParamsCollapsed = !locusParamsCollapsed" class="panel-heading">
                        <div class="h3 panel-title">
                            <span>{{selectedLocusParameter.locus_id | locus | async}}</span>
                            <span *ngIf="locusParamsCollapsed" class="glyphicon glyphicon-menu-right pull-right"></span>
                            <span *ngIf="!locusParamsCollapsed" class="glyphicon glyphicon-menu-down pull-right"></span>
                        </div>
                    </div>
                    <div *ngIf="!locusParamsCollapsed" class="panel-body">
                        <form (ngSubmit)="saveLocusParams(selectedLocusParameter.locus_id)">
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
                            <button type="submit" class="btn btn-default" [ngClass]="{disabled: isSubmitting}">Save and Analyze</button>
                            <span *ngIf="isSubmitting" class="label label-info">Saving and Analyzing Locus...This May Take A While...</span>
                        </form>
                    </div>
                </div>
            </div>
        </div>
        <div *ngIf="selectedLocusChannelAnnotations" class="col-sm-7" style="height: 35vh">
            <pm-d3-bin-estimator-locus-plot [(bins)]="selectedBins" [(locus)]="selectedLocus" [(annotations)]="selectedLocusChannelAnnotations"></pm-d3-bin-estimator-locus-plot>
        </div>
    </div>
    `,
    directives: [SectionHeaderComponent, LocusParametersListComponent, LocusParametersDetailComponent, D3BinEstimatorPlot, CommonLocusParametersDetailComponent]
})
export class BinEstimatorLocusListComponent {
    private selectedProject: BinEstimatorProject;
    private locusParameters: BinEstimatorLocusParameters[] = [];
    private selectedLocusParameter: BinEstimatorLocusParameters;
    private selectedLocus: Locus;
    private selectedLocusChannelAnnotations: ChannelAnnotation[];
    private selectedBins: Bin[];
    private errorMessage: string;
    private isSubmitting: boolean = false;

    private locusParamsCollapsed = false;
    
    private navItems;
    private header;
    
    constructor(
        private _binEstimatorProjectService: BinEstimatorProjectService,
        private _routeParams: RouteParams,
        private _router: Router,
        private _locusService: LocusService
    ){}
    
    getProject() {
        let id = +this._routeParams.get('project_id');
        this._binEstimatorProjectService.getBinEstimatorProject(id)
            .subscribe(
                proj => {
                    console.log(proj);
                    
                    this.selectedProject = proj;
                    this.loadLocusParameters();
                    
                    this.header = this.selectedProject.title + " Loci"
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
    
    private getLocusChannelAnnotations(){
        this._binEstimatorProjectService.getLocusChannelAnnotations(this.selectedLocusParameter.project_id, this.selectedLocusParameter.locus_id)
            .subscribe(
                channel_annotations => {
                    console.log(channel_annotations);                    
                    this.selectedLocusChannelAnnotations = channel_annotations;
                },
                err => this.errorMessage = err
            )
    }
    
    private selectLocus(locus_id: number) {
        this.selectedLocus = null;
        this.selectedLocusParameter = null;
        this.selectedBins = null;
        this.selectedLocusChannelAnnotations = null;
        if(!this.isSubmitting) {
            this._locusService.getLocus(locus_id).subscribe(
                locus => {
                    this.selectedLocus = locus;
                    this.selectedLocusParameter = this.selectedProject.locus_parameters.get(locus_id);
                    if(this.selectedProject.locus_bin_sets.has(this.selectedLocus.id)){
                        this.selectedBins = this.selectedProject.locus_bin_sets.get(this.selectedLocus.id).bins;
                    }
                    this.getLocusChannelAnnotations();
                },
                err => this.errorMessage = err
            )
            
        }
    }
    
    private locusParamsSaved() {
        this.getLocusChannelAnnotations();
    }
    
    private locusParamsChanged() {
        this.selectedLocusParameter.isDirty = true;
    }
    
    private saveLocusParams(id: number) {
        let locusParameter = this.selectedProject.locus_parameters.get(id);
        if(locusParameter.isDirty || locusParameter.filter_parameters_stale || locusParameter.scanning_parameters_stale) {
            console.log(locusParameter);
            this.isSubmitting = true;
            this._binEstimatorProjectService.saveLocusParameters(locusParameter).subscribe(
            (locusParam) => {
                this._binEstimatorProjectService.clearCache(locusParam.project_id);
                this.getProject();
                this.selectLocus(locusParam.locus_id);
                this.isSubmitting = false;
            },
            (error) => this.errorMessage = error
            )
        }
    }
    
    ngOnInit() {
        this.getProject();
    }
}