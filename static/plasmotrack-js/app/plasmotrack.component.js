System.register(['rxjs/Rx', 'angular2/core', 'angular2/router', './plasmomapper/plasmomapper.component', './plasmomapper/components/project/samples-list.component'], function(exports_1, context_1) {
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
    var core_1, router_1, plasmomapper_component_1, samples_list_component_1;
    var PlasmoTrackComponent;
    return {
        setters:[
            function (_1) {},
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (router_1_1) {
                router_1 = router_1_1;
            },
            function (plasmomapper_component_1_1) {
                plasmomapper_component_1 = plasmomapper_component_1_1;
            },
            function (samples_list_component_1_1) {
                samples_list_component_1 = samples_list_component_1_1;
            }],
        execute: function() {
            PlasmoTrackComponent = (function () {
                function PlasmoTrackComponent() {
                    this.title = "PlasmoTrack";
                }
                PlasmoTrackComponent = __decorate([
                    core_1.Component({
                        selector: 'plasmotrack',
                        templateUrl: './app/plasmotrack.component.html',
                        styleUrls: ['./app/plasmotrack.component.css'],
                        directives: [router_1.ROUTER_DIRECTIVES, samples_list_component_1.SampleListComponent],
                        providers: [
                            router_1.ROUTER_PROVIDERS,
                        ]
                    }),
                    router_1.RouteConfig([
                        {
                            path: '/plasmomapper/...',
                            name: 'PlasmoMapper',
                            component: plasmomapper_component_1.PlasmoMapperComponent,
                            useAsDefault: true
                        },
                    ]), 
                    __metadata('design:paramtypes', [])
                ], PlasmoTrackComponent);
                return PlasmoTrackComponent;
            }());
            exports_1("PlasmoTrackComponent", PlasmoTrackComponent);
        }
    }
});
//# sourceMappingURL=plasmotrack.component.js.map