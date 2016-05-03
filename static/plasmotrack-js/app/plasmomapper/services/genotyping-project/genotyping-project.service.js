System.register(['angular2/core', '../../api', '../utils/LRUCache', '../utils/ServerMethods', '../sample-based-project/sample-based-project.service', './genotyping-project.model'], function(exports_1, context_1) {
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
    var core_1, api_1, LRUCache_1, ServerMethods_1, sample_based_project_service_1, genotyping_project_model_1;
    var GenotypingProjectService;
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
            function (sample_based_project_service_1_1) {
                sample_based_project_service_1 = sample_based_project_service_1_1;
            },
            function (genotyping_project_model_1_1) {
                genotyping_project_model_1 = genotyping_project_model_1_1;
            }],
        execute: function() {
            GenotypingProjectService = (function (_super) {
                __extends(GenotypingProjectService, _super);
                function GenotypingProjectService(_commonServerMethods) {
                    var _this = this;
                    _super.call(this, _commonServerMethods);
                    this._commonServerMethods = _commonServerMethods;
                    this._projectsUrl = api_1.API_BASE + '/genotyping-project/';
                    this._annotationsUrl = api_1.API_BASE + '/locus-annotations/';
                    this._projectCache = new LRUCache_1.LRUCache(100);
                    this._socket = io(api_1.SERVER_BASE + "/project");
                    this._socket.on('list_all', function (event) {
                        console.log("Listing Projects Received");
                        console.log(event);
                    });
                    this.getProjects = function () {
                        console.log("Listing Projects");
                        _this._socket.emit('list');
                        return _this._commonServerMethods.getList(genotyping_project_model_1.GenotypingProject, _this._projectsUrl);
                    };
                    this.getProject = function (id) {
                        return _this._commonServerMethods.getDetails(id, genotyping_project_model_1.GenotypingProject, _this._projectsUrl, _this._projectCache);
                    };
                    this.updateProject = function (project) {
                        return _this._commonServerMethods.updateItem(project, genotyping_project_model_1.GenotypingProject, _this._projectsUrl, _this._projectCache);
                    };
                    this.createProject = function (project) {
                        if (project.id == null) {
                            return _this._commonServerMethods.createItem(project, genotyping_project_model_1.GenotypingProject, _this._projectsUrl, _this._projectCache);
                        }
                    };
                    this.deleteProject = function (id) {
                        return _this._commonServerMethods.deleteItem(id, _this._projectsUrl, _this._projectCache);
                    };
                    this.clearCache = function (id) { return _this._projectCache.remove(id); };
                    this.saveAnnotations = function (annotations) {
                        return _this._commonServerMethods.postJSON(annotations, _this._annotationsUrl);
                    };
                }
                GenotypingProjectService = __decorate([
                    core_1.Injectable(), 
                    __metadata('design:paramtypes', [ServerMethods_1.CommonServerMethods])
                ], GenotypingProjectService);
                return GenotypingProjectService;
            }(sample_based_project_service_1.SampleBasedProjectService));
            exports_1("GenotypingProjectService", GenotypingProjectService);
        }
    }
});
//# sourceMappingURL=genotyping-project.service.js.map