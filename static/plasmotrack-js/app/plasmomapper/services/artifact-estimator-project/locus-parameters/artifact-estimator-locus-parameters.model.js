System.register(['../../project/locus-parameters/locus-parameters.model'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var locus_parameters_model_1;
    var ArtifactEstimatorLocusParameters;
    return {
        setters:[
            function (locus_parameters_model_1_1) {
                locus_parameters_model_1 = locus_parameters_model_1_1;
            }],
        execute: function() {
            ArtifactEstimatorLocusParameters = (function (_super) {
                __extends(ArtifactEstimatorLocusParameters, _super);
                function ArtifactEstimatorLocusParameters() {
                    _super.apply(this, arguments);
                }
                return ArtifactEstimatorLocusParameters;
            }(locus_parameters_model_1.LocusParameters));
            exports_1("ArtifactEstimatorLocusParameters", ArtifactEstimatorLocusParameters);
        }
    }
});
//# sourceMappingURL=artifact-estimator-locus-parameters.model.js.map