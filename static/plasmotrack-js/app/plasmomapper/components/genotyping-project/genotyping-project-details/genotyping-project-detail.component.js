System.register(['angular2/core', 'angular2/router', '../../layout/section-header.component', '../../../services/genotyping-project/genotyping-project.service'], function(exports_1, context_1) {
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
    var core_1, router_1, section_header_component_1, genotyping_project_service_1;
    var GenotypingProjectDetailComponent;
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
            }],
        execute: function() {
            GenotypingProjectDetailComponent = (function () {
                function GenotypingProjectDetailComponent(_genotypingProjectService, _routeParams, _router) {
                    this._genotypingProjectService = _genotypingProjectService;
                    this._routeParams = _routeParams;
                    this._router = _router;
                    console.log("Loading Project Details");
                }
                GenotypingProjectDetailComponent.prototype.getProject = function () {
                    var _this = this;
                    this._genotypingProjectService.getProject(+this._routeParams.get('project_id'))
                        .subscribe(function (project) {
                        console.log(project);
                        _this.selectedProject = project;
                        _this.navHeader = _this.selectedProject.title + " Details";
                        _this.navItems = [
                            {
                                label: 'Details',
                                click: function () { return _this.goToLink('GenotypingProjectDetail', { project_id: _this.selectedProject.id }); },
                                active: true
                            },
                            {
                                label: 'Samples',
                                click: function () { return _this.goToLink('GenotypingProjectSampleList', { project_id: _this.selectedProject.id }); },
                                active: false
                            },
                            {
                                label: 'Loci',
                                click: function () { return _this.goToLink('GenotypingProjectLocusList', { project_id: _this.selectedProject.id }); },
                                active: false
                            }
                        ];
                    });
                };
                GenotypingProjectDetailComponent.prototype.goToLink = function (dest, params) {
                    var link = [dest, params];
                    this._router.navigate(link);
                };
                GenotypingProjectDetailComponent.prototype.saveProject = function () {
                    var _this = this;
                    this.saveProjectError = null;
                    if (this.selectedProject.isDirty) {
                        this._genotypingProjectService.updateProject(this.selectedProject).subscribe(function (project) {
                            _this.selectedProject.copyFromObj(project);
                            console.log(project);
                        }, function (error) { return _this.saveProjectError = error; });
                    }
                };
                GenotypingProjectDetailComponent.prototype.deleteProject = function () {
                    var _this = this;
                    this.deleteProjectError = null;
                    this._genotypingProjectService.deleteProject(this.selectedProject.id).subscribe(function () { return _this.goToLink('GenotypingProjectList'); }, function (err) { return _this.deleteProjectError = err; });
                };
                GenotypingProjectDetailComponent.prototype.onChanged = function (e) {
                    console.log(this.selectedProject);
                    this.selectedProject.isDirty = true;
                };
                GenotypingProjectDetailComponent.prototype.ngOnInit = function () {
                    this.getProject();
                };
                GenotypingProjectDetailComponent = __decorate([
                    core_1.Component({
                        selector: 'pm-genotyping-project-detail',
                        template: "\n    <div *ngIf=\"selectedProject\">\n        <pm-section-header [header]=\"navHeader\" [navItems]=\"navItems\"></pm-section-header>\n        <div class=\"row col-sm-6\">\n            <form (ngSubmit)=\"saveProject()\">\n                <div class=\"form-group\">\n                    <label>Title</label>\n                    <input type=\"text\" (keyup)=\"onChanged()\" class=\"form-control\" required\n                        [(ngModel)] = \"selectedProject.title\">\n                </div>\n                <div class=\"form-group\">\n                    <label>Creator</label>\n                    <input type=\"text\" (keyup)=\"onChanged()\" class=\"form-control\"\n                        [(ngModel)] = \"selectedProject.creator\">\n                </div>\n                <div class=\"form-group\">\n                    <label>Description</label>\n                    <input type=\"text\" (keyup)=\"onChanged()\" class=\"form-control\"\n                        [(ngModel)] = \"selectedProject.description\">\n                </div>\n                <button type=\"submit\" class=\"btn btn-default\" [ngClass]=\"{disabled: !selectedProject.isDirty}\">Save</button>\n                <button class=\"btn btn-warning\" (click)=\"deleteProject()\">Delete</button>\n                <span class=\"label label-danger\">{{saveProjectError}}</span>\n                <span class=\"label label-danger\">{{deleteProjectError}}</span>\n            </form>\n        </div>\n    </div>\n    ",
                        styleUrls: ['app/plasmomapper/styles/forms.css'],
                        directives: [section_header_component_1.SectionHeaderComponent]
                    }), 
                    __metadata('design:paramtypes', [genotyping_project_service_1.GenotypingProjectService, router_1.RouteParams, router_1.Router])
                ], GenotypingProjectDetailComponent);
                return GenotypingProjectDetailComponent;
            }());
            exports_1("GenotypingProjectDetailComponent", GenotypingProjectDetailComponent);
        }
    }
});
//# sourceMappingURL=genotyping-project-detail.component.js.map