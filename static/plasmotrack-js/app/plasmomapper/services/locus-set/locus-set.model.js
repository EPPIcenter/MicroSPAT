System.register(['../DatabaseItem', '../locus/locus.model'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var DatabaseItem_1, locus_model_1;
    var LocusSet;
    return {
        setters:[
            function (DatabaseItem_1_1) {
                DatabaseItem_1 = DatabaseItem_1_1;
            },
            function (locus_model_1_1) {
                locus_model_1 = locus_model_1_1;
            }],
        execute: function() {
            LocusSet = (function (_super) {
                __extends(LocusSet, _super);
                function LocusSet() {
                    _super.apply(this, arguments);
                }
                LocusSet.prototype.fillFromJSON = function (obj) {
                    this.isDirty = false;
                    for (var p in obj) {
                        this[p] = obj[p];
                    }
                    var l = new Map();
                    for (var key in obj.loci) {
                        var new_l = new locus_model_1.Locus();
                        new_l.fillFromJSON(obj.loci[key]);
                        l.set(parseInt(key), new_l);
                    }
                    this.loci = l;
                };
                return LocusSet;
            }(DatabaseItem_1.DatabaseItem));
            exports_1("LocusSet", LocusSet);
        }
    }
});
//# sourceMappingURL=locus-set.model.js.map