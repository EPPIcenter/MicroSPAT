System.register(['angular2/core', 'angular2/router', '../layout/section-header.component', '../../services/genotyping-project/genotyping-project.service', '../../services/locus-set/locus-set.service', '../../services/artifact-estimator-project/artifact-estimator-project.service', '../../services/bin-estimator-project/bin-estimator-project.service', '../../services/genotyping-project/genotyping-project.model'], function(exports_1, context_1) {
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
    var core_1, router_1, section_header_component_1, genotyping_project_service_1, locus_set_service_1, artifact_estimator_project_service_1, bin_estimator_project_service_1, genotyping_project_model_1;
    var GenotypingProjectListComponent;
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
            function (genotyping_project_service_1_1) {
                genotyping_project_service_1 = genotyping_project_service_1_1;
            },
            function (locus_set_service_1_1) {
                locus_set_service_1 = locus_set_service_1_1;
            },
            function (artifact_estimator_project_service_1_1) {
                artifact_estimator_project_service_1 = artifact_estimator_project_service_1_1;
            },
            function (bin_estimator_project_service_1_1) {
                bin_estimator_project_service_1 = bin_estimator_project_service_1_1;
            },
            function (genotyping_project_model_1_1) {
                genotyping_project_model_1 = genotyping_project_model_1_1;
            }],
        execute: function() {
            GenotypingProjectListComponent = (function () {
                function GenotypingProjectListComponent(_genotypingProjectService, _locusSetService, _artifactEstimatorService, _binEstimatorService, _router) {
                    this._genotypingProjectService = _genotypingProjectService;
                    this._locusSetService = _locusSetService;
                    this._artifactEstimatorService = _artifactEstimatorService;
                    this._binEstimatorService = _binEstimatorService;
                    this._router = _router;
                    this.genotypingProjects = [];
                    this.constructorErrors = [];
                    this.validArtifactEstimators = [];
                    this.artifactEstimatorsDisabled = true;
                    this.binEstimators = [];
                    this.validBinEstimators = [];
                    this.binEstimatorsDisabled = true;
                    this.sortingParam = 'last_updated';
                    this.reversed = false;
                    this.isSubmitting = false;
                    this.newProject = new genotyping_project_model_1.GenotypingProject();
                }
                GenotypingProjectListComponent.prototype.getProjects = function () {
                    var _this = this;
                    this._genotypingProjectService.getProjects()
                        .subscribe(function (projects) {
                        _this.genotypingProjects = projects;
                        _this.sortProjects();
                    }, function (error) { return _this.constructorErrors.push(error); });
                };
                GenotypingProjectListComponent.prototype.deleteProject = function (id) {
                    var _this = this;
                    this.deleteProjectError = null;
                    this._genotypingProjectService.deleteProject(id)
                        .subscribe(function () { return _this.getProjects(); }, function (err) { return _this.deleteProjectError = err; });
                };
                GenotypingProjectListComponent.prototype.gotoDetail = function (project_id) {
                    this._router.navigate(['GenotypingProjectDetail', { project_id: project_id }]);
                };
                GenotypingProjectListComponent.prototype.sortProjects = function () {
                    var _this = this;
                    this.genotypingProjects.sort(function (a, b) {
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
                        this.genotypingProjects.reverse();
                    }
                };
                GenotypingProjectListComponent.prototype.submitNewProject = function () {
                    var _this = this;
                    this.newProjectError = null;
                    this.isSubmitting = true;
                    this._genotypingProjectService.createProject(this.newProject).subscribe(function () {
                        _this.isSubmitting = false;
                        _this.getProjects();
                    }, function (err) {
                        _this.isSubmitting = false;
                        _this.newProjectError = err;
                    });
                };
                GenotypingProjectListComponent.prototype.locusSetChange = function (e) {
                    var _this = this;
                    var locus_set_id = +e.target.value;
                    this.artifactEstimatorsDisabled = true;
                    this.binEstimatorsDisabled = true;
                    this.validArtifactEstimators = [];
                    this.validBinEstimators = [];
                    this.artifactEstimators.forEach(function (artifactEstimator) {
                        if (artifactEstimator.locus_set_id == locus_set_id) {
                            console.log(artifactEstimator);
                            console.log(locus_set_id);
                            _this.validArtifactEstimators.push(artifactEstimator);
                        }
                    });
                    this.binEstimators.forEach(function (binEstimator) {
                        console.log(binEstimator);
                        console.log(locus_set_id);
                        if (binEstimator.locus_set_id == locus_set_id) {
                            _this.validBinEstimators.push(binEstimator);
                        }
                    });
                    if (this.validArtifactEstimators.length > 0) {
                        this.artifactEstimatorsDisabled = false;
                    }
                    if (this.validBinEstimators.length > 0) {
                        this.binEstimatorsDisabled = false;
                    }
                };
                GenotypingProjectListComponent.prototype.ngOnInit = function () {
                    var _this = this;
                    this._locusSetService.getLocusSets().subscribe(function (locus_sets) { return _this.locusSets = locus_sets; }, function (err) { return _this.constructorErrors.push(err); });
                    this._artifactEstimatorService.getArtifactEstimatorProjects().subscribe(function (artifact_estimators) { return _this.artifactEstimators = artifact_estimators; }, function (err) { return _this.constructorErrors.push(err); });
                    this._binEstimatorService.getBinEstimatorProjects().subscribe(function (bin_estimators) { return _this.binEstimators = bin_estimators; }, function (err) { return _this.constructorErrors.push(err); });
                    this.getProjects();
                };
                GenotypingProjectListComponent = __decorate([
                    core_1.Component({
                        selector: 'genotyping-project-list',
                        template: "\n    <div class=\"row\">\n        <pm-section-header [header]=\"'Genotyping Projects'\"></pm-section-header>\n    </div>\n    <div class=\"row\">\n        <div *ngFor=\"#err of constructorErrors\">\n            <span class=\"label label-danger\">{{err}}</span>\n            <br/>\n        </div>\n        <span class=\"label label-danger\">{{deleteProjectError}}</span>\n    </div>\n    <div class=\"row main-container\">\n        <div class=\"table-responsive list-panel col-sm-6\">\n            <table class=\"table table-striped table-hover table-condensed\">\n                <thead>\n                    <tr>\n                        <th (click)=\"sortingParam='title'; reversed=!reversed; sortProjects()\">Title</th>\n                        <th>Creator</th>\n                        <th>Description</th>\n                        <th (click)=\"sortingParam='last_updated'; reversed=!reversed; sortProjects()\">Last Updated</th>\n                    </tr>\n                </thead>\n                <tbody>\n                    <tr *ngFor=\"#project of genotypingProjects\" (click)=\"gotoDetail(project.id)\">\n                        <td>{{project.title}}</td>\n                        <td>{{project.creator}}</td>\n                        <td>{{project.description}}</td>\n                        <td>{{project.last_updated | date: \"fullDate\"}}</td>\n                    </tr>\n                </tbody>\n            </table>\n        </div>\n        <div class=\"col-sm-5\">\n            <div class=\"panel panel-default\">\n                <div class=\"panel-heading\">\n                    <h3 class=\"panel-title\">New Project</h3>\n                </div>\n                <div class=\"panel-body\">\n                    <form (ngSubmit)=\"submitNewProject()\">\n                        <div class=\"form-group\">\n                            <label>Title</label>\n                            <input type=\"text\" class=\"form-control\" required [(ngModel)]=\"newProject.title\">\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Creator</label>\n                            <input type=\"text\" class=\"form-control\" [(ngModel)]=\"newProject.creator\">\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Description</label>\n                            <input type=\"text\" class=\"form-control\" required [(ngModel)]=\"newProject.description\">\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Locus Set</label>\n                            <select (change)=\"locusSetChange($event)\" [(ngModel)]=\"newProject.locus_set_id\" required class=\"form-control\">\n                                <option *ngFor=\"#locusSet of locusSets\" value={{locusSet.id}}>{{locusSet.label}}</option>\n                            </select>\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Artifact Estimator</label>\n                            <select [(ngModel)]=\"newProject.artifact_estimator_id\" required class=\"form-control\" [disabled]=\"artifactEstimatorsDisabled\">\n                                <option *ngFor=\"#artifactEstimator of validArtifactEstimators\" value={{artifactEstimator.id}}>{{artifactEstimator.title}}</option>\n                            </select>\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Bin Set</label>\n                            <select [(ngModel)]=\"newProject.bin_estimator_id\" required class=\"form-control\" [disabled]=\"binEstimatorsDisabled\">\n                                <option *ngFor=\"#binEstimator of validBinEstimators\" value={{binEstimator.id}}>{{binEstimator.title}}</option>\n                            </select>\n                        </div>\n                        \n                        <button type=\"submit\" class=\"btn btn-default\" [ngClass]=\"{disabled: isSubmitting}\">Save</button>\n                    </form>\n                    <span class=\"label label-danger\">{{newProjectError}}</span>\n                </div>\n            </div>\n        </div>\n    </div>\n    ",
                        directives: [section_header_component_1.SectionHeaderComponent]
                    }), 
                    __metadata('design:paramtypes', [genotyping_project_service_1.GenotypingProjectService, locus_set_service_1.LocusSetService, artifact_estimator_project_service_1.ArtifactEstimatorProjectService, bin_estimator_project_service_1.BinEstimatorProjectService, router_1.Router])
                ], GenotypingProjectListComponent);
                return GenotypingProjectListComponent;
            }());
            exports_1("GenotypingProjectListComponent", GenotypingProjectListComponent);
        }
    }
});
//# sourceMappingURL=genotyping-project-list.component.js.map