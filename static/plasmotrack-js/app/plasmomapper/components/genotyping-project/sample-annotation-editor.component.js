System.register(['angular2/core', 'rxjs/Observable', '../d3/canvas', '../../services/channel/channel.service', '../../services/well/well.service', '../../services/locus/locus.service', 'd3'], function(exports_1, context_1) {
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
    var core_1, Observable_1, canvas_1, channel_service_1, well_service_1, locus_service_1, d3;
    var D3SampleAnnotationEditor;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (Observable_1_1) {
                Observable_1 = Observable_1_1;
            },
            function (canvas_1_1) {
                canvas_1 = canvas_1_1;
            },
            function (channel_service_1_1) {
                channel_service_1 = channel_service_1_1;
            },
            function (well_service_1_1) {
                well_service_1 = well_service_1_1;
            },
            function (locus_service_1_1) {
                locus_service_1 = locus_service_1_1;
            },
            function (d3_1) {
                d3 = d3_1;
            }],
        execute: function() {
            D3SampleAnnotationEditor = (function () {
                // @Output() binToggled = new EventEmitter();
                function D3SampleAnnotationEditor(_elementRef, _channelService, _wellService, _locusService) {
                    this._elementRef = _elementRef;
                    this._channelService = _channelService;
                    this._wellService = _wellService;
                    this._locusService = _locusService;
                }
                D3SampleAnnotationEditor.prototype.findMaxHeight = function () {
                    var _this = this;
                    this.max_height = 300;
                    this.locusAnnotation.annotated_peaks.forEach(function (peak) {
                        if (peak['peak_height'] > _this.max_height) {
                            _this.max_height = peak['peak_height'];
                        }
                    });
                };
                D3SampleAnnotationEditor.prototype.createBars = function () {
                    this.bars = [];
                    console.log(this.locusAnnotation);
                    console.log(this.bins);
                    for (var k in this.locusAnnotation.alleles) {
                        var b = this.bins.get(+k);
                        var bar = {
                            opacity: .6,
                            center: b.base_size,
                            half_width: b.bin_buffer,
                            height: this.max_height,
                            id: +k,
                            color: null
                        };
                        if (this.locusAnnotation.alleles[k]) {
                            bar.color = '#C96310';
                        }
                        else {
                            bar.color = '#4292D1';
                        }
                        this.bars.push(bar);
                    }
                };
                D3SampleAnnotationEditor.prototype.barClicked = function (bar) {
                    console.log(bar);
                    this.locusAnnotation.alleles[bar.id] = !this.locusAnnotation.alleles[bar.id];
                    this.locusAnnotation.isDirty = true;
                    this.render();
                };
                D3SampleAnnotationEditor.prototype.createTrace = function () {
                    this.trace = null;
                    console.log(this.well, this.channel);
                    var data = d3.zip(this.well.base_sizes, this.channel.data);
                    var trace = {
                        data: data,
                        color: '#5cb85c',
                        display: true
                    };
                    this.trace = trace;
                };
                D3SampleAnnotationEditor.prototype.createCircles = function () {
                    var _this = this;
                    this.circles = [];
                    this.locusAnnotation.annotated_peaks.forEach(function (peak) {
                        var color = 'blue';
                        if (peak['flags']['artifact']) {
                            color = 'yellow';
                        }
                        if (peak['flags']['crosstalk'] || peak['flags']['bleedthrough']) {
                            color = 'green';
                        }
                        if (peak['flags']['below_relative_threshold']) {
                            color = 'yellow';
                        }
                        if (!peak['in_bin']) {
                            color = 'red';
                        }
                        var p = {
                            center: [peak['peak_size'], peak['peak_height']],
                            radius: 6,
                            color: color,
                            opacity: 1,
                            id: peak['peak_index']
                        };
                        _this.circles.push(p);
                    });
                };
                D3SampleAnnotationEditor.prototype.createCanvas = function () {
                    this.canvas = null;
                    this.canvasConfig = null;
                    this.canvasConfig = {
                        container: d3.select(this._elementRef.nativeElement).select("#plot-container"),
                        backgroundColor: '#252830',
                        domain: [this.locus.min_base_length, this.locus.max_base_length],
                        range: [-100, this.max_height * 1.1]
                    };
                    console.log(this.canvasConfig);
                    this.canvas = new canvas_1.D3Canvas(this.canvasConfig);
                    this.canvas.addBars(this.bars, this.barClicked.bind(this));
                    this.canvas.addTrace(this.trace);
                    this.canvas.addCircles(this.circles, this.selectPeak.bind(this));
                };
                D3SampleAnnotationEditor.prototype.getWell = function (channel) {
                    var _this = this;
                    return this._wellService.getWell(channel.well_id)
                        .map(function (well) {
                        console.log("Getting Well");
                        _this.well = well;
                        return channel;
                    });
                };
                D3SampleAnnotationEditor.prototype.getLocus = function (channel) {
                    var _this = this;
                    console.log("Getting Locus");
                    return this._locusService.getLocus(channel.locus_id)
                        .map(function (locus) {
                        _this.locus = locus;
                        return channel;
                    });
                };
                D3SampleAnnotationEditor.prototype.selectPeak = function (index) {
                    for (var peak_index = 0; peak_index < this.locusAnnotation.annotated_peaks.length; peak_index++) {
                        var peak = this.locusAnnotation.annotated_peaks[peak_index];
                        if (peak['peak_index'] == index) {
                            this.selectedPeak = peak;
                            break;
                        }
                    }
                };
                D3SampleAnnotationEditor.prototype.render = function () {
                    var _this = this;
                    var channelObs = this._channelService.getChannel(this.locusAnnotation.reference_channel_id).map(function (channel) {
                        _this.channel = channel;
                        return channel;
                    });
                    var wellObs = channelObs.concatMap(function (channel) {
                        console.log(channel);
                        return _this._wellService.getWell(channel.well_id)
                            .map(function (well) {
                            _this.well = well;
                            return well;
                        });
                    });
                    var locusObs = channelObs.concatMap(function (channel) {
                        return _this._locusService.getLocus(channel.locus_id)
                            .map(function (locus) {
                            _this.locus = locus;
                            return locus;
                        });
                    });
                    Observable_1.Observable.concat(locusObs, wellObs).subscribe(function () {
                        if (_this.well && _this.locus && _this.channel) {
                            _this.findMaxHeight();
                            _this.createBars();
                            _this.createTrace();
                            _this.createCircles();
                            _this.createCanvas();
                        }
                    });
                };
                D3SampleAnnotationEditor.prototype.ngOnChanges = function () {
                    if (this.locusAnnotation.reference_run_id) {
                        this.selectedPeak = null;
                        this.render();
                    }
                };
                D3SampleAnnotationEditor = __decorate([
                    core_1.Component({
                        inputs: ['locusAnnotation', 'bins'],
                        selector: 'pm-d3-sample-annotation-editor',
                        template: "\n    <div class=\"col-sm-9\" style=\"height: 100%\">\n        <div id=\"plot-container\" style=\"height: 100%\"></div>\n    </div>\n    <div class=\"col-sm-3\">\n        <div class=\"table-responseive\">\n            <table class=\"table table-striped table-condensed\">\n                <tbody>\n                    <tr *ngIf=\"well\">\n                        <td>SQ</td>\n                        <td>{{well.sizing_quality | number}}</td>\n                    </tr>\n                    <tr *ngIf=\"selectedPeak\">\n                        <td>Height</td>\n                        <td>{{selectedPeak['peak_height']}}</td>\n                    </tr>\n                    <tr *ngIf=\"selectedPeak\">\n                        <td>Size</td>\n                        <td>{{selectedPeak['peak_size'] | number}}</td>\n                    </tr>\n                    <tr *ngIf=\"selectedPeak\">\n                        <td>Artifact Contribution</td>\n                        <td>{{selectedPeak['artifact_contribution'] | number}}</td>\n                    </tr>\n                    <tr *ngIf=\"selectedPeak\">\n                        <td>Artifact Error</td>\n                        <td>{{selectedPeak['artifact_error'] | number}}</td>\n                    </tr>\n                    <tr *ngIf=\"selectedPeak\">\n                        <td>Bleedthrough</td>\n                        <td>{{selectedPeak['bleedthrough_ratio'] | number}}</td>\n                    </tr>\n                    <tr *ngIf=\"selectedPeak\">\n                        <td>Crosstalk</td>\n                        <td>{{selectedPeak['crosstalk_ratio'] | number}}</td>\n                    </tr>\n                    <tr *ngIf=\"selectedPeak\">\n                        <td>Probability</td>\n                        <td>{{selectedPeak['probability'] | number}}</td>\n                    </tr>\n                </tbody>\n            </table>\n        </div>\n    </div>\n    "
                    }), 
                    __metadata('design:paramtypes', [core_1.ElementRef, channel_service_1.ChannelService, well_service_1.WellService, locus_service_1.LocusService])
                ], D3SampleAnnotationEditor);
                return D3SampleAnnotationEditor;
            }());
            exports_1("D3SampleAnnotationEditor", D3SampleAnnotationEditor);
        }
    }
});
//# sourceMappingURL=sample-annotation-editor.component.js.map