System.register(['../../DatabaseItem', '../../sample/sample.model', './locus-annotation/sample-locus-annotation.model'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var DatabaseItem_1, sample_model_1, sample_locus_annotation_model_1;
    var SampleAnnotation;
    return {
        setters:[
            function (DatabaseItem_1_1) {
                DatabaseItem_1 = DatabaseItem_1_1;
            },
            function (sample_model_1_1) {
                sample_model_1 = sample_model_1_1;
            },
            function (sample_locus_annotation_model_1_1) {
                sample_locus_annotation_model_1 = sample_locus_annotation_model_1_1;
            }],
        execute: function() {
            SampleAnnotation = (function (_super) {
                __extends(SampleAnnotation, _super);
                function SampleAnnotation() {
                    _super.apply(this, arguments);
                }
                SampleAnnotation.prototype.fillFromJSON = function (obj) {
                    this.isDirty = false;
                    for (var p in obj) {
                        this[p] = obj[p];
                    }
                    if (obj.last_updated != null) {
                        this.last_updated = new Date(obj.last_updated);
                    }
                    var la = new Map();
                    for (var key in obj.locus_annotations) {
                        var new_la = new sample_locus_annotation_model_1.SampleLocusAnnotation();
                        new_la.fillFromJSON(obj.locus_annotations[key]);
                        la.set(parseInt(key), new_la);
                    }
                    this.locus_annotations = la;
                    if (obj.sample != null) {
                        this.sample = new sample_model_1.Sample();
                        this.sample.fillFromJSON(obj.sample);
                    }
                };
                return SampleAnnotation;
            }(DatabaseItem_1.DatabaseItem));
            exports_1("SampleAnnotation", SampleAnnotation);
        }
    }
});
//# sourceMappingURL=sample-annotation.model.js.map