import { Component, ChangeDetectionStrategy, Input, OnChanges, SimpleChanges, ElementRef, Output, EventEmitter, OnInit } from '@angular/core';
import * as d3 from 'd3';

import { Line, Circle, MspatSVGCanvas, MspatCanvasConfig } from './../plots/canvas';

@Component({
  selector: 'mspat-artifact-plot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id='plot-container'></div>
  `,
  styles: [`
    #plot-container {
      height: 100%;
      width: 100%;
    }
  `]
})
export class ArtifactPlotComponent implements OnChanges, OnInit {
  @Input() artifactPlot: {
    lines: Line[],
    points: Circle[],
    domain: [number, number],
    range: [number, number]
  }

  @Output() addBreakpoint: EventEmitter<number> = new EventEmitter();

  private canvasConfig: MspatCanvasConfig;
  private canvas: MspatSVGCanvas

  constructor(private _elementRef: ElementRef) {}

  render() {
    this.canvas.clear()

    if (this.artifactPlot.lines.length === 0) {
      return;
    }

    this.canvas.resize(this.artifactPlot.domain, this.artifactPlot.range);

    this.canvas.addCircles(this.artifactPlot.points);
    this.artifactPlot.lines.forEach(line => {
      this.canvas.addLine(line);
    });
  }

  ngOnInit() {
    this.canvasConfig = {
      container: d3.select(this._elementRef.nativeElement).select('#plot-container'),
      backgroundColor: '#252830',
      // domain: this.artifactPlot.domain || [0, 400],
      // range: this.artifactPlot.range || [0, 1],
      contextMenu: [
        {
          title: 'Add Breakpoint',
          action: this.addBreakpointAction.bind(this)
        }
      ]
    }

    this.canvas = new MspatSVGCanvas(this.canvasConfig);
    this.render();
  }

  ngOnChanges(c: SimpleChanges) {
    setTimeout(() => {
      this.render();
    })
  }

  addBreakpointAction(xCoord: number, yCoord: number) {
    this.addBreakpoint.emit(xCoord);
  }
}
