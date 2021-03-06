import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { MatSort, MatTableDataSource } from '@angular/material';

import { Sample } from 'app/models/sample/sample';

@Component({
  selector: 'mspat-sample-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card *ngIf="samplesLoading" class="loading-indicator">
      <mat-card-content>
        <div>
          <mat-spinner [diameter]='spinnerDiameter'></mat-spinner>
        </div>
      </mat-card-content>
    </mat-card>

    <div *ngIf="!samplesLoading" class="sample-table-container">
      <mat-form-field class="sample-filter">
        <input matInput (keyup)="applyFilter($event.target.value)" placeholder="Filter">
      </mat-form-field>
      <div class="sample-table">
        <table mat-table [dataSource]="dataSource">
          <ng-container matColumnDef="barcode">
            <th mat-header-cell *matHeaderCellDef> Sample ID </th>
            <td mat-cell *matCellDef="let element"> {{element.barcode}} </td>
          </ng-container>

          <ng-container matColumnDef="designation">
            <th mat-header-cell *matHeaderCellDef> Designation </th>
            <td mat-cell *matCellDef="let element"> {{designations[element.designation]}} </td>
          </ng-container>

          <ng-container matColumnDef="last_updated">
            <th mat-header-cell *matHeaderCellDef> Last Updated </th>
            <td mat-cell *matCellDef="let element"> {{element.last_updated | date}} </td>
          </ng-container>

          <ng-container matColumnDef="total_runs">
            <th mat-header-cell *matHeaderCellDef> Runs </th>
            <td mat-cell *matCellDef="let element"> {{element.channels.length}} </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns; sticky: true"></tr>

          <tr mat-row (click) = "selectSample.emit(row.id)"
                      [style.background] = "selectedSample && selectedSample.id === row.id ? 'lightblue' : ''"
                      *matRowDef = "let row; columns: displayedColumns;"></tr>

        </table>
      </div>
    </div>
  `,
  styles: [`
    mat-spinner {
      margin: 0 auto;
    }

    .sample-table {
      height: calc(100% - 45px);
      overflow: auto;
    }

    .sample-filter {
      width: 100%;
      height: 35px;
      margin-bottom: 12px;
    }

    .sample-table-container {
      height: 100%;
      padding: 0 0 2px 0;
    }

    .mat-row {
      height: 28px;
    }

    .mat-header-row {
      height: 28px;
    }

    .mat-cell {
      font-size: 10px;
    }

    table.mat-table {
      width: 100%;
    }
  `]
})
export class SampleListComponent implements OnChanges {

  @ViewChild(MatSort) sort: MatSort;

  @Input() samples: Sample[] = [];
  @Input() selectedSample: Sample = null;
  @Input() samplesLoading = false;
  @Output() selectSample: EventEmitter<number> = new EventEmitter();

  designations = {
    sample: 'Sample',
    negative_control: 'Negative Control',
    positive_control: 'Positive Control',
  }

  public spinnerDiameter = 250;
  public dataSource: MatTableDataSource<Sample>;
  public displayedColumns = ['barcode', 'designation', 'last_updated', 'total_runs'];

  constructor() {
    this.dataSource = new MatTableDataSource(this.samples);
    this.dataSource.sort = this.sort;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.samples) {
      this.dataSource.data = this.samples;
    }
  }

  applyFilter(filterValue: string) {
    filterValue = filterValue.trim().toLowerCase();
    this.dataSource.filter = filterValue;
  }

}
