import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, SimpleChange, SimpleChanges, OnChanges, ViewChild } from '@angular/core';
import { SelectionModel } from '@angular/cdk/collections';
import { MatTableDataSource, MatPaginator } from '@angular/material';

import { Sample } from '../../../models/sample/sample';

@Component({
  selector: 'mspat-sample-selector-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div class="sample-list mat-elevation-z8 row">
    <h6>{{header}}</h6>
    <div class="sample-table col-sm-12">
      <mat-form-field style="width: 100%;">
        <input matInput (keyup)="applyFilter($event.target.value)" placeholder="Filter">
      </mat-form-field>
      <table mat-table [dataSource]="dataSource">
        <ng-container matColumnDef="select">
          <th mat-header-cell *matHeaderCellDef>
            <mat-checkbox (change) = "$event ? masterToggle() : null"
                          [checked] = "selection.hasValue() && isAllSelected()"
                          [disabled] = "activeTasks?.length > 0"
                          [indeterminate] = "selection.hasValue() && !isAllSelected()">
            </mat-checkbox>
          </th>
          <td mat-cell class="sample-select" *matCellDef = "let row">
            <mat-checkbox (click) = "$event.stopPropagation()"
                          (change) = "$event ? selection.toggle(row) : null"
                          [disabled] = "activeTasks?.length > 0"
                          [checked] = "selection.isSelected(row)">
            </mat-checkbox>
          </td>
        </ng-container>

        <ng-container matColumnDef="barcode">
          <th mat-header-cell *matHeaderCellDef> Sample ID </th>
          <td mat-cell *matCellDef="let element"> {{element.barcode}} </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns; sticky: true"></tr>
        <tr mat-row (click) = "$event ? selection.toggle(row) : null" *matRowDef = "let row; columns: displayedColumns;">
        </tr>
      </table>
      <mat-paginator [pageSizeOptions]="[25, 50, 100]" showFirstLastButtons></mat-paginator>
    </div>
    <div class="col-sm-2">
      <button mat-raised-button color="primary" [disabled]="disabled || selection.selected.length === 0" (click)="buttonClicked()">{{selectButtonLabel}}</button>
    </div>
  </div>
  `,
  styles: [`
    .sample-list {
      display: flex;
      margin: 16px 16px 8px 16px;
      padding: 16px;
      border-radius: 8px;
      height: 90%;
    }

    .sample-table {
      height: 90%;
      overflow: auto;
      margin-bottom: 8px;
    }

    table.mat-table {
      width: 100%
    }

    .mat-row {
      height: 12px;
    }

    .mat-cell {
      font-size: 10px;
    }

    .sample-select {
      padding: 10px 0 0 0;
    }
  `]
})
export class SampleSelectorListComponent implements OnChanges {
  @Input() samples: Sample[];
  @Input() selectButtonLabel: string;
  @Input() header: string;
  @Input() disabled = false;
  @Input() activeTasks = [];

  @Output() selected: EventEmitter<number[]> = new EventEmitter();
  @ViewChild(MatPaginator) paginator: MatPaginator;

  public selection: SelectionModel<Sample>;

  public dataSource: MatTableDataSource<Sample>;
  public displayedColumns = ['select', 'barcode'];

  constructor() {
    const initialSelection = [];
    const allowMultiSelect = true;
    this.selection = new SelectionModel<Sample>(allowMultiSelect, initialSelection);
    this.dataSource = new MatTableDataSource(this.samples);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.samples) {
      if (changes.samples.firstChange) {
        this.dataSource.paginator = this.paginator;
      }
      this.dataSource.data = this.samples;
    }
  }

  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.filteredData.length;
    return numSelected === numRows;
  }

  masterToggle() {
    this.isAllSelected() ?
    this.selection.clear() :
    this.dataSource.filteredData.forEach(row => this.selection.select(row));
  }

  applyFilter(filterValue: string) {
    filterValue = filterValue.trim().toLowerCase();
    this.selection.clear();
    this.dataSource.filter = filterValue;
  }

  buttonClicked() {
    this.selected.emit(this.selectedSamples);
    this.selection.clear();
  }

  get selectedSamples() {
    return this.selection.selected.map(s => +s.id);
  }



}
