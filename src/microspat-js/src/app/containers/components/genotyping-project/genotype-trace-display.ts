import { ChangeDetectionStrategy, Component, Input, Output, ElementRef, EventEmitter, OnChanges, SimpleChanges, OnInit } from '@angular/core';
import * as d3 from 'd3';
import 'd3-svg-annotation';
import { MspatCanvasConfig, MspatSVGCanvas, Trace, Bar, Circle } from './../plots/canvas';

export interface TraceDisplay {
  domain: [number, number],
  range: [number, number],
  trace: Trace,
  bins: Bar[],
  peakAnnotations?: Circle[]
}

@Component({
  selector: 'mspat-genotype-trace-display',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="plot-container"></div>
  `,
  styles: [`
    #plot-container {
      height: 100%;
      width: 100%;
    }

  `]
})
export class GenotypeTraceDisplayComponent implements OnChanges, OnInit {
  @Input() traceDisplay: TraceDisplay;

  @Output() toggleAllele = new EventEmitter();

  private canvasConfig: MspatCanvasConfig;
  private canvas: MspatSVGCanvas;

  constructor(private _elementRef: ElementRef) {}

  render() {
    this.canvas.clear()

    if (!this.traceDisplay) {
      return;
    }

    this.canvas.resize(this.traceDisplay.domain, this.traceDisplay.range)

    this.canvas.addTrace(this.traceDisplay.trace);
    this.canvas.addBars(this.traceDisplay.bins, this.binClicked.bind(this));
    if (this.traceDisplay.peakAnnotations) {
      this.canvas.addCircles(this.traceDisplay.peakAnnotations, this.peakHover.bind(this));
    }

  }

  ngOnInit() {
    this.canvasConfig = {
      container: d3.select(this._elementRef.nativeElement).select('#plot-container'),
      backgroundColor: '#252830',
      // domain: this.traceDisplay.domain || [0, 1000],
      // range: this.traceDisplay.range || [0, 400]
    }
    this.canvas = new MspatSVGCanvas(this.canvasConfig);
    this.render();
  }

  ngOnChanges(c: SimpleChanges) {
    setTimeout(() => {
      this.render();
    })
  }

  binClicked(b: Bar) {
    this.toggleAllele.emit(b);
  }

  peakHover(p: Circle) {
  }
}
