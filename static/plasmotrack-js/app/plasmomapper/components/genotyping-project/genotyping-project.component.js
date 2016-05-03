System.register(['angular2/core', 'angular2/router', './genotyping-project-list.component', './genotyping-project-details/genotyping-project-detail.component', './genotyping-project-details/samples/genotyping-project-sample-list.component', './genotyping-project-details/samples/genotyping-project-sample-detail.component', './genotyping-project-details/samples/genotyping-project-sample-channel.component', './genotyping-project-details/loci/genotyping-project-locus-list.component', './genotyping-project-details/loci/genotyping-project-locus-detail.component', './genotyping-project-details/loci/genotyping-project-locus-channel.component'], function(exports_1, context_1) {
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
    var core_1, router_1, genotyping_project_list_component_1, genotyping_project_detail_component_1, genotyping_project_sample_list_component_1, genotyping_project_sample_detail_component_1, genotyping_project_sample_channel_component_1, genotyping_project_locus_list_component_1, genotyping_project_locus_detail_component_1, genotyping_project_locus_channel_component_1;
    var GenotypingProjectComponent;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (router_1_1) {
                router_1 = router_1_1;
            },
            function (genotyping_project_list_component_1_1) {
                genotyping_project_list_component_1 = genotyping_project_list_component_1_1;
            },
            function (genotyping_project_detail_component_1_1) {
                genotyping_project_detail_component_1 = genotyping_project_detail_component_1_1;
            },
            function (genotyping_project_sample_list_component_1_1) {
                genotyping_project_sample_list_component_1 = genotyping_project_sample_list_component_1_1;
            },
            function (genotyping_project_sample_detail_component_1_1) {
                genotyping_project_sample_detail_component_1 = genotyping_project_sample_detail_component_1_1;
            },
            function (genotyping_project_sample_channel_component_1_1) {
                genotyping_project_sample_channel_component_1 = genotyping_project_sample_channel_component_1_1;
            },
            function (genotyping_project_locus_list_component_1_1) {
                genotyping_project_locus_list_component_1 = genotyping_project_locus_list_component_1_1;
            },
            function (genotyping_project_locus_detail_component_1_1) {
                genotyping_project_locus_detail_component_1 = genotyping_project_locus_detail_component_1_1;
            },
            function (genotyping_project_locus_channel_component_1_1) {
                genotyping_project_locus_channel_component_1 = genotyping_project_locus_channel_component_1_1;
            }],
        execute: function() {
            GenotypingProjectComponent = (function () {
                function GenotypingProjectComponent() {
                }
                GenotypingProjectComponent = __decorate([
                    core_1.Component({
                        selector: 'pm-genotyping-project',
                        template: '<router-outlet></router-outlet>',
                        directives: [router_1.ROUTER_DIRECTIVES],
                    }),
                    router_1.RouteConfig([
                        {
                            path: '/',
                            name: 'GenotypingProjectList',
                            component: genotyping_project_list_component_1.GenotypingProjectListComponent,
                            useAsDefault: true
                        },
                        {
                            path: '/:project_id',
                            name: 'GenotypingProjectDetail',
                            component: genotyping_project_detail_component_1.GenotypingProjectDetailComponent,
                        },
                        {
                            path: '/:project_id/samples',
                            name: 'GenotypingProjectSampleList',
                            component: genotyping_project_sample_list_component_1.GenotypingProjectSampleList
                        },
                        {
                            path: '/:project_id/samples/:sample_id',
                            name: 'GenotypingProjectSampleDetail',
                            component: genotyping_project_sample_detail_component_1.GenotypingProjectSampleDetail
                        },
                        {
                            path: '/:project_id/samples/:sample_id/channels',
                            name: 'GenotypingProjectSampleChannel',
                            component: genotyping_project_sample_channel_component_1.GenotypingProjectSampleChannel
                        },
                        {
                            path: '/:project_id/loci',
                            name: 'GenotypingProjectLocusList',
                            component: genotyping_project_locus_list_component_1.GenotypingProjectLocusList
                        },
                        {
                            path: '/:project_id/loci/:locus_id',
                            name: 'GenotypingProjectLocusDetail',
                            component: genotyping_project_locus_detail_component_1.GenotypingProjectLocusDetail
                        },
                        {
                            path: '/:project_id/loci/:locus_id/channels',
                            name: 'GenotypingProjectLocusChannel',
                            component: genotyping_project_locus_channel_component_1.GenotypingProjectLocusChannel
                        },
                    ]), 
                    __metadata('design:paramtypes', [])
                ], GenotypingProjectComponent);
                return GenotypingProjectComponent;
            }());
            exports_1("GenotypingProjectComponent", GenotypingProjectComponent);
        }
    }
});
//# sourceMappingURL=genotyping-project.component.js.map