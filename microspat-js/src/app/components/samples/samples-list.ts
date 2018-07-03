import { Component, ChangeDetectionStrategy, OnChanges, OnInit, Input, Output, EventEmitter, SimpleChanges, ViewChild } from '@angular/core';
import { Sample } from 'app/models/sample/sample';
import { MatTableDataSource, MatSort } from '@angular/material';



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

    <div *ngIf="!samplesLoading" class="sample-table-container mat-elevation-z8">
      <mat-form-field style="width: 100%;">
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
      height: 65vh;
      overflow: auto;
    }

    .sample-table-container {
      padding: 2px
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
  @Input() samplesLoading: boolean;
  @Output() selectSample: EventEmitter<number> = new EventEmitter();

  designations = {
    'sample': 'Sample',
    'negative_control': 'Negative Control',
    'positive_control': 'Positive Control'
  }

  private spinnerDiameter = 250;

  private dataSource: MatTableDataSource<Sample>;
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

  // ngOnInit() {
  //   this.dataSource.sort = this.sort;
  // }

  applyFilter(filterValue: string) {
    filterValue = filterValue.trim().toLowerCase();
    this.dataSource.filter = filterValue;
  }

}
