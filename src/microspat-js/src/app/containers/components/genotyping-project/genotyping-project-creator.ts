import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

import { ArtifactEstimatorProject } from 'app/models/artifact-estimator/project';
import { BinEstimatorProject } from 'app/models/bin-estimator/project';
import { LocusSet } from 'app/models/locus/locus-set';
import { QuantificationBiasEstimatorProject } from 'app/models/quantification-bias-estimator/project';
import { Task } from 'app/models/task';

@Component({
  selector: 'mspat-genotyping-project-creator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <mat-card>
    <mat-card-header>
      <h3>Create New Genotyping Project</h3>
    </mat-card-header>
    <mat-divider [inset]='true'></mat-divider>
    <mat-card-content>
      <form [formGroup]="genotypingProjectForm" class="genotyping-project-form">
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
          <mat-select matInput formControlName="locus_set_id" (selectionChange)="locusSetChanged()">
            <mat-option *ngFor="let locusSet of locusSets" [value]="locusSet.id">{{locusSet.label}}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field [floatLabel]="'always'">
          <mat-label>Bin Estimator</mat-label>
          <mat-select matInput formControlName="bin_estimator_id">
            <mat-option *ngFor="let binEstimator of validBinEstimators" [value]="binEstimator.id">{{binEstimator.title}}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field [floatLabel]="'always'">
          <mat-label>Artifact Estimator</mat-label>
          <mat-select matInput formControlName="artifact_estimator_id">
            <mat-option [value]="null">No Artifact Estimator</mat-option>
            <mat-option *ngFor="let artifactEstimator of validArtifactEstimators" [value]="artifactEstimator.id">{{artifactEstimator.title}}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field [floatLabel]="'always'">
        <mat-label>Quantification Bias Estimator</mat-label>
        <mat-select matInput formControlName="quantification_bias_estimator_id">
          <mat-option [value]="null">No Quantifiaction Bias Estimator</mat-option>
          <mat-option *ngFor="let qbe of validQuantBiasEstimators" [value]="qbe.id">{{qbe.title}}</mat-option>
        </mat-select>
      </mat-form-field>

      </form>
    </mat-card-content>
    <mat-card-actions>
      <button mat-raised-button [disabled]="this.genotypingProjectForm.invalid || taskActive" color="primary" (click)="submitPressed()">SUBMIT</button>
    </mat-card-actions>
    <mat-card-footer>
      <mspat-task-progress-display *ngIf="activeTask" [task]="activeTask"></mspat-task-progress-display>
      <mspat-task-progress-display *ngIf="failedTask" [task]="failedTask"></mspat-task-progress-display>
    </mat-card-footer>
  </mat-card>
  `,
  styles: [`
    .genotyping-project-form {
      display: flex;
      flex-direction: column;
    }

    .genotyping-project-form > * {
      width: 100%;
    }

    mat-card-content {
      margin: 10px 0;
    }
  `]
})
export class GenotypingProjectCreatorComponent {
  @Input() locusSets: LocusSet[] = [];
  @Input() binEstimators: BinEstimatorProject[] = [];
  @Input() artifactEstimators: ArtifactEstimatorProject[] = [];
  @Input() quantificationBiasEstimators: QuantificationBiasEstimatorProject[] = [];

  @Input() activeTasks: Task[] = [];
  @Input() failedTasks: Task[] = [];

  @Output() submit = new EventEmitter();

  public genotypingProjectForm: FormGroup

  constructor() {
    this.createForm();
  }

  createForm() {
    this.genotypingProjectForm = new FormGroup({
      title: new FormControl({value: '', disabled: false}, Validators.required),
      creator: new FormControl({value: '', disabled: false}),
      description: new FormControl({value: '', disabled: false}),
      locus_set_id: new FormControl({value: null, disabled: false}, Validators.required),
      bin_estimator_id: new FormControl({value: null, disabled: true}, Validators.required),
      artifact_estimator_id: new FormControl({value: null, disabled: true}),
      quantification_bias_estimator_id: new FormControl({value: null, disabled: true})
    })
  }

  prepareSaveGenotypingProject() {
    const genotypingProjectModel = this.genotypingProjectForm.value;
    return genotypingProjectModel;
  }

  submitPressed() {
    if (this.genotypingProjectForm.valid) {
      this.submit.emit(this.prepareSaveGenotypingProject());
      this.createForm();
    }
  }

  locusSetChanged() {
    this.genotypingProjectForm.patchValue({
      bin_estimator_id: null,
      artifact_estimator_id: null,
      quantification_bias_estimator_id: null,
    })

    if (!this.activeLocusSetID) {
      this.genotypingProjectForm.controls.bin_estimator_id.disable();
      this.genotypingProjectForm.controls.artifact_estimator_id.disable();
      this.genotypingProjectForm.controls.quantification_bias_estimator_id.disable();
    } else {
      this.genotypingProjectForm.controls.bin_estimator_id.enable();
      this.genotypingProjectForm.controls.artifact_estimator_id.enable();
      this.genotypingProjectForm.controls.quantification_bias_estimator_id.enable();
    }
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

  get activeLocusSetID() {
    return this.genotypingProjectForm.value.locus_set_id ? this.genotypingProjectForm.value.locus_set_id : false;
  }

  get validBinEstimators() {
    return this.binEstimators.filter((be) => be.locus_set === this.activeLocusSetID);
  }

  get validArtifactEstimators() {
    return this.artifactEstimators.filter((ae) => ae.locus_set === this.activeLocusSetID);
  }

  get validQuantBiasEstimators() {
    return this.quantificationBiasEstimators.filter((qbe) => qbe.locus_set === this.activeLocusSetID);
  }
}
