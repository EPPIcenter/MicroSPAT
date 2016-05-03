System.register(['angular2/core', 'angular2/router', './services/utils/ServerMethods', './services/project/project-server-methods', './components/genotyping-project/genotyping-project.component', './components/bin-estimator/bin-estimator.component', './components/artifact-estimator/artifact-estimator.component', './components/plate/plate.component', './components/sample/sample.component', './components/locus/locus.component', './components/locus-set/locus-set.component', './services/genotyping-project/genotyping-project.service', './services/artifact-estimator-project/artifact-estimator-project.service', './services/bin-estimator-project/bin-estimator-project.service', './services/channel/channel.service', './services/locus-set/locus-set.service', './services/plate/plate.service', './services/locus/locus.service', './services/project/project.service', './services/ladder/ladder.service', './services/sample/sample.service', './services/well/well.service'], function(exports_1, context_1) {
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
    var core_1, router_1, ServerMethods_1, project_server_methods_1, genotyping_project_component_1, bin_estimator_component_1, artifact_estimator_component_1, plate_component_1, sample_component_1, locus_component_1, locus_set_component_1, genotyping_project_service_1, artifact_estimator_project_service_1, bin_estimator_project_service_1, channel_service_1, locus_set_service_1, plate_service_1, locus_service_1, project_service_1, ladder_service_1, sample_service_1, well_service_1;
    var PlasmoMapperComponent;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (router_1_1) {
                router_1 = router_1_1;
            },
            function (ServerMethods_1_1) {
                ServerMethods_1 = ServerMethods_1_1;
            },
            function (project_server_methods_1_1) {
                project_server_methods_1 = project_server_methods_1_1;
            },
            function (genotyping_project_component_1_1) {
                genotyping_project_component_1 = genotyping_project_component_1_1;
            },
            function (bin_estimator_component_1_1) {
                bin_estimator_component_1 = bin_estimator_component_1_1;
            },
            function (artifact_estimator_component_1_1) {
                artifact_estimator_component_1 = artifact_estimator_component_1_1;
            },
            function (plate_component_1_1) {
                plate_component_1 = plate_component_1_1;
            },
            function (sample_component_1_1) {
                sample_component_1 = sample_component_1_1;
            },
            function (locus_component_1_1) {
                locus_component_1 = locus_component_1_1;
            },
            function (locus_set_component_1_1) {
                locus_set_component_1 = locus_set_component_1_1;
            },
            function (genotyping_project_service_1_1) {
                genotyping_project_service_1 = genotyping_project_service_1_1;
            },
            function (artifact_estimator_project_service_1_1) {
                artifact_estimator_project_service_1 = artifact_estimator_project_service_1_1;
            },
            function (bin_estimator_project_service_1_1) {
                bin_estimator_project_service_1 = bin_estimator_project_service_1_1;
            },
            function (channel_service_1_1) {
                channel_service_1 = channel_service_1_1;
            },
            function (locus_set_service_1_1) {
                locus_set_service_1 = locus_set_service_1_1;
            },
            function (plate_service_1_1) {
                plate_service_1 = plate_service_1_1;
            },
            function (locus_service_1_1) {
                locus_service_1 = locus_service_1_1;
            },
            function (project_service_1_1) {
                project_service_1 = project_service_1_1;
            },
            function (ladder_service_1_1) {
                ladder_service_1 = ladder_service_1_1;
            },
            function (sample_service_1_1) {
                sample_service_1 = sample_service_1_1;
            },
            function (well_service_1_1) {
                well_service_1 = well_service_1_1;
            }],
        execute: function() {
            PlasmoMapperComponent = (function () {
                function PlasmoMapperComponent(_ladderService, _locusService, _locusSetService) {
                    this._ladderService = _ladderService;
                    this._locusService = _locusService;
                    this._locusSetService = _locusSetService;
                    this.title = "PlasmoMapper";
                }
                PlasmoMapperComponent.prototype.initServices = function () {
                    var _this = this;
                    this._ladderService.getLadders().subscribe(function (ladders) {
                        ladders.forEach(function (ladder) { return _this._ladderService.getLadder(ladder.id).subscribe(); });
                    });
                    this._locusService.getLoci().subscribe(function (loci) {
                        loci.forEach(function (locus) { return _this._locusService.getLocus(locus.id).subscribe(); });
                    });
                    this._locusSetService.getLocusSets().subscribe(function (locusSets) {
                        locusSets.forEach(function (locusSet) { return _this._locusSetService.getLocusSet(locusSet.id).subscribe(); });
                    });
                };
                PlasmoMapperComponent.prototype.ngOnInit = function () {
                    console.log("Initializing PlasmoMapper");
                    this.initServices();
                };
                PlasmoMapperComponent = __decorate([
                    core_1.Component({
                        selector: 'plasmomapper',
                        templateUrl: 'app/plasmomapper/plasmomapper.component.html',
                        styleUrls: ['app/plasmomapper/plasmomapper.component.css'],
                        directives: [router_1.ROUTER_DIRECTIVES],
                        providers: [
                            ServerMethods_1.CommonServerMethods, project_server_methods_1.ProjectServerMethods, genotyping_project_service_1.GenotypingProjectService,
                            channel_service_1.ChannelService, locus_set_service_1.LocusSetService, plate_service_1.PlateService, locus_service_1.LocusService, project_service_1.ProjectService,
                            artifact_estimator_project_service_1.ArtifactEstimatorProjectService, bin_estimator_project_service_1.BinEstimatorProjectService, ladder_service_1.LadderService,
                            sample_service_1.SampleService, well_service_1.WellService
                        ]
                    }),
                    router_1.RouteConfig([
                        {
                            path: '/genotyping-projects/...',
                            name: 'GenotypingProject',
                            component: genotyping_project_component_1.GenotypingProjectComponent,
                            useAsDefault: true
                        },
                        {
                            path: '/artifact-estimators/...',
                            name: 'ArtifactEstimatingProject',
                            component: artifact_estimator_component_1.ArtifactEstimatorComponent
                        },
                        {
                            path: '/bin-estimators/...',
                            name: 'BinEstimatorProject',
                            component: bin_estimator_component_1.BinEstimatorComponent,
                        },
                        {
                            path: '/loci/...',
                            name: 'Locus',
                            component: locus_component_1.LocusComponent,
                        },
                        {
                            path: '/locus-sets/...',
                            name: 'LocusSet',
                            component: locus_set_component_1.LocusSetComponent,
                        },
                        {
                            path: '/plates/...',
                            name: 'Plate',
                            component: plate_component_1.PlateComponent
                        },
                        {
                            path: '/samples/...',
                            name: 'Sample',
                            component: sample_component_1.SampleComponent
                        }
                    ]), 
                    __metadata('design:paramtypes', [ladder_service_1.LadderService, locus_service_1.LocusService, locus_set_service_1.LocusSetService])
                ], PlasmoMapperComponent);
                return PlasmoMapperComponent;
            }());
            exports_1("PlasmoMapperComponent", PlasmoMapperComponent);
        }
    }
});
//# sourceMappingURL=plasmomapper.component.js.map