import { Component, OnInit } from '@angular/core';
import { RouteParams, Router } from '@angular/router-deprecated';

import { LocusPipe } from '../../../../pipes/locus.pipe';
import { SectionHeaderComponent } from '../../../layout/section-header.component'

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
            <div *ngIf="selectedProject" class="col-sm-1">
                <pm-locus-parameter-list class="list-panel" [(locusParameters)]="locusParameters" (locusClicked)="selectLocus($event)">
                </pm-locus-parameter-list>
            </div>
            <div *ngIf="selectedLocusParameter" class="col-sm-4">
                <div class="row">
                    <div class="panel panel-default">
                        <div (click)="locusParamsCollapsed = !locusParamsCollapsed" class="panel-heading">
                            <div class="h3 panel-title">
                                <span>{{selectedLocusParameter.locus_id | locus | async}}</span> <span *ngIf="selectedLocusAnnotations"> | {{selectedLocusAnnotations.length}} Samples </span> <span *ngIf="failureRate"> | Failure Rate: {{failureRate | number}}</span>
                                <span *ngIf="locusParamsCollapsed" class="glyphicon glyphicon-menu-right pull-right"></span>
                                <span *ngIf="!locusParamsCollapsed" class="glyphicon glyphicon-menu-down pull-right"></span> 
                            </div>
                        </div>
                        <div *ngIf="!locusParamsCollapsed" class="panel-body">
                            <form (ngSubmit)="saveLocusParams(selectedLocusParameter.locus_id)">
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
                                        </div>                                
                                        <div class="col-sm-6">
                                            <div class="form-group">
                                                <label>Soft Artifact SD Limit</label>
                                                <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" [(ngModel)]="selectedLocusParameter.soft_artifact_sd_limit">
                                            </div>
                                            <div class="form-group">
                                                <label>Hard Artifact SD Limit</label>
                                                <input class="form-control input-sm" (change)="onChanged()" type="number" required step="any" min="0" [(ngModel)]="selectedLocusParameter.hard_artifact_sd_limit">
                                            </div>
                                            <div class="form-group">
                                                <label>Offscale Threshold</label>
                                                <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="selectedLocusParameter.offscale_threshold">
                                            </div>
                                            <div class="form-group">
                                                <label>Failure Threshold</label>
                                                <input class="form-control input-sm" (change)="onChanged()" type="number" required step="1" min="0" [(ngModel)]="selectedLocusParameter.failure_threshold">
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
                <div *ngIf="selectedLocusAnnotations" class="row">
                    <div class="panel panel-default">
                        <div class="panel-heading">
                            <div class="h3 panel-title">
                                Annotations Filters
                            </div>
                        </div>
                        <div class="panel-body">
                            <form>
                                <div class="col-sm-6">
                                    <div class="form-group">
                                        <input type="checkbox" (change)="filters.offscale=false" [(ngModel)]="filters.failures"> Failures Only
                                    </div>
                                    <div class="form-group">
                                        <input type="checkbox" (change)="filters.failures=false" [(ngModel)]="filters.offscale"> Offscale Only
                                    </div>
                                    <div class="form-group">
                                        <label>Crosstalk Limit</label>
                                        <input class="form-control" type="number" step="any" min=0 [(ngModel)]="filters.crosstalk" [disabled]="filters.failures || filters.offscale">
                                    </div>
                                    <div class="form-group">
                                        <label>Bleedthrough Limit</label>
                                        <input class="form-control" type="number" step="any" min=0 [(ngModel)]="filters.bleedthrough" [disabled]="filters.failures || filters.offscale">
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
            <div class="col-sm-7">
                <div *ngIf="selectedLocusParameter">
                    <div class="row">
                        <div class="col-sm-12">
                            <div class="panel panel-default">
                                <div class="panel-heading">
                                    <h3 *ngIf="selectedLocusAnnotation" class="panel-title">{{selectedProject.sample_annotations.get(selectedLocusAnnotation.sample_annotations_id).sample.barcode}}</h3>
                                </div>
                                <div class="panel-body">
                                    <div id="channel_plot" style="height: 30vh">
                                        <pm-d3-sample-annotation-editor *ngIf="selectedLocusAnnotation" [locusAnnotation]="selectedLocusAnnotation" [bins]="selectedBins"></pm-d3-sample-annotation-editor>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-sm-12">
                            <div class="panel panel-default">
                                <div class="panel-heading">
                                    <div class="h3 panel-title">
                                        <span>Filtered Annotations</span> <span *ngIf="filteredLocusAnnotations.length > 0"> | {{filteredLocusAnnotations.length}} Results </span> <span *ngIf="filteredLocusAnnotations.length > 0" class='pull-right'> {{filteredLocusAnnotationIndex + 1}} / {{filteredLocusAnnotations.length}} </span>
                                    </div>
                                </div>
                                <div class="panel-body">
                                    <div class="table-responsive" style="overflow: auto; height: 45vh">
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
                                                <tr [ngClass]="{success: annotation.id==selectedLocusAnnotation?.id, warning: annotation.isDirty}" *ngFor="#annotation of filteredLocusAnnotations; #i = index" (click)="filteredLocusAnnotationIndex = i; selectLocusAnnotation()">
                                                    <td>{{selectedProject.sample_annotations.get(annotation.sample_annotations_id).sample.barcode}}</td>
                                                    <td>{{countOf(annotation.alleles, true)}}</td>
                                                    <td>{{annotation.annotated_peaks?.length}}</td>
                                                    <td><span class="glyphicon glyphicon-ok" *ngIf="annotation.flags['offscale']"></span></td>
                                                    <td><span class="glyphicon glyphicon-ok" *ngIf="annotation.flags['failure']"></span></td>
                                                    <td><span class="glyphicon glyphicon-ok" *ngIf="annotation.flags['manual_curation']"></span></td>
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
    directives: [SectionHeaderComponent, LocusParametersListComponent, CommonLocusParametersDetailComponent, LocusParametersDetailComponent, D3SampleAnnotationEditor]
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
    private failureRate: number;
    
    private locusParamsCollapsed = false;
    private selectedLocusAnnotation: SampleLocusAnnotation;
    private filteredLocusAnnotations: SampleLocusAnnotation[] = [];
    private filteredLocusAnnotationIndex = 0;
    
    private filters: AnnotationFilter;
    
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
        console.log("Getting Bin Estimator");
        
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
        console.log("Getting Project");
        let id = +this._routeParams.get('project_id');
        this._genotypingProjectService.getProject(id)
            .map((project) => {
                console.log(project);
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
    
    private getFailureRate(locusAnnotations: SampleLocusAnnotation[]) {
        this.failureRate = 0
        locusAnnotations.forEach(locusAnnotation => {
            if(locusAnnotation.flags['failure']) {
                this.failureRate += 1 / locusAnnotations.length;
            }
        })
        console.log(this.failureRate);            
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
        this.filters = {
            failures: false,
            offscale: false,
            min_allele_count: 0,
            max_allele_count: Object.keys(this.selectedLocusAnnotations[0].alleles).length,
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
                    console.log(locusAnnotations);  
                    this.selectedLocusAnnotations = locusAnnotations;
                    this.getFailureRate(locusAnnotations);
                    this.selectedLocusAnnotation = locusAnnotations[0];    
                })
    }
    
    private selectLocusAnnotation() {
        if (this.filteredLocusAnnotations.length > this.filteredLocusAnnotationIndex){
            this.selectedLocusAnnotation = this.filteredLocusAnnotations[this.filteredLocusAnnotationIndex];    
        } else if(this.filteredLocusAnnotations.length > 0) {
            this.filteredLocusAnnotationIndex = 0;
            this.selectedLocusAnnotation = this.filteredLocusAnnotations[this.filteredLocusAnnotationIndex];
        } else {
            this.filteredLocusAnnotationIndex = 0;
            this.selectedLocusAnnotation = null;
        }
        // for (var index = 0; index < this.selectedLocusAnnotations.length; index++) {
        //     var locusAnnotation = this.selectedLocusAnnotations[index];
        //     if(locusAnnotation.id == id) {
        //         this.selectedLocusAnnotation = locusAnnotation;
        //         break;
        //     }
        // }
    }
    
    private eventHandler(event: KeyboardEvent) {
        console.log(event, event.keyCode);
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
        this.selectedLocus = null;
        this.failureRate = null;
        this.selectedLocusParameter = null;
        this.selectedLocusAnnotation = null;
        this.filteredLocusAnnotations = [];
        this.selectedLocusAnnotations = null;
        if(!this.isSubmitting) {
            this._locusService.getLocus(locus_id)
            .subscribe(locus => {
                this.selectedLocus = locus;
                this.selectedLocusParameter = this.selectedProject.locus_parameters.get(locus_id);
                if(this.selectedBinEstimator.locus_bin_sets.has(this.selectedLocus.id)) {
                    this.selectedBins = this.selectedBinEstimator.locus_bin_sets.get(this.selectedLocus.id).bins;
                };
                
                this.getLocusAnnotations().subscribe(
                    () => this.clearFilter()
                );
            })
        }
    }
    
    private locusParamsSaved() {
        this.locusParameters = [];
        this.selectedProject.locus_parameters.forEach((locusParam, id) => {
            this.locusParameters.push(locusParam);
        })
    }
    
    private saveLocusParams(id: number) {
        let locusParameter = this.selectedProject.locus_parameters.get(id);
        if(locusParameter.isDirty || locusParameter.filter_parameters_stale || locusParameter.scanning_parameters_stale) {
            this.isSubmitting = true;
            this._genotypingProjectService.saveLocusParameters(locusParameter).subscribe(
            (locusParam) => {
                this._genotypingProjectService.clearCache(locusParam.project_id);
                this.getProject();
                this.selectLocus(locusParam.locus_id);
                this.isSubmitting = false;
            },
            (error) => this.errorMessage = error
            )
        }
    }
    
    private saveAnnotations() {
        this.isSubmitting = true;
        let annots = [];
        this.selectedLocusAnnotations.forEach(annotation => {
            if(annotation.isDirty) {
                annots.push(annotation);
            }
        })
        
        this._genotypingProjectService.saveAnnotations(annots)
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
    
    onChanged(e) {
        console.log(this.filters);
        this.selectedLocusParameter.isDirty = true
    }
  
    ngOnInit() {
        this.getProject();
    }
       
}