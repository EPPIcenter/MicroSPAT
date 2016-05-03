System.register(['angular2/core', '../../services/ladder/ladder.service', '../../services/well/well.service', '../../services/channel/channel.service', 'd3'], function(exports_1, context_1) {
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
    var core_1, ladder_service_1, well_service_1, channel_service_1, d3;
    var D3LadderEditorComponent;
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
            function (d3_1) {
                d3 = d3_1;
            }],
        execute: function() {
            D3LadderEditorComponent = (function () {
                function D3LadderEditorComponent(_wellService, _ladderService, _channelService, _elementRef) {
                    var _this = this;
                    this._wellService = _wellService;
                    this._ladderService = _ladderService;
                    this._channelService = _channelService;
                    this._elementRef = _elementRef;
                    this.errorMessages = [];
                    this.ladderRecalculated = new core_1.EventEmitter();
                    this.peaksCleared = new core_1.EventEmitter();
                    this.undoChanges = new core_1.EventEmitter();
                    this.getLadderChannel = function (ladder) {
                        return _this._channelService.getChannel(_this.well.channels.get(ladder.color).id);
                    };
                }
                D3LadderEditorComponent.prototype.clearPeaks = function () {
                    this.well.ladder_peak_indices = [];
                    this.well.isDirty = true;
                    this.render();
                };
                D3LadderEditorComponent.prototype.undo = function () {
                    var _this = this;
                    this._wellService.clearWellFromCache(this.well.id);
                    this._wellService.getWell(this.well.id).subscribe(function (well) {
                        _this.well.copyFromObj(well);
                        _this.render();
                    }, function (err) { return _this.errorMessages.push(err); });
                };
                D3LadderEditorComponent.prototype.recalculateLadder = function () {
                    this.ladderRecalculated.emit(this.well);
                };
                D3LadderEditorComponent.prototype.ngOnDestroy = function () {
                    console.log("Destroying Ladder Editor Component");
                    d3.select(this._elementRef.nativeElement).select("#ladder-container").select("*").remove();
                };
                D3LadderEditorComponent.prototype.render = function () {
                    var _this = this;
                    d3.select(this._elementRef.nativeElement).select("#ladder-container").select("*").remove();
                    var max_i = null;
                    var windowSize = 25;
                    var canvas = d3.select(this._elementRef.nativeElement).select("#ladder-container")
                        .append('svg')
                        .attr("width", '100%')
                        .attr("height", "100%")
                        .style("background-color", "#252830");
                    var fullWidth = parseInt(canvas.style("width"));
                    var fullHeight = parseInt(canvas.style("height"));
                    var x = d3.scale.linear()
                        .domain([0, this.ladderChannel.data.length])
                        .range([0, fullWidth]);
                    var y = d3.scale.linear()
                        .domain([-200, d3.max(this.ladderChannel.data) * 1.2 + 25])
                        .range([fullHeight, 0]);
                    var xAxis = d3.svg.axis().scale(x).tickSize(-fullHeight);
                    var yAxisLeft = d3.svg.axis().scale(y).ticks(8).orient('left');
                    var line = d3.svg.line()
                        .x(function (d) { return x(d[0]); })
                        .y(function (d) { return y(d[1]); });
                    var __this = this;
                    var mouseMove = function () {
                        var x0 = x.invert(d3.mouse(this)[0]);
                        var i = d3.round(x0);
                        var searchWindow = __this.ladderChannel.data.slice(i - windowSize, i + windowSize);
                        max_i = searchWindow.indexOf(d3.max(searchWindow)) + i - windowSize;
                        focus.attr("transform", "translate(" + x(max_i) + "," + y(__this.ladderChannel.data[max_i]) + ")");
                    };
                    var click = function () {
                        if (_this.well.ladder_peak_indices.indexOf(max_i) == -1) {
                            _this.well.ladder_peak_indices.push(max_i);
                        }
                        else {
                            _this.well.ladder_peak_indices.splice(_this.well.ladder_peak_indices.indexOf(max_i), 1);
                        }
                        _this.well.isDirty = true;
                        refresh_peaks();
                    };
                    canvas.append("svg:g")
                        .attr("class", "x axis")
                        .attr("transform", "translate(0," + (fullHeight - 15) + ")")
                        .style("font-size", 8)
                        .call(xAxis);
                    canvas.append("svg:g")
                        .attr("class", "y axis")
                        .attr("transform", "translate(35, 0)")
                        .style("font-size", 8)
                        .call(yAxisLeft);
                    var r = d3.zip(d3.range(this.ladderChannel.data.length), this.ladderChannel.data);
                    canvas.append("svg:path")
                        .attr("d", line(r))
                        .style("stroke", "#5cb85c")
                        .style("fill", "none")
                        .style("stroke-width", 1.5);
                    var focus = canvas.append("svg:g")
                        .attr("class", "focus")
                        .style("display", "none");
                    focus.append("circle").attr("r", 4.5);
                    var refresh_peaks = function () {
                        var peak = canvas.selectAll(".peak")
                            .data(_this.well.ladder_peak_indices, function (d) { return d; });
                        var new_peaks = peak.enter().append("svg:g")
                            .attr("class", "peak")
                            .attr("transform", function (d) {
                            return "translate(" + x(d) + "," + y(_this.ladderChannel.data[d]) + ")";
                        });
                        new_peaks.append("circle");
                        new_peaks.append("text");
                        peak.selectAll("circle")
                            .attr("r", 4.5)
                            .style("fill", "steelblue");
                        peak.selectAll("text")
                            .text(function (d) { return _this.well.base_sizes[d]; })
                            .attr("y", -9)
                            .attr("dy", ".35em")
                            .style("fill", "white")
                            .style("font-size", 8)
                            .style("font", "Helvetica");
                        peak.exit().remove();
                    };
                    refresh_peaks();
                    canvas.append("rect")
                        .attr("class", "overlay")
                        .attr("width", fullWidth)
                        .attr("height", fullHeight)
                        .on("mouseover", function () { focus.style("display", null); })
                        .on("mouseout", function () { focus.style("disply", "none"); })
                        .on("mousemove", mouseMove)
                        .on("click", click);
                };
                D3LadderEditorComponent.prototype.ngOnChanges = function () {
                    var _this = this;
                    d3.select(this._elementRef.nativeElement).select("#ladder-container").select("*").remove();
                    if (this.well) {
                        this._ladderService.getLadder(this.well.ladder_id)
                            .concatMap(this.getLadderChannel)
                            .subscribe(function (channel) {
                            _this.ladderChannel = channel;
                            _this.render();
                        }, function (err) { return _this.errorMessages.push(err); });
                    }
                };
                __decorate([
                    core_1.Output(), 
                    __metadata('design:type', Object)
                ], D3LadderEditorComponent.prototype, "ladderRecalculated", void 0);
                __decorate([
                    core_1.Output(), 
                    __metadata('design:type', Object)
                ], D3LadderEditorComponent.prototype, "peaksCleared", void 0);
                __decorate([
                    core_1.Output(), 
                    __metadata('design:type', Object)
                ], D3LadderEditorComponent.prototype, "undoChanges", void 0);
                D3LadderEditorComponent = __decorate([
                    core_1.Component({
                        inputs: ['well'],
                        selector: 'pm-d3-ladder-editor',
                        template: "\n    <div class=\"col-sm-9\" style=\"height: 25vh\">\n        <div style=\"height: 100%\">\n            <div id=\"ladder-container\" style=\"height: 100%\"></div>\n        </div>\n    </div>\n    <div class=\"col-sm-3\">\n        <a (click)=\"recalculateLadder()\" [ngClass]=\"{disabled: !well.isDirty}\" class=\"btn btn-primary btn-block\">Recalculate Ladder</a>\n        <a (click)=\"clearPeaks()\" class=\"btn btn-warning btn-block\">Clear Peaks</a>\n        <a [ngClass]=\"{disabled: !well.isDirty}\" (click)=\"undo()\" class=\"btn btn-info btn-block\">Undo Changes</a>\n        <h3 class=\"span12 label label-info\">SQ: {{well.sizing_quality | number}}</h3>\n        <h3 class=\"span12 label label-success\">Well: {{well.well_label}}</h3>\n        <span class=\"label label-danger\" *ngFor='#err of errorMessages'>{{err}}</span>\n    </div>\n    "
                    }), 
                    __metadata('design:paramtypes', [well_service_1.WellService, ladder_service_1.LadderService, channel_service_1.ChannelService, core_1.ElementRef])
                ], D3LadderEditorComponent);
                return D3LadderEditorComponent;
            }());
            exports_1("D3LadderEditorComponent", D3LadderEditorComponent);
        }
    }
});
//# sourceMappingURL=d3-ladder-editor.component.js.map