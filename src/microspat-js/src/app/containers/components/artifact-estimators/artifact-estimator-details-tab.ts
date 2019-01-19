import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { ArtifactEstimatorProject } from '../../../models/artifact-estimator/project';
import { LocusSet } from '../../../models/locus/locus-set';
import { Task } from '../../../models/task';

@Component({
  selector: 'mspat-artifact-estimator-details-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
        <div class="details-container mat-elevation-z8 row">
          <div class="col-sm-12">
            <mat-form-field [floatLabel]="'always'">
              <mat-label>Title</mat-label>
              <input matInput [value]="artifactEstimatorProject.title" disabled="true">
            </mat-form-field>
          </div>

          <div class="col-sm-12">
            <mat-form-field [floatLabel]="'always'">
              <mat-label>Creator</mat-label>
              <input matInput [value]="artifactEstimatorProject.creator" disabled="true">
            </mat-form-field>
          </div>

          <div class="col-sm-12">
            <mat-form-field [floatLabel]="'always'">
              <mat-label>Description</mat-label>
              <textarea matInput [value]="artifactEstimatorProject.description" disabled="true"></textarea>
            </mat-form-field>
          </div>

          <div class="col-sm-12">
            <mat-form-field [floatLabel]="'always'">
              <mat-label>Date Created</mat-label>
              <input matInput [value]="artifactEstimatorProject.date" disabled="true">
            </mat-form-field>
          </div>

          <div class="col-sm-12">
            <mat-form-field [floatLabel]="'always'">
              <mat-label>Last Updated</mat-label>
              <input matInput [value]="artifactEstimatorProject.last_updated" disabled="true">
            </mat-form-field>
          </div>

          <div class="col-sm-12">
            <mat-form-field [floatLabel]="'always'">
              <mat-label>Locus Set</mat-label>
              <input matInput [value]="locusSet.label" disabled="true">
            </mat-form-field>
          </div>

          <div class="col-sm-12">

            <button mat-raised-button color="warn" [disabled]="!artifactEstimatorProject?.detailed || anyTask" (click)="deleteArtifactEstimator.emit(artifactEstimatorProject.id)"> DELETE </button>

            <div *ngIf="!artifactEstimatorProject?.detailed || activeTask">
              Loading Project...
              <mat-progress-bar mode='indeterminate'></mat-progress-bar>
            </div>

            <div *ngIf="anyTask">
              <mspat-task-progress-display *ngIf="failedTask" [task]="failedTask"></mspat-task-progress-display>
            </div>

          </div>
        </div>

  `,
  styles: [`
    .details-container {
      display: flex;
      margin: 16px;
      padding: 16px;
      border-radius: 8px;
      width: 98%;
    }

    mat-form-field {
      width: 100%;
    }
  `]
})

export class ArtifactEstimatorDetailsTabComponent {
  @Input() artifactEstimatorProject: ArtifactEstimatorProject;
  @Input() locusSet: LocusSet;
  @Input() activeTasks: Task[] = [];
  @Input() failedTasks: Task[] = [];

  @Output() deleteArtifactEstimator = new EventEmitter();

  get activeTask() {
    return this.activeTasks.length > 0 ? this.activeTasks[0] : false;
  }

  get failedTask() {
    return this.failedTasks.length > 0 ? this.failedTasks[0] : false;
  }

  get anyTask() {
    return this.activeTask || this.failedTask;
  }

  constructor() {}
}
