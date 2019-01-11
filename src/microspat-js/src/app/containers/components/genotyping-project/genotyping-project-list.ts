import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, SimpleChanges, OnChanges } from '@angular/core';

import { GenotypingProject } from 'app/models/genotyping/project';
import { MatTableDataSource } from '@angular/material';
import { Task } from 'app/models/task';


@Component({
  selector: 'mspat-genotyping-project-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="genotyping-project-list">
      <mat-card *ngIf="genotypingProjectsLoading">
        <mat-card-content>
          <div>
            <mat-spinner [diameter]='spinnerDiameter'></mat-spinner>
          </div>
        </mat-card-content>
      </mat-card>
      <mat-card *ngIf="!genotypingProjectsLoading">
        <mat-card-header>
          <mat-card-title><h3>Genotyping Projects</h3></mat-card-title>
        </mat-card-header>
        <mat-divider [inset]="true"></mat-divider>
        <mat-card-content>
          <div class="genotyping-project-table">
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
                (click) = "selectGenotypingProjectAction(row.id)"
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

    .genotyping-project-table {
      height: calc(90vh - 40px);
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
export class GenotypingProjectListComponent implements OnChanges {
  @Input() genotypingProjects: GenotypingProject[];
  @Input() genotypingProjectsLoading: boolean;
  @Input() activeTasks: Task[] = [];

  @Output() selectGenotypingProject: EventEmitter<number> = new EventEmitter();

  public spinnerDiameter = 250;

  public dataSource: MatTableDataSource<GenotypingProject>;
  public displayedColumns = ['title', 'creator', 'description', 'last_updated'];

  constructor() {
    this.dataSource = new MatTableDataSource(this.genotypingProjects);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.genotypingProjects) {
      this.dataSource.data = this.genotypingProjects;
    }
  }

  selectGenotypingProjectAction(e) {
    if (this.activeTasks.length === 0) {
      this.selectGenotypingProject.emit(e)
    }
  }

}
