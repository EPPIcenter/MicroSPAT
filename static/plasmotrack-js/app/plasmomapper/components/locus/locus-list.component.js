System.register(['angular2/core', '../layout/section-header.component', '../../pipes/capitalize.pipe', '../../services/locus/locus.model', '../../services/locus/locus.service'], function(exports_1, context_1) {
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
    var core_1, section_header_component_1, capitalize_pipe_1, locus_model_1, locus_service_1;
    var LocusListComponent;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (section_header_component_1_1) {
                section_header_component_1 = section_header_component_1_1;
            },
            function (capitalize_pipe_1_1) {
                capitalize_pipe_1 = capitalize_pipe_1_1;
            },
            function (locus_model_1_1) {
                locus_model_1 = locus_model_1_1;
            },
            function (locus_service_1_1) {
                locus_service_1 = locus_service_1_1;
            }],
        execute: function() {
            LocusListComponent = (function () {
                function LocusListComponent(_locusService) {
                    this._locusService = _locusService;
                    this.constructorErrors = [];
                    this.reversed = false;
                    this.sortingParam = 'label';
                    this.newLocus = new locus_model_1.Locus();
                }
                LocusListComponent.prototype.getLoci = function () {
                    var _this = this;
                    this._locusService.getLoci().subscribe(function (loci) {
                        _this.loci = loci;
                        _this.sortLoci();
                    }, function (err) { return _this.constructorErrors.push(err); });
                };
                LocusListComponent.prototype.sortLoci = function () {
                    var _this = this;
                    this.loci.sort(function (a, b) {
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
                        this.loci.reverse();
                    }
                };
                LocusListComponent.prototype.removeLocus = function (id) {
                    var _this = this;
                    this.locusListError = null;
                    this._locusService.deleteLocus(id).subscribe(function () { return _this.getLoci(); }, function (err) {
                        _this.locusListError = err;
                    });
                };
                LocusListComponent.prototype.submitNewLocus = function () {
                    var _this = this;
                    this.isSubmitting = true;
                    this.newLocusError = null;
                    this._locusService.createLocus(this.newLocus).subscribe(function () {
                        _this.getLoci();
                        _this.newLocus = new locus_model_1.Locus();
                    }, function (err) {
                        _this.newLocusError = err;
                    });
                    this.isSubmitting = false;
                };
                LocusListComponent.prototype.ngOnInit = function () {
                    this.getLoci();
                };
                LocusListComponent = __decorate([
                    core_1.Component({
                        selector: 'pm-locus-list',
                        template: "\n    <pm-section-header [header]=\"'Loci'\"></pm-section-header>\n    <div class=\"row main-container\">\n        <div class=\"table-responsive list-panel col-sm-4\">\n            <span class=\"label label-danger\">{{locusListError}}</span>\n            <table class=\"table table-striped table-hover table-condensed\">\n                <thead>\n                    <tr>\n                        <th (click)=\"sortingParam='label'; reversed=!reversed; sortLoci()\">Label</th>\n                        <th (click)=\"sortingParam='min_base_length'; reversed=!reversed; sortLoci()\">Min. Base Length</th>\n                        <th (click)=\"sortingParam='max_base_length'; reversed=!reversed; sortLoci()\">Max. Base Length</th>\n                        <th (click)=\"sortingParam='nucleotide_repeat_length'; reversed=!reversed; sortLoci()\">Nucleotide Repeat Length</th>\n                        <th (click)=\"sortingParam='color'; reversed=!reversed; sortLoci()\">Color</th>\n                        <th></th>\n                    </tr>\n                </thead>\n                <tbody>\n                    <tr *ngFor=\"#locus of loci\">\n                        <td>{{locus.label}}</td>\n                        <td>{{locus.min_base_length}}</td>\n                        <td>{{locus.max_base_length}}</td>\n                        <td>{{locus.nucleotide_repeat_length}}</td>\n                        <td>{{locus.color | capitalize}}</td>\n                        <td><a><span (click)=\"removeLocus(locus.id)\" class=\"glyphicon glyphicon-remove-circle\"></span></a></td>\n                    </tr>\n                </tbody>\n            </table>\n        </div>\n        <div class=\"col-sm-6\">\n            <div class=\"panel panel-default\">\n                <div class=\"panel-heading\">\n                    <h3 class=\"panel-title\">New Locus</h3>\n                </div>\n                <div class=\"panel-body\">\n                    <form (ngSubmit)=\"submitNewLocus()\">\n                        <div class=\"form-group\">\n                            <label>Label</label>\n                            <input type=\"text\" class=\"form-control\" required [(ngModel)]=\"newLocus.label\">\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Min. Base Length</label>\n                            <input type=\"number\" class=\"form-control\" min=\"0\" required [(ngModel)]=\"newLocus.min_base_length\">\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Max. Base Length</label>\n                            <input type=\"number\" class=\"form-control\" min=\"0\" required [(ngModel)]=\"newLocus.max_base_length\">\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Nucleotide Repeat Length</label>\n                            <input type=\"number\" class=\"form-control\" min=\"0\" required [(ngModel)]=\"newLocus.nucleotide_repeat_length\">\n                            \n                        </div>\n                        <div class=\"form-group\">\n                            <label>Color</label>\n                            <select [(ngModel)]=\"newLocus.color\" required class=\"form-control\">\n                                <option value=\"red\">Red</option>\n                                <option value=\"green\">Green</option>\n                                <option value=\"blue\">Blue</option>\n                                <option value=\"yellow\">Yellow</option>\n                                <option value=\"orange\">Orange</option>\n                            </select>\n                        </div>\n                        <button type=\"submit\" class=\"btn btn-default\" [ngClass]=\"{disabled: isSubmitting}\">Save</button>\n                    </form>\n                    <span class=\"label label-danger\">{{newLocusError}}</span>\n                </div>\n            </div>\n        </div>\n    </div>\n    ",
                        pipes: [capitalize_pipe_1.CapitalizePipe],
                        directives: [section_header_component_1.SectionHeaderComponent]
                    }), 
                    __metadata('design:paramtypes', [locus_service_1.LocusService])
                ], LocusListComponent);
                return LocusListComponent;
            }());
            exports_1("LocusListComponent", LocusListComponent);
        }
    }
});
//# sourceMappingURL=locus-list.component.js.map