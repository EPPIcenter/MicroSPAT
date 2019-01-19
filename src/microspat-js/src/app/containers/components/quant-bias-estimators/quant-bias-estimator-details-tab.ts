import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, SimpleChanges } from "@angular/core";
import { QuantificationBiasEstimatorProject } from 'app/models/quantification-bias-estimator/project';
import { BinEstimatorProject } from 'app/models/bin-estimator/project';
import { LocusSet } from 'app/models/locus/locus-set';
import { Task } from 'app/models/task';
import { ArtifactEstimatorProject } from 'app/models/artifact-estimator/project';


@Component({
  selector: 'mspat-quant-bias-estimator-details-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div class="details-container mat-elevation-z8 row">
    <div class="col-sm-12">
      <mat-form-field [floatLabel]="'always'">
        <mat-label>Title</mat-label>
        <input matInput [value]="quantBiasEstimator.title" disabled="true">
      </mat-form-field>
    </div>

    <div class="col-sm-12">
      <mat-form-field [floatLabel]="'always'">
        <mat-label>Creator</mat-label>
        <input matInput [value]="quantBiasEstimator.creator" disabled="true">
      </mat-form-field>
    </div>

    <div class="col-sm-12">
      <mat-form-field [floatLabel]="'always'">
        <mat-label>Description</mat-label>
        <textarea matInput [value]="quantBiasEstimator.description" disabled="true"></textarea>
      </mat-form-field>
    </div>

    <div class="col-sm-12">
      <mat-form-field [floatLabel]="'always'">
        <mat-label>Date Created</mat-label>
        <input matInput [value]="quantBiasEstimator.date" disabled="true">
      </mat-form-field>
    </div>

    <div class="col-sm-12">
      <mat-form-field [floatLabel]="'always'">
        <mat-label>Last Updated</mat-label>
        <input matInput [value]="quantBiasEstimator.last_updated" disabled="true">
      </mat-form-field>
    </div>

    <div class="col-sm-12">
      <mat-form-field [floatLabel]="'always'">
        <mat-label>Locus Set</mat-label>
        <input matInput [value]="locusSet.label" disabled="true">
      </mat-form-field>
    </div>

    <div class="col-sm-12">
      <mat-form-field [floatLabel]="'always'">
        <mat-label>Bin Estimator</mat-label>
        <input matInput [value]="binEstimator?.title" disabled="true">
      </mat-form-field>
    </div>

    <div class="col-sm-12">
      <mat-form-field [floatLabel]="'always'">
        <mat-label>Artifact Estimator</mat-label>
        <input matInput [value]="artifactEstimator?.title" disabled="true">
      </mat-form-field>
    </div>

    <div class="col-sm-12">

      <button mat-raised-button color="warn" [disabled]="!quantBiasEstimator?.detailed || anyTask" (click)="deleteClicked()"> DELETE </button>

      <div *ngIf="!quantBiasEstimator?.detailed || activeTask">
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
export class QuantificationBiasEstimatorProjectDetailsTabComponent {
  @Input() quantBiasEstimator: QuantificationBiasEstimatorProject;
  @Input() locusSet: LocusSet;
  @Input() binEstimator: BinEstimatorProject;
  @Input() artifactEstimator: ArtifactEstimatorProject;
  @Input() activeTasks: Task[];
  @Input() failedTasks: Task[];

  @Output() deleteAction: EventEmitter<number> = new EventEmitter();

  get activeTask() {
    return this.activeTasks.length > 0 ? this.activeTasks[0] : false;
  }

  get failedTask() {
    return this.failedTasks.length > 0 ? this.failedTasks[0] : false;
  }

  get anyTask() {
    return this.activeTask || this.failedTask;
  }

  deleteClicked() {
    this.deleteAction.emit(+this.quantBiasEstimator.id);
  }

  ngOnChanges(changes: SimpleChanges): void {
  }

  constructor() {}
}