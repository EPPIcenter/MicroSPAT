System.register(['angular2/core', 'angular2/router', '../layout/section-header.component', '../../services/bin-estimator-project/bin-estimator-project.service', '../../services/bin-estimator-project/bin-estimator-project.model', '../../services/locus-set/locus-set.service'], function(exports_1, context_1) {
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
    var core_1, router_1, section_header_component_1, bin_estimator_project_service_1, bin_estimator_project_model_1, locus_set_service_1;
    var BinEstimatorListComponent;
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
            function (bin_estimator_project_service_1_1) {
                bin_estimator_project_service_1 = bin_estimator_project_service_1_1;
            },
            function (bin_estimator_project_model_1_1) {
                bin_estimator_project_model_1 = bin_estimator_project_model_1_1;
            },
            function (locus_set_service_1_1) {
                locus_set_service_1 = locus_set_service_1_1;
            }],
        execute: function() {
            BinEstimatorListComponent = (function () {
                function BinEstimatorListComponent(_binEstimatorProjectService, _locusSetService, _router) {
                    this._binEstimatorProjectService = _binEstimatorProjectService;
                    this._locusSetService = _locusSetService;
                    this._router = _router;
                    this.constructorErrors = [];
                    this.sortingParam = 'title';
                    this.reversed = false;
                    this.isSubmitting = false;
                }
                BinEstimatorListComponent.prototype.loadNewBinEstimator = function () {
                    this.newBinEstimatorProject = new bin_estimator_project_model_1.BinEstimatorProject();
                };
                BinEstimatorListComponent.prototype.getProjects = function () {
                    var _this = this;
                    this._binEstimatorProjectService.getBinEstimatorProjects()
                        .subscribe(function (projects) {
                        _this.binEstimatorProjects = projects;
                        _this.sortProjects();
                    }, function (error) { return _this.constructorErrors.push(error); });
                };
                BinEstimatorListComponent.prototype.getLocusSets = function () {
                    var _this = this;
                    this._locusSetService.getLocusSets()
                        .subscribe(function (locusSets) {
                        _this.locusSets = locusSets;
                    }, function (error) { return _this.constructorErrors.push(error); });
                };
                BinEstimatorListComponent.prototype.gotoDetail = function (id) {
                    this._router.navigate(['BinEstimatorDetail', { project_id: id }]);
                };
                BinEstimatorListComponent.prototype.submitNewProject = function () {
                    var _this = this;
                    this.newProjectError = null;
                    this.isSubmitting = true;
                    this._binEstimatorProjectService.createBinEstimatorProject(this.newBinEstimatorProject).subscribe(function () {
                        _this.isSubmitting = false;
                        _this.getProjects();
                    }, function (err) {
                        _this.isSubmitting = false;
                        _this.newProjectError = err;
                    });
                };
                BinEstimatorListComponent.prototype.sortProjects = function () {
                    var _this = this;
                    this.binEstimatorProjects.sort(function (a, b) {
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
                        this.binEstimatorProjects.reverse();
                    }
                };
                BinEstimatorListComponent.prototype.ngOnInit = function () {
                    this.loadNewBinEstimator();
                    this.getProjects();
                    this.getLocusSets();
                };
                BinEstimatorListComponent = __decorate([
                    core_1.Component({
                        selector: 'pm-bin-estimator-list',
                        template: "\n    <div class=\"row\">\n        <pm-section-header [header]=\"'Bin Estimator Projects'\"></pm-section-header>\n    </div>\n    <div class=\"row\">\n        <div *ngFor=\"#err of consttructorErrors\">\n            <span class=\"label label-danger\">{{err}}</span>\n            <br/>\n        </div>\n    </div>\n    <div class=\"row main-container\">\n        <div class=\"table-responsive list-panel col-sm-4\">\n            <table class=\"table table-striped table-hover table-condensed\">\n                <thead>\n                    <tr>\n                        <th (click)=\"sortingParam='title'; reversed=!reversed; sortProjects()\">Title</th>\n                        <th>Creator</th>\n                        <th>Description</th>\n                        <th (click)=\"sortingParam='last_updated'; reversed=!reversed; sortProjects()\">Last Updated</th>\n                    </tr>\n                </thead>\n                <tbody>\n                    <tr *ngFor=\"#project of binEstimatorProjects\" (click)=\"gotoDetail(project.id)\">\n                        <td>{{project.title}}</td>\n                        <td>{{project.creator}}</td>\n                        <td>{{project.description}}</td>\n                        <td>{{project.last_updated | date: \"fullDate\"}}</td>\n                    </tr>\n                </tbody>\n            </table>\n        </div>\n        <div class=\"col-sm-6\">\n            <div class=\"panel panel-default\">\n                <div class=\"panel-heading\">\n                    <h3 class=\"panel-title\">New Bin Estimator</h3>\n                </div>\n                <div class=\"panel-body\">\n                    <form (ngSubmit)=\"submitNewProject()\">\n                        <div class=\"form-group\">\n                            <label>Title</label>\n                            <input type=\"text\" class=\"form-control\" required [(ngModel)]=\"newBinEstimatorProject.title\">\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Creator</label>\n                            <input type=\"text\" class=\"form-control\" [(ngModel)]=\"newBinEstimatorProject.creator\">\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Description</label>\n                            <input type=\"text\" class=\"form-control\" [(ngModel)]=\"newBinEstimatorProject.description\">\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Locus Set</label>\n                            <select [(ngModel)]=\"newBinEstimatorProject.locus_set_id\" required class=\"form-control\">\n                                <option *ngFor=\"#locusSet of locusSets\" value={{locusSet.id}}>{{locusSet.label}}</option>\n                            </select>\n                        </div>\n                        <button type=\"submit\" class=\"btn btn-default\" [ngClass]=\"{disabled: isSubmitting}\">Save</button>\n                        <span *ngIf=\"isSubmitting\" class=\"label label-info\">Saving to Server...</span>\n                        <span class=\"label label-danger\">{{newProjectError}}</span>\n                    </form>\n                    \n                </div>\n            </div>\n        </div>\n    </div>\n    ",
                        directives: [section_header_component_1.SectionHeaderComponent]
                    }), 
                    __metadata('design:paramtypes', [bin_estimator_project_service_1.BinEstimatorProjectService, locus_set_service_1.LocusSetService, router_1.Router])
                ], BinEstimatorListComponent);
                return BinEstimatorListComponent;
            }());
            exports_1("BinEstimatorListComponent", BinEstimatorListComponent);
        }
    }
});
//# sourceMappingURL=bin-estimator-list.component.js.map