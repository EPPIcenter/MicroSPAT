import { Component, ChangeDetectionStrategy, OnChanges, Input, Output, EventEmitter } from '@angular/core';
import { FormGroup, FormBuilder, Validators, AbstractControl } from '@angular/forms';
import { Ladder } from 'app/models/ce/ladder';
import { Task } from 'app/models/task';

@Component({
  selector: 'mspat-ladder-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card>
      <mat-card-header>
        <h3 *ngIf="!ladder">Create New Ladder</h3>
        <h3 *ngIf="ladder">Editing {{ladder.label}}</h3>
      </mat-card-header>
      <mat-divider [inset]='true'></mat-divider>
      <mat-card-content>
      <form [formGroup]="ladderForm">
        <mat-tab-group>
          <mat-tab label="Ladder Settings">
              <mat-form-field class="half-width" [floatLabel]="'always'" >
                <mat-label>Label</mat-label>
                <input type="text" matInput formControlName="label">
              </mat-form-field>
              <mat-form-field class="half-width" [floatLabel]="'always'" >
                <mat-label>Base Sizes (Comma Separated)</mat-label>
                <textarea type="text" matInput formControlName="baseSizeString"></textarea>
              </mat-form-field>
              <mat-form-field class="half-width" [floatLabel]="'always'" >
                <mat-label>SQ Flagging Limit</mat-label>
                <input type="number" min="0" matInput formControlName="sqLimit">
              </mat-form-field>
              <mat-form-field class="half-width" [floatLabel]="'always'" >
                <mat-label>Unusable SQ</mat-label>
                <input type="number" min="0" matInput formControlName="unusableSQLimit">
              </mat-form-field>
              <mat-form-field class="half-width" [floatLabel]="'always'" >
                <mat-label>Base Size Precision</mat-label>
                <input type="number" min="0" step="1" matInput formControlName="baseSizePrecision">
              </mat-form-field>
              <mat-form-field class="half-width" [floatLabel]="'always'" >
                <mat-label>Index Overlap</mat-label>
                <input type="number" min="0" step="1" matInput formControlName="indexOverlap">
              </mat-form-field>
              <mat-form-field class="half-width" [floatLabel]="'always'" >
                <mat-label>Min. Time</mat-label>
                <input type="number" min="0" step="1" matInput formControlName="minTime">
              </mat-form-field>
              <mat-form-field class="half-width" [floatLabel]="'always'" >
                <mat-label>Max. Peak Height</mat-label>
                <input type="number" min="0" step="1" matInput formControlName="maxPeakHeight">
              </mat-form-field>
              <mat-form-field class="half-width" [floatLabel]="'always'" >
                <mat-label>Min. Peak Height</mat-label>
                <input type="number" step="1" matInput formControlName="minPeakHeight">
              </mat-form-field>
              <mat-form-field class="half-width" [floatLabel]="'always'" >
                <mat-label>Outlier Limit</mat-label>
                <input type="number" min="0" step="1" matInput formControlName="outlierLimit">
              </mat-form-field>
              <mat-form-field class="half-width" [floatLabel]="'always'" >
                <mat-label>Max. Missing Peaks</mat-label>
                <input type="number" min="0" step="1" matInput formControlName="maximumMissingPeakCount">
              </mat-form-field>
              <mat-form-field class="half-width" [floatLabel]="'always'">
                <mat-label>Color</mat-label>
                <mat-select matInput formControlName="color">
                  <mat-option *ngFor="let color of VALID_COLORS" [value]="color.value" [style.color]="color.value">
                    {{color.label}}
                  </mat-option>
                </mat-select>
              </mat-form-field>
              <div class="half-width">
                <mat-checkbox matInput formControlName="allowBleedthrough"><h6>Allow Bleedthrough</h6></mat-checkbox>
                <br>
                <mat-checkbox matInput formControlName="removeOutliers"><h6>Remove Outliers</h6></mat-checkbox>
              </div>
          </mat-tab>
          <mat-tab label="Peak Scanning Settings">
            <mat-form-field class="half-width" [floatLabel]="'always'">
              <mat-label>Maxima Window</mat-label>
              <input type="number" min="0" step="1" matInput formControlName="maximaWindow">
            </mat-form-field>
            <mat-form-field class="half-width" [floatLabel]="'always'">
              <mat-label>Scanning Method</mat-label>
              <mat-select matInput formControlName="scanningMethod">
                <mat-option *ngFor="let method of SCANNING_METHODS" [value]="method.value">
                  {{method.label}}
                </mat-option>
              </mat-select>
            </mat-form-field>
            <div *ngIf="ladderForm.get('scanningMethod').value === 'cwt'">
              <mat-form-field class="half-width" [floatLabel]="'always'">
                <mat-label>CWT Min Width</mat-label>
                <input type="number" min="0" step="1" matInput formControlName="cwtMinWidth">
              </mat-form-field>
              <mat-form-field class="half-width" [floatLabel]="'always'">
                <mat-label>CWT Max Width</mat-label>
                <input type="number" min="0" step="1" matInput formControlName="cwtMaxWidth">
              </mat-form-field>
              <mat-form-field class="half-width" [floatLabel]="'always'">
                <mat-label>Min. Signal to Noise Ratio</mat-label>
                <input type="number" min="0" step="1" matInput formControlName="minSNR">
              </mat-form-field>
              <mat-form-field class="half-width" [floatLabel]="'always'">
                <mat-label>Noise Percentile</mat-label>
                <input type="number" min="0" step="1" matInput formControlName="noisePerc">
              </mat-form-field>
              <mat-form-field class="half-width" [floatLabel]="'always'">
                <mat-label>Gap Threshold</mat-label>
                <input type="number" min="0" step="1" matInput formControlName="gapThreshold">
              </mat-form-field>
            </div>
            <div *ngIf="ladderForm.get('scanningMethod').value === 'relmax'">
              <mat-form-field class="half-width" [floatLabel]="'always'">
                <mat-label>Relative Maximum Window</mat-label>
                <input type="number" min="0" step="1" matInput formControlName="argrelmaxWindow">
              </mat-form-field>
              <mat-form-field class="half-width" [floatLabel]="'always'">
                <mat-label>Smoothing Window</mat-label>
                <input type="number" min="0" step="1" matInput formControlName="traceSmoothingWindow">
              </mat-form-field>
              <mat-form-field class="half-width" [floatLabel]="'always'">
                <mat-label>Smoothing Order</mat-label>
                <input type="number" min="0" step="1" matInput formControlName="traceSmoothingOrder">
              </mat-form-field>
              <mat-form-field class="half-width" [floatLabel]="'always'">
                <mat-label>Tophat Factor</mat-label>
                <input type="number" min="0" step=".001" matInput formControlName="tophatFactor">
              </mat-form-field>
            </div>
          </mat-tab>
        </mat-tab-group>
        </form>
      </mat-card-content>
      <mat-card-actions>
      <button mat-raised-button [disabled]="this.ladderForm.invalid" color="primary" (click)="submitPressed()">SUBMIT</button>
        <button mat-raised-button color="primary" (click)="cancelPressed()">CANCEL</button>
      </mat-card-actions>
      <mat-card-footer>
        <mspat-task-progress-display *ngIf="activeSaveLadderTask" [task]="activeSaveLadderTask"></mspat-task-progress-display>
        <mspat-task-progress-display *ngIf="failedSaveLadderTask" [task]="failedSaveLadderTask"></mspat-task-progress-display>
      </mat-card-footer>
    </mat-card>
  `,
  styles: [`
    mat-card {
      width: 100%;
      height: 100%;
    }

    .half-width {
      width: 45%;
      margin: 5px;
    }

    .full-width {
      width: 100%
    }
  `]
})
export class LadderEditorComponent implements OnChanges {

  @Input() ladder: Ladder;
  @Input() activeTasks: Task[];
  @Input() activeSaveLadderTasks: Task[];
  @Input() failedSaveLadderTasks: Task[];
  @Output() cancel = new EventEmitter();
  @Output() submit = new EventEmitter();

  private ladderForm: FormGroup;

  VALID_COLORS = [
    {value: 'red', label: 'Red'},
    {value: 'yellow', label: 'Yellow'},
    {value: 'green', label: 'Green'},
    {value: 'blue', label: 'Blue'},
    {value: 'orange', label: 'Orange'}
  ]

  SCANNING_METHODS = [
    {value: 'cwt', label: 'Continuous Wavelet Transform'},
    {value: 'relmax', label: 'Relative Maximum'}
  ]

  constructor(private fb: FormBuilder) {
    this.createForm();
  }

  baseSizeValidator(ctrl: AbstractControl): {[key: string]: any} | null {
    const baseSizes = ctrl.value.split(',').map(t => +t).every(Number.isInteger);
    console.log('Base Sizes Valid', baseSizes);
    return baseSizes ? null : {'improperBaseSizes': ctrl.value};
  }

  ngOnChanges(change) {
    if (this.ladder) {
      this.setLadder(this.ladder);
    }
  }

  cancelPressed() {
    this.cancel.emit();
    this.createForm();
  }

  prepareSaveLadder(): Ladder {
    const ladderModel = this.ladderForm.value;

    const newLadder: Ladder = {
      id: null,
      label: ladderModel.label,
      base_sizes: ladderModel.baseSizeString.split(',').map(t => +t),
      sq_limit: ladderModel.sqLimit,
      unusable_sq_limit: ladderModel.unusableSQLimit,
      base_size_precision: ladderModel.baseSizePrecision,
      index_overlap: ladderModel.index_overlap,
      min_time: ladderModel.minTime,
      max_peak_height: ladderModel.maxPeakHeight,
      min_peak_height: ladderModel.min_peak_height,
      outlier_limit: ladderModel.outlierLimit,
      maximum_missing_peak_count: ladderModel.maximumMissingPeakCount,
      color: ladderModel.color,
      allow_bleedthrough: ladderModel.allowBleedthrough,
      remove_outliers: ladderModel.removeOutliers,
      scanning_method: ladderModel.scanningMethod,
      maxima_window: ladderModel.maxima_window,
      argrelmax_window: ladderModel.argrelmaxWindow,
      trace_smoothing_window: ladderModel.traceSmoothingWindow,
      trace_smoothing_order: ladderModel.traceSmoothingOrder,
      tophat_factor: ladderModel.tophatFactor,
      cwt_min_width: ladderModel.cwt_min_width,
      cwt_max_width: ladderModel.cwt_max_width,
      min_snr: ladderModel.minSNR,
      noise_perc: ladderModel.noisePerc,
      gap_threshold: ladderModel.gapThreshold
    }

    if (this.ladder) {
      newLadder.id = this.ladder.id;
    }

    return newLadder
  }

  submitPressed() {
    if (this.ladderForm.valid) {
      const l = this.prepareSaveLadder();
      this.submit.emit(l);
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
      color: ladder.color,
      allowBleedthrough: ladder.allow_bleedthrough,
      removeOutliers: ladder.remove_outliers,
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
    });
  }

  createForm() {
    this.ladderForm = this.fb.group({
      label: ['', Validators.required],
      baseSizeString: ['', [Validators.required, this.baseSizeValidator]],
      sqLimit: [1, Validators.required],
      unusableSQLimit: [10, Validators.required],
      baseSizePrecision: [2, Validators.required],
      indexOverlap: [15, Validators.required],
      minTime: [1200, Validators.required],
      maxPeakHeight: [12000, Validators.required],
      minPeakHeight: [200, Validators.required],
      outlierLimit: [3, Validators.required],
      maximumMissingPeakCount: [5, Validators.required],
      color: ['red', Validators.required],
      allowBleedthrough: [true, Validators.required],
      removeOutliers: [true, Validators.required],
      scanningMethod: ['relmax', Validators.required],
      maximaWindow: [10, Validators.required],
      argrelmaxWindow: [6, Validators.required],
      traceSmoothingWindow: [11, Validators.required],
      traceSmoothingOrder: [7, Validators.required],
      tophatFactor: [0.005, Validators.required],
      cwtMinWidth: [4, Validators.required],
      cwtMaxWidth: [15, Validators.required],
      minSNR: [3, Validators.required],
      noisePerc: [13, Validators.required],
      gapThreshold: [2, Validators.required]
    })
  }

  get taskActive() {
    return this.activeTasks.length > 0;
  }

  get activeSaveLadderTask() {
    return this.activeSaveLadderTasks.length > 0 ? this.activeSaveLadderTasks[0] : false;
  }

  get failedSaveLadderTask() {
    return this.failedSaveLadderTasks.length > 0 ? this.failedSaveLadderTasks[0] : false;
  }


}
