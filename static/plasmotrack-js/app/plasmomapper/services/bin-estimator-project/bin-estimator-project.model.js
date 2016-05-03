System.register(['../project/project.model', './locus-bin-set/locus-bin-set.model', './locus-parameters/bin-estimator-locus-parameters.model'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var project_model_1, locus_bin_set_model_1, bin_estimator_locus_parameters_model_1;
    var BinEstimatorProject;
    return {
        setters:[
            function (project_model_1_1) {
                project_model_1 = project_model_1_1;
            },
            function (locus_bin_set_model_1_1) {
                locus_bin_set_model_1 = locus_bin_set_model_1_1;
            },
            function (bin_estimator_locus_parameters_model_1_1) {
                bin_estimator_locus_parameters_model_1 = bin_estimator_locus_parameters_model_1_1;
            }],
        execute: function() {
            BinEstimatorProject = (function (_super) {
                __extends(BinEstimatorProject, _super);
                function BinEstimatorProject() {
                    _super.apply(this, arguments);
                }
                BinEstimatorProject.prototype.fillFromJSON = function (obj) {
                    _super.prototype.fillFromJSON.call(this, obj);
                    var lp = new Map();
                    for (var key in obj.locus_parameters) {
                        var new_lp = new bin_estimator_locus_parameters_model_1.BinEstimatorLocusParameters();
                        new_lp.fillFromJSON(obj.locus_parameters[key]);
                        lp.set(parseInt(key), new_lp);
                    }
                    this.locus_parameters = lp;
                    var lb = new Map();
                    for (var key in obj.locus_bin_sets) {
                        var new_lb = new locus_bin_set_model_1.LocusBinSet();
                        new_lb.fillFromJSON(obj.locus_bin_sets[key]);
                        lb.set(parseInt(key), new_lb);
                    }
                    this.locus_bin_sets = lb;
                };
                return BinEstimatorProject;
            }(project_model_1.Project));
            exports_1("BinEstimatorProject", BinEstimatorProject);
        }
    }
});
//# sourceMappingURL=bin-estimator-project.model.js.map