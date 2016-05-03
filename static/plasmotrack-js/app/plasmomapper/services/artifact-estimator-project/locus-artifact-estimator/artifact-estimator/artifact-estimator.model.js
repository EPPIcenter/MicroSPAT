System.register(['../../../DatabaseItem', './artifact-equation/artifact-equation.model'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var DatabaseItem_1, artifact_equation_model_1;
    var ArtifactEstimator;
    return {
        setters:[
            function (DatabaseItem_1_1) {
                DatabaseItem_1 = DatabaseItem_1_1;
            },
            function (artifact_equation_model_1_1) {
                artifact_equation_model_1 = artifact_equation_model_1_1;
            }],
        execute: function() {
            ArtifactEstimator = (function (_super) {
                __extends(ArtifactEstimator, _super);
                function ArtifactEstimator() {
                    _super.apply(this, arguments);
                }
                ArtifactEstimator.prototype.fillFromJSON = function (obj) {
                    this.isDirty = false;
                    for (var p in obj) {
                        this[p] = obj[p];
                    }
                    var a = obj.artifact_equations;
                    this.artifact_equations = a.map(function (obj) {
                        var new_obj = new artifact_equation_model_1.ArtifactEquation();
                        new_obj.fillFromJSON(obj);
                        return new_obj;
                    });
                };
                return ArtifactEstimator;
            }(DatabaseItem_1.DatabaseItem));
            exports_1("ArtifactEstimator", ArtifactEstimator);
        }
    }
});
//# sourceMappingURL=artifact-estimator.model.js.map