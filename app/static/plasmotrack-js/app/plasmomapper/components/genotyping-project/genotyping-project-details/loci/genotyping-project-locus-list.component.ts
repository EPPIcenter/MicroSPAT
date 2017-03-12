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

import { LocusPipe } from '../../../../pipes/locus.pipe';
import { SectionHeaderComponent } from '../../../layout/section-header.component'
import { ProgressBarComponent } from '../../../layout/progress-bar.component';

import { LocusParametersListComponent } from '../../../project/locus-parameters-list.component';
import { CommonLocusParametersDetailComponent } from '../../../project/common-locus-parameters-detail.component';

import { LocusParametersDetailComponent } from '../../../project/locus-parameters-detail.component';

import { GenotypingLocusParameters } from '../../../../services/genotyping-project/locus-parameters/genotyping-locus-parameters.model';
import { SampleLocusAnnotation } from '../../../../services/sample-based-project/sample-annotation/locus-annotation/sample-locus-annotation.model';
import { ChannelAnnotation } from '../../../../services/project/channel-annotation/channel-annotation.model';

import { GenotypingProject } from '../../../../services/genotyping-project/genotyping-project.model';
import { GenotypingProjectService } from '../../../../services/genotyping-project/genotyping-project.service';

import { Locus } from '../../../../services/locus/locus.model';
import { LocusService } from '../../../../services/locus/locus.service';

import { Bin } from '../../../../services/bin-estimator-project/locus-bin-set/bin/bin.model';
import { BinEstimatorProject } from '../../../../services/bin-estimator-project/bin-estimator-project.model';
import { BinEstimatorProjectService } from '../../../../services/bin-estimator-project/bin-estimator-project.service';
import { D3SampleAnnotationEditor } from '../../sample-annotation-editor.component';

interface AnnotationFilter {
    failures: boolean;
    offscale: boolean;
    out_of_bin: boolean;
    min_allele_count: number;
    max_allele_count: number;
    crosstalk: number;
    bleedthrough: number;
    main_min_peak_height: number;
    main_max_peak_height: number;
}


@Component({
    selector: 'genotyping-project-locus-list',
    pipes: [LocusPipe],
    host: {
        '(document:keydown)': 'eventHandler($event)'
    },
    template: `
        <pm-section-header [header]="header" [navItems]="navItems"></pm-section-header>
        <div class="row">
            <div class="col-sm-4">
                <div class="row">
                    <div class="col-sm-12">
                        <div class="panel panel-default">
                            <div (click)="locusParamsCollapsed = !locusParamsCollapsed" class="panel-heading">
                                <div *ngIf="selectedLocusParameter" class="h3 panel-title">
                                    <span>{{selectedLocusParameter.locus_id | locus | async}}</span> <span *ngIf="selectedLocusAnnotations"> | {{selectedLocusAnnotations.length}} Samples </span> <span *ngIf="failureRate"> | Failure Rate: {{failureRate | number}}</span>
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
                                            <h4>Genotyping Settings</h4>
                                            <div class="col-sm-6">
                                                <div class="form-group">
                                                    <label>Min Relative Peak Height</label>
                                                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" max="1" [(ngModel)]="selectedLocusParameter.relative_peak_height_limit">
                                                </div>
                                                <div class="form-group">
                                                    <label>Min Absolute Peak Height</label>
                                                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="selectedLocusParameter.absolute_peak_height_limit">
                                                </div>
                                                <div class="form-group">
                                                    <label>Bleedthrough Limit</label>
                                                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" [(ngModel)]="selectedLocusParameter.bleedthrough_filter_limit">
                                                </div>
                                                <div class="form-group">
                                                    <label>Crosstalk Limit</label>
                                                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" [(ngModel)]="selectedLocusParameter.crosstalk_filter_limit">
                                                </div>
                                                <div class="form-group">
                                                    <label>Failure Threshold</label>
                                                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="selectedLocusParameter.failure_threshold">
                                                </div>
                                            </div>                                
                                            <div class="col-sm-6">
                                                <div *ngIf="selectedProject.artifact_estimator_id" class="form-group">
                                                    <label>Soft Artifact SD Limit</label>
                                                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" [(ngModel)]="selectedLocusParameter.soft_artifact_sd_limit">
                                                </div>
                                                <div  *ngIf="selectedProject.artifact_estimator_id" class="form-group">
                                                    <label>Hard Artifact SD Limit</label>
                                                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" [(ngModel)]="selectedLocusParameter.hard_artifact_sd_limit">
                                                </div>
                                                <div class="form-group">
                                                    <label>Genotyping Probability Threshold</label>
                                                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" [(ngModel)]="selectedLocusParameter.probability_threshold">
                                                </div>
                                                <div class="form-group">
                                                    <label>Bootstrap Probability Threshold</label>
                                                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" [(ngModel)]="selectedLocusParameter.bootstrap_probability_threshold">
                                                </div>
                                                <div class="form-group">
                                                    <label>Offscale Threshold</label>
                                                    <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="selectedLocusParameter.offscale_threshold">
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
                                <div *ngIf="errorMessage" class="alert alert-danger" role="alert">{{errorMessage}}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-sm-12">
                    <div *ngIf="selectedLocusAnnotations" class="row">
                        <div class="panel panel-default">
                            <div class="panel-heading">
                                <div class="h3 panel-title">
                                    Annotations Filters
                                </div>
                            </div>
                            <div *ngIf="filters" class="panel-body">
                                <form>
                                    <div class="col-sm-6">
                                        <div class="form-group">
                                            <input type="checkbox" (change)="filters.offscale=false" [(ngModel)]="filters.failures"> Failures Only
                                        </div>
                                        <div class="form-group">
                                            <input type="checkbox" (change)="filters.failures=false" [(ngModel)]="filters.offscale"> Offscale Only
                                        </div>
                                        <div class="form-group">
                                            <input type="checkbox" (change)="filters.out_of_bin=false" [(ngModel)]="filters.out_of_bin"> Out Of Bin Peaks
                                        </div>
                                        <div class="form-group">
                                            <label>Crosstalk Limit</label>
                                            <input class="form-control" type="number" step="any" min=0 [(ngModel)]="filters.crosstalk" [disabled]="filters.failures || filters.offscale || filters.out_of_bin">
                                        </div>
                                        <div class="form-group">
                                            <label>Bleedthrough Limit</label>
                                            <input class="form-control" type="number" step="any" min=0 [(ngModel)]="filters.bleedthrough" [disabled]="filters.failures || filters.offscale || filters.out_of_bin">
                                        </div>
                                    </div>
                                    <div class="col-sm-6">
                                        <div class="form-group">
                                            <label>Min Allele Count</label>
                                            <input class="form-control" type="number" [(ngModel)]="filters.min_allele_count" [disabled]="filters.failures || filters.offscale">
                                        </div>
                                        <div class="form-group">
                                            <label>Max Allele Count</label>
                                            <input class="form-control" type="number" [(ngModel)]="filters.max_allele_count" [disabled]="filters.failures || filters.offscale">
                                        </div>
                                        <div class="form-group">
                                            <label>Min Main Peak Height</label>
                                            <input class="form-control" type="number" [(ngModel)]="filters.main_min_peak_height" [disabled]="filters.failures || filters.offscale">    
                                        </div>
                                        <div class="form-group">
                                            <label>Max Main Peak Height</label>
                                            <input class="form-control" type="number" [(ngModel)]="filters.main_max_peak_height" [disabled]="filters.failures || filters.offscale">
                                        </div>
                                    </div>
                                    <button class="btn btn-default" (click)="filterLocusAnnotations()">Filter Annotations</button>
                                    <button class="btn btn-default" (click)="clearFilter()">Clear Filter</button>
                                    <button class="btn btn-default" (click)="saveAnnotations()">Save Annotations</button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-sm-8">
                <div *ngIf="loadingLocusAnnotations">
                    <pm-progress-bar [fullLabel]="'Loading Samples'"></pm-progress-bar>
                </div>
                <div *ngIf="selectedLocusParameter && selectedLocusAnnotation && selectedSampleChannelAnnotations">
                    <div class="row">
                        <div class="col-sm-12">
                            <div class="panel panel-default">
                                <div class="panel-heading">
                                    <h3 *ngIf="selectedLocusAnnotation" class="panel-title">{{selectedProject.sample_annotations.get(selectedLocusAnnotation.sample_annotations_id).sample.barcode}}</h3>
                                </div>
                                <div *ngIf="selectedSampleChannelAnnotations" class="panel-body">
                                    <div id="channel_plot" style="height: 30vh">
                                        <div *ngFor="let channelAnnotation of selectedSampleChannelAnnotations">
                                            <pm-d3-sample-annotation-editor [channelAnnotation]="channelAnnotation" [locusAnnotation]="selectedLocusAnnotation" [bins]="selectedBins"></pm-d3-sample-annotation-editor>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div *ngIf="filteredLocusAnnotations" class="row">
                        <div class="col-sm-12">
                            <div class="panel panel-default">
                                <div class="panel-heading">
                                    <div class="h3 panel-title">
                                        <span>Filtered Annotations</span> <span *ngIf="filteredLocusAnnotations.length > 0"> | {{filteredLocusAnnotations.length}} Results </span> <span *ngIf="filteredLocusAnnotations.length > 0" class='pull-right'> {{filteredLocusAnnotationIndex + 1}} / {{filteredLocusAnnotations.length}} </span>
                                    </div>
                                </div>
                                <div class="panel-body">
                                    <div *ngIf="loadingAnnotations">
                                        <pm-progress-bar [label]="'Annotations'"></pm-progress-bar>
                                    </div>
                                    <div *ngIf="!loadingAnnotations" class="table-responsive" style="overflow: auto; height: 45vh">
                                        <table class="table table-striped table-hover table-condensed">
                                            <thead>
                                                <tr>
                                                    <th>Barcode</th>
                                                    <th># Alleles</th>
                                                    <th># Peaks</th>
                                                    <th>Offscale</th>
                                                    <th>Failure</th>
                                                    <th>Manual</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr [ngClass]="{success: annotation.id==selectedLocusAnnotation?.id, warning: annotation.isDirty}" *ngFor="let annotation of filteredLocusAnnotations; let i = index" (click)="filteredLocusAnnotationIndex = i; selectLocusAnnotation()">
                                                    <td>{{selectedProject.sample_annotations.get(annotation.sample_annotations_id).sample.barcode}}</td>
                                                    <td>{{countOf(annotation.alleles, true)}}</td>
                                                    <td>{{annotation.annotated_peaks?.length}}</td>
                                                    <td><span class="glyphicon glyphicon-ok" *ngIf="annotation.flags?.offscale"></span></td>
                                                    <td><span class="glyphicon glyphicon-ok" *ngIf="annotation.flags?.failure"></span></td>
                                                    <td><span class="glyphicon glyphicon-ok" *ngIf="annotation.flags?.manual_curation"></span></td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,
    directives: [SectionHeaderComponent, LocusParametersListComponent, CommonLocusParametersDetailComponent, LocusParametersDetailComponent, D3SampleAnnotationEditor, ProgressBarComponent]
})
export class GenotypingProjectLocusList {
    private selectedProject: GenotypingProject;
    private locusParameters: GenotypingLocusParameters[] = [];
    private selectedLocus: Locus;
    private selectedLocusParameter: GenotypingLocusParameters;
    // private selectedLocusChannelAnnotations: ChannelAnnotation[];
    private selectedLocusAnnotations: SampleLocusAnnotation[];
    private selectedBinEstimator: BinEstimatorProject;
    private selectedBins: Map<number, Bin>;
    private errorMessage: string;
    private isSubmitting: boolean = false;
    private selectingLocus: boolean = false;

    private failureRate: number;
    
    private locusParamsCollapsed = false;
    private selectedLocusAnnotation: SampleLocusAnnotation;
    private filteredLocusAnnotations: SampleLocusAnnotation[] = [];
    private filteredLocusAnnotationIndex = 0;
    
    private channelAnnotations: Map<number, ChannelAnnotation[]>;
    private selectedSampleChannelAnnotations: ChannelAnnotation[];
    
    private filters: AnnotationFilter;

    private loadingAnnotations = false;
    private loadingLocusAnnotations = false;
    
    private navItems;
    private header;
    
    constructor(
        private _genotypingProjectService: GenotypingProjectService,
        private _binEstimatorProjectService: BinEstimatorProjectService,
        private _locusService: LocusService,
        private _routeParams: RouteParams,
        private _router: Router
    ){}
    
    
    private getBinEstimator = (proj: GenotypingProject) => {
        return this._binEstimatorProjectService.getBinEstimatorProject(proj.bin_estimator_id);
    }
    
    private countOf(object: Object, status) {
        let count = 0;
        for(let k in object) {
            if(object[k] == status) {
                count++;
            }
        }
        return count
    }
    
    getProject() {
        let id = +this._routeParams.get('project_id');
        this._genotypingProjectService.getProject(id)
            .map(project => {
                this.selectedProject = project;
                this.loadLocusParameters();
                this.header = this.selectedProject.title + " Loci"
                this.navItems = [
                    {
                        label: 'Details',
                        click: () => this.goToLink('GenotypingProjectDetail', {project_id: this.selectedProject.id}),
                        active: false
                    },
                    {
                        label: 'Samples',
                        click: () => this.goToLink('GenotypingProjectSampleList', {project_id: this.selectedProject.id}),
                        active: false
                    },
                    {
                        label: 'Loci',
                        click: () => this.goToLink('GenotypingProjectLocusList', {project_id: this.selectedProject.id}),
                        active: true
                    }
                ]
                return project;
            })
            .concatMap(this.getBinEstimator)
            .subscribe(
                binEstimator => {
                    this.selectedBinEstimator = <BinEstimatorProject> binEstimator;
                },
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
    
    private getFailureRate(locusAnnotations: SampleLocusAnnotation[]) {
        this.failureRate = 1
        locusAnnotations.forEach(locusAnnotation => {
            if(locusAnnotation.flags && !locusAnnotation.flags['failure']) {
                this.failureRate -= 1 / locusAnnotations.length;
            }
        })            
    }
    
    private filterLocusAnnotations() {
        this.filteredLocusAnnotations = [];
        this.filteredLocusAnnotationIndex = 0
        this.selectedLocusAnnotation = null;
        this.selectedLocusAnnotations.forEach(locusAnnotation => {
            if(this.filters.failures) {
                if(locusAnnotation.flags['failure']) {
                    this.filteredLocusAnnotations.push(locusAnnotation);
                }
            } else if(this.filters.offscale) {
                if(locusAnnotation.flags['offscale']) {
                    this.filteredLocusAnnotations.push(locusAnnotation);
                }
            } else if(this.filters.out_of_bin) {
              for (var peak_idx = 0; peak_idx < locusAnnotation.annotated_peaks.length; peak_idx++) {
                  var peak = locusAnnotation.annotated_peaks[peak_idx];
                //   if(!peak['in_bin'] && peak['bin'] && locusAnnotation.alleles[+peak['bin_id']]) {
                    if(!peak['in_bin'] && !peak['flags']['below_relative_threshold'] && !peak['flags']['artifact']) {
                      this.filteredLocusAnnotations.push(locusAnnotation);
                      break;
                  }
              }  
            } else {
                let main_peak = null;
                locusAnnotation.annotated_peaks.forEach(peak => {
                    if(main_peak) {
                        if(peak['peak_height'] > main_peak['peak_height']) {
                            main_peak = peak;
                        }
                    } else {
                        main_peak = peak;
                    }
                })
                
                for (var index = 0; index < locusAnnotation.annotated_peaks.length; index++) {
                    var peak = locusAnnotation.annotated_peaks[index];
                    if(peak['bleedthrough_ratio'] > this.filters.bleedthrough &&
                       peak['crosstalk_ratio'] > this.filters.crosstalk &&
                       this.filters.main_min_peak_height < main_peak['peak_height'] &&
                       main_peak['peak_height'] < this.filters.main_max_peak_height &&
                       this.countOf(locusAnnotation.alleles, true) >= this.filters.min_allele_count &&
                       this.countOf(locusAnnotation.alleles, true) <= this.filters.max_allele_count) {
                           this.filteredLocusAnnotations.push(locusAnnotation);
                           break;
                       } 
                }
            }
        })
        this.selectLocusAnnotation()
    }
    
    private clearFilter() {
        console.log("Selected Bin Estimator", this.selectedBinEstimator);   
        this.filters = {
            failures: false,
            offscale: false,
            out_of_bin: false,
            min_allele_count: 0,
            max_allele_count: this.selectedBinEstimator.locus_bin_sets.get(this.selectedLocus.id).bins.size,
            bleedthrough: 0,
            crosstalk: 0,
            main_min_peak_height: 0,
            main_max_peak_height: 40000
        }
        this.filteredLocusAnnotations = [];
        this.selectedLocusAnnotations.forEach(annotation => {
            if(annotation.reference_channel_id){
                this.filteredLocusAnnotations.push(annotation);
            }
        })
    }
    
    private getLocusAnnotations(){
        return this._genotypingProjectService.getLocusAnnotations(this.selectedProject.id, this.selectedLocus.id)
            .map(
                locusAnnotations => {                    
                    this.selectedLocusAnnotations = locusAnnotations;
                    this.getFailureRate(locusAnnotations);
                    this.selectedLocusAnnotation = locusAnnotations[0];    
                })
    }
    
    private selectLocusAnnotation() {
        if (this.filteredLocusAnnotations.length > this.filteredLocusAnnotationIndex){
            this.selectedLocusAnnotation = this.filteredLocusAnnotations[this.filteredLocusAnnotationIndex];
            let sample_id = this.selectedProject.sample_annotations.get(this.selectedLocusAnnotation.sample_annotations_id).sample.id;
            this.selectedSampleChannelAnnotations = this.channelAnnotations.get(sample_id)    
        } else if(this.filteredLocusAnnotations.length > 0) {
            this.filteredLocusAnnotationIndex = 0;
            this.selectedLocusAnnotation = this.filteredLocusAnnotations[this.filteredLocusAnnotationIndex];
            let sample_id = this.selectedProject.sample_annotations.get(this.selectedLocusAnnotation.sample_annotations_id).sample.id;
            this.selectedSampleChannelAnnotations = this.channelAnnotations.get(sample_id)
        } else {
            this.filteredLocusAnnotationIndex = 0;
            this.selectedLocusAnnotation = null;
        }
    }
    
    private eventHandler(event: KeyboardEvent) {
        if(this.filteredLocusAnnotations) {         
            if(event.keyCode == 38) {
                if(this.filteredLocusAnnotationIndex > 0) {
                    this.filteredLocusAnnotationIndex--;
                    this.selectLocusAnnotation();
                    event.preventDefault()
                }
            } else if(event.keyCode == 40) {
                if(this.filteredLocusAnnotationIndex < this.filteredLocusAnnotations.length - 1) {
                    this.filteredLocusAnnotationIndex++;
                    this.selectLocusAnnotation();
                    event.preventDefault()
                }
            }
        } 
    }
    
    private selectLocus(locus_id: number) {
        if(!this.isSubmitting && !this.selectingLocus){
            this.errorMessage = null;
            this.selectedLocus = null;
            this.failureRate = null;
            this.selectedLocusParameter = null;
            this.filteredLocusAnnotations = [];
            this.selectedLocusAnnotations = null;
            this.selectedLocusAnnotation = null;
            this.selectedSampleChannelAnnotations = [];
            this.filteredLocusAnnotationIndex = 0;
            this.channelAnnotations = null;
            if(locus_id != -1) {
                this.selectingLocus = true
                this.channelAnnotations = new Map<number, ChannelAnnotation[]>();
                this.loadingAnnotations = true;
                this._locusService.getLocus(locus_id)
                .subscribe(locus => {
                    this.selectedLocus = locus;
                    this.selectedLocusParameter = this.selectedProject.locus_parameters.get(locus_id);
                    if(this.selectedBinEstimator.locus_bin_sets.has(this.selectedLocus.id)) {
                        this.selectedBins = this.selectedBinEstimator.locus_bin_sets.get(this.selectedLocus.id).bins;
                    };
                    this.loadingLocusAnnotations = true;
                    this.getLocusAnnotations().subscribe(
                        () => {
                            this.clearFilter();
                            this.loadingLocusAnnotations = false;
                        }
                    );
                    this._genotypingProjectService.getLocusChannelAnnotations(this.selectedProject.id, locus_id).subscribe(
                        channelAnnotations => {
                            channelAnnotations.forEach(channelAnnotation => {
                                if(this.channelAnnotations.has(channelAnnotation.sample_id)) {
                                    this.channelAnnotations.get(channelAnnotation.sample_id).push(channelAnnotation)
                                } else {
                                    this.channelAnnotations.set(channelAnnotation.sample_id, [channelAnnotation]);
                                }
                                
                                this.selectLocusAnnotation();
                            });
                            this.loadingAnnotations = false;
                        },
                        err => {
                            toastr.error(err);
                        },
                        () => {
                            this.selectingLocus = false;
                        }
                    )
                }),
                err => {
                    toastr.error(err);
                }
            } else {
                let lp = new GenotypingLocusParameters();
                // lp.locus_id = -1;
                lp.initialize();
                this.selectedLocusParameter = lp;
            }
            
        }
        
    }
    
    private locusParamsSaved() {
        this.locusParameters = [];
        this.selectedProject.locus_parameters.forEach((locusParam, id) => {
            this.locusParameters.push(locusParam);
        })
    }
    
    private saveLocusParams(locusParameter) {
        if(!this.isSubmitting) {
            this.isSubmitting = true;
            // let locusParameter = this.selectedProject.locus_parameters.get(id);
            if(locusParameter.id) {
                this._genotypingProjectService.saveLocusParameters(locusParameter).subscribe(
                    (locusParam: GenotypingLocusParameters) => {
                        this._genotypingProjectService.clearCache(locusParam.project_id);
                        this._genotypingProjectService.getProject(locusParam.project_id)
                            .subscribe(
                                proj => {
                                    this.selectedProject = proj;
                                    this.loadLocusParameters();
                                    this.selectedLocusParameter = locusParam;
                                    this.selectLocus(locusParam.locus_id);
                                }
                            )
                    },
                    (error) => {
                        this.errorMessage = error;
                        this.isSubmitting = false;
                    },
                    () => {
                        this.isSubmitting = false;
                    }
                )
            } else {
                this._genotypingProjectService.batchApplyLocusParameters(locusParameter, this.selectedProject.id).subscribe(
                    () => {
                        this._genotypingProjectService.clearCache(this.selectedProject.id);
                        this._genotypingProjectService.getProject(this.selectedProject.id)
                            .subscribe(
                                proj => {
                                    this.selectedProject = proj;
                                    this.loadLocusParameters();
                                }
                            )
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
    
    private saveAnnotations() {
        if(!this.isSubmitting) {
            this.isSubmitting = true;
            let annotations = [];
            this.selectedLocusAnnotations.forEach(annotation => {
                if(annotation.isDirty) {
                    annotations.push(annotation);
                }
            })
            
            this._genotypingProjectService.saveAnnotations(annotations)
                .subscribe(
                    () => {
                        this.getLocusAnnotations().subscribe(
                            () => {
                                this.filterLocusAnnotations();
                                this.isSubmitting = false;
                            }
                        );
                    },
                    err => {
                        this.errorMessage = err;
                        this.isSubmitting = false;
                    }
                )
        }
        
    }
    
    onChanged(e) {
        this.selectedLocusParameter.isDirty = true
    }
  
    ngOnInit() {
        this.getProject();
    }
       
}