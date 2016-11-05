import { CanvasConfig } from './canvas-config.model';
import { Trace } from './trace.model';
import { Bar } from './bar.model';
import { Circle } from './circle.model'
import { Line } from './line.model'
import * as d3 from 'd3'

export class D3Canvas{
    private canvas: d3.Selection<any>;
    private canvasConfig: CanvasConfig;
    private fullWidth: number;
    private fullHeight: number;
    private x: d3.scale.Linear<number, number>;
    private y: d3.scale.Linear<number, number>;
    
    private xAxis: d3.svg.Axis;
    private yAxisLeft: d3.svg.Axis;
    
    private line: d3.svg.Line<[number, number]>;
    
    private mouseMove: () => void;
    
    private focus: d3.Selection<any>;
    
    constructor(
        canvasConfig: CanvasConfig
    ){
        canvasConfig.container.select("*").remove()
        this.canvasConfig = canvasConfig;
        
        let __this = this;
        this.canvas = canvasConfig.container
                        .append("svg")
                        .attr("width", "100%")
                        .attr("height", "100%")
                        .style("background-color", canvasConfig.backgroundColor || "#252830")
                        .on('dblclick', function() {
                            let x_coord = __this.x.invert(d3.mouse(this)[0]);
                            let y_coord = __this.y.invert(d3.mouse(this)[1]);
                            if(__this.canvasConfig.click_handler) {
                                __this.canvasConfig.click_handler(x_coord, y_coord);
                            }
                        });
        
        if(canvasConfig.contextMenu) {
            let new_context_menu = [];
            canvasConfig.contextMenu.forEach(menu_item => {
                let context_menu_item = {
                    title: menu_item.title,
                    action: (d, coords, i) => {
                        let x_coord = __this.x.invert(coords[0]);
                        let y_coord = __this.y.invert(coords[1]);
                        menu_item.action(x_coord, y_coord);
                    }
                };
                new_context_menu.push(context_menu_item)
            })
            this.canvas.on("contextmenu", d3.contextMenu(new_context_menu));
        }
                        
        this.fullWidth = parseInt(this.canvas.style("width"))
        this.fullHeight = parseInt(this.canvas.style("height"))
        
        this.x = d3.scale.linear()
                        .domain(canvasConfig.domain)
                        .range([0, this.fullWidth])
        
        this.y = d3.scale.linear()
                    .domain(canvasConfig.range)
                    .range([this.fullHeight, 0])

        this.xAxis = d3.svg.axis().scale(this.x).tickSize(-this.fullHeight);
        this.yAxisLeft = d3.svg.axis().scale(this.y).ticks(8).orient('left')
        
        this.line = d3.svg.line()
                        .x(d => this.x(d[0]))
                        .y(d => this.y(d[1]));
        
        this.canvas.append("svg:g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + (this.fullHeight - 15) + ")")
            .style("font-size", 8)
            .call(this.xAxis)
            
        this.canvas.append("svg:g")
            .attr("class", "y axis")
            .attr("transform", "translate(35, 0)")
            .style("font-size", 8)
            .call(this.yAxisLeft)
    }
    
    addTrace(trace: Trace) {
        this.canvas.append("svg:path")
            .attr("d", this.line(trace.data))
            .style("stroke", trace.color)
            .style("fill", "none")
            .attr("opacity", ".7")
            .style("stroke-width", 1.5)
    }
    
    addBars(bars: Bar[], clickHandler?: (bar: Bar) => void ) {                            
        let b = this.canvas.append("svg:g")
                    .attr("class", 'bin')
        
        b.selectAll(".bin")
            .data(bars).enter()
            .append("svg:rect")
            .attr("class", "bin")
            .attr("transform", (d) => {;
                return "translate(" + this.x(d.center - d.half_width) + ", 0)"   
            })
            .attr("height", (d) => this.y(-d.height))
            .attr("width", (d) => this.x(d.center + d.half_width) - this.x(d.center - d.half_width))
            .attr("opacity", (d) => d.opacity)
            .attr("fill", (d) => d.color)
            .on('click', (d) => clickHandler(d));
    }
    
    addCircles(circles: Circle[], mouseOverHandler?: (id: number) => void) {
        let c = this.canvas.append("svg:g")
                    .attr("class", 'peak')

        c.selectAll(".peak")
            .data(circles).enter()
            .append("svg:circle")
            .attr("class", "circle")
            .attr("r", (d) => d.radius)
            .attr("cx", (d) => this.x(d.center[0]))
            .attr("cy", (d) => this.y(d.center[1]))
            .style("fill", (d) => d.color)
            .attr("opacity", (d) => d.opacity)
            .on("mouseover", (d) => mouseOverHandler(d.id))
    }
    
    addLine(line: Line) {
        let lineGenerator: any = d3.svg.line().x(d => this.x(d[0]))
                                         .y(d => this.y(d[1]));
        let start_x = line.start
        let end_x = line.end
        let start_y = line.slope * start_x + line.intercept;
        let end_y = line.slope * end_x + line.intercept;
        let c = this.canvas.append("svg:g")
                    .attr("class", "line")
        
        c.append("svg:path")
            .attr("d", lineGenerator([[start_x, start_y], [end_x, end_y]]))
            .style("stroke", line.color)
            .style("fill", "none")
            .style("stroke-width", 1.5);
    }
}