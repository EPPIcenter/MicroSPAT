System.register(['angular2/core', '../../api', '../utils/LRUCache', '../utils/ServerMethods', './locus.model'], function(exports_1, context_1) {
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
    var core_1, api_1, LRUCache_1, ServerMethods_1, locus_model_1;
    var LocusService;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (api_1_1) {
                api_1 = api_1_1;
            },
            function (LRUCache_1_1) {
                LRUCache_1 = LRUCache_1_1;
            },
            function (ServerMethods_1_1) {
                ServerMethods_1 = ServerMethods_1_1;
            },
            function (locus_model_1_1) {
                locus_model_1 = locus_model_1_1;
            }],
        execute: function() {
            LocusService = (function () {
                function LocusService(_commonServerMethods) {
                    var _this = this;
                    this._commonServerMethods = _commonServerMethods;
                    this._lociUrl = api_1.API_BASE + '/locus/';
                    this._locusCache = new LRUCache_1.LRUCache();
                    this.getLoci = function () { return _this._commonServerMethods.getList(locus_model_1.Locus, _this._lociUrl); };
                    this.getLocus = function (id) { return _this._commonServerMethods.getDetails(id, locus_model_1.Locus, _this._lociUrl, _this._locusCache); };
                    this.updateLocus = function (locus) { return _this._commonServerMethods.updateItem(locus, locus_model_1.Locus, _this._lociUrl, _this._locusCache); };
                    this.createLocus = function (locus) { return _this._commonServerMethods.createItem(locus, locus_model_1.Locus, _this._lociUrl, _this._locusCache); };
                    this.deleteLocus = function (id) { return _this._commonServerMethods.deleteItem(id, _this._lociUrl, _this._locusCache); };
                }
                LocusService = __decorate([
                    core_1.Injectable(), 
                    __metadata('design:paramtypes', [ServerMethods_1.CommonServerMethods])
                ], LocusService);
                return LocusService;
            }());
            exports_1("LocusService", LocusService);
        }
    }
});
//# sourceMappingURL=locus.service.js.map