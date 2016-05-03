import { Component, OnInit } from 'angular2/core';
import { RouteParams, Router } from 'angular2/router';

import { LocusPipe } from '../../../../pipes/locus.pipe';

import { SectionHeaderComponent } from '../../../layout/section-header.component'

import { GenotypingProject } from '../../../../services/genotyping-project/genotyping-project.model';
import { GenotypingProjectService } from '../../../../services/genotyping-project/genotyping-project.service';

import { BinEstimatorProjectService } from '../../../../services/bin-estimator-project/bin-estimator-project.service';
import { Bin } from '../../../../services/bin-estimator-project/locus-bin-set/bin/bin.model';
import { BinEstimatorProject } from '../../../../services/bin-estimator-project/bin-estimator-project.model';

import { SampleAnnotation } from '../../../../services/sample-based-project/sample-annotation/sample-annotation.model';
import { Sample } from '../../../../services/sample/sample.model';
import { SampleLocusAnnotation } from '../../../../services/sample-based-project/sample-annotation/locus-annotation/sample-locus-annotation.model';
import { SampleListComponent } from '../../../project/samples-list.component';

import { D3SampleAnnotationEditor } from '../../sample-annotation-editor.component';

@Component({
    selector: 'genotyping-project-sample-list',
    pipes: [LocusPipe],
    host: {
        '(document:keydown)': 'eventHandler($event)'
    },
    template: `
        <pm-section-header [header]="header" [navItems]="navItems"></pm-section-header>
        <div class="row">
            <div class="col-sm-6">
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
                                        <th (click)="reverseSampleSorting = !reverseSampleSorting; sampleSorgingParam = 'moi'; sortSamples()">MOI</th>
                                        <th>Last Updated</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr *ngFor="#sample_annotation of _sampleAnnotations" (click)="selectSample(sample_annotation)" [ngClass]="{success:sample_annotation.sample.id==selectedSample?.id}">
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
            <div *ngIf="selectedSampleLocusAnnotations" class="col-sm-6">
                <div class="row">
                    <div class="col-sm-12">
                        <div *ngIf="selectedLocusAnnotation" class="panel panel-default">
                            <div class="panel-heading">
                                <div class="h3 panel-title">
                                    {{selectedLocusAnnotation.locus_id | locus | async}}
                                </div>
                            </div>
                            <div *ngIf="selectedLocusAnnotation.reference_channel_id" class="panel-body">
                                <div id="channel_plot" style="height: 30vh">
                                    <pm-d3-sample-annotation-editor [locusAnnotation]="selectedLocusAnnotation" [bins]="selectedBins"></pm-d3-sample-annotation-editor>
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
                                            <tr *ngFor="#annotation of selectedSampleLocusAnnotations; #i = index" (click)="selectedLocusAnnotationIndex = i; selectLocusAnnotation()" [ngClass]="{success:annotation==selectedLocusAnnotation, danger:!annotation.reference_run_id, warning: annotation.isDirty}">
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
    directives: [SampleListComponent, SectionHeaderComponent, D3SampleAnnotationEditor]
})
export class GenotypingProjectSampleList implements OnInit {
    public selectedProject: GenotypingProject;
    public selectedSample: Sample;
    public selectedSampleLocusAnnotations: SampleLocusAnnotation[];
    public selectedLocusAnnotation: SampleLocusAnnotation;
    public errorMessage: string;
    private selectedBinEstimator: BinEstimatorProject;
    private selectedBins: Map<number, Bin>;
    
    private sampleSortingParam: string = 'barcode';
    private reverseSampleSorting = true;
    
    public navItems;
    public header;
    
    private _sampleAnnotations: SampleAnnotation[] = [];
    private selectedLocusAnnotationIndex = 0;
    
    
    constructor(
        private _genotypingProjectService: GenotypingProjectService,
        private _binEstimatorProjectService: BinEstimatorProjectService,
        private _routeParams: RouteParams,
        private _router: Router
    ) {}
    
    private getBinEstimator = (proj: GenotypingProject) => {
        console.log("Getting Bin Estimator");
        
        return this._binEstimatorProjectService.getBinEstimatorProject(proj.bin_estimator_id);
    }
    
    private selectLocusAnnotation() {
        let annotation = this.selectedSampleLocusAnnotations[this.selectedLocusAnnotationIndex];
        if(annotation.reference_run_id) {}
        this.selectedBins = null;
        this.selectedLocusAnnotation = annotation;
        if(this.selectedBinEstimator.locus_bin_sets.get(this.selectedLocusAnnotation.locus_id)) {
            this.selectedBins = this.selectedBinEstimator.locus_bin_sets.get(this.selectedLocusAnnotation.locus_id).bins;
        };
    }
    
    getProject(id) {
        this._genotypingProjectService.getProject(+this._routeParams.get('project_id'))
                .map((project) => {
                    this.selectedProject = project;
                    this.selectedSample = null;
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
                    binEstimator => this.selectedBinEstimator = <BinEstimatorProject> binEstimator,
                    err => this.errorMessage = err
                )
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
    
    private eventHandler(event: KeyboardEvent) {
        console.log(event, event.keyCode);
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
                this.selectedSample = sample_annotation.sample
                this.selectedSampleLocusAnnotations = sampleLocusAnnotations;
                this.sortAnnotations();
                console.log(sampleLocusAnnotations);
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
    
    private goToLink(dest: String, params: Object) {
        let link = [dest, params];
        this._router.navigate(link);
    }
  
    ngOnInit() {
        this.getProject(+this._routeParams.get('project_id'));
    }
}