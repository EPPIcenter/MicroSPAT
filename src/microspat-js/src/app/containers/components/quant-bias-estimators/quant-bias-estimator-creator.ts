import { FormGroup, FormBuilder, Validators, FormControl } from '@angular/forms';
import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, SimpleChanges } from '@angular/core';

import { LocusSet } from 'app/models/locus/locus-set';
import { Task } from 'app/models/task';
import { BinEstimatorProject } from 'app/models/bin-estimator/project';
import { ArtifactEstimatorProject } from 'app/models/artifact-estimator/project';

@Component({
  selector: 'mspat-quant-bias-estimator-creator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card>
      <mat-card-header>
        <h3>Create New Quantification Bias Estimator</h3>
      </mat-card-header>
      <mat-divider [inset]='true'></mat-divider>
      <mat-card-content>
        <form [formGroup]="quantificationBiasEstimatorForm" class="quantification-bias-estimator-form">

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

          <mat-form-field floatLabel="always">
            <mat-label>Locus Set</mat-label>
            <mat-select matInput formControlName="locus_set_id" (selectionChange)="locusSetChanged()">
              <mat-option *ngFor="let locusSet of locusSets" [value]="locusSet.id">{{locusSet.label}}</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field floatLabel='always'>
            <mat-label>Bin Estimator</mat-label>
            <mat-select matInput formControlName="bin_estimator_id">
              <mat-option *ngFor="let binEstimator of validBinEstimators" [value]="binEstimator.id">{{binEstimator.title}}</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field floatLabel='always'>
            <mat-label>Artifact Estimator</mat-label>
            <mat-select matInput formControlName="artifact_estimator_id">
              <mat-option *ngFor="let artifactEstimator of validArtifactEstimators" [value]="artifactEstimator.id">{{artifactEstimator.title}}</mat-option>
            </mat-select>
          </mat-form-field>

        </form>
      </mat-card-content>
      <mat-card-actions>
        <button mat-raised-button [disabled]="this.quantificationBiasEstimatorForm.invalid || taskActive" color="primary" (click)="submitPressed()">SUBMIT</button>
      </mat-card-actions>
      <mat-card-footer>
        <mspat-task-progress-display *ngIf="activeTask" [task]="activeTask"></mspat-task-progress-display>
        <mspat-task-progress-display *ngIf="failedTask" [task]="failedTask"></mspat-task-progress-display>
      </mat-card-footer>
    </mat-card>
  `,
  styles: [`
  .quantification-bias-estimator-form {
    display: flex;
    flex-direction: column;
  }

  .quantification-bias-estimator-form > * {
    width: 100%;
  }

  mat-card-content {
    margin: 10px 0;
  }
  `]
})

export class QuantificationBiasEstimatorCreatorComponent {

  @Input() locusSets: LocusSet[] = [];
  @Input() binEstimators: BinEstimatorProject[];
  @Input() artifactEstimators: ArtifactEstimatorProject[];
  @Input() activeTasks: Task[] = [];
  @Input() failedTasks: Task[] = [];

  @Output() submit = new EventEmitter();

  public quantificationBiasEstimatorForm: FormGroup

  constructor(private fb: FormBuilder) {
    this.createForm();
  };

  createForm() {
    this.quantificationBiasEstimatorForm = this.fb.group({
      title: ['', Validators.required],
      creator: ['', Validators.required],
      description: '',
      locus_set_id: [, Validators.required],
      bin_estimator_id: new FormControl({value: null, disabled: true}, Validators.required),
      artifact_estimator_id: new FormControl({value: null, disabled: true})
    })
  }

  ngOnChanges(changes: SimpleChanges): void {
  }

  prepareSaveQuantificationBiasEstimator() {
    const quantificationBiasEstimatorModel = this.quantificationBiasEstimatorForm.value;
    return quantificationBiasEstimatorModel;
  }

  submitPressed() {
    if (this.quantificationBiasEstimatorForm.valid) {
      this.submit.emit(this.prepareSaveQuantificationBiasEstimator());
      this.createForm();
    }
  }

  locusSetChanged() {
    this.quantificationBiasEstimatorForm.patchValue({
      bin_estimator_id: null
    })

    if(this.quantificationBiasEstimatorForm.value.locus_set_id == null) {
      this.quantificationBiasEstimatorForm.controls.bin_estimator_id.disable();
      this.quantificationBiasEstimatorForm.controls.artifact_estimator_id.disable();
    } else {
      this.quantificationBiasEstimatorForm.controls.bin_estimator_id.enable();
      this.quantificationBiasEstimatorForm.controls.artifact_estimator_id.enable();
    }
  }

  get validBinEstimators(): BinEstimatorProject[] {
    return this.binEstimators.filter(b => b.locus_set === this.quantificationBiasEstimatorForm.value.locus_set_id);
  }

  get validArtifactEstimators(): ArtifactEstimatorProject[] {
    return this.artifactEstimators.filter(a => a.locus_set === this.quantificationBiasEstimatorForm.value.locus_set_id);
  }

  get taskActive() {
    return this.activeTasks.length > 0;
  }

  get activeTask() {
    return this.activeTasks.length > 0 ? this.activeTasks[0] : false;
  }

  get failedTask() {
    return this.failedTasks.length > 0 ? this.failedTasks[0] : false;
  }
}
