import { AbstractParameterComponent } from './../parameters-component';
import { FormGroupDirective, ControlContainer, FormBuilder, Validators } from '@angular/forms';
import { Component, ChangeDetectionStrategy } from '@angular/core';


export interface GenotypingProjectParameters {
  soft_artifact_sd_limit: number;
  hard_artifact_sd_limit: number;
  offscale_threshold: number;
  bleedthrough_filter_limit: number;
  crosstalk_filter_limit: number;
  relative_peak_height_limit: number;
  absolute_peak_height_limit: number;
  failure_threshold: number;
  probability_threshold: number;
  bootstrap_probability_threshold: number;
}

@Component({
  selector: 'mspat-genotyping-project-parameters',
  viewProviders: [
    {
      provide: ControlContainer,
      useExisting: FormGroupDirective
    }
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div class="settings" formGroupName="genotyping_project_parameters">
    <h5>Genotyping Settings</h5>
    <mat-form-field floatLabel="always">
      <mat-label>Soft Artifact SD. Limit</mat-label>
      <input type="number" min="0" step=".1" matInput formControlName="soft_artifact_sd_limit">
    </mat-form-field>

    <mat-form-field floatLabel="always">
      <mat-label>Hard Artifact SD. Limit</mat-label>
      <input type="number" min="0" step=".1" matInput formControlName="hard_artifact_sd_limit">
    </mat-form-field>

    <mat-form-field floatLabel="always">
      <mat-label>Offscale Threshold</mat-label>
      <input type="number" min="0" step="100" matInput formControlName="offscale_threshold">
    </mat-form-field>

    <mat-form-field floatLabel="always">
      <mat-label>Bleedthrough Ratio Limit</mat-label>
      <input type="number" min="0" step=".1" matInput formControlName="bleedthrough_filter_limit">
    </mat-form-field>

    <mat-form-field floatLabel="always">
      <mat-label>Crosstalk Ratio Limit</mat-label>
      <input type="number" min="0" step=".1" matInput formControlName="crosstalk_filter_limit">
    </mat-form-field>

    <mat-form-field floatLabel="always">
      <mat-label>Relative Peak Height Limit</mat-label>
      <input type="number" min="0" max="1" step=".01" matInput formControlName="relative_peak_height_limit">
    </mat-form-field>

    <mat-form-field floatLabel="always">
      <mat-label>Absolute Peak Height Limit</mat-label>
      <input type="number" min="0" step="100" matInput formControlName="absolute_peak_height_limit">
    </mat-form-field>

    <mat-form-field floatLabel="always">
      <mat-label>Failure Threshold</mat-label>
      <input type="number" min="0" step="100" matInput formControlName="failure_threshold">
    </mat-form-field>

    <mat-form-field floatLabel="always">
      <mat-label>Probability Threshold</mat-label>
      <input type="number" min="0" max="1" step=".01" matInput formControlName="probability_threshold">
    </mat-form-field>

    <mat-form-field floatLabel="always">
      <mat-label>Iterative Probability Threshold</mat-label>
      <input type="number" min="0" max="1" step=".01" matInput formControlName="bootstrap_probability_threshold">
    </mat-form-field>
  </div>
  `,
  styles: [`
    .settings > * {
      width: 50%;
      padding: 0px 18px 0px 0px;
    }
  `]
})
export class GenotypingProjectParametersFormComponent extends AbstractParameterComponent {
  protected parameterValidators = {
    soft_artifact_sd_limit: [Validators.required, Validators.min(0)],
    hard_artifact_sd_limit: [Validators.required, Validators.min(0)],
    offscale_threshold: [Validators.required, Validators.min(0)],
    bleedthrough_filter_limit: [Validators.required, Validators.min(0)],
    crosstalk_filter_limit: [Validators.required, Validators.min(0)],
    relative_peak_height_limit: [Validators.required, Validators.min(0), Validators.max(1)],
    absolute_peak_height_limit: [Validators.required, Validators.min(0)],
    failure_threshold: [Validators.required, Validators.min(0)],
    probability_threshold: [Validators.required, Validators.min(0), Validators.max(1)],
    bootstrap_probability_threshold: [Validators.required, Validators.min(0), Validators.max(1)]
  }

  constructor(protected parent: FormGroupDirective, protected fb: FormBuilder) {
    super(parent, fb, 'genotyping_project_parameters');
  }
}
