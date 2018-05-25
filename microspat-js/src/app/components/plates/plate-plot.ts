import { Component, ChangeDetectionStrategy, Input, ElementRef, EventEmitter,  Output, OnChanges, OnDestroy} from '@angular/core';
import { Square } from 'app/models/square';
import * as d3 from 'd3';
import { SimpleChanges } from '@angular/core/src/metadata/lifecycle_hooks';


@Component({
  selector: 'mspat-plate-plot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="plot-container"></div>
  `,
  styles: [`
    #plot-container {
      height: 95%;
      width: 100%;
    }
  `]
})
export class PlatePlotComponent implements OnChanges, OnDestroy {
  @Input() squares: Square[];
  @Input() wellArrangement: number;
  @Input() active: boolean;
  @Output() wellSelected = new EventEmitter();

  private rowIndexMapping = {
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

  private rowLength: number;
  private colLength: number;
  private rowPadding = 1;
  private colPadding = 1;

  constructor(
    private _elementRef: ElementRef
  ) {

  }

  getRowIndex(well_label: string) {
    return this.rowIndexMapping[well_label.slice(0, 1)];
  }

  getColIndex(well_label: string) {
    return +well_label.slice(1) - 1;
  }

  ngOnDestroy() {
    d3.select(this._elementRef.nativeElement).select('#plot-container').select('*').remove();
  }


  render() {
    if (!this.active) {
      return;
    }

    d3.select(this._elementRef.nativeElement).select('#plot-container').select('*').remove();
    if (this.wellArrangement === 96) {
      this.rowLength = 12;
      this.colLength = 8;
    } else {
      this.rowLength = 24;
      this.colLength = 16;
    }

    const canvas = d3.select(this._elementRef.nativeElement).select('#plot-container').append<SVGElement>('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('background-color', '#252830');

    const full_width = parseInt(canvas.style('width'), 10);
    const full_height = parseInt(canvas.style('height'), 10);
    if (!full_height || !full_width) {
      return;
    }

    const width = Math.max(full_width - ((this.rowLength + 1) * this.rowPadding), 0);
    const height = Math.max(full_height - ((this.colLength + 1) * this.colPadding), 0);

    canvas.selectAll('rect')
      .data(this.squares)
      .enter().append('rect')
      .attr('x', d => this.getColIndex(d.wellLabel) * (full_width / this.rowLength) + this.rowPadding)
      .attr('y', d => this.getRowIndex(d.wellLabel) * (full_height / this.colLength) + this.colPadding)
      .attr('width', width / this.rowLength)
      .attr('height', height / this.colLength)
      .attr('stroke', d => {
        if (d.border) {
          return d.border;
        } else {
          return 'black';
        }
      })
      .attr('stroke-width', d => {
        if (d.border) {
          return 3;
        } else {
          return 0;
        }
      })
      .attr('fill', d => d.color)
      .attr('opacity', d => d.disabled ? 0.5 : 1)
      .on('click', d => {
        if (d.disabled) {
          return;
        }
        this.wellSelected.emit(d.id);
      });
  }

  ngOnChanges(c: SimpleChanges) {
    console.log(c);
    setTimeout(() => {
      if (this.active) {
        this.render();
      }
    });
  }

}
