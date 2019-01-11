import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';

import { LocusSet } from 'app/models/locus/locus-set';
import { Task } from 'app/models/task';


@Component({
  selector: 'mspat-bin-estimator-creator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card>
      <mat-card-header>
        <h3>Create New Bin Estimator</h3>
      </mat-card-header>
      <mat-divider [inset]='true'></mat-divider>
      <mat-card-content>
        <form [formGroup]="binEstimatorForm" class="bin-estimator-form">
          <mat-form-field floatLabel="always">
            <mat-label>Title</mat-label>
            <input type="text" matInput formControlName="title">
          </mat-form-field>

          <mat-form-field floatLabel="always">
            <mat-label>Creator</mat-label>
            <input type="text" matInput formControlName="creator">
          </mat-form-field>

          <mat-form-field floatLabel="always">
            <mat-label>Description</mat-label>
            <textarea matInput formControlName="description"></textarea>
          </mat-form-field>

          <mat-form-field [floatLabel]="'always'">
            <mat-label>Locus Set</mat-label>
            <mat-select matInput formControlName="locus_set_id">
              <mat-option *ngFor="let locusSet of locusSets" [value]="locusSet.id">{{locusSet.label}}</mat-option>
            </mat-select>
          </mat-form-field>
        </form>
      </mat-card-content>
      <mat-card-actions>
        <button mat-raised-button [disabled]="this.binEstimatorForm.invalid || anyTask" color="primary" (click)="submitPressed()">SUBMIT</button>
      </mat-card-actions>
      <mat-card-footer>
        <mspat-task-progress-display *ngIf="activeTask" [task]="activeTask"></mspat-task-progress-display>
        <mspat-task-progress-display *ngIf="failedTask" [task]="failedTask"></mspat-task-progress-display>
      </mat-card-footer>
    </mat-card>
  `,
  styles: [`
  .bin-estimator-form {
    display: flex;
    flex-direction: column;
  }

  .bin-estimator-form > * {
    width: 100%;
  }

  mat-card-content {
    margin: 10px 0;
  }
  `]
})
export class BinEstimatorCreatorComponent {

  @Input() locusSets: LocusSet[] = [];
  @Input() activeTasks: Task[] = [];
  @Input() failedTasks: Task[] = [];

  @Output() submit = new EventEmitter();

  public binEstimatorForm: FormGroup

  constructor(private fb: FormBuilder) {
    this.createForm();
  };

  createForm() {
    this.binEstimatorForm = this.fb.group({
      title: ['', Validators.required],
      creator: '',
      description: '',
      locus_set_id: [, Validators.required]
    })
  }

  prepareSaveBinEstimator() {
    const binEstimatorModel = this.binEstimatorForm.value;
    return binEstimatorModel;
  }

  submitPressed() {
    if (this.binEstimatorForm.valid) {
      this.submit.emit(this.prepareSaveBinEstimator());
      this.createForm();
    }
  }

  get anyTask() {
    return this.activeTask || this.failedTask;
  }

  get activeTask() {
    return this.activeTasks.length > 0 ? this.activeTasks[0] : false;
  }

  get failedTask() {
    return this.failedTasks.length > 0 ? this.failedTasks[0] : false;
  }
}
