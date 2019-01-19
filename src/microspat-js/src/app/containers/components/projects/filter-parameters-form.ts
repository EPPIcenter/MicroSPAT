import { ChangeDetectionStrategy, Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { ControlContainer, FormBuilder, FormGroup, FormGroupDirective, Validators } from '@angular/forms';
import { AbstractParameterComponent } from '../parameters-component';

@Component({
  selector: 'mspat-filter-parameters',
  viewProviders: [
    {
      provide: ControlContainer,
      useExisting: FormGroupDirective,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings" formGroupName="filter_parameters">
      <h5>Filtering Parameters</h5>
      <mat-form-field floatLabel="always">
        <mat-label>Min. Peak Height</mat-label>
        <input type="number" min="0" step="50" matInput formControlName="min_peak_height">
      </mat-form-field>

      <mat-form-field floatLabel="always">
        <mat-label>Max. Peak Height</mat-label>
        <input type="number" min="0" step="50" matInput formControlName="max_peak_height">
      </mat-form-field>

      <mat-form-field floatLabel="always">
        <mat-label>Min. Peak Height Ratio</mat-label>
        <input type="number" min="0" max="1" step="0.01" matInput formControlName="min_peak_height_ratio">
      </mat-form-field>

      <mat-form-field floatLabel="always">
        <mat-label>Max. Bleedthrough</mat-label>
        <input type="number" min="0" step="0.1" matInput formControlName="max_bleedthrough">
      </mat-form-field>

      <mat-form-field floatLabel="always">
        <mat-label>Max Crosstalk</mat-label>
        <input type="number" min="0" step="0.1" matInput formControlName="max_crosstalk">
      </mat-form-field>

      <mat-form-field floatLabel="always">
        <mat-label>Min. Peak Distance</mat-label>
        <input type="number" min="0" step="0.1" matInput formControlName="min_peak_distance">
      </mat-form-field>

    </div>
  `,
  styles: [`
  .settings > * {
    width: 100%;
  }
  `],
})
export class FilterParametersFormComponent extends AbstractParameterComponent implements OnChanges {

  protected parameterValidators = {
    min_peak_height: [Validators.required, Validators.min(0)],
    max_peak_height: [Validators.required, Validators.min(0)],
    min_peak_height_ratio: [Validators.required, Validators.min(0), Validators.max(1)],
    max_bleedthrough: [Validators.required, Validators.min(0)],
    max_crosstalk: [Validators.required, Validators.min(0)],
    min_peak_distance: [Validators.required, Validators.min(0)],
  }

  constructor(protected parent: FormGroupDirective, protected fb: FormBuilder) {
    super(parent, fb, 'filter_parameters');
  }

}
