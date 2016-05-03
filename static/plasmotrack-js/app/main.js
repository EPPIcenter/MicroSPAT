System.register(['angular2/platform/browser', './plasmotrack.component', 'angular2/http'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var browser_1, plasmotrack_component_1, http_1;
    return {
        setters:[
            function (browser_1_1) {
                browser_1 = browser_1_1;
            },
            function (plasmotrack_component_1_1) {
                plasmotrack_component_1 = plasmotrack_component_1_1;
            },
            function (http_1_1) {
                http_1 = http_1_1;
            }],
        execute: function() {
            // enableProdMode();
            browser_1.bootstrap(plasmotrack_component_1.PlasmoTrackComponent, [http_1.HTTP_PROVIDERS]);
        }
    }
});
//# sourceMappingURL=main.js.map