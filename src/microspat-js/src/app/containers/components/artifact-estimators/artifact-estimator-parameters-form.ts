import { Component, ChangeDetectionStrategy } from '@angular/core';
import { FormGroupDirective, ControlContainer, FormBuilder, Validators } from '@angular/forms';
import { AbstractParameterComponent } from '../parameters-component';

export interface ArtifactEstimatorParamters {
  min_peak_frequency: number,
  default_artifact_buffer: number
}

@Component({
  selector: 'mspat-artifact-estimator-parameters',
  viewProviders: [
    {
      provide: ControlContainer,
      useExisting: FormGroupDirective
    }
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings" formGroupName="artifact_estimator_parameters">
      <h5>Artifact Estimator Settings</h5>
      <mat-form-field floatLabel="always">
        <mat-label>Max. Secondary Relative Peak Height</mat-label>
        <input type="number" min="0" step="10" matInput formControlName="max_secondary_relative_peak_height">
      </mat-form-field>

      <mat-form-field floatLabel="always">
        <mat-label>Min. Artifact Peak Frequency</mat-label>
        <input type="number" min="0" step=".1" matInput formControlName="min_artifact_peak_frequency">
      </mat-form-field>

    </div>
  `,
  styles: [`
  .settings > * {
    width: 100%;
  }
  `]
})
export class ArtifactEstimatorParametersFormComponent extends AbstractParameterComponent {

  protected parameterValidators = {
    min_artifact_peak_frequency: [Validators.required, Validators.min(0)],
    max_secondary_relative_peak_height: [Validators.required, Validators.min(0)],
  }

  constructor(protected parent: FormGroupDirective, protected fb: FormBuilder) {
    super(parent, fb, 'artifact_estimator_parameters')
  }

}
