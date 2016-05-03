System.register(['angular2/core', '../../api', '../utils/LRUCache', '../utils/ServerMethods', './ladder.model'], function(exports_1, context_1) {
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
    var core_1, api_1, LRUCache_1, ServerMethods_1, ladder_model_1;
    var LadderService;
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
            function (ladder_model_1_1) {
                ladder_model_1 = ladder_model_1_1;
            }],
        execute: function() {
            LadderService = (function () {
                function LadderService(_commonServerMethods) {
                    var _this = this;
                    this._commonServerMethods = _commonServerMethods;
                    this._ladderUrl = api_1.API_BASE + '/ladder/';
                    this._ladderCache = new LRUCache_1.LRUCache();
                    this.getLadders = function () { return _this._commonServerMethods.getList(ladder_model_1.Ladder, _this._ladderUrl); };
                    this.getLadder = function (id) { return _this._commonServerMethods.getDetails(id, ladder_model_1.Ladder, _this._ladderUrl, _this._ladderCache); };
                    this.updateLadder = function (ladder) { return _this._commonServerMethods.updateItem(ladder, ladder_model_1.Ladder, _this._ladderUrl, _this._ladderCache); };
                    this.createLadder = function (ladder) { return _this._commonServerMethods.createItem(ladder, ladder_model_1.Ladder, _this._ladderUrl, _this._ladderCache); };
                }
                LadderService = __decorate([
                    core_1.Injectable(), 
                    __metadata('design:paramtypes', [ServerMethods_1.CommonServerMethods])
                ], LadderService);
                return LadderService;
            }());
            exports_1("LadderService", LadderService);
        }
    }
});
//# sourceMappingURL=ladder.service.js.map