import { AbstractParameterComponent } from '../parameters-component';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { FormGroupDirective, ControlContainer, FormBuilder, Validators } from '@angular/forms';

@Component({
  selector: 'mspat-scanning-parameters',
  viewProviders: [
    {
      provide: ControlContainer,
      useExisting: FormGroupDirective
    }
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings" formGroupName="scanning_parameters">
      <h5>Scanning Parameters</h5>
      <mat-form-field class="half-width" [floatLabel]="'always'">
        <mat-label>Maxima Window</mat-label>
        <input type="number" min="0" step="1" matInput formControlName="maxima_window">
      </mat-form-field>

      <mat-form-field class="half-width" [floatLabel]="'always'">
        <mat-label>Scanning Method</mat-label>
        <mat-select matInput formControlName="scanning_method">
          <mat-option *ngFor="let method of SCANNING_METHODS" [value]="method.value">
            {{method.label}}
          </mat-option>
        </mat-select>
      </mat-form-field>

      <div class="settings" *ngIf="form.get('scanning_parameters').get('scanning_method').value === 'cwt'">

        <mat-form-field class="half-width" [floatLabel]="'always'">
          <mat-label>CWT Min Width</mat-label>
          <input type="number" min="0" step="1" matInput formControlName="cwt_min_width">
        </mat-form-field>

        <mat-form-field class="half-width" [floatLabel]="'always'">
          <mat-label>CWT Max Width</mat-label>
          <input type="number" min="0" step="1" matInput formControlName="cwt_max_width">
        </mat-form-field>

        <mat-form-field class="half-width" [floatLabel]="'always'">
          <mat-label>Min. Signal to Noise Ratio</mat-label>
          <input type="number" min="0" step="1" matInput formControlName="min_snr">
        </mat-form-field>

        <mat-form-field class="half-width" [floatLabel]="'always'">
          <mat-label>Noise Percentile</mat-label>
          <input type="number" min="0" step="1" matInput formControlName="noise_perc">
        </mat-form-field>

        <mat-form-field class="half-width" [floatLabel]="'always'">
          <mat-label>Gap Threshold</mat-label>
          <input type="number" min="0" step="1" matInput formControlName="gap_threshold">
        </mat-form-field>

      </div>

      <div class="settings" *ngIf="form.get('scanning_parameters').get('scanning_method').value === 'relmax'">

        <mat-form-field class="half-width" [floatLabel]="'always'">
          <mat-label>Relative Maximum Window</mat-label>
          <input type="number" min="0" step="1" matInput formControlName="argrelmax_window">
        </mat-form-field>

        <mat-form-field class="half-width" [floatLabel]="'always'">
          <mat-label>Smoothing Window</mat-label>
          <input type="number" min="0" step="1" matInput formControlName="trace_smoothing_window">
        </mat-form-field>

        <mat-form-field class="half-width" [floatLabel]="'always'">
          <mat-label>Smoothing Order</mat-label>
          <input type="number" min="0" step="1" matInput formControlName="trace_smoothing_order">
        </mat-form-field>

        <mat-form-field class="half-width" [floatLabel]="'always'">
          <mat-label>Tophat Factor</mat-label>
          <input type="number" min="0" step=".001" matInput formControlName="tophat_factor">
        </mat-form-field>

      </div>

    </div>
  `,
  styles: [`
  .settings > * {
    width: 100%;
  }
  `]
})
export class ScanningParametersFormComponent extends AbstractParameterComponent {

  public SCANNING_METHODS = [
    {value: 'relmax', label: 'Relative Maximum'},
    {value: 'cwt', label: 'Continuous Wavelet Transform'},
  ]

  protected parameterValidators = {
    scanning_method: [Validators.required, Validators.min(0)],
    maxima_window: [Validators.required, Validators.min(0)],
    argrelmax_window: [Validators.required, Validators.min(0)],
    trace_smoothing_window: [Validators.required, Validators.min(0)],
    trace_smoothing_order: [Validators.required, Validators.min(0)],
    tophat_factor: [Validators.required, Validators.min(0)],
    cwt_min_width: [Validators.required, Validators.min(0)],
    cwt_max_width: [Validators.required, Validators.min(0)],
    min_snr: [Validators.required, Validators.min(0)],
    noise_perc: [Validators.required, Validators.min(0)],
    gap_threshold: [Validators.required, Validators.min(0)],
  }

  constructor(protected parent: FormGroupDirective, protected fb: FormBuilder) {
    super(parent, fb, 'scanning_parameters');
  }

}
