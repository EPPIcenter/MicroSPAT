System.register([], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var DatabaseItem;
    return {
        setters:[],
        execute: function() {
            DatabaseItem = (function () {
                function DatabaseItem() {
                }
                DatabaseItem.prototype.copyFromObj = function (obj) {
                    for (var p in obj) {
                        this[p] = obj[p];
                    }
                };
                return DatabaseItem;
            }());
            exports_1("DatabaseItem", DatabaseItem);
        }
    }
});
//# sourceMappingURL=DatabaseItem.js.map