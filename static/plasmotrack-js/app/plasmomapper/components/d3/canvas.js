System.register(['d3'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var d3;
    var D3Canvas;
    return {
        setters:[
            function (d3_1) {
                d3 = d3_1;
            }],
        execute: function() {
            D3Canvas = (function () {
                function D3Canvas(canvasConfig) {
                    var _this = this;
                    canvasConfig.container.select("*").remove();
                    this.canvasConfig = canvasConfig;
                    var __this = this;
                    this.canvas = canvasConfig.container
                        .append("svg")
                        .attr("width", "100%")
                        .attr("height", "100%")
                        .style("background-color", canvasConfig.backgroundColor || "#252830")
                        .on('dblclick', function () {
                        var x_coord = __this.x.invert(d3.mouse(this)[0]);
                        var y_coord = __this.y.invert(d3.mouse(this)[1]);
                        __this.canvasConfig.click_handler(x_coord, y_coord);
                    });
                    this.fullWidth = parseInt(this.canvas.style("width"));
                    this.fullHeight = parseInt(this.canvas.style("height"));
                    this.x = d3.scale.linear()
                        .domain(canvasConfig.domain)
                        .range([0, this.fullWidth]);
                    this.y = d3.scale.linear()
                        .domain(canvasConfig.range)
                        .range([this.fullHeight, 0]);
                    this.xAxis = d3.svg.axis().scale(this.x).tickSize(-this.fullHeight);
                    this.yAxisLeft = d3.svg.axis().scale(this.y).ticks(8).orient('left');
                    this.line = d3.svg.line()
                        .x(function (d) { return _this.x(d[0]); })
                        .y(function (d) { return _this.y(d[1]); });
                    this.canvas.append("svg:g")
                        .attr("class", "x axis")
                        .attr("transform", "translate(0," + (this.fullHeight - 15) + ")")
                        .style("font-size", 8)
                        .call(this.xAxis);
                    this.canvas.append("svg:g")
                        .attr("class", "y axis")
                        .attr("transform", "translate(35, 0)")
                        .style("font-size", 8)
                        .call(this.yAxisLeft);
                }
                D3Canvas.prototype.addTrace = function (trace) {
                    this.canvas.append("svg:path")
                        .attr("d", this.line(trace.data))
                        .style("stroke", trace.color)
                        .style("fill", "none")
                        .attr("opacity", ".7")
                        .style("stroke-width", 1.5);
                };
                D3Canvas.prototype.addBars = function (bars, clickHandler) {
                    var _this = this;
                    var b = this.canvas.append("svg:g")
                        .attr("class", 'bin');
                    b.selectAll(".bin")
                        .data(bars).enter()
                        .append("svg:rect")
                        .attr("class", "bin")
                        .attr("transform", function (d) {
                        ;
                        return "translate(" + _this.x(d.center - d.half_width) + ", 0)";
                    })
                        .attr("height", function (d) { return _this.y(-d.height); })
                        .attr("width", function (d) { return _this.x(d.center + d.half_width) - _this.x(d.center - d.half_width); })
                        .attr("opacity", function (d) { return d.opacity; })
                        .attr("fill", function (d) { return d.color; })
                        .on('click', function (d) { return clickHandler(d); });
                };
                D3Canvas.prototype.addCircles = function (circles, mouseOverHandler) {
                    var _this = this;
                    var c = this.canvas.append("svg:g")
                        .attr("class", 'peak');
                    c.selectAll(".peak")
                        .data(circles).enter()
                        .append("svg:circle")
                        .attr("class", "circle")
                        .attr("r", function (d) { return d.radius; })
                        .attr("cx", function (d) { return _this.x(d.center[0]); })
                        .attr("cy", function (d) { return _this.y(d.center[1]); })
                        .style("fill", function (d) { return d.color; })
                        .attr("opacity", function (d) { return d.opacity; })
                        .on("mouseover", function (d) { return mouseOverHandler(d.id); });
                };
                D3Canvas.prototype.addLine = function (line) {
                    var _this = this;
                    var lineGenerator = d3.svg.line().x(function (d) { return _this.x(d[0]); })
                        .y(function (d) { return _this.y(d[1]); });
                    var start_x = line.start;
                    var end_x = line.end;
                    var start_y = line.slope * start_x + line.intercept;
                    var end_y = line.slope * end_x + line.intercept;
                    console.log(start_x, end_x, start_y, end_y);
                    console.log(lineGenerator([[start_x, start_y], [end_x, end_y]]));
                    var c = this.canvas.append("svg:g")
                        .attr("class", "line");
                    c.append("svg:path")
                        .attr("d", lineGenerator([[start_x, start_y], [end_x, end_y]]))
                        .style("stroke", line.color)
                        .style("fill", "none")
                        .style("stroke-width", 1.5);
                };
                return D3Canvas;
            }());
            exports_1("D3Canvas", D3Canvas);
        }
    }
});
//# sourceMappingURL=canvas.js.map