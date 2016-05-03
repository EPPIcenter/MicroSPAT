System.register(['angular2/core', '../../api', '../utils/LRUCache', '../utils/ServerMethods', './plate.model'], function(exports_1, context_1) {
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
    var core_1, api_1, LRUCache_1, ServerMethods_1, plate_model_1;
    var PlateService;
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
            function (plate_model_1_1) {
                plate_model_1 = plate_model_1_1;
            }],
        execute: function() {
            PlateService = (function () {
                function PlateService(_commonServerMethods) {
                    var _this = this;
                    this._commonServerMethods = _commonServerMethods;
                    this._platesUrl = api_1.API_BASE + '/plate/';
                    this._plateCache = new LRUCache_1.LRUCache(100);
                    this.getPlates = function () { return _this._commonServerMethods.getList(plate_model_1.Plate, _this._platesUrl); };
                    this.getPlate = function (id) { return _this._commonServerMethods.getDetails(id, plate_model_1.Plate, _this._platesUrl, _this._plateCache); };
                    this.clearPlateFromCache = function (id) { return _this._plateCache.remove(id); };
                    this.postPlates = function (files, params) {
                        return _this._commonServerMethods.postFiles(files, _this._platesUrl, params)
                            .map(function (plates) {
                            console.log(plates);
                            var plate_array = [];
                            for (var i = 0; i < plates.length; i++) {
                                var t = new plate_model_1.Plate();
                                t.fillFromJSON(plates[i]);
                                plate_array.push(t);
                                _this._plateCache.set(t.id, t);
                            }
                            return plate_array;
                        });
                    };
                    this.postPlateMap = function (files, id) {
                        return _this._commonServerMethods.postFiles(files, _this._platesUrl + id + "/", {})
                            .map(function (plate) {
                            var t = new plate_model_1.Plate();
                            t.fillFromJSON(plate);
                            _this._plateCache.set(t.id, t);
                            return t;
                        });
                    };
                }
                PlateService = __decorate([
                    core_1.Injectable(), 
                    __metadata('design:paramtypes', [ServerMethods_1.CommonServerMethods])
                ], PlateService);
                return PlateService;
            }());
            exports_1("PlateService", PlateService);
        }
    }
});
//# sourceMappingURL=plate.service.js.map