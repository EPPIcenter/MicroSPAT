System.register(['angular2/core', '../../api', '../utils/LRUCache', '../utils/ServerMethods', './locus-set.model'], function(exports_1, context_1) {
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
    var core_1, api_1, LRUCache_1, ServerMethods_1, locus_set_model_1;
    var LocusSetService;
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
            function (locus_set_model_1_1) {
                locus_set_model_1 = locus_set_model_1_1;
            }],
        execute: function() {
            LocusSetService = (function () {
                function LocusSetService(_commonServerMethods) {
                    var _this = this;
                    this._commonServerMethods = _commonServerMethods;
                    this._locusSetUrl = api_1.API_BASE + '/locus-set/';
                    this._locusSetCache = new LRUCache_1.LRUCache(100);
                    this.getLocusSets = function () { return _this._commonServerMethods.getList(locus_set_model_1.LocusSet, _this._locusSetUrl); };
                    this.getLocusSet = function (id) { return _this._commonServerMethods.getDetails(id, locus_set_model_1.LocusSet, _this._locusSetUrl, _this._locusSetCache); };
                    this.createLocusSet = function (locus_set, locus_ids) {
                        return _this._commonServerMethods.createItem({ locus_set: locus_set, locus_ids: locus_ids }, locus_set_model_1.LocusSet, _this._locusSetUrl, _this._locusSetCache);
                    };
                    this.deleteLocusSet = function (id) { return _this._commonServerMethods.deleteItem(id, _this._locusSetUrl, _this._locusSetCache); };
                }
                LocusSetService = __decorate([
                    core_1.Injectable(), 
                    __metadata('design:paramtypes', [ServerMethods_1.CommonServerMethods])
                ], LocusSetService);
                return LocusSetService;
            }());
            exports_1("LocusSetService", LocusSetService);
        }
    }
});
//# sourceMappingURL=locus-set.service.js.map