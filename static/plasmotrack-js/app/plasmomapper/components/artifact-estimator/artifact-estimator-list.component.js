System.register(['angular2/core', 'angular2/router', '../layout/section-header.component', '../../services/artifact-estimator-project/artifact-estimator-project.service', '../../services/artifact-estimator-project/artifact-estimator-project.model', '../../services/bin-estimator-project/bin-estimator-project.service', '../../services/locus-set/locus-set.service'], function(exports_1, context_1) {
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
    var core_1, router_1, section_header_component_1, artifact_estimator_project_service_1, artifact_estimator_project_model_1, bin_estimator_project_service_1, locus_set_service_1;
    var ArtifactEstimatorListComponent;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (router_1_1) {
                router_1 = router_1_1;
            },
            function (section_header_component_1_1) {
                section_header_component_1 = section_header_component_1_1;
            },
            function (artifact_estimator_project_service_1_1) {
                artifact_estimator_project_service_1 = artifact_estimator_project_service_1_1;
            },
            function (artifact_estimator_project_model_1_1) {
                artifact_estimator_project_model_1 = artifact_estimator_project_model_1_1;
            },
            function (bin_estimator_project_service_1_1) {
                bin_estimator_project_service_1 = bin_estimator_project_service_1_1;
            },
            function (locus_set_service_1_1) {
                locus_set_service_1 = locus_set_service_1_1;
            }],
        execute: function() {
            ArtifactEstimatorListComponent = (function () {
                function ArtifactEstimatorListComponent(_artifactEstimatorProjectService, _locusSetService, _binEstimatorService, _router) {
                    this._artifactEstimatorProjectService = _artifactEstimatorProjectService;
                    this._locusSetService = _locusSetService;
                    this._binEstimatorService = _binEstimatorService;
                    this._router = _router;
                    this.binEstimatorsDisabled = true;
                    this.binEstimators = [];
                    this.validBinEstimators = [];
                    this.constructorErrors = [];
                    this.sortingParam = 'title';
                    this.reversed = false;
                    this.isSubmitting = false;
                }
                ArtifactEstimatorListComponent.prototype.loadNewArtifactEstimator = function () {
                    this.newArtifactEstimatorProject = new artifact_estimator_project_model_1.ArtifactEstimatorProject();
                };
                ArtifactEstimatorListComponent.prototype.getProjects = function () {
                    var _this = this;
                    this._artifactEstimatorProjectService.getArtifactEstimatorProjects()
                        .subscribe(function (projects) {
                        _this.artifactEstimatorProjects = projects;
                        _this.sortProjects();
                    }),
                        function (error) { return _this.constructorErrors.push(error); };
                };
                ArtifactEstimatorListComponent.prototype.getLocusSets = function () {
                    var _this = this;
                    this._locusSetService.getLocusSets()
                        .subscribe(function (locusSets) { return _this.locusSets = locusSets; }),
                        function (error) { return _this.constructorErrors.push(error); };
                };
                ArtifactEstimatorListComponent.prototype.getBinEstimators = function () {
                    var _this = this;
                    this._binEstimatorService.getBinEstimatorProjects()
                        .subscribe(function (bin_estimators) { return _this.binEstimators = bin_estimators; }, function (err) { return _this.constructorErrors.push(err); });
                };
                ArtifactEstimatorListComponent.prototype.submitNewProject = function () {
                    var _this = this;
                    this.newProjectError = null;
                    this.isSubmitting = true;
                    this._artifactEstimatorProjectService.createArtifactEstimatorProject(this.newArtifactEstimatorProject)
                        .subscribe(function () {
                        _this.isSubmitting = false;
                        _this.loadNewArtifactEstimator();
                        _this.getProjects();
                    }, function (err) {
                        _this.isSubmitting = false;
                        _this.newProjectError = err;
                    });
                };
                ArtifactEstimatorListComponent.prototype.locusSetChange = function (e) {
                    var _this = this;
                    var locus_set_id = +e.target.value;
                    this.binEstimatorsDisabled = true;
                    this.validBinEstimators = [];
                    this.binEstimators.forEach(function (binEstimator) {
                        if (binEstimator.locus_set_id == locus_set_id) {
                            _this.validBinEstimators.push(binEstimator);
                        }
                    });
                    if (this.validBinEstimators.length > 0) {
                        this.binEstimatorsDisabled = false;
                    }
                };
                ArtifactEstimatorListComponent.prototype.gotoDetail = function (id) {
                    this._router.navigate(['ArtifactEstimatorDetail', { project_id: id }]);
                };
                ArtifactEstimatorListComponent.prototype.sortProjects = function () {
                    var _this = this;
                    this.artifactEstimatorProjects.sort(function (a, b) {
                        if (a[_this.sortingParam] > b[_this.sortingParam]) {
                            return 1;
                        }
                        else if (a[_this.sortingParam] < b[_this.sortingParam]) {
                            return -1;
                        }
                        else {
                            return 0;
                        }
                    });
                    if (this.reversed) {
                        this.artifactEstimatorProjects.reverse();
                    }
                };
                ArtifactEstimatorListComponent.prototype.ngOnInit = function () {
                    this.loadNewArtifactEstimator();
                    this.getProjects();
                    this.getLocusSets();
                    this.getBinEstimators();
                };
                ArtifactEstimatorListComponent = __decorate([
                    core_1.Component({
                        selector: 'pm-artifact-estimator-list',
                        template: "\n    <div class=\"row\">\n        <pm-section-header [header]=\"'Artifact Estimator Projects'\"></pm-section-header>\n    </div>\n    <div class=\"row\">\n        <div *ngFor=\"#err of consttructorErrors\">\n            <span class=\"label label-danger\">{{err}}</span>\n            <br/>\n        </div>\n    </div>\n    <div class=\"row main-container\">\n        <div class=\"table-responsive list-panel col-sm-4\">\n            <table class=\"table table-striped table-hover table-condensed\">\n                <thead>\n                   <tr>\n                        <th (click)=\"sortingParam='title'; reversed=!reversed; sortProjects()\">Title</th>\n                        <th>Creator</th>\n                        <th>Description</th>\n                        <th (click)=\"sortingParam='last_updated'; reversed=!reversed; sortProjects()\">Last Updated</th>\n                    </tr>\n                </thead>\n                <tbody>\n                    <tr *ngFor=\"#project of artifactEstimatorProjects\" (click)=\"gotoDetail(project.id)\">\n                        <td>{{project.title}}</td>\n                        <td>{{project.creator}}</td>\n                        <td>{{project.description}}</td>\n                        <td>{{project.last_updated | date: \"fullDate\"}}</td>\n                    </tr>\n                </tbody>\n            </table>\n        </div>\n        <div class=\"col-sm-6\">\n            <div class=\"panel panel-default\">\n                <div class=\"panel-heading\">\n                    <h3 class=\"panel-title\">New Artifact Estimator</h3>\n                </div>\n                <div class=\"panel-body\">\n                    <form (ngSubmit)=\"submitNewProject()\">\n                        <div class=\"form-group\">\n                            <label>Title</label>\n                            <input type=\"text\" class=\"form-control\" required [(ngModel)]=\"newArtifactEstimatorProject.title\">\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Creator</label>\n                            <input type=\"text\" class=\"form-control\" [(ngModel)]=\"newArtifactEstimatorProject.creator\">\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Description</label>\n                            <input type=\"text\" class=\"form-control\" [(ngModel)]=\"newArtifactEstimatorProject.description\">\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Locus Set</label>\n                            <select (change)=\"locusSetChange($event)\" [(ngModel)]=\"newArtifactEstimatorProject.locus_set_id\" required class=\"form-control\">\n                                <option *ngFor=\"#locusSet of locusSets\" value={{locusSet.id}}>{{locusSet.label}}</option>\n                            </select>\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Bin Set</label>\n                            <select [(ngModel)]=\"newArtifactEstimatorProject.bin_estimator_id\" required class=\"form-control\" [disabled]=\"binEstimatorsDisabled\">\n                                <option *ngFor=\"#binEstimator of validBinEstimators\" value={{binEstimator.id}}>{{binEstimator.title}}</option>\n                            </select>\n                        </div>\n                        <button type=\"submit\" class=\"btn btn-default\" [ngClass]=\"{disabled: isSubmitting}\">Save</button>\n                        <span *ngIf=\"isSubmitting\" class=\"label label-info\">Saving to Server...</span>\n                        <span class=\"label label-danger\">{{newProjectError}}</span>\n                    </form>\n                    \n                </div>\n            </div>\n        </div>\n    </div>\n    ",
                        directives: [section_header_component_1.SectionHeaderComponent]
                    }), 
                    __metadata('design:paramtypes', [artifact_estimator_project_service_1.ArtifactEstimatorProjectService, locus_set_service_1.LocusSetService, bin_estimator_project_service_1.BinEstimatorProjectService, router_1.Router])
                ], ArtifactEstimatorListComponent);
                return ArtifactEstimatorListComponent;
            }());
            exports_1("ArtifactEstimatorListComponent", ArtifactEstimatorListComponent);
        }
    }
});
//# sourceMappingURL=artifact-estimator-list.component.js.map