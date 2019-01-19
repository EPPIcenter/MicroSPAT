import { MatTableDataSource } from '@angular/material';
import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, SimpleChanges, OnChanges } from '@angular/core';

import { ArtifactEstimatorProject } from '../../../models/artifact-estimator/project';
import { Task } from 'app/models/task';

@Component({
  selector: 'mspat-artifact-estimator-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="artifact-estimator-list">
      <mat-card *ngIf="artifactEstimatorsLoading">
        <mat-card-content>
          <div>
            <mat-spinner [diameter]='spinnerDiameter'></mat-spinner>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card *ngIf="!artifactEstimatorsLoading">
        <mat-card-header>
          <mat-card-title><h3>Artifact Estimator Projects</h3></mat-card-title>
        </mat-card-header>
        <mat-divider [inset]="true"></mat-divider>
        <mat-card-content>
          <div class="artifact-estimator-table">
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
                (click) = "selectArtifactEstimatorProjectAction(row.id)"
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

    .artifact-estimator-table {
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
export class ArtifactEstimatorListComponent implements OnChanges {

  @Input() artifactEstimatorProjects: ArtifactEstimatorProject[];
  @Input() artifactEstimatorProjectsLoading: boolean;
  @Input() artifactEstimatorsLoading = false;
  @Input() activeTasks: Task[] = [];

  @Output() selectArtifactEstimatorProject: EventEmitter<number> = new EventEmitter();

  public spinnerDiameter = 250;

  public dataSource: MatTableDataSource<ArtifactEstimatorProject>;
  public displayedColumns = ['title', 'creator', 'description', 'last_updated'];

  constructor() {
    this.dataSource = new MatTableDataSource(this.artifactEstimatorProjects);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.artifactEstimatorProjects) {
      this.dataSource.data = this.artifactEstimatorProjects;
    }
  }

  selectArtifactEstimatorProjectAction(e) {
    if (this.activeTasks.length === 0) {
      this.selectArtifactEstimatorProject.emit(e);
    }
  }
}
