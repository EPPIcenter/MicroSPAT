System.register(['angular2/core', 'angular2/http', '../utils/ServerMethods'], function(exports_1, context_1) {
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
    var core_1, http_1, ServerMethods_1;
    var ProjectServerMethods;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (http_1_1) {
                http_1 = http_1_1;
            },
            function (ServerMethods_1_1) {
                ServerMethods_1 = ServerMethods_1_1;
            }],
        execute: function() {
            ProjectServerMethods = (function (_super) {
                __extends(ProjectServerMethods, _super);
                function ProjectServerMethods(http) {
                    _super.call(this, http);
                    this.http = http;
                }
                ;
                ProjectServerMethods = __decorate([
                    core_1.Injectable(), 
                    __metadata('design:paramtypes', [http_1.Http])
                ], ProjectServerMethods);
                return ProjectServerMethods;
            }(ServerMethods_1.CommonServerMethods));
            exports_1("ProjectServerMethods", ProjectServerMethods);
        }
    }
});
//# sourceMappingURL=project-server-methods.js.map