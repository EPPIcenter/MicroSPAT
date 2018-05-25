import { Component, ChangeDetectionStrategy, OnChanges, SimpleChanges, Input, ElementRef } from '@angular/core';
import { Trace, MspatCanvas, MspatCanvasConfig, Legend } from 'app/components/plots/canvas';
import * as d3 from 'd3';

@Component({
  selector: 'mspat-trace-display',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div id="trace-container"></div>
  `,

  styles: [`
    #trace-container {
      height: 100%;
      width: 100%
    }
  `]
})
export class TraceDisplayComponent implements OnChanges {
  @Input() traces: Trace[] = [];
  @Input() domain: [number, number] = [0, 400];
  @Input() range: [number, number];
  @Input() legend: Legend;
  @Input() active = false;

  private canvasConfig: MspatCanvasConfig;
  private canvas: MspatCanvas;

  constructor(private _elementRef: ElementRef) {
  }

  render() {
    if (!this.active) {
      return;
    }
    console.log(this.domain);
    d3.select(this._elementRef.nativeElement).select('#trace-container').select('*').remove();
    this.canvasConfig = {
      container: d3.select(this._elementRef.nativeElement).select('#trace-container'),
      backgroundColor: '#252830',
      domain: this.domain,
      range: this.range,
      colorMap: {
        'blue': '#00D5FF',
        'red': 'red',
        'green': 'green',
        'yellow': 'yellow'
      }
    };
    this.canvas = new MspatCanvas(this.canvasConfig);
    this.traces.forEach(trace => {
      this.canvas.addTrace(trace);
    });
    if (this.legend) {
      this.canvas.addLegend(this.legend);
    }
  }

  ngOnChanges(c: SimpleChanges) {
    setTimeout(() => {
      this.render();
    });
  }
}
