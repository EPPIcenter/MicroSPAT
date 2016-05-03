System.register(['../project/project.model', './sample-annotation/sample-annotation.model'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var project_model_1, sample_annotation_model_1;
    var SampleBasedProject;
    return {
        setters:[
            function (project_model_1_1) {
                project_model_1 = project_model_1_1;
            },
            function (sample_annotation_model_1_1) {
                sample_annotation_model_1 = sample_annotation_model_1_1;
            }],
        execute: function() {
            SampleBasedProject = (function (_super) {
                __extends(SampleBasedProject, _super);
                function SampleBasedProject() {
                    _super.apply(this, arguments);
                }
                SampleBasedProject.prototype.fillFromJSON = function (obj) {
                    _super.prototype.fillFromJSON.call(this, obj);
                    if (obj.sample_annotations != null) {
                        var sa = new Map();
                        for (var key in obj.sample_annotations) {
                            var new_sa = new sample_annotation_model_1.SampleAnnotation();
                            new_sa.fillFromJSON(obj.sample_annotations[key]);
                            sa.set(parseInt(key), new_sa);
                        }
                        this.sample_annotations = sa;
                    }
                    // let c = <Object[]> obj.sample_annotations;
                    // this.sample_annotations = c.map((obj) => {
                    //     let new_obj = new SampleAnnotation();
                    //     new_obj.fillFromJSON(obj);
                    //     return new_obj;
                    // })
                };
                return SampleBasedProject;
            }(project_model_1.Project));
            exports_1("SampleBasedProject", SampleBasedProject);
        }
    }
});
//# sourceMappingURL=sample-based-project.model.js.map