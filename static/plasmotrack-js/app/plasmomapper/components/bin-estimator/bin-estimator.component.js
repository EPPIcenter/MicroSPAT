System.register(['angular2/core', 'angular2/router', './bin-estimator-list.component', './bin-estimator-detail.component', './loci/bin-estimator-locus-list.component'], function(exports_1, context_1) {
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
    var core_1, router_1, bin_estimator_list_component_1, bin_estimator_detail_component_1, bin_estimator_locus_list_component_1;
    var BinEstimatorComponent;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (router_1_1) {
                router_1 = router_1_1;
            },
            function (bin_estimator_list_component_1_1) {
                bin_estimator_list_component_1 = bin_estimator_list_component_1_1;
            },
            function (bin_estimator_detail_component_1_1) {
                bin_estimator_detail_component_1 = bin_estimator_detail_component_1_1;
            },
            function (bin_estimator_locus_list_component_1_1) {
                bin_estimator_locus_list_component_1 = bin_estimator_locus_list_component_1_1;
            }],
        execute: function() {
            BinEstimatorComponent = (function () {
                function BinEstimatorComponent() {
                }
                BinEstimatorComponent = __decorate([
                    core_1.Component({
                        selector: 'pm-bin-estimator',
                        template: '<router-outlet></router-outlet>',
                        directives: [router_1.ROUTER_DIRECTIVES]
                    }),
                    router_1.RouteConfig([
                        {
                            path: '/',
                            name: 'BinEstimatorList',
                            component: bin_estimator_list_component_1.BinEstimatorListComponent,
                            useAsDefault: true
                        },
                        {
                            path: '/:project_id',
                            name: 'BinEstimatorDetail',
                            component: bin_estimator_detail_component_1.BinEstimatorDetailComponent
                        },
                        {
                            path: '/:project_id/loci',
                            name: 'BinEstimatorLocusList',
                            component: bin_estimator_locus_list_component_1.BinEstimatorLocusListComponent
                        }
                    ]), 
                    __metadata('design:paramtypes', [])
                ], BinEstimatorComponent);
                return BinEstimatorComponent;
            }());
            exports_1("BinEstimatorComponent", BinEstimatorComponent);
        }
    }
});
//# sourceMappingURL=bin-estimator.component.js.map