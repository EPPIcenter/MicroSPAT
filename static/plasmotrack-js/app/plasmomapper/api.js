System.register([], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var SERVER_BASE, API_BASE;
    return {
        setters:[],
        execute: function() {
            exports_1("SERVER_BASE", SERVER_BASE = 'http://localhost:5000');
            exports_1("API_BASE", API_BASE = SERVER_BASE + '/plasmomapper/api/v1');
        }
    }
});
//# sourceMappingURL=api.js.map