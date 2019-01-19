import { Component, ChangeDetectionStrategy, OnChanges, Input, ElementRef, SimpleChanges, Output, EventEmitter, OnInit } from '@angular/core';
import * as d3 from 'd3';

import { Bar, Circle, MspatCanvasConfig, MspatSVGCanvas } from '../plots/canvas';

@Component({
  selector: 'mspat-bin-plot',
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
export class BinPlotComponent implements OnChanges, OnInit {
  @Input() bins: Bar[];
  @Input() domain: [number, number];
  @Input() peakAnnotations: Circle[];

  @Output() selectBin: EventEmitter<number> = new EventEmitter();
  @Output() addBin: EventEmitter<number> = new EventEmitter();

  private range: [number, number] = [-.1, 1.1]

  private canvasConfig: MspatCanvasConfig;
  private canvas: MspatSVGCanvas

  constructor(private _elementRef: ElementRef) {}

  render() {
    this.canvas.clear()

    if (this.bins.length === 0) {
      return
    }

    this.canvas.resize(this.domain, this.range);

    this.canvas.addBars(this.bins, this.binClicked.bind(this));
    if (this.peakAnnotations.length > 0) {
      this.canvas.addCircles(this.peakAnnotations);
    }
  }

  binClicked(b: Bar) {
    this.selectBin.emit(b.id);
  }

  addBinAction(xCoord: number, yCoord: number) {
    this.addBin.emit(xCoord);
  }

  ngOnInit() {
    this.canvasConfig = {
      container: d3.select(this._elementRef.nativeElement).select('#plot-container'),
      backgroundColor: '#252830',
      // domain: this.domain || [0, 400],
      // range: this.range,
      contextMenu: [
        {
          title: 'Add Bin',
          action: this.addBinAction.bind(this)
        }
      ]
    };
    this.canvas = new MspatSVGCanvas(this.canvasConfig);
    this.render();
  }

  ngOnChanges(c: SimpleChanges) {
    setTimeout(() => {
      this.render();
    })
  }

}
