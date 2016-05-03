System.register(['angular2/core', 'angular2/router', '../layout/section-header.component', '../../services/bin-estimator-project/bin-estimator-project.service'], function(exports_1, context_1) {
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
    var core_1, router_1, section_header_component_1, bin_estimator_project_service_1;
    var BinEstimatorDetailComponent;
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
            }],
        execute: function() {
            BinEstimatorDetailComponent = (function () {
                function BinEstimatorDetailComponent(_binEstimatorProjectService, _routeParams, _router) {
                    this._binEstimatorProjectService = _binEstimatorProjectService;
                    this._routeParams = _routeParams;
                    this._router = _router;
                }
                BinEstimatorDetailComponent.prototype.getProject = function () {
                    var _this = this;
                    this._binEstimatorProjectService.getBinEstimatorProject(+this._routeParams.get('project_id'))
                        .subscribe(function (project) {
                        _this.selectedProject = project;
                        _this.navHeader = _this.selectedProject.title + " Details";
                        _this.navItems = [
                            {
                                label: 'Details',
                                click: function () { return _this.goToLink('BinEstimatorDetail', { project_id: _this.selectedProject.id }); },
                                active: true
                            },
                            {
                                label: 'Loci',
                                click: function () { return _this.goToLink('BinEstimatorLocusList', { project_id: _this.selectedProject.id }); },
                                active: false
                            }
                        ];
                    });
                };
                BinEstimatorDetailComponent.prototype.goToLink = function (dest, params) {
                    var link = [dest, params];
                    this._router.navigate(link);
                };
                BinEstimatorDetailComponent.prototype.saveProject = function () {
                    var _this = this;
                    this.saveProjectError = null;
                    if (this.selectedProject.isDirty) {
                        this._binEstimatorProjectService.updateBinEstimatorProject(this.selectedProject)
                            .subscribe(function (proj) {
                            _this.selectedProject.copyFromObj(proj);
                        }, function (err) { return _this.saveProjectError = err; });
                    }
                };
                BinEstimatorDetailComponent.prototype.deleteProject = function () {
                    var _this = this;
                    this.deleteProjectError = null;
                    this._binEstimatorProjectService.deleteBinEstimatorProject(this.selectedProject.id)
                        .subscribe(function () { return _this.goToLink('BinEstimatorList'); }, function (err) { return _this.deleteProjectError = err; });
                };
                BinEstimatorDetailComponent.prototype.onChanged = function (e) {
                    this.selectedProject.isDirty = true;
                };
                BinEstimatorDetailComponent.prototype.ngOnInit = function () {
                    this.getProject();
                };
                BinEstimatorDetailComponent = __decorate([
                    core_1.Component({
                        selector: 'pm-bin-estimator-detail',
                        template: "\n    <div *ngIf=\"selectedProject\">\n        <pm-section-header [header]=\"navHeader\" [navItems]=\"navItems\"></pm-section-header>\n        <div class=\"row col-sm-6\">\n            <form (ngSubmit)=\"saveProject()\">\n                <div class=\"form-group\">\n                    <label>Title</label>\n                    <input type=\"text\" (keyup)=\"onChanged()\" class=\"form-control\" required [(ngModel)]=\"selectedProject.title\">\n                </div>\n                <div class=\"form-group\">\n                    <label>Creator</label>\n                    <input type=\"text\" (keyup)=\"onChanged()\" class=\"form-control\" [(ngModel)]=\"selectedProject.creator\">\n                </div>\n                <div class=\"form-group\">\n                    <label>Description</label>\n                    <input type=\"text\" (keyup)=\"onChanged()\" class=\"form-control\" [(ngModel)]=\"selectedProject.description\">\n                </div>\n                <button type=\"submit\" class=\"btn btn-default\" [ngClass]=\"{disabled: !selectedProject.isDirty}\">Save</button>\n                <button class=\"btn btn-warning\" (click)=\"deleteProject()\">Delete</button>\n                <span class=\"label label-danger\">{{saveProjectError}}</span>\n                <span class=\"label label-danger\">{{deleteProjectError}}</span>\n            </form>\n        </div>\n    </div>\n    ",
                        styleUrls: ['app/plasmomapper/styles/forms.css'],
                        directives: [section_header_component_1.SectionHeaderComponent]
                    }), 
                    __metadata('design:paramtypes', [bin_estimator_project_service_1.BinEstimatorProjectService, router_1.RouteParams, router_1.Router])
                ], BinEstimatorDetailComponent);
                return BinEstimatorDetailComponent;
            }());
            exports_1("BinEstimatorDetailComponent", BinEstimatorDetailComponent);
        }
    }
});
//# sourceMappingURL=bin-estimator-detail.component.js.map