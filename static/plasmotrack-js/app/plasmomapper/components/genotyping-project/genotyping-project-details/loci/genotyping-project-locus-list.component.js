System.register(['angular2/core', 'angular2/router', '../../../../pipes/locus.pipe', '../../../layout/section-header.component', '../../../project/locus-parameters-list.component', '../../../project/common-locus-parameters-detail.component', '../../../project/locus-parameters-detail.component', '../../../../services/genotyping-project/genotyping-project.service', '../../../../services/locus/locus.service', '../../../../services/bin-estimator-project/bin-estimator-project.service', '../../sample-annotation-editor.component'], function(exports_1, context_1) {
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
    var core_1, router_1, locus_pipe_1, section_header_component_1, locus_parameters_list_component_1, common_locus_parameters_detail_component_1, locus_parameters_detail_component_1, genotyping_project_service_1, locus_service_1, bin_estimator_project_service_1, sample_annotation_editor_component_1;
    var GenotypingProjectLocusList;
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
            function (locus_parameters_list_component_1_1) {
                locus_parameters_list_component_1 = locus_parameters_list_component_1_1;
            },
            function (common_locus_parameters_detail_component_1_1) {
                common_locus_parameters_detail_component_1 = common_locus_parameters_detail_component_1_1;
            },
            function (locus_parameters_detail_component_1_1) {
                locus_parameters_detail_component_1 = locus_parameters_detail_component_1_1;
            },
            function (genotyping_project_service_1_1) {
                genotyping_project_service_1 = genotyping_project_service_1_1;
            },
            function (locus_service_1_1) {
                locus_service_1 = locus_service_1_1;
            },
            function (bin_estimator_project_service_1_1) {
                bin_estimator_project_service_1 = bin_estimator_project_service_1_1;
            },
            function (sample_annotation_editor_component_1_1) {
                sample_annotation_editor_component_1 = sample_annotation_editor_component_1_1;
            }],
        execute: function() {
            GenotypingProjectLocusList = (function () {
                function GenotypingProjectLocusList(_genotypingProjectService, _binEstimatorProjectService, _locusService, _routeParams, _router) {
                    var _this = this;
                    this._genotypingProjectService = _genotypingProjectService;
                    this._binEstimatorProjectService = _binEstimatorProjectService;
                    this._locusService = _locusService;
                    this._routeParams = _routeParams;
                    this._router = _router;
                    this.locusParameters = [];
                    this.isSubmitting = false;
                    this.locusParamsCollapsed = false;
                    this.filteredLocusAnnotations = [];
                    this.filteredLocusAnnotationIndex = 0;
                    this.getBinEstimator = function (proj) {
                        console.log("Getting Bin Estimator");
                        return _this._binEstimatorProjectService.getBinEstimatorProject(proj.bin_estimator_id);
                    };
                }
                GenotypingProjectLocusList.prototype.countOf = function (object, status) {
                    var count = 0;
                    for (var k in object) {
                        if (object[k] == status) {
                            count++;
                        }
                    }
                    return count;
                };
                GenotypingProjectLocusList.prototype.getProject = function () {
                    var _this = this;
                    console.log("Getting Project");
                    var id = +this._routeParams.get('project_id');
                    this._genotypingProjectService.getProject(id)
                        .map(function (project) {
                        console.log(project);
                        _this.selectedProject = project;
                        _this.loadLocusParameters();
                        _this.header = _this.selectedProject.title + " Loci";
                        _this.navItems = [
                            {
                                label: 'Details',
                                click: function () { return _this.goToLink('GenotypingProjectDetail', { project_id: _this.selectedProject.id }); },
                                active: false
                            },
                            {
                                label: 'Samples',
                                click: function () { return _this.goToLink('GenotypingProjectSampleList', { project_id: _this.selectedProject.id }); },
                                active: false
                            },
                            {
                                label: 'Loci',
                                click: function () { return _this.goToLink('GenotypingProjectLocusList', { project_id: _this.selectedProject.id }); },
                                active: true
                            }
                        ];
                        return project;
                    })
                        .concatMap(this.getBinEstimator)
                        .subscribe(function (binEstimator) { return _this.selectedBinEstimator = binEstimator; }, function (err) { return _this.errorMessage = err; });
                };
                GenotypingProjectLocusList.prototype.loadLocusParameters = function () {
                    var _this = this;
                    this.locusParameters = [];
                    this.selectedProject.locus_parameters.forEach(function (locus_param, id) {
                        _this.locusParameters.push(locus_param);
                    });
                };
                GenotypingProjectLocusList.prototype.goToLink = function (dest, params) {
                    var link = [dest, params];
                    this._router.navigate(link);
                };
                GenotypingProjectLocusList.prototype.getFailureRate = function (locusAnnotations) {
                    var _this = this;
                    this.failureRate = 0;
                    locusAnnotations.forEach(function (locusAnnotation) {
                        if (locusAnnotation.flags['failure']) {
                            _this.failureRate += 1 / locusAnnotations.length;
                        }
                    });
                    console.log(this.failureRate);
                };
                GenotypingProjectLocusList.prototype.filterLocusAnnotations = function () {
                    var _this = this;
                    this.filteredLocusAnnotations = [];
                    this.filteredLocusAnnotationIndex = 0;
                    this.selectedLocusAnnotation = null;
                    this.selectedLocusAnnotations.forEach(function (locusAnnotation) {
                        if (_this.filters.failures) {
                            if (locusAnnotation.flags['failure']) {
                                _this.filteredLocusAnnotations.push(locusAnnotation);
                            }
                        }
                        else if (_this.filters.offscale) {
                            if (locusAnnotation.flags['offscale']) {
                                _this.filteredLocusAnnotations.push(locusAnnotation);
                            }
                        }
                        else {
                            var main_peak_1 = null;
                            locusAnnotation.annotated_peaks.forEach(function (peak) {
                                if (main_peak_1) {
                                    if (peak['peak_height'] > main_peak_1['peak_height']) {
                                        main_peak_1 = peak;
                                    }
                                }
                                else {
                                    main_peak_1 = peak;
                                }
                            });
                            for (var index = 0; index < locusAnnotation.annotated_peaks.length; index++) {
                                var peak = locusAnnotation.annotated_peaks[index];
                                if (peak['bleedthrough_ratio'] > _this.filters.bleedthrough &&
                                    peak['crosstalk_ratio'] > _this.filters.crosstalk &&
                                    _this.filters.main_min_peak_height < main_peak_1['peak_height'] &&
                                    main_peak_1['peak_height'] < _this.filters.main_max_peak_height &&
                                    _this.countOf(locusAnnotation.alleles, true) >= _this.filters.min_allele_count &&
                                    _this.countOf(locusAnnotation.alleles, true) <= _this.filters.max_allele_count) {
                                    _this.filteredLocusAnnotations.push(locusAnnotation);
                                    break;
                                }
                            }
                        }
                    });
                    this.selectLocusAnnotation();
                };
                GenotypingProjectLocusList.prototype.clearFilter = function () {
                    var _this = this;
                    this.filters = {
                        failures: false,
                        offscale: false,
                        min_allele_count: 0,
                        max_allele_count: Object.keys(this.selectedLocusAnnotations[0].alleles).length,
                        bleedthrough: 0,
                        crosstalk: 0,
                        main_min_peak_height: 0,
                        main_max_peak_height: 40000
                    };
                    this.filteredLocusAnnotations = [];
                    this.selectedLocusAnnotations.forEach(function (annotation) {
                        if (annotation.reference_channel_id) {
                            _this.filteredLocusAnnotations.push(annotation);
                        }
                    });
                };
                GenotypingProjectLocusList.prototype.getLocusAnnotations = function () {
                    var _this = this;
                    return this._genotypingProjectService.getLocusAnnotations(this.selectedProject.id, this.selectedLocus.id)
                        .map(function (locusAnnotations) {
                        console.log(locusAnnotations);
                        _this.selectedLocusAnnotations = locusAnnotations;
                        _this.getFailureRate(locusAnnotations);
                        _this.selectedLocusAnnotation = locusAnnotations[0];
                    });
                };
                GenotypingProjectLocusList.prototype.selectLocusAnnotation = function () {
                    if (this.filteredLocusAnnotations.length > this.filteredLocusAnnotationIndex) {
                        this.selectedLocusAnnotation = this.filteredLocusAnnotations[this.filteredLocusAnnotationIndex];
                    }
                    else if (this.filteredLocusAnnotations.length > 0) {
                        this.filteredLocusAnnotationIndex = 0;
                        this.selectedLocusAnnotation = this.filteredLocusAnnotations[this.filteredLocusAnnotationIndex];
                    }
                    else {
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
                };
                GenotypingProjectLocusList.prototype.eventHandler = function (event) {
                    console.log(event, event.keyCode);
                    if (this.filteredLocusAnnotations) {
                        if (event.keyCode == 38) {
                            if (this.filteredLocusAnnotationIndex > 0) {
                                this.filteredLocusAnnotationIndex--;
                                this.selectLocusAnnotation();
                                event.preventDefault();
                            }
                        }
                        else if (event.keyCode == 40) {
                            if (this.filteredLocusAnnotationIndex < this.filteredLocusAnnotations.length - 1) {
                                this.filteredLocusAnnotationIndex++;
                                this.selectLocusAnnotation();
                                event.preventDefault();
                            }
                        }
                    }
                };
                GenotypingProjectLocusList.prototype.selectLocus = function (locus_id) {
                    var _this = this;
                    this.selectedLocus = null;
                    this.failureRate = null;
                    this.selectedLocusParameter = null;
                    this.selectedLocusAnnotation = null;
                    this.filteredLocusAnnotations = [];
                    this.selectedLocusAnnotations = null;
                    if (!this.isSubmitting) {
                        this._locusService.getLocus(locus_id)
                            .subscribe(function (locus) {
                            _this.selectedLocus = locus;
                            _this.selectedLocusParameter = _this.selectedProject.locus_parameters.get(locus_id);
                            if (_this.selectedBinEstimator.locus_bin_sets.has(_this.selectedLocus.id)) {
                                _this.selectedBins = _this.selectedBinEstimator.locus_bin_sets.get(_this.selectedLocus.id).bins;
                            }
                            ;
                            _this.getLocusAnnotations().subscribe(function () { return _this.clearFilter(); });
                        });
                    }
                };
                GenotypingProjectLocusList.prototype.locusParamsSaved = function () {
                    var _this = this;
                    this.locusParameters = [];
                    this.selectedProject.locus_parameters.forEach(function (locusParam, id) {
                        _this.locusParameters.push(locusParam);
                    });
                };
                GenotypingProjectLocusList.prototype.saveLocusParams = function (id) {
                    var _this = this;
                    var locusParameter = this.selectedProject.locus_parameters.get(id);
                    if (locusParameter.isDirty || locusParameter.filter_parameters_stale || locusParameter.scanning_parameters_stale) {
                        this.isSubmitting = true;
                        this._genotypingProjectService.saveLocusParameters(locusParameter).subscribe(function (locusParam) {
                            _this._genotypingProjectService.clearCache(locusParam.project_id);
                            _this.getProject();
                            _this.selectLocus(locusParam.locus_id);
                            _this.isSubmitting = false;
                        }, function (error) { return _this.errorMessage = error; });
                    }
                };
                GenotypingProjectLocusList.prototype.saveAnnotations = function () {
                    var _this = this;
                    this.isSubmitting = true;
                    var annots = [];
                    this.selectedLocusAnnotations.forEach(function (annotation) {
                        if (annotation.isDirty) {
                            annots.push(annotation);
                        }
                    });
                    this._genotypingProjectService.saveAnnotations(annots)
                        .subscribe(function () {
                        _this.getLocusAnnotations().subscribe(function () {
                            _this.filterLocusAnnotations();
                            _this.isSubmitting = false;
                        });
                    }, function (err) {
                        _this.errorMessage = err;
                        _this.isSubmitting = false;
                    });
                };
                GenotypingProjectLocusList.prototype.onChanged = function (e) {
                    console.log(this.filters);
                    this.selectedLocusParameter.isDirty = true;
                };
                GenotypingProjectLocusList.prototype.ngOnInit = function () {
                    this.getProject();
                };
                GenotypingProjectLocusList = __decorate([
                    core_1.Component({
                        selector: 'genotyping-project-locus-list',
                        pipes: [locus_pipe_1.LocusPipe],
                        host: {
                            '(document:keydown)': 'eventHandler($event)'
                        },
                        template: "\n        <pm-section-header [header]=\"header\" [navItems]=\"navItems\"></pm-section-header>\n        <div class=\"row\">\n            <div *ngIf=\"selectedProject\" class=\"col-sm-1\">\n                <pm-locus-parameter-list class=\"list-panel\" [(locusParameters)]=\"locusParameters\" (locusClicked)=\"selectLocus($event)\">\n                </pm-locus-parameter-list>\n            </div>\n            <div *ngIf=\"selectedLocusParameter\" class=\"col-sm-4\">\n                <div class=\"row\">\n                    <div class=\"panel panel-default\">\n                        <div (click)=\"locusParamsCollapsed = !locusParamsCollapsed\" class=\"panel-heading\">\n                            <div class=\"h3 panel-title\">\n                                <span>{{selectedLocusParameter.locus_id | locus | async}}</span> <span *ngIf=\"selectedLocusAnnotations\"> | {{selectedLocusAnnotations.length}} Samples </span> <span *ngIf=\"failureRate\"> | Failure Rate: {{failureRate | number}}</span>\n                                <span *ngIf=\"locusParamsCollapsed\" class=\"glyphicon glyphicon-menu-right pull-right\"></span>\n                                <span *ngIf=\"!locusParamsCollapsed\" class=\"glyphicon glyphicon-menu-down pull-right\"></span> \n                            </div>\n                        </div>\n                        <div *ngIf=\"!locusParamsCollapsed\" class=\"panel-body\">\n                            <form (ngSubmit)=\"saveLocusParams(selectedLocusParameter.locus_id)\">\n                                <pm-common-locus-parameter-detail [(locusParameter)]=\"selectedLocusParameter\"></pm-common-locus-parameter-detail>\n                                <div class=\"row\">\n                                    <div class=\"col-sm-12\">\n                                        <h4>Genotyping Settings</h4>\n                                        <div class=\"col-sm-6\">\n                                            <div class=\"form-group\">\n                                                <label>Min Relative Peak Height</label>\n                                                <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" max=\"1\" [(ngModel)]=\"selectedLocusParameter.relative_peak_height_limit\">\n                                            </div>\n                                            <div class=\"form-group\">\n                                                <label>Min Absolute Peak Height</label>\n                                                <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"selectedLocusParameter.absolute_peak_height_limit\">\n                                            </div>\n                                            <div class=\"form-group\">\n                                                <label>Bleedthrough Limit</label>\n                                                <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"selectedLocusParameter.bleedthrough_filter_limit\">\n                                            </div>\n                                            <div class=\"form-group\">\n                                                <label>Crosstalk Limit</label>\n                                                <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"selectedLocusParameter.crosstalk_filter_limit\">\n                                            </div>\n                                        </div>                                \n                                        <div class=\"col-sm-6\">\n                                            <div class=\"form-group\">\n                                                <label>Soft Artifact SD Limit</label>\n                                                <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"selectedLocusParameter.soft_artifact_sd_limit\">\n                                            </div>\n                                            <div class=\"form-group\">\n                                                <label>Hard Artifact SD Limit</label>\n                                                <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"selectedLocusParameter.hard_artifact_sd_limit\">\n                                            </div>\n                                            <div class=\"form-group\">\n                                                <label>Offscale Threshold</label>\n                                                <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"selectedLocusParameter.offscale_threshold\">\n                                            </div>\n                                            <div class=\"form-group\">\n                                                <label>Failure Threshold</label>\n                                                <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"selectedLocusParameter.failure_threshold\">\n                                            </div>\n                                        </div>\n                                    </div>\n                                </div>\n                                <button type=\"submit\" class=\"btn btn-default\" [ngClass]=\"{disabled: isSubmitting}\">Save and Analyze</button>\n                                <span *ngIf=\"isSubmitting\" class=\"label label-info\">Saving and Analyzing Locus...This May Take A While...</span>\n                            </form>\n                        </div>\n                    </div>\n                </div>\n                <div *ngIf=\"selectedLocusAnnotations\" class=\"row\">\n                    <div class=\"panel panel-default\">\n                        <div class=\"panel-heading\">\n                            <div class=\"h3 panel-title\">\n                                Annotations Filters\n                            </div>\n                        </div>\n                        <div class=\"panel-body\">\n                            <form>\n                                <div class=\"col-sm-6\">\n                                    <div class=\"form-group\">\n                                        <input type=\"checkbox\" (change)=\"filters.offscale=false\" [(ngModel)]=\"filters.failures\"> Failures Only\n                                    </div>\n                                    <div class=\"form-group\">\n                                        <input type=\"checkbox\" (change)=\"filters.failures=false\" [(ngModel)]=\"filters.offscale\"> Offscale Only\n                                    </div>\n                                    <div class=\"form-group\">\n                                        <label>Crosstalk Limit</label>\n                                        <input class=\"form-control\" type=\"number\" step=\"any\" min=0 [(ngModel)]=\"filters.crosstalk\" [disabled]=\"filters.failures || filters.offscale\">\n                                    </div>\n                                    <div class=\"form-group\">\n                                        <label>Bleedthrough Limit</label>\n                                        <input class=\"form-control\" type=\"number\" step=\"any\" min=0 [(ngModel)]=\"filters.bleedthrough\" [disabled]=\"filters.failures || filters.offscale\">\n                                    </div>\n                                </div>\n                                <div class=\"col-sm-6\">\n                                    <div class=\"form-group\">\n                                        <label>Min Allele Count</label>\n                                        <input class=\"form-control\" type=\"number\" [(ngModel)]=\"filters.min_allele_count\" [disabled]=\"filters.failures || filters.offscale\">\n                                    </div>\n                                    <div class=\"form-group\">\n                                        <label>Max Allele Count</label>\n                                        <input class=\"form-control\" type=\"number\" [(ngModel)]=\"filters.max_allele_count\" [disabled]=\"filters.failures || filters.offscale\">\n                                    </div>\n                                    <div class=\"form-group\">\n                                        <label>Min Main Peak Height</label>\n                                        <input class=\"form-control\" type=\"number\" [(ngModel)]=\"filters.main_min_peak_height\" [disabled]=\"filters.failures || filters.offscale\">    \n                                    </div>\n                                    <div class=\"form-group\">\n                                        <label>Max Main Peak Height</label>\n                                        <input class=\"form-control\" type=\"number\" [(ngModel)]=\"filters.main_max_peak_height\" [disabled]=\"filters.failures || filters.offscale\">\n                                    </div>\n                                </div>\n                                <button class=\"btn btn-default\" (click)=\"filterLocusAnnotations()\">Filter Annotations</button>\n                                <button class=\"btn btn-default\" (click)=\"clearFilter()\">Clear Filter</button>\n                                <button class=\"btn btn-default\" (click)=\"saveAnnotations()\">Save Annotations</button>\n                            </form>\n                        </div>\n                    </div>\n                </div>\n            </div>\n            <div class=\"col-sm-7\">\n                <div *ngIf=\"selectedLocusParameter\">\n                    <div class=\"row\">\n                        <div class=\"col-sm-12\">\n                            <div class=\"panel panel-default\">\n                                <div class=\"panel-heading\">\n                                    <h3 *ngIf=\"selectedLocusAnnotation\" class=\"panel-title\">{{selectedProject.sample_annotations.get(selectedLocusAnnotation.sample_annotations_id).sample.barcode}}</h3>\n                                </div>\n                                <div class=\"panel-body\">\n                                    <div id=\"channel_plot\" style=\"height: 30vh\">\n                                        <pm-d3-sample-annotation-editor *ngIf=\"selectedLocusAnnotation\" [locusAnnotation]=\"selectedLocusAnnotation\" [bins]=\"selectedBins\"></pm-d3-sample-annotation-editor>\n                                    </div>\n                                </div>\n                            </div>\n                        </div>\n                    </div>\n                    <div class=\"row\">\n                        <div class=\"col-sm-12\">\n                            <div class=\"panel panel-default\">\n                                <div class=\"panel-heading\">\n                                    <div class=\"h3 panel-title\">\n                                        <span>Filtered Annotations</span> <span *ngIf=\"filteredLocusAnnotations.length > 0\"> | {{filteredLocusAnnotations.length}} Results </span> <span *ngIf=\"filteredLocusAnnotations.length > 0\" class='pull-right'> {{filteredLocusAnnotationIndex + 1}} / {{filteredLocusAnnotations.length}} </span>\n                                    </div>\n                                </div>\n                                <div class=\"panel-body\">\n                                    <div class=\"table-responsive\" style=\"overflow: auto; height: 45vh\">\n                                        <table class=\"table table-striped table-hover table-condensed\">\n                                            <thead>\n                                                <tr>\n                                                    <th>Barcode</th>\n                                                    <th># Alleles</th>\n                                                    <th># Peaks</th>\n                                                    <th>Offscale</th>\n                                                    <th>Failure</th>\n                                                    <th>Manual</th>\n                                                </tr>\n                                            </thead>\n                                            <tbody>\n                                                <tr [ngClass]=\"{success: annotation.id==selectedLocusAnnotation?.id, warning: annotation.isDirty}\" *ngFor=\"#annotation of filteredLocusAnnotations; #i = index\" (click)=\"filteredLocusAnnotationIndex = i; selectLocusAnnotation()\">\n                                                    <td>{{selectedProject.sample_annotations.get(annotation.sample_annotations_id).sample.barcode}}</td>\n                                                    <td>{{countOf(annotation.alleles, true)}}</td>\n                                                    <td>{{annotation.annotated_peaks?.length}}</td>\n                                                    <td><span class=\"glyphicon glyphicon-ok\" *ngIf=\"annotation.flags['offscale']\"></span></td>\n                                                    <td><span class=\"glyphicon glyphicon-ok\" *ngIf=\"annotation.flags['failure']\"></span></td>\n                                                    <td><span class=\"glyphicon glyphicon-ok\" *ngIf=\"annotation.flags['manual_curation']\"></span></td>\n                                                </tr>\n                                            </tbody>\n                                        </table>\n                                    </div>\n                                </div>\n                            </div>\n                        </div>\n                    </div>\n                </div>\n            </div>\n        </div>\n    ",
                        directives: [section_header_component_1.SectionHeaderComponent, locus_parameters_list_component_1.LocusParametersListComponent, common_locus_parameters_detail_component_1.CommonLocusParametersDetailComponent, locus_parameters_detail_component_1.LocusParametersDetailComponent, sample_annotation_editor_component_1.D3SampleAnnotationEditor]
                    }), 
                    __metadata('design:paramtypes', [genotyping_project_service_1.GenotypingProjectService, bin_estimator_project_service_1.BinEstimatorProjectService, locus_service_1.LocusService, router_1.RouteParams, router_1.Router])
                ], GenotypingProjectLocusList);
                return GenotypingProjectLocusList;
            }());
            exports_1("GenotypingProjectLocusList", GenotypingProjectLocusList);
        }
    }
});
//# sourceMappingURL=genotyping-project-locus-list.component.js.map