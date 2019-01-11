import { Component, ChangeDetectionStrategy } from '@angular/core';
import { FormGroupDirective, ControlContainer, FormBuilder, Validators } from '@angular/forms';
import { AbstractParameterComponent } from '../parameters-component';

export interface BinEstimatorParameters {
  min_peak_frequency: number,
  default_bin_buffer: number
}

@Component({
  selector: 'mspat-bin-estimator-parameters',
  viewProviders: [
    {
      provide: ControlContainer,
      useExisting: FormGroupDirective
    }
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings" formGroupName="bin_estimator_parameters">
      <h5>Bin Estimator Settings</h5>
      <mat-form-field floatLabel="always">
        <mat-label>Min. Peak Frequency</mat-label>
        <input type="number" min="0" step="10" matInput formControlName="min_peak_frequency">
      </mat-form-field>

      <mat-form-field floatLabel="always">
        <mat-label>Default Bin Buffer</mat-label>
        <input type="number" min="0" step=".1" matInput formControlName="default_bin_buffer">
      </mat-form-field>

    </div>
  `,
  styles: [`
  .settings > * {
    width: 100%;
  }
  `]
})
export class BinEstimatorParametersFormComponent extends AbstractParameterComponent {

  protected parameterValidators = {
    min_peak_frequency: [Validators.required, Validators.min(0)],
    default_bin_buffer: [Validators.required, Validators.min(0)],
  }

  constructor(protected parent: FormGroupDirective, protected fb: FormBuilder) {
    super(parent, fb, 'bin_estimator_parameters')
  }

}
