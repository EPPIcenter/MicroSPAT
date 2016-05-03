System.register(['angular2/core', '../../api', '../utils/ServerMethods', '../project/project.service', './sample-annotation/locus-annotation/sample-locus-annotation.model', '../project/channel-annotation/channel-annotation.model'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
        var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
        else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
    };
    var __metadata = (this && this.__metadata) || function (k, v) {
        if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
    };
    var core_1, api_1, ServerMethods_1, project_service_1, sample_locus_annotation_model_1, channel_annotation_model_1;
    var SampleBasedProjectService;
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
            function (project_service_1_1) {
                project_service_1 = project_service_1_1;
            },
            function (sample_locus_annotation_model_1_1) {
                sample_locus_annotation_model_1 = sample_locus_annotation_model_1_1;
            },
            function (channel_annotation_model_1_1) {
                channel_annotation_model_1 = channel_annotation_model_1_1;
            }],
        execute: function() {
            SampleBasedProjectService = (function (_super) {
                __extends(SampleBasedProjectService, _super);
                function SampleBasedProjectService(_commonServerMethods) {
                    var _this = this;
                    _super.call(this, _commonServerMethods);
                    this._commonServerMethods = _commonServerMethods;
                    this._locusAnnotationUrl = api_1.API_BASE + '/locus-annotations/';
                    this.getLocusAnnotations = function (project_id, locus_id) {
                        var url = _this._locusAnnotationUrl + project_id + "/locus/" + locus_id + "/";
                        return _this._commonServerMethods.getList(sample_locus_annotation_model_1.SampleLocusAnnotation, url);
                    };
                    this.getSampleLocusAnnotations = function (project_id, sample_id) {
                        var url = _this._locusAnnotationUrl + project_id + "/sample/" + sample_id + "/";
                        return _this._commonServerMethods.getList(sample_locus_annotation_model_1.SampleLocusAnnotation, url);
                    };
                    this.getSampleChannelAnnotations = function (project_id, sample_id) {
                        var url = _this._channelAnnotationsUrl + project_id + "/sample/" + sample_id;
                        return _this._commonServerMethods.getList(channel_annotation_model_1.ChannelAnnotation, url);
                    };
                }
                SampleBasedProjectService = __decorate([
                    core_1.Injectable(), 
                    __metadata('design:paramtypes', [ServerMethods_1.CommonServerMethods])
                ], SampleBasedProjectService);
                return SampleBasedProjectService;
            }(project_service_1.ProjectService));
            exports_1("SampleBasedProjectService", SampleBasedProjectService);
        }
    }
});
//# sourceMappingURL=sample-based-project.service.js.map