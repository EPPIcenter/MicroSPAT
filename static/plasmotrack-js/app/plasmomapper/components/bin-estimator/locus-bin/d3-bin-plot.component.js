System.register(['angular2/core', '../../d3/canvas', 'd3'], function(exports_1, context_1) {
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
    var core_1, canvas_1, d3;
    var D3BinEstimatorPlot;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (canvas_1_1) {
                canvas_1 = canvas_1_1;
            },
            function (d3_1) {
                d3 = d3_1;
            }],
        execute: function() {
            D3BinEstimatorPlot = (function () {
                function D3BinEstimatorPlot(_elementRef) {
                    this._elementRef = _elementRef;
                    this.binSelected = new core_1.EventEmitter();
                }
                D3BinEstimatorPlot.prototype.findRange = function () {
                    var _this = this;
                    this.max_peak = 0;
                    this.annotations.forEach(function (annotation) {
                        annotation.annotated_peaks.forEach(function (peak) {
                            if (peak['peak_height'] > _this.max_peak) {
                                _this.max_peak = peak['peak_height'];
                            }
                        });
                    });
                };
                D3BinEstimatorPlot.prototype.createBars = function () {
                    var _this = this;
                    this.bars = [];
                    if (this.bins) {
                        this.bins.forEach(function (bin) {
                            var bar = {
                                color: '#4292D1',
                                opacity: .6,
                                center: bin.base_size,
                                half_width: bin.bin_buffer,
                                height: 1
                            };
                            console.log(bar);
                            _this.bars.push(bar);
                        });
                    }
                };
                D3BinEstimatorPlot.prototype.createCircles = function () {
                    var _this = this;
                    this.circles = [];
                    this.annotations.forEach(function (annotation) {
                        annotation.annotated_peaks.forEach(function (peak) {
                            var circle = {
                                center: [peak['peak_size'], peak['relative_peak_height']],
                                radius: 2,
                                color: 'red',
                                opacity: 1
                            };
                            _this.circles.push(circle);
                        });
                    });
                };
                D3BinEstimatorPlot.prototype.ngOnInit = function () {
                    this.findRange();
                    this.createBars();
                    this.createCircles();
                    this.render();
                };
                D3BinEstimatorPlot.prototype.render = function () {
                    this.canvasConfig = {
                        container: d3.select(this._elementRef.nativeElement).select("#plot-container"),
                        backgroundColor: '#252830',
                        domain: [this.locus.min_base_length, this.locus.max_base_length],
                        range: [-.1, 1.1]
                    };
                    this.canvas = new canvas_1.D3Canvas(this.canvasConfig);
                    console.log(this.bars);
                    this.canvas.addBars(this.bars);
                    this.canvas.addCircles(this.circles);
                };
                D3BinEstimatorPlot.prototype.ngOnChanges = function () {
                    this.ngOnInit();
                };
                D3BinEstimatorPlot.prototype.ngOnDestroy = function () {
                };
                __decorate([
                    core_1.Output(), 
                    __metadata('design:type', Object)
                ], D3BinEstimatorPlot.prototype, "binSelected", void 0);
                D3BinEstimatorPlot = __decorate([
                    core_1.Component({
                        inputs: ['bins', 'locus', 'annotations'],
                        selector: 'pm-d3-bin-estimator-locus-plot',
                        template: "\n    <div style=\"height:100%\" id=\"plot-container\"></div>\n    "
                    }), 
                    __metadata('design:paramtypes', [core_1.ElementRef])
                ], D3BinEstimatorPlot);
                return D3BinEstimatorPlot;
            }());
            exports_1("D3BinEstimatorPlot", D3BinEstimatorPlot);
        }
    }
});
//# sourceMappingURL=d3-bin-plot.component.js.map