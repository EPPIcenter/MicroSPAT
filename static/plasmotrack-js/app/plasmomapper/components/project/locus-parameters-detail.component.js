System.register(['angular2/core', 'angular2/common', '../../pipes/locus.pipe', '../../services/project/project.service'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
        var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
        else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
    };
    var __metadata = (this && this.__metadata) || function (k, v) {
        if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
    };
    var core_1, common_1, locus_pipe_1, project_service_1;
    var LocusParametersDetailComponent;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (common_1_1) {
                common_1 = common_1_1;
            },
            function (locus_pipe_1_1) {
                locus_pipe_1 = locus_pipe_1_1;
            },
            function (project_service_1_1) {
                project_service_1 = project_service_1_1;
            }],
        execute: function() {
            LocusParametersDetailComponent = (function () {
                // @Output() locusParamsSaved = new EventEmitter();
                function LocusParametersDetailComponent(_projectService) {
                    this._projectService = _projectService;
                    this.saveResolved = false;
                    this.saveClicked = new core_1.EventEmitter();
                    console.log("Creating Detail Component");
                }
                LocusParametersDetailComponent.prototype.onChanged = function (e) {
                    this.locusParameter.isDirty = true;
                };
                LocusParametersDetailComponent.prototype.onSubmit = function (id) {
                    this.saveClicked.emit(id);
                };
                LocusParametersDetailComponent.prototype.ngOnChanges = function (changes) {
                };
                __decorate([
                    core_1.Output(), 
                    __metadata('design:type', Object)
                ], LocusParametersDetailComponent.prototype, "saveClicked", void 0);
                LocusParametersDetailComponent = __decorate([
                    core_1.Component({
                        selector: 'pm-locus-parameter-detail',
                        pipes: [locus_pipe_1.LocusPipe],
                        inputs: ['locusParameter', 'saveResolved'],
                        directives: [common_1.FORM_DIRECTIVES],
                        styleUrls: ['app/plasmomapper/styles/forms.css'],
                        template: "\n    <div class=\"panel panel-default\">\n        <div class=\"panel-heading\">\n            <h3 class=\"panel-title\">{{locusParameter.locus_id | locus | async}} Parameters</h3>\n        </div>\n        <div class=\"panel-body\">\n            <form (ngSubmit)=\"onSubmit(locusParameter.locus_id)\">\n                <div class=\"col-sm-6\">\n                    <h4>Scanning Parameters</h4>\n                    <div class=\"form-group\">\n                        <label>Scanning Method</label>\n                        <select (change)=\"onChanged()\" [(ngModel)]=\"locusParameter.scanning_method\" class=\"form-control\">\n                            <option value=\"cwt\">Continuous Wavelet Transform</option>\n                            <option value=\"relmax\">Relative Maximum</option>\n                        </select>\n                    </div>\n                    <div *ngIf=\"locusParameter.scanning_method == 'cwt'\">\n                        <div class=\"form-group\">\n                            <label>CWT Min Width</label>\n                            <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"locusParameter.cwt_min_width\" ngControl=\"cwt_min_width\">\n                        </div>\n                        <div class=\"form-group\">\n                            <label>CWT Max Width</label>\n                            <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"locusParameter.cwt_max_width\" ngControl=\"cwt_max_width\">\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Min Signal to Noise Ratio</label>\n                            <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"locusParameter.min_snr\" ngControl=\"min_snr\">\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Noise Percentile</label>\n                            <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"locusParameter.noise_perc\" ngControl=\"noise_perc\">\n                        </div>\n                    </div>\n                    <div *ngIf=\"locusParameter.scanning_method == 'relmax'\">\n                        <div class=\"form-group\">\n                            <label>Relative Maximum Window</label>\n                            <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"locusParameter.argrelmax_window\" ngControl=\"argrelmax_window\">\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Smoothing Window</label>\n                            <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"locusParameter.trace_smoothing_window\" ngControl=\"trace_smoothing_window\">\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Smoothing Order</label>\n                            <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"locusParameter.trace_smoothing_order\" ngControl=\"trace_smoothing_order\">\n                        </div>\n                        <div class=\"form-group\">\n                            <label>Tophat Factor</label>\n                            <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"locusParameter.tophat_factor\" ngControl=\"tophat_factor\">\n                        </div>\n                    </div>\n                </div>\n                <div class=\"col-sm-6\">\n                    <h4>Filter Parameters</h4>\n                    <div class=\"form-group\">\n                        <label>Maxima Window</label>\n                        <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"locusParameter.maxima_window\">\n                    </div>\n                    <div class=\"form-group\">\n                        <label>Min Peak Height</label>\n                        <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"locusParameter.min_peak_height\">\n                    </div>\n                    <div class=\"form-group\">\n                        <label>Max Peak Height</label>\n                        <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"locusParameter.max_peak_height\">\n                    </div>\n                    <div class=\"form-group\">\n                        <label>Min Peak Height Ratio</label>\n                        <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"locusParameter.min_peak_height_ratio\">\n                    </div>\n                    <div class=\"form-group\">\n                        <label>Max Bleedthrough Ratio</label>\n                        <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"locusParameter.max_bleedthrough\">\n                    </div>\n                    <div class=\"form-group\">\n                        <label>Max Crosstalk Ratio</label>\n                        <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"locusParameter.max_crosstalk\">\n                    </div>\n                    <div class=\"form-group\">\n                        <label>Min Peak Distance</label>\n                        <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"locusParameter.min_peak_distance\">\n                    </div>\n                    <div class=\"form-group\">\n                        <label>Offscale Threshold</label>\n                        <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"locusParameter.offscale_threshold\">\n                    </div>\n                    <button type=\"submit\" class=\"btn btn-default\" [ngClass]=\"{disabled: !saveResolved}\">Save and Analyze</button>\n                    <span *ngIf=\"!saveResolved\" class=\"label label-info\">Saving and Analyzing Locus...This May Take A While...</span>\n                </div>\n            </form>\n        </div>\n    </div>   \n    "
                    }), 
                    __metadata('design:paramtypes', [project_service_1.ProjectService])
                ], LocusParametersDetailComponent);
                return LocusParametersDetailComponent;
            }());
            exports_1("LocusParametersDetailComponent", LocusParametersDetailComponent);
        }
    }
});
//# sourceMappingURL=locus-parameters-detail.component.js.map