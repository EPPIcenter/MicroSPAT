import { Component, ChangeDetectionStrategy, OnChanges, Input, Output, EventEmitter } from '@angular/core';
import { FormControl, FormGroup, FormBuilder, Validators } from '@angular/forms';

import { Ladder } from 'app/models/ce/ladder';

@Component({
  selector: 'mspat-ladder-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card>
      <mat-card-header>
        <h3 *ngIf="!ladder">Create New Ladder</h3>
        <h3 *ngIf="ladder">Editing {{ladder.label}}</h3>
      </mat-card-header>
      <mat-card-content>
      <form [formGroup]="ladderForm">
        <mat-form-field [floatLabel]="'always'" >
          <mat-label>Label</mat-label>
          <input type="text" matInput formControlName="label">
        </mat-form-field>
        <mat-form-field [floatLabel]="'always'" >
          <mat-label>Base Sizes (Comma Separated)</mat-label>
          <input type="text" matInput formControlName="baseSizeString">
        </mat-form-field>
        <mat-form-field [floatLabel]="'always'" >
          <mat-label>SQ Flagging Limit</mat-label>
          <input type="number" min="0" matInput formControlName="sqLimit">
        </mat-form-field>
        <mat-form-field [floatLabel]="'always'" >
          <mat-label>Unusable SQ</mat-label>
          <input type="number" min="0" matInput formControlName="unusableSQLimit">
        </mat-form-field>
        <mat-form-field [floatLabel]="'always'" >
          <mat-label>Base Size Precision</mat-label>
          <input type="number" min="0" step="1" matInput formControlName="baseSizePrecision">
        </mat-form-field>
        <mat-form-field [floatLabel]="'always'" >
          <mat-label>Index Overlap</mat-label>
          <input type="number" min="0" step="1" matInput formControlName="indexOverlap">
        </mat-form-field>
        <mat-form-field [floatLabel]="'always'" >
          <mat-label>Min. Time</mat-label>
          <input type="number" min="0" step="1" matInput formControlName="minTime">
        </mat-form-field>
        <mat-form-field [floatLabel]="'always'" >
          <mat-label>Max. Peak Height</mat-label>
          <input type="number" min="0" step="1" matInput formControlName="maxPeakHeight">
        </mat-form-field>
        <mat-form-field [floatLabel]="'always'" >
          <mat-label>Min. Peak Height</mat-label>
          <input type="number" step="1" matInput formControlName="minPeakHeight">
        </mat-form-field>
        <mat-form-field [floatLabel]="'always'" >
          <mat-label>Outlier Limit</mat-label>
          <input type="number" min="0" step="1" matInput formControlName="outlierLimit">
        </mat-form-field>
        <mat-form-field [floatLabel]="'always'" >
          <mat-label>Max. Missing Peaks</mat-label>
          <input type="number" min="0" step="1" matInput formControlName="maximumMissingPeakCount">
        </mat-form-field>
        <mat-checkbox matInput formControlName="allowBleedthrough"><h6>Allow Bleedthrough</h6></mat-checkbox>
        <mat-checkbox matInput formControlName="outlierLimit"><h6>Outlier Limit</h6></mat-checkbox>
      </form>
      </mat-card-content>
      <mat-card-actions>
        <button mat-raised-button (click)="cancel.emit()">Cancel</button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    mat-card {
      width: 100%;
      height: 100%;
    }
  `]
})
export class LadderEditorComponent implements OnChanges {

  @Input() ladder: Ladder;
  @Output() cancel = new EventEmitter();

  private ladderForm: FormGroup;

  constructor(private fb: FormBuilder) {
    this.createForm();
  }

  ngOnChanges(change) {
    console.log(change);
    if (this.ladder) {
      this.setLadder(this.ladder);
    } else {
      this.createForm();
    }
  }

  setLadder(ladder: Ladder) {
    this.ladderForm.setValue({
      label: ladder.label,
      baseSizeString: ladder.base_sizes.join(', '),
      sqLimit: ladder.sq_limit,
      unusableSQLimit: ladder.unusable_sq_limit,
      baseSizePrecision: ladder.base_size_precision,
      indexOverlap: ladder.index_overlap,
      minTime: ladder.min_time,
      maxPeakHeight: ladder.max_peak_height,
      minPeakHeight: ladder.min_peak_height,
      outlierLimit: ladder.outlier_limit,
      maximumMissingPeakCount: ladder.maximum_missing_peak_count,
      allowBleedthrough: ladder.allow_bleedthrough,
      removeOutliers: ladder.remove_outliers,
      peakScannerSettings: {
        scanningMethod: ladder.scanning_method,
        maximaWindow: ladder.maxima_window,
        argrelmaxWindow: ladder.argrelmax_window,
        traceSmoothingWindow: ladder.trace_smoothing_window,
        traceSmoothingOrder: ladder.trace_smoothing_order,
        tophatFactor: ladder.tophat_factor,
        cwtMinWidth: ladder.cwt_min_width,
        cwtMaxWidth: ladder.cwt_max_width,
        minSNR: ladder.min_snr,
        noisePerc: ladder.noise_perc,
        gapThreshold: ladder.gap_threshold
      }
    });
  }

  createForm() {
    this.ladderForm = this.fb.group({
      label: ['', Validators.required],
      baseSizeString: ['', Validators.required],
      sqLimit: [1, Validators.required],
      unusableSQLimit: [10, Validators.required],
      baseSizePrecision: [2, Validators.required],
      indexOverlap: [15, Validators.required],
      minTime: [1200, Validators.required],
      maxPeakHeight: [12000, Validators.required],
      minPeakHeight: [200, Validators.required],
      outlierLimit: [3, Validators.required],
      maximumMissingPeakCount: [5, Validators.required],
      allowBleedthrough: [true, Validators.required],
      removeOutliers: [true, Validators.required],
      peakScannerSettings: this.fb.group({
        scanningMethod: 'relmax',
        maximaWindow: 10,
        argrelmaxWindow: 6,
        traceSmoothingWindow: 11,
        traceSmoothingOrder: 7,
        tophatFactor: 0.005,
        cwtMinWidth: 4,
        cwtMaxWidth: 15,
        minSNR: 3,
        noisePerc: 13,
        gapThreshold: 2
      })
    })
  }

}
