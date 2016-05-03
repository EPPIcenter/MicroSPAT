System.register(['angular2/core', '../layout/section-header.component', '../../pipes/capitalize.pipe', '../../services/locus-set/locus-set.model', '../../services/locus/locus.service', '../../services/locus-set/locus-set.service'], function(exports_1, context_1) {
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
    var core_1, section_header_component_1, capitalize_pipe_1, locus_set_model_1, locus_service_1, locus_set_service_1;
    var LocusSetListComponent;
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
            function (locus_set_model_1_1) {
                locus_set_model_1 = locus_set_model_1_1;
            },
            function (locus_service_1_1) {
                locus_service_1 = locus_service_1_1;
            },
            function (locus_set_service_1_1) {
                locus_set_service_1 = locus_set_service_1_1;
            }],
        execute: function() {
            LocusSetListComponent = (function () {
                function LocusSetListComponent(_locusSetService, _locusService) {
                    this._locusSetService = _locusSetService;
                    this._locusService = _locusService;
                    this.isSubmitting = false;
                    this.constructorErrors = [];
                    this.sortingParam = 'label';
                    this.reversed = false;
                    this.newLocusSet = new locus_set_model_1.LocusSet();
                }
                LocusSetListComponent.prototype.getLocusSets = function () {
                    var _this = this;
                    this._locusSetService.getLocusSets().subscribe(function (locusSets) {
                        _this.locusSets = locusSets;
                    });
                };
                LocusSetListComponent.prototype.getLoci = function () {
                    var _this = this;
                    this.selectedLocusIds = new Map();
                    this._locusService.getLoci().subscribe(function (loci) {
                        _this.loci = loci;
                        loci.forEach(function (locus) {
                            _this.selectedLocusIds[locus.id] = false;
                        });
                    });
                };
                LocusSetListComponent.prototype.sortLoci = function () {
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
                LocusSetListComponent.prototype.removeLocusSet = function (id) {
                    var _this = this;
                    this.locusSetListError = null;
                    this._locusSetService.deleteLocusSet(id).subscribe(function () {
                        _this.getLocusSets();
                    }, function (err) { return _this.locusSetListError = err; });
                };
                LocusSetListComponent.prototype.createLocusSet = function () {
                    var _this = this;
                    this.isSubmitting = true;
                    this.newLocusSetError = null;
                    var locusIds = [];
                    console.log(this.selectedLocusIds);
                    for (var id in this.selectedLocusIds) {
                        if (this.selectedLocusIds[id]) {
                            locusIds.push(id);
                        }
                    }
                    console.log(locusIds);
                    this._locusSetService.createLocusSet(this.newLocusSet, locusIds).subscribe(function () {
                        _this.newLocusSet = new locus_set_model_1.LocusSet();
                        _this.getLocusSets();
                        _this.getLoci();
                    }, function (err) {
                        _this.newLocusSetError = err;
                    });
                    this.isSubmitting = false;
                };
                LocusSetListComponent.prototype.ngOnInit = function () {
                    this.getLocusSets();
                    this.getLoci();
                };
                LocusSetListComponent = __decorate([
                    core_1.Component({
                        selector: 'pm-locus-set-list',
                        template: "\n    <pm-section-header [header]=\"'Locus Sets'\"></pm-section-header>\n    <div class=\"row main-container\">\n        <div class=\"table-responsive list-panel col-sm-2\">\n            <span class=\"label label-danger\">{{locusSetListError}}</span>\n            <table class=\"table table-striped table-hover table-condensed\">\n                <thead>\n                    <tr>\n                        <th>Label</th>\n                        <th></th>\n                    </tr>\n                </thead>\n                <tbody>\n                    <tr *ngFor=\"#locusSet of locusSets\">\n                        <td>{{locusSet.label}}</td>\n                        <td><a><span (click)=\"removeLocusSet(locusSet.id)\" class=\"glyphicon glyphicon-remove-circle\"></span></a></td>\n                    </tr>\n                </tbody>\n            </table>\n        </div>\n        <div class=\"col-sm-5\">\n            <div class=\"panel panel-default\">\n                <div class=\"panel-heading\">\n                    <h3 class=\"panel-title\">New Locus Set</h3>\n                </div>\n                <div class=\"panel-body list-panel\">\n                    <form (ngSubmit)=\"createLocusSet()\">\n                        <div class=\"form-group\">\n                            <label>Label</label>\n                            <input type=\"text\" class=\"form-control\" required [(ngModel)]=\"newLocusSet.label\">\n                        </div>\n                        <div>\n                            <table class=\"table table-striped table-hover table-condensed\">\n                                <thead>\n                                    <tr>\n                                        <th (click)=\"sortingParam='label'; reversed=!reversed; sortLoci()\">Label</th>\n                                        <th (click)=\"sortingParam='min_base_length'; reversed=!reversed; sortLoci()\">Min. Base Length</th>\n                                        <th (click)=\"sortingParam='max_base_length'; reversed=!reversed; sortLoci()\">Max. Base Length</th>\n                                        <th (click)=\"sortingParam='nucleotide_repeat_length'; reversed=!reversed; sortLoci()\">Nucleotide Repeat Length</th>\n                                        <th (click)=\"sortingParam='color'; reversed=!reversed; sortLoci()\">Color</th>\n                                    </tr>\n                                </thead>\n                                <tbody>\n                                    <tr *ngFor=\"#locus of loci\" [ngClass]=\"{success: selectedLocusIds[locus.id]}\" (click)=\"selectedLocusIds[locus.id] = !selectedLocusIds[locus.id]\">\n                                        <td>{{locus.label}}</td>\n                                        <td>{{locus.min_base_length}}</td>\n                                        <td>{{locus.max_base_length}}</td>\n                                        <td>{{locus.nucleotide_repeat_length}}</td>\n                                        <td>{{locus.color | capitalize}}</td>\n                                    </tr>\n                                </tbody>\n                            </table>\n                        </div>\n                        <button type=\"submit\" class=\"btn btn-default\" [ngClass]=\"{disabled: isSubmitting}\">Save</button>\n                    </form>\n                </div>\n            </div>\n        </div>\n    </div>\n    ",
                        pipes: [capitalize_pipe_1.CapitalizePipe],
                        directives: [section_header_component_1.SectionHeaderComponent]
                    }), 
                    __metadata('design:paramtypes', [locus_set_service_1.LocusSetService, locus_service_1.LocusService])
                ], LocusSetListComponent);
                return LocusSetListComponent;
            }());
            exports_1("LocusSetListComponent", LocusSetListComponent);
        }
    }
});
//# sourceMappingURL=locus-set-list.component.js.map