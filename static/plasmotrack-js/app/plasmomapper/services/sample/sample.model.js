System.register(['../DatabaseItem'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var DatabaseItem_1;
    var Sample;
    return {
        setters:[
            function (DatabaseItem_1_1) {
                DatabaseItem_1 = DatabaseItem_1_1;
            }],
        execute: function() {
            Sample = (function (_super) {
                __extends(Sample, _super);
                function Sample() {
                    _super.apply(this, arguments);
                }
                Sample.prototype.fillFromJSON = function (obj) {
                    this.isDirty = false;
                    for (var p in obj) {
                        this[p] = obj[p];
                    }
                    if (obj.last_updated != null) {
                        this.last_updated = new Date(obj.last_updated);
                    }
                };
                return Sample;
            }(DatabaseItem_1.DatabaseItem));
            exports_1("Sample", Sample);
        }
    }
});
//# sourceMappingURL=sample.model.js.map