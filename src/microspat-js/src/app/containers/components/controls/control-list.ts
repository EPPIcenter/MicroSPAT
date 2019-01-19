import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { MatTableDataSource, MatSort } from '@angular/material';

import { Control } from 'app/models/sample/control';
import { BinEstimatorProject } from 'app/models/bin-estimator/project';

interface ControlRow {
  label: string;
  binEstimator: string;
}

@Component({
    selector: 'mspat-controls-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
      <div class="control-list">
        <mat-card *ngIf="controlsLoading">
          <mat-card-content>
            <div>
              <mat-spinner [diameter]="spinnerDiameter"></mat-spinner>
            </div>
          </mat-card-content>
        </mat-card>

        <div *ngIf="!controlsLoading" class="control-table mat-elevation-z8">
          <table mat-table [dataSource]="dataSource" matSort>

            <ng-container matColumnDef="label">
              <th mat-header-cell *matHeaderCellDef mat-sort-header> Label </th>
              <td mat-cell *matCellDef="let element"> {{element.label}} </td>
            </ng-container>

            <ng-container matColumnDef="binEstimator">
              <th mat-header-cell *matHeaderCellDef mat-sort-header> Bin Estimator </th>
              <td mat-cell *matCellDef="let element"> {{element.binEstimator}} </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns; sticky: true"></tr>
            <tr mat-row
              (click)="selectControl.emit(row.id)"
              [style.background] = "selectedControl && selectedControl.id === row.id ? 'lightblue' : ''"
              *matRowDef="let row; columns: displayedColumns">
            </tr>

          </table>
        </div>

      </div>
    `,
    styles: [`
      mat-spinner {
        margin: 0 auto;
      }

      .control-table {
        height: 95vh;
        overflow: auto;
      }

      table.mat-table {
        width: 100%;
      }

      .mat-row {
        height: 28px;
      }

      .mat-header-row {

      }

      .mat-row:hover {
        background-color: #C3CFE5
      }
    `],
})
export class ControlListComponent implements OnChanges {
  @ViewChild(MatSort) sort: MatSort;

  @Input() controls: Control[] = [];
  @Input() controlsLoading: boolean;
  @Input() selectedControl: Control;
  @Output() selectControl = new EventEmitter();

  public spinnerDiameter = 250;
  public dataSource: MatTableDataSource<ControlRow>;
  public displayedColumns = ['label', 'binEstimator'];

  private get _controls(): ControlRow[] {
    return this.controls.map((c: Control & ({bin_estimator: BinEstimatorProject})) => {
      return {
        id: c.id,
        label: c.barcode,
        binEstimator: c.bin_estimator.title
      }
    })
  }

  constructor() {
    this.dataSource = new MatTableDataSource(this._controls);
    this.dataSource.sort = this.sort;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.controls) {
      this.dataSource.data = this._controls;
      this.dataSource.sort = this.sort;
    }
  }
}
