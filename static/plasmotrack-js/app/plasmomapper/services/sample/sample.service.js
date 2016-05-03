System.register(['angular2/core', '../../api', '../utils/LRUCache', '../utils/ServerMethods', './sample.model'], function(exports_1, context_1) {
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
    var core_1, api_1, LRUCache_1, ServerMethods_1, sample_model_1;
    var SampleService;
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
            function (sample_model_1_1) {
                sample_model_1 = sample_model_1_1;
            }],
        execute: function() {
            SampleService = (function () {
                function SampleService(_commonServerMethods) {
                    var _this = this;
                    this._commonServerMethods = _commonServerMethods;
                    this._samplesUrl = api_1.API_BASE + '/sample/';
                    this._sampleCache = new LRUCache_1.LRUCache();
                    this.getSamples = function () { return _this._commonServerMethods.getList(sample_model_1.Sample, _this._samplesUrl); };
                    this.getSample = function (id) { return _this._commonServerMethods.getDetails(id, sample_model_1.Sample, _this._samplesUrl, _this._sampleCache); };
                    this.postSamples = function (files) {
                        return _this._commonServerMethods.postFiles(files, _this._samplesUrl, {})
                            .map(function (samples) {
                            console.log(samples);
                            var sample_array = [];
                            for (var i = 0; i < samples.length; i++) {
                                var t = new sample_model_1.Sample();
                                t.fillFromJSON(samples[i]);
                                sample_array.push(t);
                                _this._sampleCache.set(t.id, t);
                            }
                            return sample_array;
                        });
                    };
                }
                SampleService = __decorate([
                    core_1.Injectable(), 
                    __metadata('design:paramtypes', [ServerMethods_1.CommonServerMethods])
                ], SampleService);
                return SampleService;
            }());
            exports_1("SampleService", SampleService);
        }
    }
});
//# sourceMappingURL=sample.service.js.map