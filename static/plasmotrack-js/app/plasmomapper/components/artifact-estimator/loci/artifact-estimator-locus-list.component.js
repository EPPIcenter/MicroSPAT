System.register(['angular2/core', 'angular2/router', 'angular2/common', '../../../pipes/locus.pipe', '../../layout/section-header.component', '../../project/locus-parameters-list.component', '../../project/common-locus-parameters-detail.component', '../../../services/bin-estimator-project/bin-estimator-project.service', '../../../services/locus/locus.service', '../../../services/artifact-estimator-project/artifact-estimator-project.service', '../locus-artifact-estimator/d3-artifact-estimator-panel.component'], function(exports_1, context_1) {
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
    var core_1, router_1, common_1, locus_pipe_1, section_header_component_1, locus_parameters_list_component_1, common_locus_parameters_detail_component_1, bin_estimator_project_service_1, locus_service_1, artifact_estimator_project_service_1, d3_artifact_estimator_panel_component_1;
    var ArtifactEstimatorLocusListComponent;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (router_1_1) {
                router_1 = router_1_1;
            },
            function (common_1_1) {
                common_1 = common_1_1;
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
            function (bin_estimator_project_service_1_1) {
                bin_estimator_project_service_1 = bin_estimator_project_service_1_1;
            },
            function (locus_service_1_1) {
                locus_service_1 = locus_service_1_1;
            },
            function (artifact_estimator_project_service_1_1) {
                artifact_estimator_project_service_1 = artifact_estimator_project_service_1_1;
            },
            function (d3_artifact_estimator_panel_component_1_1) {
                d3_artifact_estimator_panel_component_1 = d3_artifact_estimator_panel_component_1_1;
            }],
        execute: function() {
            ArtifactEstimatorLocusListComponent = (function () {
                function ArtifactEstimatorLocusListComponent(_artifactEstimatorProjectService, _binEstimatorProjectService, _routeParams, _router, _locusService) {
                    var _this = this;
                    this._artifactEstimatorProjectService = _artifactEstimatorProjectService;
                    this._binEstimatorProjectService = _binEstimatorProjectService;
                    this._routeParams = _routeParams;
                    this._router = _router;
                    this._locusService = _locusService;
                    this.locusParameters = [];
                    this.isSubmitting = false;
                    this.getBinEstimator = function (proj) {
                        return _this._binEstimatorProjectService.getBinEstimatorProject(proj.bin_estimator_id);
                    };
                }
                ArtifactEstimatorLocusListComponent.prototype.getProject = function () {
                    var _this = this;
                    var id = +this._routeParams.get('project_id');
                    this._artifactEstimatorProjectService.getArtifactEstimatorProject(id)
                        .map(function (proj) {
                        _this.selectedProject = proj;
                        _this.loadLocusParameters();
                        _this.header = _this.selectedProject.title = " Loci";
                        _this.navItems = [
                            {
                                label: 'Details',
                                click: function () { return _this.goToLink('ArtifactEstimatorDetail', { project_id: _this.selectedProject.id }); },
                                active: false
                            },
                            {
                                label: 'Loci',
                                click: function () { return _this.goToLink('ArtifactEstimatorLocusList', { project_id: _this.selectedProject.id }); },
                                active: true
                            }
                        ];
                        return proj;
                    })
                        .concatMap(this.getBinEstimator)
                        .subscribe(function (binEstimator) { return _this.selectedBinEstimator = binEstimator; }, function (err) { return _this.errorMessage = err; });
                };
                ArtifactEstimatorLocusListComponent.prototype.loadLocusParameters = function () {
                    var _this = this;
                    this.locusParameters = [];
                    this.selectedProject.locus_parameters.forEach(function (locus_param, id) {
                        _this.locusParameters.push(locus_param);
                    });
                };
                ArtifactEstimatorLocusListComponent.prototype.goToLink = function (dest, params) {
                    var link = [dest, params];
                    this._router.navigate(link);
                };
                ArtifactEstimatorLocusListComponent.prototype.selectLocus = function (locus_id) {
                    var _this = this;
                    this.selectedLocus = null;
                    this.selectedLocusParameter = null;
                    this.selectedBins = null;
                    this.selectedArtifactEstimator = null;
                    this.artifactEstimators = [];
                    if (!this.isSubmitting) {
                        this._locusService.getLocus(locus_id).subscribe(function (locus) {
                            _this.selectedLocus = locus;
                            _this.selectedLocusParameter = _this.selectedProject.locus_parameters.get(locus_id);
                            if (_this.selectedBinEstimator.locus_bin_sets.has(_this.selectedLocus.id)) {
                                _this.selectedBins = _this.selectedBinEstimator.locus_bin_sets.get(_this.selectedLocus.id).bins;
                            }
                            if (_this.selectedProject.locus_artifact_estimators.has(_this.selectedLocus.id)) {
                                _this.artifactEstimators = _this.selectedProject.locus_artifact_estimators.get(_this.selectedLocus.id).artifact_estimators;
                                if (_this.artifactEstimators) {
                                    _this.selectedArtifactEstimator = _this.artifactEstimators[0];
                                }
                            }
                        }, function (err) { return _this.errorMessage = err; });
                    }
                };
                ArtifactEstimatorLocusListComponent.prototype.selectArtifactEstimator = function (e) {
                    var _this = this;
                    var artifactEstimatorId = +e.target.value;
                    this.artifactEstimators.forEach(function (artifactEstimator) {
                        if (artifactEstimator.id == artifactEstimatorId) {
                            _this.selectedArtifactEstimator = artifactEstimator;
                        }
                    });
                };
                ArtifactEstimatorLocusListComponent.prototype.saveLocusParams = function (id) {
                    var _this = this;
                    var locusParameter = this.selectedProject.locus_parameters.get(id);
                    if (locusParameter.isDirty || locusParameter.filter_parameters_stale || locusParameter.scanning_parameters_stale) {
                        this.isSubmitting = true;
                        this._artifactEstimatorProjectService.saveLocusParameters(locusParameter).subscribe(function (locusParam) {
                            _this._artifactEstimatorProjectService.clearCache(locusParam.project_id);
                            _this.getProject();
                            _this.selectLocus(locusParam.locus_id);
                            _this.isSubmitting = false;
                        }, function (error) { return _this.errorMessage = error; });
                    }
                };
                ArtifactEstimatorLocusListComponent.prototype.deleteArtifactEstimator = function () {
                    var _this = this;
                    this._artifactEstimatorProjectService.deleteArtifactEstimator(this.selectedArtifactEstimator.id)
                        .subscribe(function () {
                        var _ = [];
                        _this.artifactEstimators.forEach(function (artifactEstimator, i) {
                            if (artifactEstimator.id != _this.selectedArtifactEstimator.id) {
                                _.push(artifactEstimator);
                            }
                        });
                        _this.selectedProject.locus_artifact_estimators.get(_this.selectedLocus.id).artifact_estimators = _;
                        _this.artifactEstimators = _;
                        if (_this.artifactEstimators.length > 0) {
                            _this.selectedArtifactEstimator = _this.artifactEstimators[0];
                        }
                        ;
                    }, function (err) { return _this.errorMessage = err; });
                };
                ArtifactEstimatorLocusListComponent.prototype.clearBreakpoints = function () {
                    var _this = this;
                    this._artifactEstimatorProjectService.clearArtifactEstimatorBreakpoints(this.selectedArtifactEstimator.id)
                        .subscribe(function (aes) {
                        console.log(aes);
                        _this.selectedArtifactEstimator.copyFromObj(aes);
                    }, function (err) { return _this.errorMessage = err; });
                };
                ArtifactEstimatorLocusListComponent.prototype.onChanged = function (e) {
                    this.selectedLocusParameter.isDirty = true;
                };
                ArtifactEstimatorLocusListComponent.prototype.ngOnInit = function () {
                    this.getProject();
                };
                ArtifactEstimatorLocusListComponent = __decorate([
                    core_1.Component({
                        selector: 'pm-artifact-estimator-locus-list',
                        pipes: [locus_pipe_1.LocusPipe],
                        template: "\n    <pm-section-header [header]=\"header\" [navItems]=\"navItems\"></pm-section-header>\n    <div class=\"row\">\n        <div *ngIf=\"selectedProject\" class=\"col-sm-1\">\n            <pm-locus-parameter-list class=\"list-panel\" [(locusParameters)]=\"locusParameters\" (locusClicked)=\"selectLocus($event)\">\n            </pm-locus-parameter-list>\n        </div>\n        <div *ngIf=\"selectedLocusParameter\" class=\"col-sm-4\">\n                <div class=\"panel panel-default\">\n                    <div class=\"panel-heading\">\n                        <h3 class=\"panel-title\">{{selectedLocusParameter.locus_id | locus | async}} Parameters</h3>\n                    </div>\n                    <div class=\"panel-body\">\n                        <form (ngSubmit)=\"saveLocusParams(selectedLocusParameter.locus_id)\">\n                            <pm-common-locus-parameter-detail [(locusParameter)]=\"selectedLocusParameter\"></pm-common-locus-parameter-detail>\n                            <div class=\"col-sm-6\">\n                                <h4>Artifact Estimator Settings</h4>\n                                <div class=\"form-group\">\n                                    <label>Max Secondary Relative Peak Height</label>\n                                    <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" max=\"1\" [(ngModel)]=\"selectedLocusParameter.max_secondary_relative_peak_height\">\n                                </div>\n                                <div class=\"form-group\">\n                                    <label>Min Artifact Peak Frequency</label>\n                                    <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"selectedLocusParameter.min_artifact_peak_frequency\">\n                                </div>\n                                <button type=\"submit\" class=\"btn btn-default\" [ngClass]=\"{disabled: isSubmitting}\">Save and Analyze</button>\n                            <span *ngIf=\"isSubmitting\" class=\"label label-info\">Saving and Analyzing Locus...This May Take A While...</span>\n                            </div>\n                        </form>\n                    </div>\n                </div>\n        </div>\n        <div *ngIf=\"selectedLocus\" class=\"col-sm-6\">\n            <div *ngIf=\"selectedArtifactEstimator\" class=\"row\" style=\"height: 35vh\">\n                <pm-d3-artifact-estimator-panel [(bins)]=\"selectedBins\" [(locus)]=\"selectedLocus\" [(artifactEstimator)]=\"selectedArtifactEstimator\"></pm-d3-artifact-estimator-panel>\n            </div>\n            <div class=\"row\">\n                <div class=\"panel panel-default\">\n                    <div class=\"panel-heading\">\n                        <h3 class=\"panel-title\">Artifact Estimator</h3>\n                    </div>\n                    <div class=\"panel-body\">\n                        <div class=\"row\">\n                            <div class=\"form-group col-sm-3\">\n                                <label>Artifact Distance</label>\n                                <select (change)=\"selectArtifactEstimator($event)\" class=\"form-control\">\n                                    <option *ngFor=\"#artifactEstimator of artifactEstimators\" value={{artifactEstimator.id}}>{{artifactEstimator.artifact_distance | number}}     {{artifactEstimator.peak_data.length}}</option>\n                                </select>\n                            </div>\n                        </div>\n                        <div class=\"row\">\n                            <div class=\"btn-group\">\n                                <button type=\"button\" class=\"btn btn-warning\" (click)=\"deleteArtifactEstimator()\">Delete Estimator</button>\n                                <button type=\"button\" class=\"btn btn-warning\" (click)=\"clearBreakpoints()\">Clear Breakpoints</button>\n                            </div>\n                        </div>\n                    </div>\n                </div>\n\n            </div>\n        </div>\n    </div>\n    ",
                        directives: [section_header_component_1.SectionHeaderComponent, locus_parameters_list_component_1.LocusParametersListComponent, common_locus_parameters_detail_component_1.CommonLocusParametersDetailComponent, d3_artifact_estimator_panel_component_1.D3ArtifactEstimatorPanel, common_1.FORM_DIRECTIVES]
                    }), 
                    __metadata('design:paramtypes', [artifact_estimator_project_service_1.ArtifactEstimatorProjectService, bin_estimator_project_service_1.BinEstimatorProjectService, router_1.RouteParams, router_1.Router, locus_service_1.LocusService])
                ], ArtifactEstimatorLocusListComponent);
                return ArtifactEstimatorLocusListComponent;
            }());
            exports_1("ArtifactEstimatorLocusListComponent", ArtifactEstimatorLocusListComponent);
        }
    }
});
//# sourceMappingURL=artifact-estimator-locus-list.component.js.map