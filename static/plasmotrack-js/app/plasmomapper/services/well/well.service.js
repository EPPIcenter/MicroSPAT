System.register(['angular2/core', '../../api', '../utils/LRUCache', '../utils/ServerMethods', './well.model'], function(exports_1, context_1) {
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
    var core_1, api_1, LRUCache_1, ServerMethods_1, well_model_1;
    var WellService;
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
            function (well_model_1_1) {
                well_model_1 = well_model_1_1;
            }],
        execute: function() {
            WellService = (function () {
                function WellService(_commonServerMethods) {
                    var _this = this;
                    this._commonServerMethods = _commonServerMethods;
                    this._wellsUrl = api_1.API_BASE + "/well/";
                    this._wellCache = new LRUCache_1.LRUCache(97);
                    this.getWell = function (id) { return _this._commonServerMethods.getDetails(id, well_model_1.Well, _this._wellsUrl, _this._wellCache); };
                    this.clearWellFromCache = function (id) { return _this._wellCache.remove(id); };
                    this.recalculateLadder = function (id, peakIndices) {
                        _this.clearWellFromCache(id);
                        var url = _this._wellsUrl + id + '/recalculate-ladder/';
                        return _this._commonServerMethods.postJSON({ 'peak_indices': peakIndices }, url);
                    };
                }
                WellService = __decorate([
                    core_1.Injectable(), 
                    __metadata('design:paramtypes', [ServerMethods_1.CommonServerMethods])
                ], WellService);
                return WellService;
            }());
            exports_1("WellService", WellService);
        }
    }
});
//# sourceMappingURL=well.service.js.map