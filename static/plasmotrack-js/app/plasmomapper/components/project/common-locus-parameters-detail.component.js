System.register(['angular2/core', 'angular2/common'], function(exports_1, context_1) {
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
    var core_1, common_1;
    var CommonLocusParametersDetailComponent;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (common_1_1) {
                common_1 = common_1_1;
            }],
        execute: function() {
            CommonLocusParametersDetailComponent = (function () {
                // public saveResolved = false;
                // @Output() saveClicked = new EventEmitter();
                // @Output() locusParamsSaved = new EventEmitter();
                function CommonLocusParametersDetailComponent() {
                    console.log("Creating Detail Component");
                }
                CommonLocusParametersDetailComponent.prototype.onChanged = function (e) {
                    this.locusParameter.isDirty = true;
                };
                CommonLocusParametersDetailComponent = __decorate([
                    core_1.Component({
                        selector: 'pm-common-locus-parameter-detail',
                        inputs: ['locusParameter'],
                        directives: [common_1.FORM_DIRECTIVES],
                        styleUrls: ['app/plasmomapper/styles/forms.css'],
                        template: "\n        <div class=\"col-sm-6\">\n            <h4>Scanning Parameters</h4>\n            <div class=\"form-group\">\n                <label>Scanning Method</label>\n                <select (change)=\"onChanged()\" [(ngModel)]=\"locusParameter.scanning_method\" class=\"form-control\">\n                    <option value=\"cwt\">Continuous Wavelet Transform</option>\n                    <option value=\"relmax\">Relative Maximum</option>\n                </select>\n            </div>\n            <div *ngIf=\"locusParameter.scanning_method == 'cwt'\">\n                <div class=\"form-group\">\n                    <label>CWT Min Width</label>\n                    <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"locusParameter.cwt_min_width\">\n                </div>\n                <div class=\"form-group\">\n                    <label>CWT Max Width</label>\n                    <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"locusParameter.cwt_max_width\">\n                </div>\n                <div class=\"form-group\">\n                    <label>Min Signal to Noise Ratio</label>\n                    <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"locusParameter.min_snr\">\n                </div>\n                <div class=\"form-group\">\n                    <label>Noise Percentile</label>\n                    <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"locusParameter.noise_perc\">\n                </div>\n            </div>\n            <div *ngIf=\"locusParameter.scanning_method == 'relmax'\">\n                <div class=\"form-group\">\n                    <label>Relative Maximum Window</label>\n                    <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"locusParameter.argrelmax_window\">\n                </div>\n                <div class=\"form-group\">\n                    <label>Smoothing Window</label>\n                    <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"locusParameter.trace_smoothing_window\">\n                </div>\n                <div class=\"form-group\">\n                    <label>Smoothing Order</label>\n                    <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"locusParameter.trace_smoothing_order\">\n                </div>\n                <div class=\"form-group\">\n                    <label>Tophat Factor</label>\n                    <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"locusParameter.tophat_factor\">\n                </div>\n                <div class=\"form-group\">\n                    <label>Maxima Window</label>\n                    <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"locusParameter.maxima_window\">\n                </div>\n            </div>\n        </div>\n        <div class=\"col-sm-6\">\n            <h4>Filter Parameters</h4>\n            <div class=\"form-group\">\n                <label>Min Peak Height</label>\n                <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"locusParameter.min_peak_height\">\n            </div>\n            <div class=\"form-group\">\n                <label>Max Peak Height</label>\n                <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"1\" min=\"0\" [(ngModel)]=\"locusParameter.max_peak_height\">\n            </div>\n            <div class=\"form-group\">\n                <label>Min Peak Height Ratio</label>\n                <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"locusParameter.min_peak_height_ratio\">\n            </div>\n            <div class=\"form-group\">\n                <label>Max Bleedthrough Ratio</label>\n                <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"locusParameter.max_bleedthrough\">\n            </div>\n            <div class=\"form-group\">\n                <label>Max Crosstalk Ratio</label>\n                <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"locusParameter.max_crosstalk\">\n            </div>\n            <div class=\"form-group\">\n                <label>Min Peak Distance</label>\n                <input class=\"form-control input-sm\" (change)=\"onChanged()\" type=\"number\" required step=\"any\" min=\"0\" [(ngModel)]=\"locusParameter.min_peak_distance\">\n            </div>\n        </div> \n    "
                    }), 
                    __metadata('design:paramtypes', [])
                ], CommonLocusParametersDetailComponent);
                return CommonLocusParametersDetailComponent;
            }());
            exports_1("CommonLocusParametersDetailComponent", CommonLocusParametersDetailComponent);
        }
    }
});
//# sourceMappingURL=common-locus-parameters-detail.component.js.map