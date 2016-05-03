System.register(['angular2/core', 'angular2/router', '../../../../pipes/locus.pipe', '../../../layout/section-header.component', '../../../../services/genotyping-project/genotyping-project.service', '../../../../services/bin-estimator-project/bin-estimator-project.service', '../../../project/samples-list.component', '../../sample-annotation-editor.component'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
        var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
        else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
    };
    var __metadata = (this && this.__metadata) || function (k, v) {
        if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
    };
    var core_1, router_1, locus_pipe_1, section_header_component_1, genotyping_project_service_1, bin_estimator_project_service_1, samples_list_component_1, sample_annotation_editor_component_1;
    var GenotypingProjectSampleList;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (router_1_1) {
                router_1 = router_1_1;
            },
            function (locus_pipe_1_1) {
                locus_pipe_1 = locus_pipe_1_1;
            },
            function (section_header_component_1_1) {
                section_header_component_1 = section_header_component_1_1;
            },
            function (genotyping_project_service_1_1) {
                genotyping_project_service_1 = genotyping_project_service_1_1;
            },
            function (bin_estimator_project_service_1_1) {
                bin_estimator_project_service_1 = bin_estimator_project_service_1_1;
            },
            function (samples_list_component_1_1) {
                samples_list_component_1 = samples_list_component_1_1;
            },
            function (sample_annotation_editor_component_1_1) {
                sample_annotation_editor_component_1 = sample_annotation_editor_component_1_1;
            }],
        execute: function() {
            GenotypingProjectSampleList = (function () {
                function GenotypingProjectSampleList(_genotypingProjectService, _binEstimatorProjectService, _routeParams, _router) {
                    var _this = this;
                    this._genotypingProjectService = _genotypingProjectService;
                    this._binEstimatorProjectService = _binEstimatorProjectService;
                    this._routeParams = _routeParams;
                    this._router = _router;
                    this.sampleSortingParam = 'barcode';
                    this.reverseSampleSorting = true;
                    this._sampleAnnotations = [];
                    this.selectedLocusAnnotationIndex = 0;
                    this.getBinEstimator = function (proj) {
                        console.log("Getting Bin Estimator");
                        return _this._binEstimatorProjectService.getBinEstimatorProject(proj.bin_estimator_id);
                    };
                }
                GenotypingProjectSampleList.prototype.selectLocusAnnotation = function () {
                    var annotation = this.selectedSampleLocusAnnotations[this.selectedLocusAnnotationIndex];
                    if (annotation.reference_run_id) { }
                    this.selectedBins = null;
                    this.selectedLocusAnnotation = annotation;
                    if (this.selectedBinEstimator.locus_bin_sets.get(this.selectedLocusAnnotation.locus_id)) {
                        this.selectedBins = this.selectedBinEstimator.locus_bin_sets.get(this.selectedLocusAnnotation.locus_id).bins;
                    }
                    ;
                };
                GenotypingProjectSampleList.prototype.getProject = function (id) {
                    var _this = this;
                    this._genotypingProjectService.getProject(+this._routeParams.get('project_id'))
                        .map(function (project) {
                        _this.selectedProject = project;
                        _this.selectedSample = null;
                        project.sample_annotations.forEach(function (sampleAnnotation) {
                            _this._sampleAnnotations.push(sampleAnnotation);
                        });
                        _this.sortSamples();
                        _this.header = _this.selectedProject.title + " Samples";
                        _this.navItems = [
                            {
                                label: 'Details',
                                click: function () { return _this.goToLink('GenotypingProjectDetail', { project_id: _this.selectedProject.id }); },
                                active: false
                            },
                            {
                                label: 'Samples',
                                click: function () { return _this.goToLink('GenotypingProjectSampleList', { project_id: _this.selectedProject.id }); },
                                active: true
                            },
                            {
                                label: 'Loci',
                                click: function () { return _this.goToLink('GenotypingProjectLocusList', { project_id: _this.selectedProject.id }); },
                                active: false
                            }
                        ];
                        return project;
                    })
                        .concatMap(this.getBinEstimator)
                        .subscribe(function (binEstimator) { return _this.selectedBinEstimator = binEstimator; }, function (err) { return _this.errorMessage = err; });
                };
                GenotypingProjectSampleList.prototype.countOf = function (object, status) {
                    var count = 0;
                    for (var k in object) {
                        if (object[k] == status) {
                            count++;
                        }
                    }
                    return count;
                };
                GenotypingProjectSampleList.prototype.eventHandler = function (event) {
                    console.log(event, event.keyCode);
                    if (this.selectedSampleLocusAnnotations) {
                        if (event.keyCode == 38) {
                            if (this.selectedLocusAnnotationIndex > 0) {
                                this.selectedLocusAnnotationIndex--;
                                this.selectLocusAnnotation();
                                event.preventDefault();
                            }
                        }
                        else if (event.keyCode == 40) {
                            if (this.selectedLocusAnnotationIndex < this.selectedSampleLocusAnnotations.length - 1) {
                                this.selectedLocusAnnotationIndex++;
                                this.selectLocusAnnotation();
                                event.preventDefault();
                            }
                        }
                    }
                };
                GenotypingProjectSampleList.prototype.selectSample = function (sample_annotation) {
                    var _this = this;
                    this._genotypingProjectService.getSampleLocusAnnotations(sample_annotation.project_id, sample_annotation.sample.id)
                        .subscribe(function (sampleLocusAnnotations) {
                        _this.selectedLocusAnnotation = null;
                        _this.selectedSample = sample_annotation.sample;
                        _this.selectedSampleLocusAnnotations = sampleLocusAnnotations;
                        _this.sortAnnotations();
                        console.log(sampleLocusAnnotations);
                    });
                };
                GenotypingProjectSampleList.prototype.sortAnnotations = function () {
                    this.selectedSampleLocusAnnotations.sort(function (a, b) {
                        if (a.locus_id > b.locus_id) {
                            return 1;
                        }
                        else if (a.locus_id < b.locus_id) {
                            return -1;
                        }
                        else {
                            return 0;
                        }
                    });
                };
                GenotypingProjectSampleList.prototype.sortSamples = function () {
                    var _this = this;
                    var inSample = false;
                    if (['barcode', 'designation'].indexOf(this.sampleSortingParam) >= 0) {
                        inSample = true;
                    }
                    this._sampleAnnotations.sort(function (a, b) {
                        if (inSample) {
                            var c = a.sample[_this.sampleSortingParam];
                            var d = b.sample[_this.sampleSortingParam];
                        }
                        else {
                            var c = a[_this.sampleSortingParam];
                            var d = b[_this.sampleSortingParam];
                        }
                        if (c > d) {
                            return 1;
                        }
                        else if (c < d) {
                            return -1;
                        }
                        else {
                            return 0;
                        }
                    });
                    if (this.reverseSampleSorting) {
                        this._sampleAnnotations.reverse();
                    }
                };
                GenotypingProjectSampleList.prototype.goToLink = function (dest, params) {
                    var link = [dest, params];
                    this._router.navigate(link);
                };
                GenotypingProjectSampleList.prototype.ngOnInit = function () {
                    this.getProject(+this._routeParams.get('project_id'));
                };
                GenotypingProjectSampleList = __decorate([
                    core_1.Component({
                        selector: 'genotyping-project-sample-list',
                        pipes: [locus_pipe_1.LocusPipe],
                        host: {
                            '(document:keydown)': 'eventHandler($event)'
                        },
                        template: "\n        <pm-section-header [header]=\"header\" [navItems]=\"navItems\"></pm-section-header>\n        <div class=\"row\">\n            <div class=\"col-sm-6\">\n                <div class=\"panel panel-default\">\n                    <div class=\"panel-heading\">\n                        <div class=\"h3 panel-title\">\n                            <span>Samples</span>\n                        </div>\n                    </div>\n                    <div class=\"panel-body\">\n                        <div class=\"table-responsive\" style=\"overflow: auto; height:80vh\">\n                            <table class=\"table table-striped table-hover table-condensed\">\n                                <thead>\n                                    <tr>\n                                        <th (click)=\"reverseSampleSorting = !reverseSampleSorting; sampleSortingParam = 'barcode'; sortSamples()\">Barcode</th>\n                                        <th (click)=\"reverseSampleSorting = !reverseSampleSorting; sampleSortingParam = 'designation'; sortSamples()\">Designation</th>\n                                        <th (click)=\"reverseSampleSorting = !reverseSampleSorting; sampleSorgingParam = 'moi'; sortSamples()\">MOI</th>\n                                        <th>Last Updated</th>\n                                    </tr>\n                                </thead>\n                                <tbody>\n                                    <tr *ngFor=\"#sample_annotation of _sampleAnnotations\" (click)=\"selectSample(sample_annotation)\" [ngClass]=\"{success:sample_annotation.sample.id==selectedSample?.id}\">\n                                        <td>{{sample_annotation.sample.barcode}}</td>\n                                        <td>{{sample_annotation.sample.designation}}</td>\n                                        <td>{{sample_annotation.moi}}</td>\n                                        <td>{{sample_annotation.last_updtaed | date: \"fullDate\"}}</td>\n                                    </tr>\n                                </tbody>\n                            </table>\n                        </div>\n                    </div>\n                </div>\n            </div>\n            <div *ngIf=\"selectedSampleLocusAnnotations\" class=\"col-sm-6\">\n                <div class=\"row\">\n                    <div class=\"col-sm-12\">\n                        <div *ngIf=\"selectedLocusAnnotation\" class=\"panel panel-default\">\n                            <div class=\"panel-heading\">\n                                <div class=\"h3 panel-title\">\n                                    {{selectedLocusAnnotation.locus_id | locus | async}}\n                                </div>\n                            </div>\n                            <div *ngIf=\"selectedLocusAnnotation.reference_channel_id\" class=\"panel-body\">\n                                <div id=\"channel_plot\" style=\"height: 30vh\">\n                                    <pm-d3-sample-annotation-editor [locusAnnotation]=\"selectedLocusAnnotation\" [bins]=\"selectedBins\"></pm-d3-sample-annotation-editor>\n                                </div>\n                            </div>\n                        </div>\n                        <div *ngIf=\"!selectedLocusAnnotation\" class=\"panel panel-default\">\n                            <div class=\"panel-heading\">\n                                <div class=\"h3 panel-title\">\n                                    Select An Annotation\n                                </div>\n                            </div>\n                        </div>\n                    </div>\n                    <div class=\"col-sm-12\">\n                        <div class=\"panel panel-default\">\n                            <div class=\"panel-heading\">\n                                <h3 class=\"panel-title\">Locus Annotations</h3>\n                            </div>\n                            <div class=\"panel-body\">\n                                <div class=\"table-responsive\" style=\"overflow: auto; height: 35vh\">\n                                    <table class=\"table table-striped table-hover table-condensed\">\n                                        <thead>\n                                            <tr>\n                                                <th>Locus</th>\n                                                <th># Alleles</th>\n                                                <th># Peaks</th>\n                                                <th>Offscale</th>\n                                                <th>Failure</th>\n                                                <th>Manual</th>\n                                            </tr>\n                                        </thead>\n                                        <tbody>\n                                            <tr *ngFor=\"#annotation of selectedSampleLocusAnnotations; #i = index\" (click)=\"selectedLocusAnnotationIndex = i; selectLocusAnnotation()\" [ngClass]=\"{success:annotation==selectedLocusAnnotation, danger:!annotation.reference_run_id, warning: annotation.isDirty}\">\n                                                <td>{{annotation.locus_id | locus | async}}</td>\n                                                <td>{{countOf(annotation.alleles, true)}}</td>\n                                                <td>{{annotation.annotated_peaks?.length}}</td>\n                                                <td><span class=\"glyphicon glyphicon-ok\" *ngIf=\"annotation.flags['offscale']\"></span></td>\n                                                <td><span class=\"glyphicon glyphicon-ok\" *ngIf=\"annotation.flags['failure']\"></span></td>\n                                                <td><span class=\"glyphicon glyphicon-ok\" *ngIf=\"annotation.flags['manual_curation']\"></span></td>\n                                            </tr>\n                                        </tbody>\n                                    </table>\n                                </div>\n                            </div>\n                        </div>\n                    </div>\n                </div>\n            </div>\n        </div>\n    ",
                        directives: [samples_list_component_1.SampleListComponent, section_header_component_1.SectionHeaderComponent, sample_annotation_editor_component_1.D3SampleAnnotationEditor]
                    }), 
                    __metadata('design:paramtypes', [genotyping_project_service_1.GenotypingProjectService, bin_estimator_project_service_1.BinEstimatorProjectService, router_1.RouteParams, router_1.Router])
                ], GenotypingProjectSampleList);
                return GenotypingProjectSampleList;
            }());
            exports_1("GenotypingProjectSampleList", GenotypingProjectSampleList);
        }
    }
});
//# sourceMappingURL=genotyping-project-sample-list.component.js.map