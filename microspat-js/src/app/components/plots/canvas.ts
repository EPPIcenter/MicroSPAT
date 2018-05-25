import { Observable } from 'rxjs';
import * as d3 from 'd3';

export interface ContextMenu {
  title: string;
  action: (any);
}
export interface MspatCanvasConfig {
  container: any;
  backgroundColor: string;
  domain: [number, number];
  range: [number, number];
  click_handler?: (x_coord?: number, y_coord?: number) => void;
  contextMenu?: ContextMenu[];
  colorMap?: { [color: string]: string };
}

export interface Bar {
  id?: number;
  color: string;
  opacity: number;
  center: number;
  halfWidth: number;
  height: number;
}

export interface Legend {
  legendEntries: LegendEntry[];
  fontSize: number;

}

export interface LegendEntry {
  label: string;
  color: string;
}

export interface Annotation {
  x: number;
  y: number;
  text: string;
}

export interface Circle {
  center: number[];
  radius: number;
  color: string;
  opacity: number;
  id?: number;
  outline?: string;
  annotations?: Annotation[];
}

export interface Line {
  slope: number;
  intercept: number;
  start: number;
  end: number;
  color: string;
}

export interface Trace {
  data: [number, number][];
  color: string;
}


const contextMenu = function(menu, openCallback = null) {
  d3.selectAll('.d3-context-menu').data([1])
      .enter()
      .append('div')
      .attr('class', 'd3-context-menu');

  // close menu
  d3.select('body').on('click.d3-context-menu', function() {
      d3.select('.d3-context-menu').style('display', 'none');
  });

  // this gets executed when a contextmenu event occurs
  return function(data, index) {
      const elm = this;
      const coords = d3.mouse(this);

      d3.selectAll('.d3-context-menu').html('');

      const list = d3.selectAll('.d3-context-menu').append('ul');

      list.selectAll('li').data(typeof menu === 'function' ? menu(data) : menu).enter()
          .append('li')
          .html(function(d: ContextMenu) {
              return d.title;
          })
          .on('click', function(d: ContextMenu, i) {
              d.action(elm, coords, index);
              d3.select('.d3-context-menu').style('display', 'none');
          });

      // the openCallback allows an action to fire before the menu is displayed
      // an example usage would be closing a tooltip
      if (openCallback) {
        openCallback(data, index);
      };

      // display context menu
      d3.select('.d3-context-menu')
          .style('left', (d3.event.pageX - 2) + 'px')
          .style('top', (d3.event.pageY - 2) + 'px')
          .style('display', 'block');

      d3.event.preventDefault();
  };
};

export class MspatCanvas {
    private canvas: d3.Selection<any, any, any, any>;
    private canvasConfig: MspatCanvasConfig;
    private fullWidth: number;
    private fullHeight: number;
    private x: d3.ScaleLinear<number, number>;
    private y: d3.ScaleLinear<number, number>;
    private xAxis: d3.Axis<number | { valueOf(): number}>;
    private yAxisLeft: d3.Axis<number | { valueOf(): number}>;
    private line: d3.Line<[number, number]>;
    private mouseMove: () => void;
    private focus: d3.Selection<any, any, any, any>;

    constructor(canvasConfig: MspatCanvasConfig) {
        this.canvasConfig = canvasConfig;
        const __this = this;
        this.canvas = canvasConfig.container
          .append('svg')
          .attr('width', '100%')
          .attr('height', '100%')
          .style('background-color', canvasConfig.backgroundColor || '#252830')
          .on('dblclick', function() {
              const xCoord = __this.x.invert(d3.mouse(this)[0]);
              const yCoord = __this.y.invert(d3.mouse(this)[1]);
              if (__this.canvasConfig.click_handler) {
                  __this.canvasConfig.click_handler(xCoord, yCoord);
              }
          });

        if (canvasConfig.contextMenu) {
          const newContextMenu = [];
          canvasConfig.contextMenu.forEach(menu_item => {
            const contextMenuItem = {
              title: menu_item.title,
              action: (d, coords, i) => {
                const xCoord = __this.x.invert(coords[0]);
                const yCoord = __this.y.invert(coords[1]);
                menu_item.action(xCoord, yCoord);
              }
            };
            newContextMenu.push(contextMenuItem);
          });
          this.canvas.on('contextmenu', contextMenu(newContextMenu));
        }

        this.fullWidth = parseInt(this.canvas.style('width'), 10);
        this.fullHeight = parseInt(this.canvas.style('height'), 10);

        this.x = d3
          .scaleLinear()
          .domain(canvasConfig.domain)
          .range([0, this.fullWidth]);

        this.y = d3.scaleLinear()
          .domain(canvasConfig.range)
          .range([this.fullHeight, 0]);

        this.xAxis = d3.axisBottom(this.x).tickSize(-this.fullHeight);
        this.yAxisLeft = d3.axisLeft(this.y).ticks(8);

        this.line = d3.line()
          .x(d => this.x(d[0]))
          .y(d => this.y(d[1]));

        this.canvas.append('svg:g')
          .attr('class', 'x axis')
          .attr('transform', 'translate(0,' + (this.fullHeight - 15) + ')')
          .style('font-size', 8)
          .call(this.xAxis);

        this.canvas.append('svg:g')
          .attr('class', 'y axis')
          .attr('transform', 'translate(35, 0)')
          .style('font-size', 8)
          .call(this.yAxisLeft);
    }

    addTrace(trace: Trace) {
      this.canvas.append('svg:path')
        .attr('d', this.line(trace.data))
        .style('stroke', this.canvasConfig.colorMap ? this.canvasConfig.colorMap[trace.color] : trace.color)
        .style('fill', 'none')
        .attr('opacity', '.7')
        .style('stroke-width', 1.5);
    }

    addBars(bars: Bar[], clickHandler?: (bar: Bar) => void ) {
        const b = this.canvas.append('svg:g')
                    .attr('class', 'bin');

        b.selectAll('.bin')
            .data(bars).enter()
            .append('svg:rect')
            .attr('class', 'bin')
            .attr('transform', (d) => {;
                return 'translate(' + this.x(d.center - d.halfWidth) + ', 0)'
            })
            .attr('height', (d) => this.y(-d.height))
            .attr('width', (d) => this.x(d.center + d.halfWidth) - this.x(d.center - d.halfWidth))
            .attr('opacity', (d) => d.opacity)
            .attr('fill', (d) => d.color)
            .on('click', (d) => {
                if (clickHandler) {
                    clickHandler(d);
                }
            });
    }

    addCircles(circles: Circle[], mouseOverHandler?: (id: number) => void) {
        const c = this.canvas.append('svg:g')
                    .attr('class', 'peak');

        let annotations = [].concat(circles.map(circle => circle.annotations)).filter(a => a);
        annotations = [].concat.apply([], annotations)

        c.selectAll('.peak')
            .data(circles).enter()
            .append('svg:circle')
            .attr('class', 'circle')
            .attr('r', (d) => d.radius)
            .attr('cx', (d) => this.x(d.center[0]))
            .attr('cy', (d) => this.y(d.center[1]))
            .style('fill', (d) => d.color)
            .style('stroke', (d) => d.outline)
            .attr('opacity', (d) => d.opacity)
            .on('mouseover', (d) => mouseOverHandler(d.id));

        if (annotations.length > 0) {
          const a = this.canvas.append('svg:g')
            .attr('class', 'peak-annotation');

          a.selectAll('.peak-annotation')
            .data(annotations).enter()
            .append('svg:text')
            .attr('x', d => this.x(d.x))
            .attr('y', d => this.y(d.y))
            .text(d => d.text);
        }
    }

    addLegend(legend: Legend) {
      const legendHolder = this.canvas.append('svg:g')
        .attr('class', 'legend');

      legendHolder.selectAll('legend-entry')
        .data(legend.legendEntries).enter()
        .append('svg:rect')
        .attr('transform', (d, i) => {
          return 'translate(' + (this.fullWidth - 150) + ', ' + (17 * i + 40) + ')';
        })
        .attr('height', 12.5)
        .attr('width', 20)
        .attr('fill', (d) => this.canvasConfig.colorMap ? this.canvasConfig.colorMap[d.color] : d.color)

      legendHolder.selectAll('legend-label')
        .data(legend.legendEntries).enter()
        .append('svg:text')
        .attr('x', (d, i) => this.fullWidth - 125)
        .attr('y', (d, i) => 17 * i + 51.5)
        .style('stroke', 'none')
        .style('fill', 'white')
        .text(d => d.label)

    }



    addLine(line: Line) {
        const lineGenerator = d3.line()
          .x(d => this.x(d[0]))
          .y(d => this.y(d[1]));

        const start_x = line.start;
        const end_x = line.end;
        const start_y = line.slope * start_x + line.intercept;
        const end_y = line.slope * end_x + line.intercept;
        const c = this.canvas
          .append('svg:g')
          .attr('class', 'line');

        c.append('svg:path')
          .attr('d', lineGenerator([[start_x, start_y], [end_x, end_y]]))
          .style('stroke', line.color)
          .style('fill', 'none')
          .style('stroke-width', 1.5);
    }
}
