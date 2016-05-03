System.register(['angular2/core', '../../api', '../utils/LRUCache', '../utils/ServerMethods', '../project/project.service', './artifact-estimator-project.model', './locus-artifact-estimator/artifact-estimator/artifact-estimator.model'], function(exports_1, context_1) {
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
    var core_1, api_1, LRUCache_1, ServerMethods_1, project_service_1, artifact_estimator_project_model_1, artifact_estimator_model_1;
    var ArtifactEstimatorProjectService;
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
            function (project_service_1_1) {
                project_service_1 = project_service_1_1;
            },
            function (artifact_estimator_project_model_1_1) {
                artifact_estimator_project_model_1 = artifact_estimator_project_model_1_1;
            },
            function (artifact_estimator_model_1_1) {
                artifact_estimator_model_1 = artifact_estimator_model_1_1;
            }],
        execute: function() {
            ArtifactEstimatorProjectService = (function (_super) {
                __extends(ArtifactEstimatorProjectService, _super);
                function ArtifactEstimatorProjectService(_commonServerMethods) {
                    var _this = this;
                    _super.call(this, _commonServerMethods);
                    this._commonServerMethods = _commonServerMethods;
                    this._artifactEstimatorProjectsUrl = api_1.API_BASE + '/artifact-estimator-project/';
                    this._artifactEstimatorUrl = api_1.API_BASE + "/artifact-estimator/";
                    this._artifactEstimatorProjectsCache = new LRUCache_1.LRUCache(100);
                    this.getArtifactEstimatorProjects = function () { return _this._commonServerMethods.getList(artifact_estimator_project_model_1.ArtifactEstimatorProject, _this._artifactEstimatorProjectsUrl); };
                    this.getArtifactEstimatorProject = function (id) { return _this._commonServerMethods.getDetails(id, artifact_estimator_project_model_1.ArtifactEstimatorProject, _this._artifactEstimatorProjectsUrl, _this._artifactEstimatorProjectsCache); };
                    this.updateArtifactEstimatorProject = function (project) { return _this._commonServerMethods.updateItem(project, artifact_estimator_project_model_1.ArtifactEstimatorProject, _this._artifactEstimatorProjectsUrl, _this._artifactEstimatorProjectsCache); };
                    this.createArtifactEstimatorProject = function (project) { return _this._commonServerMethods.createItem(project, artifact_estimator_project_model_1.ArtifactEstimatorProject, _this._artifactEstimatorProjectsUrl, _this._artifactEstimatorProjectsCache); };
                    this.deleteArtifactEstimatorProject = function (id) { return _this._commonServerMethods.deleteItem(id, _this._artifactEstimatorProjectsUrl, _this._artifactEstimatorProjectsCache); };
                    this.deleteArtifactEstimator = function (id) { return _this._commonServerMethods.deleteItem(id, _this._artifactEstimatorUrl); };
                    this.addBreakpoint = function (artifact_estimator_id, breakpoint) {
                        return _this._commonServerMethods.postJSON({ 'breakpoint': breakpoint }, _this._artifactEstimatorUrl + artifact_estimator_id + "/")
                            .map(function (res) { return res.json().data; })
                            .map(function (res) {
                            var t = new artifact_estimator_model_1.ArtifactEstimator();
                            t.fillFromJSON(res);
                            return t;
                        });
                    };
                    this.clearArtifactEstimatorBreakpoints = function (artifact_estimator_id) {
                        return _this._commonServerMethods.getUrl(_this._artifactEstimatorUrl + artifact_estimator_id + "/clear-breakpoints/")
                            .map(function (res) {
                            var t = new artifact_estimator_model_1.ArtifactEstimator();
                            t.fillFromJSON(res);
                            return t;
                        });
                    };
                    this.clearCache = function (id) { return _this._artifactEstimatorProjectsCache.remove(id); };
                }
                ArtifactEstimatorProjectService = __decorate([
                    core_1.Injectable(), 
                    __metadata('design:paramtypes', [ServerMethods_1.CommonServerMethods])
                ], ArtifactEstimatorProjectService);
                return ArtifactEstimatorProjectService;
            }(project_service_1.ProjectService));
            exports_1("ArtifactEstimatorProjectService", ArtifactEstimatorProjectService);
        }
    }
});
//# sourceMappingURL=artifact-estimator-project.service.js.map