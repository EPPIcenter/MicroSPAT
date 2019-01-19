import { Component, ChangeDetectionStrategy } from '@angular/core';
import { FormGroupDirective, ControlContainer, FormBuilder, Validators } from '@angular/forms';
import { AbstractParameterComponent } from '../parameters-component';

export interface QuantificationBiasEstimatorParameters {
  offscale_threshold: number,
  min_bias_quantifier_peak_height: number,
  min_bias_quantifier_peak_proportion: number
}

@Component({
  selector: 'mspat-quant-bias-estimator-project-parameters',
  viewProviders: [
    {
      provide: ControlContainer,
      useExisting: FormGroupDirective
    }
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings" formGroupName="quantification_bias_estimator_parameters">
      <h5>Quantification Bias Estimator Settings</h5>

      <mat-form-field floatLabel="always">
        <mat-label>Offscale Threshold</mat-label>
        <input type="number" min="0" step="100" matInput formControlName="offscale_threshold">
      </mat-form-field>

      <mat-form-field floatLabel="always">
        <mat-label>Min. Peak Height</mat-label>
        <input type="number" min="0" step="100" matInput formControlName="min_bias_quantifier_peak_height">
      </mat-form-field>

      <mat-form-field floatLabel="always">
        <mat-label>Min. Peak Proportion</mat-label>
        <input type="number" min="0" step=".1" matInput formControlName="min_bias_quantifier_peak_proportion">
      </mat-form-field>

    </div>
  `,
  styles: [`
  .settings > * {
    width: 100%;
  }
  `]
})
export class QuantificationBiasEstimatorParametersFormComponent extends AbstractParameterComponent {

  protected parameterValidators = {
    offscale_threshold: [Validators.required, Validators.min(0)],
    min_bias_quantifier_peak_height: [Validators.required, Validators.min(0)],
    min_bias_quantifier_peak_proportion: [Validators.required, Validators.min(0), Validators.max(1)],
  }

  constructor(protected parent: FormGroupDirective, protected fb: FormBuilder) {
    super(parent, fb, 'quantification_bias_estimator_parameters')
  }

}
