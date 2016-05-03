System.register(['../project/project.model', './locus-artifact-estimator/locus-artifact-estimator.model', './locus-parameters/artifact-estimator-locus-parameters.model'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var project_model_1, locus_artifact_estimator_model_1, artifact_estimator_locus_parameters_model_1;
    var ArtifactEstimatorProject;
    return {
        setters:[
            function (project_model_1_1) {
                project_model_1 = project_model_1_1;
            },
            function (locus_artifact_estimator_model_1_1) {
                locus_artifact_estimator_model_1 = locus_artifact_estimator_model_1_1;
            },
            function (artifact_estimator_locus_parameters_model_1_1) {
                artifact_estimator_locus_parameters_model_1 = artifact_estimator_locus_parameters_model_1_1;
            }],
        execute: function() {
            ArtifactEstimatorProject = (function (_super) {
                __extends(ArtifactEstimatorProject, _super);
                function ArtifactEstimatorProject() {
                    _super.apply(this, arguments);
                }
                ArtifactEstimatorProject.prototype.fillFromJSON = function (obj) {
                    _super.prototype.fillFromJSON.call(this, obj);
                    var lp = new Map();
                    for (var key in obj.locus_parameters) {
                        var new_lp = new artifact_estimator_locus_parameters_model_1.ArtifactEstimatorLocusParameters();
                        new_lp.fillFromJSON(obj.locus_parameters[key]);
                        lp.set(parseInt(key), new_lp);
                    }
                    this.locus_parameters = lp;
                    var la = new Map();
                    for (var key in obj.locus_artifact_estimators) {
                        var new_la = new locus_artifact_estimator_model_1.LocusArtifactEstimator();
                        new_la.fillFromJSON(obj.locus_artifact_estimators[key]);
                        la.set(parseInt(key), new_la);
                    }
                    this.locus_artifact_estimators = la;
                };
                return ArtifactEstimatorProject;
            }(project_model_1.Project));
            exports_1("ArtifactEstimatorProject", ArtifactEstimatorProject);
        }
    }
});
//# sourceMappingURL=artifact-estimator-project.model.js.map