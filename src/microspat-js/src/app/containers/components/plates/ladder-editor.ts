import { Component, ChangeDetectionStrategy, Input, Output, ElementRef, OnChanges, OnInit, EventEmitter } from '@angular/core';
import * as d3 from 'd3';
import { OnDestroy } from '@angular/core';
import { Well } from '../../../models/ce/well';
import { Task } from '../../../models/task';

@Component({
  selector: 'mspat-well-ladder-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-list id="ladder-editor">
      <mat-list-item id="ladder-plot">
        <div id="ladder-container"></div>
      </mat-list-item>
      <mat-list-item id="ladder-controls">
        <div class="button-row">
          <button color="primary" mat-raised-button
            (click)="recalculateWellLadder.emit()"
            [disabled]="tasksActive">
            Recalculate Ladder
          </button>
          <button color="warn" mat-raised-button
            [disabled]="tasksActive"
            (click)="clearPeakIndices.emit(activeWell.id)">
           Clear Peaks
          </button>
        </div>
        <div id="sizing-quality">
          <mat-chip-list>
            <mat-chip color="primary" selected="true">SQ: {{activeWell.sizing_quality | number}}</mat-chip>
          </mat-chip-list>
        </div>
      </mat-list-item>
    </mat-list>
  `,
  styles: [`
    button {
      margin: 0 5px
    }

    #sizing-quality {
      margin: 5px;
    }

    #ladder-editor {
      height: 100%
    }

    #ladder-plot {
      height: 90%
    }

    #ladder-controls {
      height: 10%
    }

    #ladder-container {
      height: 100%;
      width: 100%;
    }
  `]
})

export class WellLadderEditorComponent implements OnChanges, OnDestroy {
  @Input() data: number[];
  @Input() baseSizes: number[];
  @Input() peakIndices: number[];
  @Input() activeWell: Well;
  @Input() active: boolean;
  @Input() recalculateLadderTask: Task;
  @Input() failedRecalculateLadderTask: Task;
  @Input() tasksActive: boolean;

  @Output() setPeakIndices = new EventEmitter();
  @Output() recalculateWellLadder = new EventEmitter();
  @Output() clearPeakIndices = new EventEmitter();

  private canvas;
  private fullWidth: number;
  private fullHeight: number;
  private x;
  private y;
  private windowSize = 100;

  private xAxis;
  private yAxis;
  private line;
  private focus;
  private peaks;

  private maxI;

  constructor(private _elementRef: ElementRef) {}

  ngOnDestroy() {
    d3.select(this._elementRef.nativeElement).select('#ladder-container').select('*').remove();
  }

  renderCanvas() {
    d3.select(this._elementRef.nativeElement).select('#ladder-container').select('*').remove();
    if (!this.data) { return; }

    this.canvas = d3.select(this._elementRef.nativeElement).select('#ladder-container')
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('background-color', '#252830');
    this.fullWidth = parseInt(this.canvas.style('width'), 10);
    this.fullHeight = parseInt(this.canvas.style('height'), 10);
  }

  renderAxes() {
    if (!this.canvas) { return; }

    this.x = d3.scaleLinear()
      .domain([0, this.data.length])
      .range([0, this.fullWidth]);

    this.y = d3.scaleLinear()
      .domain([-200, d3.max(this.data) * 1.2 + 25])
      .range([this.fullHeight, 0]);

    this.xAxis = d3.axisBottom(this.x).tickSize(-this.fullHeight);
    this.yAxis = d3.axisLeft(this.y).ticks(8);

    this.canvas.append('svg:g')
      .attr('class', 'x axis')
      .attr('transform', 'translate(0,' + (this.fullHeight - 15) + ')')
      .style('font-size', 8)
      .call(this.xAxis);

    this.canvas.append('svg:g')
      .attr('class', 'y axis')
      .attr('transform', 'translate(35, 0)')
      .style('font-size', 8)
      .call(this.yAxis);
  }

  renderTrace() {
    if (!this.canvas) { return; }
    this.line = d3.line()
      .x(d => this.x(d[0]))
      .y(d => this.y(d[1]));

    const r = <[number, number][]> d3.zip(d3.range(this.data.length), this.data);
    this.canvas.append('svg:path')
      .attr('d', this.line(r))
      .style('stroke', '#5cb85c')
      .style('fill', 'none')
      .style('stroke-width', 1.5);
  }

  renderPeaks() {
    if (!this.canvas) { return; }
    this.canvas.select('.peak').remove();

    this.peaks = this.canvas.selectAll('.peak')
      .data(this.peakIndices, function(d) { return d; });

    const new_peaks = this.peaks.enter().append('svg:g')
      .attr('class', 'peak')
      .attr('transform', (d) => {
        return 'translate(' + this.x(d) + ',' + this.y(this.data[d]) + ')';
      });

    new_peaks.append('circle');
    new_peaks.append('text');

    new_peaks.selectAll('circle')
        .attr('r', 4.5)
        .style('fill', 'steelblue');

    new_peaks.selectAll('text')
        .text((d: number) => { return this.baseSizes[d]; })
        .attr('y', -9)
        .attr('dy', '.35em')
        .style('fill', 'white')
        .style('font-size', 8)
        .style('font', 'Helvetica');

    this.peaks.exit().remove();
  }

  renderFocus() {
    if (!this.canvas) { return; }

    this.focus = this.canvas.append('svg:g')
                    .attr('class', 'focus')
                    .style('display', 'none');
    this.focus.append('circle').attr('r', 4.5);
  }

  addCanvasOverlay() {
    if (!this.canvas) { return; }

    this.canvas.append('rect')
      .attr('class', 'overlay')
      .attr('width', this.fullWidth)
      .attr('height', this.fullHeight)
      .on('mouseover', () => {this.focus.style('display', null); })
      .on('mouseout', () => {this.focus.style('disply', 'none'); })
      .on('mousemove', () => this.mouseMove())
      .on('click', () => this.click());
  }

  mouseMove() {
    const x0 = this.x.invert(d3.mouse(this.canvas.node())[0]);
    const cursorPos = Math.round(x0);
    const searchWindow = this.data.slice(cursorPos - this.windowSize, cursorPos + this.windowSize);
    let peakInWindow = false;

    if (this.peakIndices) {
      this.peakIndices.forEach(pkIdx => {
        if (pkIdx > cursorPos - this.windowSize && pkIdx < cursorPos + this.windowSize) {
          peakInWindow = true;
          if (Math.abs(this.maxI - cursorPos) > Math.abs(pkIdx - cursorPos)) {
            this.maxI = pkIdx;
          }
        }
      });
    }

    if (!peakInWindow) {
      this.maxI = searchWindow.indexOf(d3.max(searchWindow)) + cursorPos - this.windowSize;
    }

    this.focus.attr('transform', 'translate(' + this.x(this.maxI) + ',' + this.y(this.data[this.maxI]) + ')');
  }

  click() {
    const filteredPeakIndices = this.peakIndices.filter(i => i !== this.maxI);
    if (filteredPeakIndices.length === this.peakIndices.length) {
      this.setPeakIndices.emit([...this.peakIndices, this.maxI]);
    } else {
      this.setPeakIndices.emit(filteredPeakIndices);
    }
  }

  ngOnChanges(c) {
    if (this.active) {
      setTimeout(() => {
        if (c.data || c.baseSizes || c.active) {
          this.renderCanvas();
          this.renderAxes();
          this.renderTrace();
          this.renderPeaks();
          this.renderFocus();
          this.addCanvasOverlay();
        } else if (c.peakIndices) {
          this.renderPeaks();
        }
      });
    }
  }

}
