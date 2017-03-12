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

import { SectionHeaderComponent } from '../../../layout/section-header.component';
import { ProgressBarComponent } from '../../../layout/progress-bar.component';

import { GenotypingProject } from '../../../../services/genotyping-project/genotyping-project.model';
import { GenotypingProjectService } from '../../../../services/genotyping-project/genotyping-project.service';

import { BinEstimatorProjectService } from '../../../../services/bin-estimator-project/bin-estimator-project.service';
import { Bin } from '../../../../services/bin-estimator-project/locus-bin-set/bin/bin.model';
import { BinEstimatorProject } from '../../../../services/bin-estimator-project/bin-estimator-project.model';

import { SampleAnnotation } from '../../../../services/sample-based-project/sample-annotation/sample-annotation.model';
import { Sample } from '../../../../services/sample/sample.model';
import { SampleLocusAnnotation } from '../../../../services/sample-based-project/sample-annotation/locus-annotation/sample-locus-annotation.model';
import { SampleListComponent } from '../../../project/samples-list.component';

import { ChannelAnnotation } from '../../../../services/project/channel-annotation/channel-annotation.model';

import { D3SampleAnnotationEditor } from '../../sample-annotation-editor.component';

@Component({
    selector: 'genotyping-project-sample-list',
    pipes: [LocusPipe],
    host: {
        '(document:keydown)': 'eventHandler($event)'
    },
    template: `
        <pm-section-header [header]="header" [navItems]="navItems"></pm-section-header>
        <div *ngIf="selectedProject" class="row">
            <div class="col-sm-6">
                <div class="row">
                    <div class="col-sm-12">
                        <div class="panel panel-default">
                            <div class="panel-heading">
                                <h6 class="panel-title">Probabilistic Peak Annotation</h6>
                            </div>
                            <div class="panel-body">
                                <div class="col-sm-3">
                                    <button class="btn btn-primary" (click)="calculateProbability()">Calculate</button>
                                </div>
                                <div class="col-sm-9">
                                    <pm-progress-bar *ngIf="calculatingProbability" [fullLabel]="'Calculating Probability...'"></pm-progress-bar>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-sm-12">
                        <div class="panel panel-default">
                            <div class="panel-heading">
                                <h6 class="panel-title">Add Samples</h6>
                            </div>
                            <div class="panel-body">
                                <form>
                                    <div class="form-group">
                                        <input type="file" (change)="fileChangeEvent($event)" placeholder="Upload file..." />
                                    </div>
                                    <button class="btn btn-primary" type="button" (click)="upload()">Upload</button>
                                </form>
                                <br>
                                <pm-progress-bar *ngIf="uploading" [fullLabel]="'Uploading File...'"></pm-progress-bar>
                                <span class="label label-danger">{{uploadError}}</span>
                            </div>
                        </div>
                    </div>
                    <div class="col-sm-12">
                        <div class="panel panel-default">
                            <div class="panel-heading">
                                <div class="h3 panel-title">
                                    <span>Samples</span>
                                </div>
                            </div>
                            <div class="panel-body">
                                <div class="table-responsive" style="overflow: auto; height:80vh">
                                    <table class="table table-striped table-hover table-condensed">
                                        <thead>
                                            <tr>
                                                <th (click)="reverseSampleSorting = !reverseSampleSorting; sampleSortingParam = 'barcode'; sortSamples()">Barcode</th>
                                                <th (click)="reverseSampleSorting = !reverseSampleSorting; sampleSortingParam = 'designation'; sortSamples()">Designation</th>
                                                <th (click)="reverseSampleSorting = !reverseSampleSorting; sampleSortingParam = 'moi'; sortSamples()">MOI</th>
                                                <th>Last Updated</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr *ngFor="let sample_annotation of _sampleAnnotations" (click)="selectSample(sample_annotation)" [ngClass]="{success:sample_annotation.sample.id==selectedSample?.id}">
                                                <td>{{sample_annotation.sample.barcode}}</td>
                                                <td>{{sample_annotation.sample.designation}}</td>
                                                <td>{{sample_annotation.moi}}</td>
                                                <td>{{sample_annotation.last_updtaed | date: "fullDate"}}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div *ngIf="selectedSampleLocusAnnotations" class="col-sm-6">
                <div class="row">
                    <div class="col-sm-12">
                        <div *ngIf="selectedLocusAnnotation" class="panel panel-default">
                            <div class="panel-heading">
                                <div class="h3 panel-title">
                                    {{selectedLocusAnnotation.locus_id | locus | async}}
                                </div>
                            </div>
                            <div *ngIf="selectedLocusChannelAnnotations" class="panel-body">
                                <div id="channel_plot" style="height: 30vh">
                                    <div *ngFor="let channelAnnotation of selectedLocusChannelAnnotations">
                                        <pm-d3-sample-annotation-editor [channelAnnotation]="channelAnnotation" [locusAnnotation]="selectedLocusAnnotation" [bins]="selectedBins"></pm-d3-sample-annotation-editor>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div *ngIf="!selectedLocusAnnotation" class="panel panel-default">
                            <div class="panel-heading">
                                <div class="h3 panel-title">
                                    Select An Annotation
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-sm-12">
                        <div class="panel panel-default">
                            <div class="panel-heading">
                                <h3 class="panel-title">Locus Annotations</h3>
                            </div>
                            <div class="panel-body">
                                <div class="table-responsive" style="overflow: auto; height: 35vh">
                                    <table class="table table-striped table-hover table-condensed">
                                        <thead>
                                            <tr>
                                                <th>Locus</th>
                                                <th># Alleles</th>
                                                <th># Peaks</th>
                                                <th>Offscale</th>
                                                <th>Failure</th>
                                                <th>Manual</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr *ngFor="let annotation of selectedSampleLocusAnnotations; let i = index" (click)="selectedLocusAnnotationIndex = i; selectLocusAnnotation()" [ngClass]="{success:annotation==selectedLocusAnnotation, danger:!annotation.reference_run_id, warning: annotation.isDirty}">
                                                <td>{{annotation.locus_id | locus | async}}</td>
                                                <td>{{countOf(annotation.alleles, true)}}</td>
                                                <td>{{annotation.annotated_peaks?.length}}</td>
                                                <td><span class="glyphicon glyphicon-ok" *ngIf="annotation.flags['offscale']"></span></td>
                                                <td><span class="glyphicon glyphicon-ok" *ngIf="annotation.flags['failure']"></span></td>
                                                <td><span class="glyphicon glyphicon-ok" *ngIf="annotation.flags['manual_curation']"></span></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <button class="btn btn-default" (click)="saveAnnotations()">Save Annotations</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,
    directives: [SampleListComponent, SectionHeaderComponent, D3SampleAnnotationEditor, ProgressBarComponent]
})
export class GenotypingProjectSampleList implements OnInit {
    public selectedProject: GenotypingProject;
    public selectedSample: Sample;
    public selectedSampleLocusAnnotations: SampleLocusAnnotation[];
    public selectedLocusAnnotation: SampleLocusAnnotation;
    public errorMessage: string;
    private selectedBinEstimator: BinEstimatorProject;
    private selectedBins: Map<number, Bin>;
    
    private sampleFileCSV: File[] = [];
    private uploading = false;
    private uploadComplete = false;
    private uploadError: string;
    private isSubmitting = false;
    
    private sampleSortingParam: string = 'barcode';
    private reverseSampleSorting = true;
    
    private navItems: [{label: string, click: Function, active: boolean}]
    private header;
    
    private _sampleAnnotations: SampleAnnotation[] = [];
    private selectedLocusAnnotationIndex = 0;
    
    private channelAnnotations: Map<number, ChannelAnnotation[]>
    private selectedLocusChannelAnnotations: ChannelAnnotation[];
    
    private calculatingProbability = false;
    
    constructor(
        private _genotypingProjectService: GenotypingProjectService,
        private _binEstimatorProjectService: BinEstimatorProjectService,
        private _routeParams: RouteParams,
        private _router: Router
    ) {}
    
    private getBinEstimator = (proj: GenotypingProject) => {
        return this._binEstimatorProjectService.getBinEstimatorProject(proj.bin_estimator_id);
    }
    
    private selectLocusAnnotation() {
        let annotation = this.selectedSampleLocusAnnotations[this.selectedLocusAnnotationIndex];
        this.selectedBins = null;
        this.selectedLocusAnnotation = annotation;
        this.selectedLocusChannelAnnotations = this.channelAnnotations.get(this.selectedLocusAnnotation.locus_id);
        if(this.selectedBinEstimator.locus_bin_sets.get(this.selectedLocusAnnotation.locus_id)) {
            this.selectedBins = this.selectedBinEstimator.locus_bin_sets.get(this.selectedLocusAnnotation.locus_id).bins;
        };
    }
    
    getProject() {
        this.selectedProject = null
        this.selectedSample = null
        this.selectedSampleLocusAnnotations = null
        this.selectedLocusAnnotation = null;
        this.selectedBinEstimator = null;
        this.selectedBins = null;
        this.calculatingProbability = false;
        this._sampleAnnotations = [];
        this._genotypingProjectService.getProject(+this._routeParams.get('project_id'))
                .map((project) => {
                    this.selectedProject = project;
                    project.sample_annotations.forEach(sampleAnnotation => {
                        this._sampleAnnotations.push(sampleAnnotation);
                    });
                    this.sortSamples();
                    this.header = this.selectedProject.title + " Samples"
                    this.navItems = [
                        {
                            label: 'Details',
                            click: () => this.goToLink('GenotypingProjectDetail', {project_id: this.selectedProject.id}),
                            active: false
                        },
                        {
                            label: 'Samples',
                            click: () => this.goToLink('GenotypingProjectSampleList', {project_id: this.selectedProject.id}),
                            active: true
                        },
                        {
                            label: 'Loci',
                            click: () => this.goToLink('GenotypingProjectLocusList', {project_id: this.selectedProject.id}),
                            active: false
                        }
                    ]
                    return project;
                })
                .concatMap(this.getBinEstimator)
                .subscribe(
                    binEstimator => this.selectedBinEstimator = binEstimator,
                    err => this.errorMessage = err
                )
    }
    
    fileChangeEvent(fileInput: any){
        this.sampleFileCSV = <Array<File>> fileInput.target.files;
    }
    
    upload() {
        if(!this.uploading) {
            this.uploading = true;
            this.uploadComplete = false
            this._genotypingProjectService.addSamples(this.sampleFileCSV, this.selectedProject.id).subscribe(
                project => {
                    this.selectedProject = project;
                    this._sampleAnnotations = [];
                    project.sample_annotations.forEach(sampleAnnotation => {
                            this._sampleAnnotations.push(sampleAnnotation);
                        });
                    this.sortSamples();
                    toastr.success("Succesfully Uploaded Sample List");
                }, 
                error => {
                    this.uploadError = error;
                    this.uploading = false;
                },
                () => {
                    this.uploading = false;
                }
            )
        }
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
    
    private calculateProbability() {
        this.calculatingProbability = true;
        this._genotypingProjectService.calculateProbability(this.selectedProject)
            .subscribe(res => {
                this.getProject();
            })
    }
    
    private eventHandler(event: KeyboardEvent) {
        if(this.selectedSampleLocusAnnotations) {         
            if(event.keyCode == 38) {
                if(this.selectedLocusAnnotationIndex > 0) {
                    this.selectedLocusAnnotationIndex--;
                    this.selectLocusAnnotation();
                    event.preventDefault()
                }
            } else if(event.keyCode == 40) {
                if(this.selectedLocusAnnotationIndex < this.selectedSampleLocusAnnotations.length - 1) {
                    this.selectedLocusAnnotationIndex++;
                    this.selectLocusAnnotation();
                    event.preventDefault()
                }
            }
        } 
    }
  
    private selectSample(sample_annotation: SampleAnnotation) {
        this._genotypingProjectService.getSampleLocusAnnotations(sample_annotation.project_id, sample_annotation.sample.id)
            .subscribe(sampleLocusAnnotations => {
                this.selectedLocusAnnotation = null;
                this.selectedSample = sample_annotation.sample;
                this.channelAnnotations = new Map<number, ChannelAnnotation[]>();
                this._genotypingProjectService.getSampleChannelAnnotations(sample_annotation.project_id, sample_annotation.sample.id).subscribe(
                    channelAnnotations => {
                        channelAnnotations.forEach(channelAnnotation => {
                            if(this.channelAnnotations.has(channelAnnotation.locus_id)) {
                                this.channelAnnotations.get(channelAnnotation.locus_id).push(channelAnnotation);
                            } else {
                                this.channelAnnotations.set(channelAnnotation.locus_id, [channelAnnotation]);
                            }
                        });
                        this.selectedSampleLocusAnnotations = sampleLocusAnnotations;
                        this.sortAnnotations();
                    }
                );
            })
    }
  
    private sortAnnotations() {
        this.selectedSampleLocusAnnotations.sort((a,b) => {
            if (a.locus_id > b.locus_id) {
                return 1;
            } else if(a.locus_id < b.locus_id) {
                return -1;
            } else {
                return 0;
            }
        })
    }
    
    private sortSamples() {
        let inSample = false;        
        if(['barcode', 'designation'].indexOf(this.sampleSortingParam) >= 0) {
            inSample = true;
        }
        this._sampleAnnotations.sort((a,b) => {            
            if(inSample) {
                var c = a.sample[this.sampleSortingParam];
                var d = b.sample[this.sampleSortingParam];
            } else {
                var c = a[this.sampleSortingParam];
                var d = b[this.sampleSortingParam];
            }
            
            if(c > d) {
                return 1;
            } else if(c < d) {
                return -1;
            } else {
                return 0;
            }
        })
        
        if(this.reverseSampleSorting) {
            this._sampleAnnotations.reverse();
        }
    }

    private saveAnnotations() {
        if(!this.isSubmitting) {
            this.isSubmitting = true;
            let annotations = [];
            this.selectedSampleLocusAnnotations.forEach(annotation => {
                if(annotation.isDirty) {
                    annotations.push(annotation);
                }
            })

            this._genotypingProjectService.saveAnnotations(annotations)
                .subscribe(
                    () => {
                        this._genotypingProjectService.getSampleLocusAnnotations(this.selectedProject.id, this.selectedSample.id).subscribe(
                            sampleLocusAnnotations => {
                                this.selectedLocusAnnotation = null;
                                this.channelAnnotations = new Map<number, ChannelAnnotation[]>();
                                this._genotypingProjectService.getSampleChannelAnnotations(this.selectedProject.id, this.selectedSample.id).subscribe(
                                    channelAnnotations => {
                                        channelAnnotations.forEach(channelAnnotation => {
                                            if(this.channelAnnotations.has(channelAnnotation.locus_id)) {
                                                this.channelAnnotations.get(channelAnnotation.locus_id).push(channelAnnotation);
                                            } else {
                                                this.channelAnnotations.set(channelAnnotation.locus_id, [channelAnnotation]);
                                            }
                                        });
                                        this.selectedSampleLocusAnnotations = sampleLocusAnnotations;
                                        this.sortAnnotations();
                                        this.isSubmitting = false;
                                    }
                                );
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
    
    private goToLink(dest: String, params: Object) {
        let link = [dest, params];
        this._router.navigate(link);
    }
  
    ngOnInit() {
        this.getProject();
    }
}