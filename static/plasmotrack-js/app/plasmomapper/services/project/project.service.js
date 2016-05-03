System.register(['angular2/core', '../../api', '../utils/ServerMethods', './locus-parameters/locus-parameters.model', './channel-annotation/channel-annotation.model'], function(exports_1, context_1) {
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
    var core_1, api_1, ServerMethods_1, locus_parameters_model_1, channel_annotation_model_1;
    var ProjectService;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (api_1_1) {
                api_1 = api_1_1;
            },
            function (ServerMethods_1_1) {
                ServerMethods_1 = ServerMethods_1_1;
            },
            function (locus_parameters_model_1_1) {
                locus_parameters_model_1 = locus_parameters_model_1_1;
            },
            function (channel_annotation_model_1_1) {
                channel_annotation_model_1 = channel_annotation_model_1_1;
            }],
        execute: function() {
            ProjectService = (function () {
                function ProjectService(_commonServerMethods) {
                    var _this = this;
                    this._commonServerMethods = _commonServerMethods;
                    this._locusParamsUrl = api_1.API_BASE + "/locus-parameters/";
                    this._channelAnnotationsUrl = api_1.API_BASE + "/channel-annotations/";
                    this.saveLocusParameters = function (locus_params) {
                        return _this._commonServerMethods.updateItem(locus_params, locus_parameters_model_1.LocusParameters, _this._locusParamsUrl);
                    };
                    this.getLocusChannelAnnotations = function (project_id, locus_id) {
                        var url = _this._channelAnnotationsUrl + project_id + "/locus/" + locus_id;
                        return _this._commonServerMethods.getList(channel_annotation_model_1.ChannelAnnotation, url);
                    };
                }
                ;
                ProjectService = __decorate([
                    core_1.Injectable(), 
                    __metadata('design:paramtypes', [ServerMethods_1.CommonServerMethods])
                ], ProjectService);
                return ProjectService;
            }());
            exports_1("ProjectService", ProjectService);
        }
    }
});
//# sourceMappingURL=project.service.js.map