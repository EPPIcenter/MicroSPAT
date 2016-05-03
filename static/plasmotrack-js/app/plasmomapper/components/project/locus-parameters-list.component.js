System.register(['angular2/core', '../../pipes/locus.pipe'], function(exports_1, context_1) {
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
    var core_1, locus_pipe_1;
    var LocusParametersListComponent;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (locus_pipe_1_1) {
                locus_pipe_1 = locus_pipe_1_1;
            }],
        execute: function() {
            LocusParametersListComponent = (function () {
                function LocusParametersListComponent() {
                    this.locusClicked = new core_1.EventEmitter();
                }
                LocusParametersListComponent.prototype.onLocusClick = function (locus_id) {
                    console.log(this.locusParameters);
                    this.locusClicked.emit(locus_id);
                };
                __decorate([
                    core_1.Output(), 
                    __metadata('design:type', Object)
                ], LocusParametersListComponent.prototype, "locusClicked", void 0);
                LocusParametersListComponent = __decorate([
                    core_1.Component({
                        selector: 'pm-locus-parameter-list',
                        inputs: ['locusParameters'],
                        template: "\n    <div class=\"panel panel-default\">\n        <div class=\"panel-heading\">\n            <h3 class=\"panel-title\">Loci</h3>\n        </div>\n        <div class=\"panel-body\">\n            <div class=\"table-responsive\">\n                <table class=\"table table-hover table-condensed\">\n                    <tbody>\n                        <tr *ngFor=\"#locusParameter of locusParameters\" (click)=\"onLocusClick(locusParameter.locus_id)\" [ngClass]=\"{warning: locusParameter.isDirty || locusParameter.scanning_parameters_stale || locusParameter.filter_parameters_stale}\">\n                            <td>{{locusParameter.locus_id | locus | async}}</td>\n                        </tr>\n                    </tbody>\n                </table>\n            </div>\n        </div>\n    </div>\n    ",
                        pipes: [locus_pipe_1.LocusPipe]
                    }), 
                    __metadata('design:paramtypes', [])
                ], LocusParametersListComponent);
                return LocusParametersListComponent;
            }());
            exports_1("LocusParametersListComponent", LocusParametersListComponent);
        }
    }
});
//# sourceMappingURL=locus-parameters-list.component.js.map