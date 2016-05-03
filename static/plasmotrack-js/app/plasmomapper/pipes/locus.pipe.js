System.register(['angular2/core', '../services/locus/locus.service'], function(exports_1, context_1) {
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
    var core_1, locus_service_1;
    var LocusPipe;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (locus_service_1_1) {
                locus_service_1 = locus_service_1_1;
            }],
        execute: function() {
            LocusPipe = (function () {
                function LocusPipe(_locusService) {
                    this._locusService = _locusService;
                }
                LocusPipe.prototype.transform = function (id, fields) {
                    var field = fields[0];
                    return this._locusService.getLocus(id)
                        .map(function (locus) {
                        return locus[field || 'label'];
                    });
                };
                LocusPipe = __decorate([
                    core_1.Pipe({
                        name: 'locus'
                    }), 
                    __metadata('design:paramtypes', [locus_service_1.LocusService])
                ], LocusPipe);
                return LocusPipe;
            }());
            exports_1("LocusPipe", LocusPipe);
        }
    }
});
//# sourceMappingURL=locus.pipe.js.map