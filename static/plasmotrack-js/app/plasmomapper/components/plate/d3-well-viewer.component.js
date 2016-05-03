System.register(['angular2/core', '../../services/ladder/ladder.service', '../../services/well/well.service', '../../services/channel/channel.service', '../../services/locus/locus.service', '../d3/canvas', 'd3'], function(exports_1, context_1) {
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
    var core_1, ladder_service_1, well_service_1, channel_service_1, locus_service_1, canvas_1, d3;
    var D3WellViewerComponent;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (ladder_service_1_1) {
                ladder_service_1 = ladder_service_1_1;
            },
            function (well_service_1_1) {
                well_service_1 = well_service_1_1;
            },
            function (channel_service_1_1) {
                channel_service_1 = channel_service_1_1;
            },
            function (locus_service_1_1) {
                locus_service_1 = locus_service_1_1;
            },
            function (canvas_1_1) {
                canvas_1 = canvas_1_1;
            },
            function (d3_1) {
                d3 = d3_1;
            }],
        execute: function() {
            D3WellViewerComponent = (function () {
                function D3WellViewerComponent(_elementRef, _channelService, _wellService, _ladderService, _locusService) {
                    this._elementRef = _elementRef;
                    this._channelService = _channelService;
                    this._wellService = _wellService;
                    this._ladderService = _ladderService;
                    this._locusService = _locusService;
                    this.traces = [];
                    this.errorMessages = [];
                    this.range_max = 0;
                    this.range_min = -200;
                    this.domain_max = 0;
                    this.domain_min = 0;
                }
                D3WellViewerComponent.prototype.zoomIn = function () {
                    this.range_max = this.range_max * 0.9;
                    this.render();
                };
                D3WellViewerComponent.prototype.zoomOut = function () {
                    this.range_max = this.range_max * 1.1;
                    this.render();
                };
                D3WellViewerComponent.prototype.setDomain = function (min_base_size, max_base_size) {
                    this.domain_min = min_base_size;
                    this.domain_max = max_base_size;
                    this.render();
                };
                D3WellViewerComponent.prototype.render = function () {
                    var _this = this;
                    this.canvasConfig = {
                        container: d3.select(this._elementRef.nativeElement).select("#plot-container"),
                        backgroundColor: "#252830",
                        domain: [this.domain_min, this.domain_max],
                        range: [this.range_min, this.range_max]
                    };
                    this.canvas = new canvas_1.D3Canvas(this.canvasConfig);
                    this.traces.forEach(function (trace) {
                        if (trace.display) {
                            _this.canvas.addTrace(trace);
                        }
                    });
                };
                D3WellViewerComponent.prototype.getZoomWindow = function (locus_id) {
                    var _this = this;
                    this._locusService.getLocus(locus_id).subscribe(function (locus) { return _this.zoomWindows.push({
                        label: locus.label + " (" + locus.color + ")",
                        min: locus.min_base_length,
                        max: locus.max_base_length
                    }); });
                };
                D3WellViewerComponent.prototype.setZoomWindow = function (e) {
                    var i = e.target.value;
                    var zoomWindow = this.zoomWindows[i];
                    this.setDomain(zoomWindow.min, zoomWindow.max);
                };
                D3WellViewerComponent.prototype.ngOnChanges = function () {
                    var _this = this;
                    this.traces = [];
                    this.zoomWindows = [{
                            label: 'No Zoom',
                            min: 0,
                            max: 600
                        }];
                    this.base_sizes = null;
                    this._wellService.getWell(this.well.id).subscribe(function (well) {
                        _this.base_sizes = well.base_sizes;
                        _this._ladderService.getLadder(well.ladder_id).subscribe(function (ladder) {
                            well.channels.forEach(function (channel, color) {
                                _this._channelService.getChannel(channel.id).subscribe(function (new_channel) {
                                    if (channel.locus_id) {
                                        _this.getZoomWindow(channel.locus_id);
                                    }
                                    var data;
                                    if (well.sizing_quality < ladder.sq_limit) {
                                        data = d3.zip(_this.base_sizes, new_channel.data);
                                        _this.domain_max = d3.max(_this.base_sizes);
                                    }
                                    else {
                                        data = d3.zip(d3.range(new_channel.data.length), new_channel.data);
                                        _this.domain_max = new_channel.data.length;
                                    }
                                    _this.range_max = d3.max([d3.max(new_channel.data), _this.range_max]);
                                    var trace = {
                                        data: data,
                                        color: color,
                                        display: true
                                    };
                                    _this.traces.push(trace);
                                    _this.render();
                                });
                            });
                        });
                    }, function (err) { return _this.errorMessages.push(err); }, function () {
                    });
                };
                D3WellViewerComponent = __decorate([
                    core_1.Component({
                        inputs: ['well'],
                        selector: 'pm-d3-well-viewer',
                        template: "\n    <div class=\"col-sm-9\" style=\"height: 25vh\">\n        <div style=\"height: 100%\">\n            <div id=\"plot-container\" style=\"height: 100%\"></div>\n        </div>\n    </div>\n    <div class=\"col-sm-3\" style=\"height: 25vh\">\n        <div class=\"row\">\n            <div class=\"btn-group-vertical\">\n                <button (click)=\"zoomIn()\" type=\"button\" class=\"btn btn-info\"><span class=\"glyphicon glyphicon-plus\"></span></button>\n                <button (click)=\"zoomOut()\" type=\"button\" class=\"btn btn-info\"><span class=\"glyphicon glyphicon-minus\"></span></button>\n            </div>\n            <div class=\"btn-group\">\n                <button type=\"button\" class=\"btn btn-default btn-sm\" *ngFor=\"#trace of traces\" (click)=\"trace.display = !trace.display; render();\">{{trace.color}}</button>\n            </div>\n        </div>\n        <div class=\"row\">\n            <div class=\"form-group\">\n                <select (change)=\"setZoomWindow($event)\" class=\"form-control\">\n                    <option *ngFor=\"#zoomWindow of zoomWindows; #i = index\" value={{i}}>{{zoomWindow.label}}</option>\n                </select>\n            </div>\n        </div>\n    </div>\n    "
                    }), 
                    __metadata('design:paramtypes', [core_1.ElementRef, channel_service_1.ChannelService, well_service_1.WellService, ladder_service_1.LadderService, locus_service_1.LocusService])
                ], D3WellViewerComponent);
                return D3WellViewerComponent;
            }());
            exports_1("D3WellViewerComponent", D3WellViewerComponent);
        }
    }
});
//# sourceMappingURL=d3-well-viewer.component.js.map