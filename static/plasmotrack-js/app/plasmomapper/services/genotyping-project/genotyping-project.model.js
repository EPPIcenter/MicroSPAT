System.register(['../sample-based-project/sample-based-project.model', './locus-parameters/genotyping-locus-parameters.model'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var sample_based_project_model_1, genotyping_locus_parameters_model_1;
    var GenotypingProject;
    return {
        setters:[
            function (sample_based_project_model_1_1) {
                sample_based_project_model_1 = sample_based_project_model_1_1;
            },
            function (genotyping_locus_parameters_model_1_1) {
                genotyping_locus_parameters_model_1 = genotyping_locus_parameters_model_1_1;
            }],
        execute: function() {
            GenotypingProject = (function (_super) {
                __extends(GenotypingProject, _super);
                function GenotypingProject() {
                    _super.apply(this, arguments);
                }
                GenotypingProject.prototype.fillFromJSON = function (obj) {
                    _super.prototype.fillFromJSON.call(this, obj);
                    var lp = new Map();
                    for (var key in obj.locus_parameters) {
                        var new_lp = new genotyping_locus_parameters_model_1.GenotypingLocusParameters();
                        new_lp.fillFromJSON(obj.locus_parameters[key]);
                        lp.set(parseInt(key), new_lp);
                    }
                    this.locus_parameters = lp;
                };
                return GenotypingProject;
            }(sample_based_project_model_1.SampleBasedProject));
            exports_1("GenotypingProject", GenotypingProject);
        }
    }
});
//# sourceMappingURL=genotyping-project.model.js.map