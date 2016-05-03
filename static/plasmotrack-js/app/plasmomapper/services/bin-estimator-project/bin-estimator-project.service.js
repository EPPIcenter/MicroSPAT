System.register(['angular2/core', '../../api', '../utils/LRUCache', '../utils/ServerMethods', '../project/project.service', './bin-estimator-project.model'], function(exports_1, context_1) {
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
    var core_1, api_1, LRUCache_1, ServerMethods_1, project_service_1, bin_estimator_project_model_1;
    var BinEstimatorProjectService;
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
            function (bin_estimator_project_model_1_1) {
                bin_estimator_project_model_1 = bin_estimator_project_model_1_1;
            }],
        execute: function() {
            BinEstimatorProjectService = (function (_super) {
                __extends(BinEstimatorProjectService, _super);
                function BinEstimatorProjectService(_commonServerMethods) {
                    var _this = this;
                    _super.call(this, _commonServerMethods);
                    this._commonServerMethods = _commonServerMethods;
                    this._binEstimatorProjectsUrl = api_1.API_BASE + '/bin-estimator/';
                    this._binEstimatorProjectsCache = new LRUCache_1.LRUCache(100);
                    this.getBinEstimatorProjects = function () { return _this._commonServerMethods.getList(bin_estimator_project_model_1.BinEstimatorProject, _this._binEstimatorProjectsUrl); };
                    this.getBinEstimatorProject = function (id) { return _this._commonServerMethods.getDetails(id, bin_estimator_project_model_1.BinEstimatorProject, _this._binEstimatorProjectsUrl, _this._binEstimatorProjectsCache); };
                    this.updateBinEstimatorProject = function (project) { return _this._commonServerMethods.updateItem(project, bin_estimator_project_model_1.BinEstimatorProject, _this._binEstimatorProjectsUrl, _this._binEstimatorProjectsCache); };
                    this.createBinEstimatorProject = function (project) { return _this._commonServerMethods.createItem(project, bin_estimator_project_model_1.BinEstimatorProject, _this._binEstimatorProjectsUrl, _this._binEstimatorProjectsCache); };
                    this.deleteBinEstimatorProject = function (id) { return _this._commonServerMethods.deleteItem(id, _this._binEstimatorProjectsUrl, _this._binEstimatorProjectsCache); };
                    this.clearCache = function (id) { return _this._binEstimatorProjectsCache.remove(id); };
                }
                BinEstimatorProjectService = __decorate([
                    core_1.Injectable(), 
                    __metadata('design:paramtypes', [ServerMethods_1.CommonServerMethods])
                ], BinEstimatorProjectService);
                return BinEstimatorProjectService;
            }(project_service_1.ProjectService));
            exports_1("BinEstimatorProjectService", BinEstimatorProjectService);
        }
    }
});
//# sourceMappingURL=bin-estimator-project.service.js.map