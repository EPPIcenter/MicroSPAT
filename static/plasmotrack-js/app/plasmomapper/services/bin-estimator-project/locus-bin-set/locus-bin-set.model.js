System.register(['../../DatabaseItem', './bin/bin.model'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var DatabaseItem_1, bin_model_1;
    var LocusBinSet;
    return {
        setters:[
            function (DatabaseItem_1_1) {
                DatabaseItem_1 = DatabaseItem_1_1;
            },
            function (bin_model_1_1) {
                bin_model_1 = bin_model_1_1;
            }],
        execute: function() {
            LocusBinSet = (function (_super) {
                __extends(LocusBinSet, _super);
                function LocusBinSet() {
                    _super.apply(this, arguments);
                }
                LocusBinSet.prototype.fillFromJSON = function (obj) {
                    this.isDirty = false;
                    for (var p in obj) {
                        this[p] = obj[p];
                    }
                    var b = new Map();
                    for (var key in obj.bins) {
                        var new_b = new bin_model_1.Bin();
                        new_b.fillFromJSON(obj.bins[key]);
                        b.set(parseInt(key), new_b);
                    }
                    this.bins = b;
                };
                return LocusBinSet;
            }(DatabaseItem_1.DatabaseItem));
            exports_1("LocusBinSet", LocusBinSet);
        }
    }
});
//# sourceMappingURL=locus-bin-set.model.js.map