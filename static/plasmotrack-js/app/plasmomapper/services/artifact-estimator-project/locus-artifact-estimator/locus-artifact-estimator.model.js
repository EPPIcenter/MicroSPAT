System.register(['../../DatabaseItem', './artifact-estimator/artifact-estimator.model'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var DatabaseItem_1, artifact_estimator_model_1;
    var LocusArtifactEstimator;
    return {
        setters:[
            function (DatabaseItem_1_1) {
                DatabaseItem_1 = DatabaseItem_1_1;
            },
            function (artifact_estimator_model_1_1) {
                artifact_estimator_model_1 = artifact_estimator_model_1_1;
            }],
        execute: function() {
            LocusArtifactEstimator = (function (_super) {
                __extends(LocusArtifactEstimator, _super);
                function LocusArtifactEstimator() {
                    _super.apply(this, arguments);
                }
                LocusArtifactEstimator.prototype.fillFromJSON = function (obj) {
                    this.isDirty = false;
                    for (var p in obj) {
                        this[p] = obj[p];
                    }
                    var a = obj.artifact_estimators;
                    this.artifact_estimators = a.map(function (obj) {
                        var new_obj = new artifact_estimator_model_1.ArtifactEstimator();
                        new_obj.fillFromJSON(obj);
                        return new_obj;
                    });
                };
                return LocusArtifactEstimator;
            }(DatabaseItem_1.DatabaseItem));
            exports_1("LocusArtifactEstimator", LocusArtifactEstimator);
        }
    }
});
//# sourceMappingURL=locus-artifact-estimator.model.js.map