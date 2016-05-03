System.register(['angular2/core', 'angular2/router', '../layout/section-header.component', '../../services/sample/sample.service'], function(exports_1, context_1) {
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
    var core_1, router_1, section_header_component_1, sample_service_1;
    var SampleListComponent;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (router_1_1) {
                router_1 = router_1_1;
            },
            function (section_header_component_1_1) {
                section_header_component_1 = section_header_component_1_1;
            },
            function (sample_service_1_1) {
                sample_service_1 = sample_service_1_1;
            }],
        execute: function() {
            SampleListComponent = (function () {
                function SampleListComponent(_sampleService, _router) {
                    this._sampleService = _sampleService;
                    this._router = _router;
                    this.samples = [];
                    this.errorMessages = [];
                    this.filesToUpload = [];
                    this.uploading = false;
                    this.uploadComplete = false;
                    this.sortingParam = 'barcode';
                    this.reversed = false;
                }
                SampleListComponent.prototype.sortSamples = function () {
                    var _this = this;
                    this.samples.sort(function (a, b) {
                        if (a[_this.sortingParam] < b[_this.sortingParam]) {
                            return 1;
                        }
                        else if (a[_this.sortingParam] > b[_this.sortingParam]) {
                            return -1;
                        }
                        else {
                            return 0;
                        }
                    });
                    if (this.reversed) {
                        this.samples.reverse();
                    }
                };
                SampleListComponent.prototype.getSamples = function () {
                    var _this = this;
                    this._sampleService.getSamples()
                        .subscribe(function (samples) {
                        _this.samples = samples;
                        _this.sortSamples();
                    }, function (err) { return _this.errorMessages.push(err); });
                };
                SampleListComponent.prototype.selectSample = function (id) {
                    var _this = this;
                    this._sampleService.getSample(id)
                        .subscribe(function (sample) { return _this.selectedSample = sample; }, function (err) { return _this.errorMessages.push(err); });
                };
                SampleListComponent.prototype.fileChangeEvent = function (fileInput) {
                    this.filesToUpload = fileInput.target.files;
                };
                SampleListComponent.prototype.upload = function () {
                    var _this = this;
                    this.newSampleError = null;
                    this.uploading = true;
                    this.uploadComplete = false;
                    this._sampleService.postSamples(this.filesToUpload)
                        .subscribe(function (samples) {
                        _this.selectedSample = samples[0];
                    }, function (err) {
                        _this.newSampleError = err;
                        _this.uploading = false;
                    }, function () {
                        _this.getSamples();
                        _this.uploading = false;
                        _this.uploadComplete = true;
                    });
                };
                SampleListComponent.prototype.ngOnInit = function () {
                    this.getSamples();
                };
                SampleListComponent = __decorate([
                    core_1.Component({
                        selector: 'pm-sample-list',
                        template: "\n    <pm-section-header [header]=\"'Samples'\"></pm-section-header>\n    <div class=\"row main-container\">\n        <div class=\"table-repsonsive list-panel col-sm-6\">\n            <table class=\"table table-striped table-hover table-sm\">\n                <thead>\n                    <tr>\n                        <th (click)=\"sortingParam='barcode'; reversed=!reversed; sortSamples()\">Barcode</th>\n                        <th (click)=\"sortingParam='designation'; reversed=!reversed; sortSamples()\">Designation</th>\n                        <th (click)=\"sortingParam='last_updated'; reversed=!reversed; sortSamples()\">Last Updated</th>\n                    </tr>\n                </thead>\n                <tbody>\n                    <tr *ngFor=\"#sample of samples\" (click)=\"selectSample(sample.id)\">\n                        <td>{{sample.barcode}}</td>\n                        <td>{{sample.designation}}</td>\n                        <td>{{sample.last_updated | date: \"shortDate\"}}</td>\n                    </tr>\n                </tbody>\n            </table>\n        </div>\n        <div class=\"col-sm-6\">\n            <div class=\"row\">\n                <div class=\"panel panel-default\">\n                    <div class=\"panel-heading\">\n                        <h3 class=\"panel-title\">New Samples</h3>\n                    </div>\n                    <div class=\"panel-body\">\n                        <form>\n                            <div class=\"form-group\">\n                                <input type=\"file\" (change)=\"fileChangeEvent($event)\" placeholder=\"Upload file...\" multiple/>\n                            </div>\n                            <button class=\"btn btn-primary\" type=\"button\" (click)=\"upload()\">Upload</button>\n                        </form>\n                        <span *ngIf=\"uploading\" class=\"label label-info\">Uploading File...</span>\n                        <span *ngIf=\"uploadComplete\" class=\"label label-success\">Upload Successful</span>\n                        <span class=\"label label-danger\">{{newSampleError}}</span>\n                    </div>\n                </div>\n            </div>\n        </div>\n    </div>\n    ",
                        directives: [section_header_component_1.SectionHeaderComponent]
                    }), 
                    __metadata('design:paramtypes', [sample_service_1.SampleService, router_1.Router])
                ], SampleListComponent);
                return SampleListComponent;
            }());
            exports_1("SampleListComponent", SampleListComponent);
        }
    }
});
//# sourceMappingURL=sample-list.component.js.map