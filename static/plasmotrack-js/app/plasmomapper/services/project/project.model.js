System.register(['../DatabaseItem', './locus-parameters/locus-parameters.model'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var DatabaseItem_1, locus_parameters_model_1;
    var Project;
    return {
        setters:[
            function (DatabaseItem_1_1) {
                DatabaseItem_1 = DatabaseItem_1_1;
            },
            function (locus_parameters_model_1_1) {
                locus_parameters_model_1 = locus_parameters_model_1_1;
            }],
        execute: function() {
            Project = (function (_super) {
                __extends(Project, _super);
                function Project() {
                    _super.apply(this, arguments);
                }
                Project.prototype.fillFromJSON = function (obj) {
                    this.isDirty = false;
                    for (var p in obj) {
                        this[p] = obj[p];
                    }
                    if (obj.date != null) {
                        this.date = new Date(obj.date);
                    }
                    if (obj.last_updated != null) {
                        this.last_updated = new Date(obj.last_updated);
                    }
                    // let c = <Object[]> obj.channel_annotations;
                    // this.channel_annotations = c.map((obj) => {
                    //     let new_obj = new ChannelAnnotation();
                    //     new_obj.fillFromJSON(obj);
                    //     return new_obj;
                    // });
                    var lp = new Map();
                    for (var key in obj.locus_parameters) {
                        var new_lp = new locus_parameters_model_1.LocusParameters();
                        new_lp.fillFromJSON(obj.locus_parameters[key]);
                        lp.set(parseInt(key), new_lp);
                    }
                    this.locus_parameters = lp;
                };
                return Project;
            }(DatabaseItem_1.DatabaseItem));
            exports_1("Project", Project);
        }
    }
});
//# sourceMappingURL=project.model.js.map