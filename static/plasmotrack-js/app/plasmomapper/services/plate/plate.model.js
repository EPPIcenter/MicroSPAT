System.register(['../DatabaseItem', '../well/well.model'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var DatabaseItem_1, well_model_1;
    var Plate;
    return {
        setters:[
            function (DatabaseItem_1_1) {
                DatabaseItem_1 = DatabaseItem_1_1;
            },
            function (well_model_1_1) {
                well_model_1 = well_model_1_1;
            }],
        execute: function() {
            Plate = (function (_super) {
                __extends(Plate, _super);
                function Plate() {
                    _super.apply(this, arguments);
                }
                Plate.prototype.fillFromJSON = function (obj) {
                    this.isDirty = false;
                    for (var p in obj) {
                        this[p] = obj[p];
                    }
                    if (obj.date_processed != null) {
                        this.date_processed = new Date(obj.date_processed);
                    }
                    if (obj.date_run != null) {
                        this.date_run = new Date(obj.date_run);
                    }
                    if (obj.last_updated != null) {
                        this.last_updated = new Date(obj.last_updated);
                    }
                    var w = new Map();
                    for (var key in obj.wells) {
                        var new_w = new well_model_1.Well();
                        new_w.fillFromJSON(obj.wells[key]);
                        w.set(key, new_w);
                    }
                    this.wells = w;
                };
                return Plate;
            }(DatabaseItem_1.DatabaseItem));
            exports_1("Plate", Plate);
        }
    }
});
//# sourceMappingURL=plate.model.js.map