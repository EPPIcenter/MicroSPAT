System.register(['angular2/core', 'angular2/router', '../../../pipes/locus.pipe', '../../layout/section-header.component', '../../project/locus-parameters-list.component', '../../project/common-locus-parameters-detail.component', '../../project/locus-parameters-detail.component', '../locus-bin/d3-bin-plot.component', '../../../services/locus/locus.service', '../../../services/bin-estimator-project/bin-estimator-project.service'], function(exports_1, context_1) {
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
    var core_1, router_1, locus_pipe_1, section_header_component_1, locus_parameters_list_component_1, common_locus_parameters_detail_component_1, locus_parameters_detail_component_1, d3_bin_plot_component_1, locus_service_1, bin_estimator_project_service_1;
    var BinEstimatorLocusListComponent;
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
            function (d3_bin_plot_component_1_1) {
                d3_bin_plot_component_1 = d3_bin_plot_component_1_1;
            },
            function (locus_service_1_1) {
                locus_service_1 = locus_service_1_1;
            },
            function (bin_estimator_project_service_1_1) {
                bin_estimator_project_service_1 = bin_estimator_project_service_1_1;
            }],
        execute: function() {
            BinEstimatorLocusListComponent = (function () {
                function BinEstimatorLocusListComponent(_binEstimatorProjectService, _routeParams, _router, _locusService) {
                    this._binEstimatorProjectService = _binEstimatorProjectService;
                    this._routeParams = _routeParams;
                    this._router = _router;
                    this._locusService = _locusService;
                    this.locusParameters = [];
                    this.isSubmitting = false;
                    this.locusParamsCollapsed = false;
                }
                BinEstimatorLocusListComponent.prototype.getProject = function () {
                    var _this = this;
                    var id = +this._routeParams.get('project_id');
                    this._binEstimatorProjectService.getBinEstimatorProject(id)
                        .subscribe(function (proj) {
                        console.log(proj);
                        _this.selectedProject = proj;
                        _this.loadLocusParameters();
                        _this.header = _this.selectedProject.title + " Loci";
                        _this.navItems = [
                            {
                                label: 'Details',
                                click: function () { return _this.goToLink('BinEstimatorDetail', { project_id: _this.selectedProject.id }); },
                                active: false
                            },
                            {
                                label: 'Loci',
                                click: function () { return _this.goToLink('BinEstimatorLocusList', { project_id: _this.selectedProject.id }); },
                                active: true
                            }
                        ];
                    });
                };
                BinEstimatorLocusListComponent.prototype.loadLocusParameters = function () {
                    var _this = this;
                    this.locusParameters = [];
                    this.selectedProject.locus_parameters.forEach(function (locus_param, id) {
                        _this.locusParameters.push(locus_param);
                    });
                };
                BinEstimatorLocusListComponent.prototype.goToLink = function (dest, params) {
                    var link = [dest, params];
                    this._router.navigate(link);
                };
                BinEstimatorLocusListComponent.prototype.getLocusChannelAnnotations = function () {
                    var _this = this;
                    this._binEstimatorProjectService.getLocusChannelAnnotations(this.selectedLocusParameter.project_id, this.selectedLocusParameter.locus_id)
                        .subscribe(function (channel_annotations) {
                        console.log(channel_annotations);
                        _this.selectedLocusChannelAnnotations = channel_annotations;
                    }, function (err) { return _this.errorMessage = err; });
                };
                BinEstimatorLocusListComponent.prototype.selectLocus = function (locus_id) {
                    var _this = this;
                    this.selectedLocus = null;
                    this.selectedLocusParameter = null;
                    this.selectedBins = null;
                    this.selectedLocusChannelAnnotations = null;
                    if (!this.isSubmitting) {
                        this._locusService.getLocus(locus_id).subscribe(function (locus) {
                            _this.selectedLocus = locus;
                            _this.selectedLocusParameter = _this.selectedProject.locus_parameters.get(locus_id);
                            if (_this.selectedProject.locus_bin_sets.has(_this.selectedLocus.id)) {
                                _this.selectedBins = _this.selectedProject.locus_bin_sets.get(_this.selectedLocus.id).bins;
                            }
                            _this.getLocusChannelAnnotations();
                        }, function (err) { return _this.errorMessage = err; });
                    }
                };
                BinEstimatorLocusListComponent.prototype.locusParamsSaved = function () {
                    this.getLocusChannelAnnotations();
                };
                BinEstimatorLocusListComponent.prototype.locusParamsChanged = function () {
                    this.selectedLocusParameter.isDirty = true;
                };
                BinEstimatorLocusListComponent.prototype.saveLocusParams = function (id) {
                    var _this = this;
                    var locusParameter = this.selectedProject.locus_parameters.get(id);
                    if (locusParameter.isDirty || locusParameter.filter_parameters_stale || locusParameter.scanning_parameters_stale) {
                        console.log(locusParameter);
                        this.isSubmitting = true;
                        this._binEstimatorProjectService.saveLocusParameters(locusParameter).subscribe(function (locusParam) {
                            _this._binEstimatorProjectService.clearCache(locusParam.project_id);
                            _this.getProject();
                            _this.selectLocus(locusParam.locus_id);
                            _this.isSubmitting = false;
                        }, function (error) { return _this.errorMessage = error; });
                    }
                };
                BinEstimatorLocusListComponent.prototype.ngOnInit = function () {
                    this.getProject();
                };
                BinEstimatorLocusListComponent = __decorate([
                    core_1.Component({
                        selector: 'pm-bin-estimator-locus-list',
                        pipes: [locus_pipe_1.LocusPipe],
                        template: "\n    <pm-section-header [header]=\"header\" [navItems]=\"navItems\"></pm-section-header>\n    <div class=\"row\">\n        <div *ngIf=\"selectedProject\" class=\"col-sm-1\">\n            <pm-locus-parameter-list class=\"list-panel\" [(locusParameters)]=\"locusParameters\" (locusClicked)=\"selectLocus($event)\">\n            </pm-locus-parameter-list>\n        </div>\n        <div *ngIf=\"selectedLocusParameter\" class=\"col-sm-4\">\n            <div class=\"row\">\n                <div class=\"panel panel-default\">\n                    <div (click)=\"locusParamsCollapsed = !locusParamsCollapsed\" class=\"panel-heading\">\n                        <div class=\"h3 panel-title\">\n                            <span>{{selectedLocusParameter.locus_id | locus | async}}</span>\n                            <span *ngIf=\"locusParamsCollapsed\" class=\"glyphicon glyphicon-menu-right pull-right\"></span>\n                            <span *ngIf=\"!locusParamsCollapsed\" class=\"glyphicon glyphicon-menu-down pull-right\"></span>\n                        </div>\n                    </div>\n                    <div *ngIf=\"!locusParamsCollapsed\" class=\"panel-body\">\n                        <form (ngSubmit)=\"saveLocusParams(selectedLocusParameter.locus_id)\">\n                            <pm-common-locus-parameter-detail [(locusParameter)]=\"selectedLocusParameter\"></pm-common-locus-parameter-detail>\n                            <div class=\"row\">\n                                <div class=\"col-sm-12\">\n                                    <h4>Bin Estimator Settings</h4>\n                                    <div class=\"col-sm-6\">\n                                        <div class=\"form-group\">\n                                            <label>Min. Peak Frequency</label>\n                                            <input class=\"form-control input-sm\" (change)=\"locusParamsChanged()\" type=\"number\" required step=\"1\" min=\"1\" [(ngModel)]=\"selectedLocusParameter.min_peak_frequency\">\n                                        </div>\n                                        <div class=\"form-group\">\n                                            <label>Default Bin Buffer</label>\n                                            <input class=\"form-control input-sm\" (change)=\"locusParamsChanged()\" type=\"number\" required step=\"any\" [(ngModel)]=\"selectedLocusParameter.default_bin_buffer\">\n                                        </div>\n                                    </div>\n                                </div>\n                            </div>\n                            <button type=\"submit\" class=\"btn btn-default\" [ngClass]=\"{disabled: isSubmitting}\">Save and Analyze</button>\n                            <span *ngIf=\"isSubmitting\" class=\"label label-info\">Saving and Analyzing Locus...This May Take A While...</span>\n                        </form>\n                    </div>\n                </div>\n            </div>\n        </div>\n        <div *ngIf=\"selectedLocusChannelAnnotations\" class=\"col-sm-7\" style=\"height: 35vh\">\n            <pm-d3-bin-estimator-locus-plot [(bins)]=\"selectedBins\" [(locus)]=\"selectedLocus\" [(annotations)]=\"selectedLocusChannelAnnotations\"></pm-d3-bin-estimator-locus-plot>\n        </div>\n    </div>\n    ",
                        directives: [section_header_component_1.SectionHeaderComponent, locus_parameters_list_component_1.LocusParametersListComponent, locus_parameters_detail_component_1.LocusParametersDetailComponent, d3_bin_plot_component_1.D3BinEstimatorPlot, common_locus_parameters_detail_component_1.CommonLocusParametersDetailComponent]
                    }), 
                    __metadata('design:paramtypes', [bin_estimator_project_service_1.BinEstimatorProjectService, router_1.RouteParams, router_1.Router, locus_service_1.LocusService])
                ], BinEstimatorLocusListComponent);
                return BinEstimatorLocusListComponent;
            }());
            exports_1("BinEstimatorLocusListComponent", BinEstimatorLocusListComponent);
        }
    }
});
//# sourceMappingURL=bin-estimator-locus-list.component.js.map