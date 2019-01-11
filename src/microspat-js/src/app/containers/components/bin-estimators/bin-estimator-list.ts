import { Component, ChangeDetectionStrategy, EventEmitter, Output, Input, OnChanges, SimpleChanges } from '@angular/core';
import { BinEstimatorProject } from '../../../models/bin-estimator/project';
import { MatTableDataSource } from '@angular/material';
import { Task } from 'app/models/task';


@Component({
  selector: 'mspat-bin-estimator-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bin-estimator-list">
      <mat-card *ngIf="binEstimatorsLoading">
        <mat-card-content>
          <div>
            <mat-spinner [diameter]='spinnerDiameter'></mat-spinner>
          </div>
        </mat-card-content>
      </mat-card>
      <mat-card *ngIf="!binEstimatorsLoading">
        <mat-card-header>
          <mat-card-title><h3>Bin Estimator Projects</h3></mat-card-title>
        </mat-card-header>
        <mat-divider [inset]="true"></mat-divider>
        <mat-card-content>
          <div class="bin-estimator-table">
            <table mat-table [dataSource]="dataSource">

              <ng-container matColumnDef="title">
                <th mat-header-cell *matHeaderCellDef> Title </th>
                <td mat-cell *matCellDef="let element"> {{element.title}} </td>
              </ng-container>

              <ng-container matColumnDef="creator">
                <th mat-header-cell *matHeaderCellDef> Creator </th>
                <td mat-cell *matCellDef="let element"> {{element.creator}} </td>
              </ng-container>

              <ng-container matColumnDef="description">
                <th mat-header-cell *matHeaderCellDef> Description </th>
                <td mat-cell *matCellDef="let element"> {{element.description | truncate: 50}} </td>
              </ng-container>

              <ng-container matColumnDef="last_updated">
                <th mat-header-cell *matHeaderCellDef> Last Updated </th>
                <td mat-cell *matCellDef="let element"> {{element.last_updated | date}} </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="displayedColumns; sticky: true"></tr>
              <tr mat-row
              [ngClass] = "activeTasks.length > 0 ? 'project-row-active' : 'project-row-inactive'"
                (click) = "selectBinEstimator.emit(row.id)"
                *matRowDef = "let row; columns: displayedColumns">
              </tr>

            </table>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    mat-spinner {
      margin: 0 auto;
    }

    .bin-estimator-table {
      height: 80vh;
      overflow: auto;
    }

    table.mat-table {
      width: 100%;
    }

    .mat-row {
      height: 28px;
    }

    .project-row-active:hover {
      background-color: #C3CFE5
    }

    .project-row-inactive:hover {
      background-color: transparent
    }
    `
  ]
})
export class BinEstimatorListComponent implements OnChanges {

  @Input() binEstimators: BinEstimatorProject[];
  @Input() binEstimatorsLoading: boolean;
  @Input() activeTasks: Task[] = [];

  @Output() selectBinEstimator: EventEmitter<number> = new EventEmitter();

  public spinnerDiameter = 250;

  public dataSource: MatTableDataSource<BinEstimatorProject>;
  public displayedColumns = ['title', 'creator', 'description', 'last_updated'];

  constructor() {
    this.dataSource = new MatTableDataSource(this.binEstimators);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.binEstimators) {
      this.dataSource.data = this.binEstimators;
    }
  }

  selectBinEstimatorAction(e) {
    console.log(`Select Bin Estimator: ${e}, ${this.activeTasks.length === 0}`);
    if (this.activeTasks.length === 0) {
      this.selectBinEstimator.emit(e);
    }
  }
}
