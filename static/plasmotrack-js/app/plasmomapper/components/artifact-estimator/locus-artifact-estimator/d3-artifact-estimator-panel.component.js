System.register(['angular2/core', '../../../services/artifact-estimator-project/artifact-estimator-project.service', '../../d3/canvas', 'd3'], function(exports_1, context_1) {
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
    var core_1, artifact_estimator_project_service_1, canvas_1, d3;
    var D3ArtifactEstimatorPanel;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (artifact_estimator_project_service_1_1) {
                artifact_estimator_project_service_1 = artifact_estimator_project_service_1_1;
            },
            function (canvas_1_1) {
                canvas_1 = canvas_1_1;
            },
            function (d3_1) {
                d3 = d3_1;
            }],
        execute: function() {
            D3ArtifactEstimatorPanel = (function () {
                function D3ArtifactEstimatorPanel(_elementRef, _artifactEstimatorProjectService) {
                    this._elementRef = _elementRef;
                    this._artifactEstimatorProjectService = _artifactEstimatorProjectService;
                }
                D3ArtifactEstimatorPanel.prototype.findRange = function () {
                    this.max_height = 1;
                };
                D3ArtifactEstimatorPanel.prototype.createBars = function () {
                    var _this = this;
                    this.bars = [];
                    if (this.bins) {
                        this.bins.forEach(function (bin) {
                            var bar = {
                                color: '#4292D1',
                                opacity: .6,
                                center: bin.base_size,
                                half_width: bin.bin_buffer,
                                height: _this.max_height
                            };
                            _this.bars.push(bar);
                        });
                    }
                };
                D3ArtifactEstimatorPanel.prototype.createCircles = function () {
                    var _this = this;
                    this.circles = [];
                    this.artifactEstimator.peak_data.forEach(function (peak) {
                        var circle = {
                            center: [peak['peak_size'], peak['relative_peak_height']],
                            radius: 2,
                            color: 'red',
                            opacity: 1
                        };
                        _this.circles.push(circle);
                    });
                };
                D3ArtifactEstimatorPanel.prototype.createLines = function () {
                    var _this = this;
                    this.lines = [];
                    this.artifactEstimator.artifact_equations.forEach(function (artifactEquation) {
                        var line = {
                            slope: artifactEquation.slope,
                            intercept: artifactEquation.intercept,
                            start: artifactEquation.start_size,
                            end: artifactEquation.end_size,
                            color: '#5CB85C'
                        };
                        var sd_line = {
                            slope: artifactEquation.slope,
                            intercept: artifactEquation.intercept + (artifactEquation.sd * 3),
                            start: artifactEquation.start_size,
                            end: artifactEquation.end_size,
                            color: '#4292D1'
                        };
                        _this.lines.push(line, sd_line);
                    });
                };
                D3ArtifactEstimatorPanel.prototype.ngOnInit = function () {
                    this.findRange();
                    this.createBars();
                    this.createCircles();
                    this.createLines();
                    this.render();
                };
                D3ArtifactEstimatorPanel.prototype.render = function () {
                    var _this = this;
                    this.canvasConfig = {
                        container: d3.select(this._elementRef.nativeElement).select("#plot-container"),
                        backgroundColor: '#252830',
                        domain: [this.locus.min_base_length, this.locus.max_base_length],
                        range: [-.1, this.max_height * 1.1],
                        click_handler: this.addBreakpoint.bind(this)
                    };
                    this.canvas = new canvas_1.D3Canvas(this.canvasConfig);
                    this.canvas.addBars(this.bars);
                    this.canvas.addCircles(this.circles);
                    this.lines.forEach(function (line) { return _this.canvas.addLine(line); });
                };
                D3ArtifactEstimatorPanel.prototype.addBreakpoint = function (x_coord) {
                    var _this = this;
                    this._artifactEstimatorProjectService.addBreakpoint(this.artifactEstimator.id, x_coord)
                        .subscribe(function (aes) {
                        _this.artifactEstimator.copyFromObj(aes);
                        _this.ngOnInit();
                    }, function (err) { return console.log(err); });
                    console.log("Adding Breakpoint at ", x_coord);
                };
                D3ArtifactEstimatorPanel.prototype.ngOnChanges = function () {
                    this.ngOnInit();
                };
                D3ArtifactEstimatorPanel.prototype.ngOnDestroy = function () {
                };
                D3ArtifactEstimatorPanel = __decorate([
                    core_1.Component({
                        inputs: ['bins', 'locus', 'artifactEstimator'],
                        selector: 'pm-d3-artifact-estimator-panel',
                        template: "\n    <div style=\"height:100%\" id=\"plot-container\"></div>\n    "
                    }), 
                    __metadata('design:paramtypes', [core_1.ElementRef, artifact_estimator_project_service_1.ArtifactEstimatorProjectService])
                ], D3ArtifactEstimatorPanel);
                return D3ArtifactEstimatorPanel;
            }());
            exports_1("D3ArtifactEstimatorPanel", D3ArtifactEstimatorPanel);
        }
    }
});
//# sourceMappingURL=d3-artifact-estimator-panel.component.js.map