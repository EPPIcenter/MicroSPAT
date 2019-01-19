import { MatTableDataSource } from '@angular/material';
import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, SimpleChanges, OnChanges } from '@angular/core';

import { QuantificationBiasEstimatorProject } from 'app/models/quantification-bias-estimator/project';
import { Task } from 'app/models/task';

@Component({
  selector: 'mspat-quant-bias-estimator-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="quantification-bias-estimator-list">
      <mat-card *ngIf="quantificationBiasEstimatorProjectsLoading">
        <mat-card-content>
          <div>
            <mat-spinner [diameter]='spinnerDiameter'></mat-spinner>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card *ngIf="!quantificationBiasEstimatorProjectsLoading">
        <mat-card-header>
          <mat-card-title><h3>Quantification Bias Estimator Projects</h3></mat-card-title>
        </mat-card-header>
        <mat-divider [inset]="true"></mat-divider>
        <mat-card-content>
          <div class="quantification-bias-estimator-table">
            <table mat-table [dataSource]="dataSource">
              <ng-container matColumnDef="title">
                <th mat-header-cell *matHeaderCellDef> Title </th>
                <td mat-cell *matCellDef="let element"> {{element.title | truncate: 50}} </td>
              </ng-container>

              <ng-container matColumnDef="creator">
                <th mat-header-cell *matHeaderCellDef> Creator </th>
                <td mat-cell *matCellDef="let element"> {{element.creator | truncate: 50}} </td>
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
                (click) = "selectQuantificationBiasEstimatorProjectAction(row.id)"
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

    .quantification-bias-estimator-table {
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
export class QuantificationBiasEstimatorListComponent implements OnChanges {
  @Input() quantificationBiasEstimatorProjects: QuantificationBiasEstimatorProject[] = [];
  @Input() quantificationBiasEstimatorProjectsLoading: boolean;
  @Input() activeTasks: Task[] = []

  @Output() selectQuantificationBiasEstimatorProject: EventEmitter<number> = new EventEmitter();

  public spinnerDiameter = 250;

  public dataSource: MatTableDataSource<QuantificationBiasEstimatorProject>;
  public displayedColumns = ['title', 'creator', 'description', 'last_updated'];

  constructor() {
    this.dataSource = new MatTableDataSource(this.quantificationBiasEstimatorProjects);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.quantificationBiasEstimatorProjects) {
      this.dataSource.data = this.quantificationBiasEstimatorProjects;
    }
  }

  selectQuantificationBiasEstimatorProjectAction(e) {
    if (this.activeTasks.length === 0) {
      this.selectQuantificationBiasEstimatorProject.emit(e);
    }
  }
}
