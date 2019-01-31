import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { BinEstimatorProject } from '../../../models/bin-estimator/project';
import { LocusSet } from '../../../models/locus/locus-set';
import { Task } from '../../../models/task';

@Component({
  selector: 'mspat-bin-estimator-details-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
        <div class="details-container mat-elevation-z8 row">
          <div class="col-sm-12">
            <mat-form-field [floatLabel]="'always'">
              <mat-label>Title</mat-label>
              <input matInput [value]="binEstimator.title" disabled="true">
            </mat-form-field>
          </div>

          <div class="col-sm-12">
            <mat-form-field [floatLabel]="'always'">
              <mat-label>Creator</mat-label>
              <input matInput [value]="binEstimator.creator" disabled="true">
            </mat-form-field>
          </div>

          <div class="col-sm-12">
            <mat-form-field [floatLabel]="'always'">
              <mat-label>Description</mat-label>
              <textarea matInput [value]="binEstimator.description" disabled="true"></textarea>
            </mat-form-field>
          </div>

          <div class="col-sm-12">
            <mat-form-field [floatLabel]="'always'">
              <mat-label>Date Created</mat-label>
              <input matInput [value]="binEstimator.date" disabled="true">
            </mat-form-field>
          </div>

          <div class="col-sm-12">
            <mat-form-field [floatLabel]="'always'">
              <mat-label>Last Updated</mat-label>
              <input matInput [value]="binEstimator.last_updated" disabled="true">
            </mat-form-field>
          </div>

          <div class="col-sm-12">
            <mat-form-field [floatLabel]="'always'">
              <mat-label>Locus Set</mat-label>
              <input matInput [value]="locusSet?.label" disabled="true">
            </mat-form-field>
          </div>

          <div class="col-sm-12">

            <button mat-raised-button color="warn" [disabled]="!binEstimator?.detailed || anyTask" (click)="deleteBinEstimator.emit(binEstimator.id)"> DELETE </button>

            <div *ngIf="!binEstimator?.detailed || activeTask">
              Loading Project...
              <mat-progress-bar mode='indeterminate'></mat-progress-bar>
            </div>

            <div *ngIf="failedTask">
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

export class BinEstimatorDetailsTabComponent {
  @Input() binEstimator: BinEstimatorProject;
  @Input() locusSet: LocusSet;
  @Input() activeTasks: Task[] = [];
  @Input() failedTasks: Task[] = [];

  @Output() deleteBinEstimator = new EventEmitter();

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
