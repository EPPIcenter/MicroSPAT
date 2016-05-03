System.register(['angular2/core', 'd3'], function(exports_1, context_1) {
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
    var core_1, d3;
    var D3WellPlotComponent;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (d3_1) {
                d3 = d3_1;
            }],
        execute: function() {
            D3WellPlotComponent = (function () {
                function D3WellPlotComponent(_elementRef) {
                    this._elementRef = _elementRef;
                    this.wellSelected = new core_1.EventEmitter();
                    this.rowIndexMapping = {
                        'A': 0,
                        'B': 1,
                        'C': 2,
                        'D': 3,
                        'E': 4,
                        'F': 5,
                        'G': 6,
                        'H': 7,
                        'I': 8,
                        'J': 9,
                        'K': 10,
                        'L': 11,
                        'M': 12,
                        'N': 13,
                        'O': 14,
                        'P': 15
                    };
                    this.rowPadding = 1;
                    this.colPadding = 1;
                }
                D3WellPlotComponent.prototype.getRowIndex = function (well_label) {
                    return this.rowIndexMapping[well_label.slice(0, 1)];
                };
                D3WellPlotComponent.prototype.getColIndex = function (well_label) {
                    return +well_label.slice(1) - 1;
                };
                D3WellPlotComponent.prototype.ngOnDestroy = function () {
                    d3.select(this._elementRef.nativeElement).select("#plot-container").select("*").remove();
                };
                D3WellPlotComponent.prototype.render = function () {
                    var _this = this;
                    d3.select(this._elementRef.nativeElement).select("#plot-container").select("*").remove();
                    if (this.wellArrangement == 96) {
                        this.rowLength = 12;
                        this.colLength = 8;
                    }
                    else {
                        this.rowLength = 24;
                        this.colLength = 16;
                    }
                    var canvas = d3.select(this._elementRef.nativeElement).select("#plot-container").append('svg')
                        .attr('width', '100%')
                        .attr('height', '100%')
                        .style("background-color", "#252830");
                    var full_width = parseInt(canvas.style('width'));
                    var full_height = parseInt(canvas.style('height'));
                    var width = full_width - ((this.rowLength + 1) * this.rowPadding);
                    var height = full_height - ((this.colLength + 1) * this.colPadding);
                    canvas.selectAll('rect')
                        .data(this.squares)
                        .enter().append('rect')
                        .attr("x", function (d) { return _this.getColIndex(d.well_label) * (full_width / _this.rowLength) + _this.rowPadding; })
                        .attr("y", function (d) { return _this.getRowIndex(d.well_label) * (full_height / _this.colLength) + _this.colPadding; })
                        .attr("width", width / this.rowLength)
                        .attr("height", height / this.colLength)
                        .attr("fill", function (d) { return d.color; })
                        .on('click', function (d) {
                        _this.wellSelected.emit(d.id);
                    });
                };
                D3WellPlotComponent.prototype.ngOnChanges = function () {
                    d3.select(this._elementRef.nativeElement).select("#plot-container").select("*").remove();
                    this.render();
                };
                __decorate([
                    core_1.Output(), 
                    __metadata('design:type', Object)
                ], D3WellPlotComponent.prototype, "wellSelected", void 0);
                D3WellPlotComponent = __decorate([
                    core_1.Component({
                        inputs: ['squares', 'wellArrangement', 'label'],
                        selector: 'pm-d3-well-plot',
                        template: "\n    <h3 class=\"span label label-success\">{{label}}</h3>\n    <div style=\"height:100%\" id=\"plot-container\"></div>\n    "
                    }), 
                    __metadata('design:paramtypes', [core_1.ElementRef])
                ], D3WellPlotComponent);
                return D3WellPlotComponent;
            }());
            exports_1("D3WellPlotComponent", D3WellPlotComponent);
        }
    }
});
//# sourceMappingURL=d3-well-plot.component.js.map