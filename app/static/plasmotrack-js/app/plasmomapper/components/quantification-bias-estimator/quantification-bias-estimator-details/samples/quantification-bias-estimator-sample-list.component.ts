import { Component, OnInit } from '@angular/core';
import { RouteParams, Router } from '@angular/router-deprecated';

import { LocusPipe } from '../../../../pipes/locus.pipe';

import { SectionHeaderComponent } from '../../../layout/section-header.component';
import { ProgressBarComponent } from '../../../layout/progress-bar.component';

import { QuantificationBiasEstimatorProject } from '../../../../services/quantification-bias-estimator-project/quantification-bias-estimator-project.model';
import { QuantificationBiasEstimatorProjectService } from '../../../../services/quantification-bias-estimator-project/quantification-bias-estimator-project.service';

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
    selector: 'quantification-bias-estimator-project-sample-list',
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
                                <h3 class="panel-title">Add Control Samples</h3>
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
                                                <th>Last Updated</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr *ngFor="let sample_annotation of sampleAnnotations" (click)="selectSample(sample_annotation)" [ngClass]="{success: sample_annotation.sample.id==selectedSample?.id}">
                                                <td>{{sample_annotation.sample.barcode}}</td>
                                                <td>{{sample_annotation.last_updated | date: "fullDate"}}</td>
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
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,
    directives: [SampleListComponent, SectionHeaderComponent, D3SampleAnnotationEditor, ProgressBarComponent]
})
export class QuantificationBiasEstimatorProjectSampleList implements OnInit {
    private selectedProject: QuantificationBiasEstimatorProject;
    private selectedSample: Sample;
    private selectedSampleLocusAnnotations: SampleLocusAnnotation[];
    private selectedLocusAnnotation: SampleLocusAnnotation;
    private selectedBinEstimator: BinEstimatorProject;
    private selectedBins: Map<number, Bin>;

    private sampleFileCSV: File[];
    private uploading = false;
    
    private sampleSortingParam: string = 'barcode';
    private reverseSampleSorting = false;

    private navItems: [{label: string, click: Function, active: boolean}]
    private header: string;

    private sampleAnnotations: SampleAnnotation[] = [];
    private selectedLocusAnnotationIndex = 0;

    private channelAnnotations: Map<number, ChannelAnnotation[]>;
    private selectedLocusChannelAnnotations: ChannelAnnotation[];
    
    constructor(
        private _quantificationBiasEstimatorProjectService: QuantificationBiasEstimatorProjectService,
        private _binEstimatorProjectService: BinEstimatorProjectService,
        private _routeParams: RouteParams,
        private _router: Router
    ){}

    private getBinEstimator = (proj: QuantificationBiasEstimatorProject) => {
        return this._binEstimatorProjectService.getBinEstimatorProject(proj.bin_estimator_id);
    }

    selectLocusAnnotation() {
        let annotation = this.selectedSampleLocusAnnotations[this.selectedLocusAnnotationIndex];
        this.selectedBins = null;
        this.selectedLocusAnnotation = annotation;
        this.selectedLocusChannelAnnotations = this.channelAnnotations.get(this.selectedLocusAnnotation.locus_id);
        if(this.selectedBinEstimator.locus_bin_sets.get(this.selectedLocusAnnotation.locus_id)) {
            this.selectedBins = this.selectedBinEstimator.locus_bin_sets.get(this.selectedLocusAnnotation.locus_id).bins;
        }
    }

    getProject() {
        this.selectedProject = null;
        this.selectedSample = null;
        this.selectedSampleLocusAnnotations = null;
        this.selectedLocusAnnotation = null;
        this.selectedBinEstimator = null;
        this.selectedBins = null;
        this.sampleAnnotations = [];
        this._quantificationBiasEstimatorProjectService.getProject(+this._routeParams.get('project_id'))
            .map(
                project => {
                    this.selectedProject = project;
                    project.sample_annotations.forEach(
                        sample_annotation => {
                            this.sampleAnnotations.push(sample_annotation);
                        }
                    )
                    this.sortSamples();
                    this.header = this.selectedProject.title + " Samples"
                    this.navItems = [
                        {
                             label: 'Details',
                            click: () => this.goToLink('QuantificationBiasEstimatorProjectDetail', {project_id: this.selectedProject.id}),
                            active: false
                        },
                        {
                            label: 'Samples',
                            click: () => this.goToLink('QuantificationBiasEstimatorProjectSampleList', {project_id: this.selectedProject.id}),
                            active: true
                        },
                        {
                            label: 'Loci',
                            click: () => this.goToLink('QuantificationBiasEstimatorProjectLocusList', {project_id: this.selectedProject.id}),
                            active: false
                        }
                    ]
                    return project;
                }
            )
            .concatMap(this.getBinEstimator)
            .subscribe(
                binEstimator => this.selectedBinEstimator = binEstimator,
                err => {
                    console.log(err);
                    toastr.error(err)
                }
            )
    }

    fileChangeEvent(fileInput: any) {
        this.sampleFileCSV = fileInput.target.files;
    }

    upload() {
        if(!this.uploading) {
            this.uploading = true;
            this._quantificationBiasEstimatorProjectService.addSamples(this.sampleFileCSV, this.selectedProject.id).subscribe(
                project => {
                    this.selectedProject = project;
                    this.sampleAnnotations = [];
                    project.sample_annotations.forEach(sample_annotation => {
                        this.sampleAnnotations.push(sample_annotation);
                    })
                    this.sortSamples();
                    toastr.success("Succesfully Uploaded Sample List and Assigned Controls");
                },
                err => {
                    console.log(err);
                    toastr.error(err)
                },
                () => this.uploading = false
            )

        }
    }

    countOf(object: Object, status) {
        let count = 0;
        for(let k in object) {
            if(object[k] == status) {
                count++;
            }
        }
        return count
    }
    
    eventHandler(event: KeyboardEvent) {
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

    selectSample(sample_annotation: SampleAnnotation) {
        this._quantificationBiasEstimatorProjectService.getSampleLocusAnnotations(sample_annotation.project_id, sample_annotation.sample.id)
            .subscribe(sampleLocusAnnotations => {
                this.selectedLocusAnnotation = null;
                this.selectedSample = sample_annotation.sample;
                this.channelAnnotations = new Map<number, ChannelAnnotation[]>();
                this._quantificationBiasEstimatorProjectService.getSampleChannelAnnotations(sample_annotation.project_id, sample_annotation.sample.id)
                    .subscribe(
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
                    )
            })
    }

    sortAnnotations() {
        this.selectedSampleLocusAnnotations.sort((a, b) => {
            if (a.locus_id > b.locus_id) {
                return 1;
            } else if(a.locus_id < b.locus_id) {
                return -1;
            } else {
                return 0;
            }
        })
    }

    sortSamples() {
        let inSample = false;        
        if(['barcode', 'designation'].indexOf(this.sampleSortingParam) >= 0) {
            inSample = true;
        }
        this.sampleAnnotations.sort((a,b) => {            
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
            this.sampleAnnotations.reverse();
        }
    }

    private goToLink(dest: String, params: Object) {
        let link = [dest, params];
        this._router.navigate(link);
    }
  
    ngOnInit() {
        console.log("Initializing Component");
        
        this.getProject();
    }
}