import { BinEstimatorLocusParams } from '../../../models/bin-estimator/locus-params';
import { SelectionModel } from '@angular/cdk/collections';
import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, SimpleChanges, OnChanges } from '@angular/core';
import { FormGroup, FormBuilder } from '@angular/forms';
import { Task } from '../../../models/task';



@Component({
  selector: 'mspat-bin-estimator-analysis-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="parameter-settings row justify-content-center">
      <div class="col-sm-5">
        <mspat-locus-parameter-selector-list [locusParameters]="activeLocusParameters"
                                   [selection]="locusParameterSelection"
                                   [activeTasks]="activeTasks">
        </mspat-locus-parameter-selector-list>
      </div>
      <div class="col-sm-5 settings-card mat-elevation-z8">
        <form [formGroup]="form">
          <div class="row">
            <mspat-scanning-parameters [parameters]="selectedLocusParameters" class="col-sm-6"></mspat-scanning-parameters>
            <mspat-filter-parameters [parameters]="selectedLocusParameters" class="col-sm-6"></mspat-filter-parameters>
            <mspat-bin-estimator-parameters [parameters]="selectedLocusParameters" class="col-sm-6"></mspat-bin-estimator-parameters>
          </div>
          <div class="row">
            <div class="col-sm-8 button-row">
              <button mat-raised-button *ngIf="anySelected && !oneSelected" [disabled]="!anySelected || anyTask" color="primary" (click)="bulkAnalyze()">
                BULK ANALYZE
              </button>

              <button mat-raised-button [disabled]="!anySelected || anyTask" color="primary" (click)="applySettings()">
                <span *ngIf="oneSelected">ANALYZE</span>
                <span *ngIf="anySelected && !oneSelected">BULK APPLY SETTINGS</span>
                <span *ngIf="!anySelected">SELECT LOCUS</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
    <div *ngIf="anyTask" class="row justify-content-center task-progress">
      <div class="col-sm-10">
        <mspat-task-progress-display *ngIf="activeTask" [task]="activeTask"></mspat-task-progress-display>
        <mspat-task-progress-display *ngIf="failedTask" [task]="failedTask"></mspat-task-progress-display>
      </div>
    </div>
  `,
  styles: [`
    .parameter-settings {
      width: 100%
    }

    .task-progress {
      width: 90%
    }

    .settings-card {
      display: flex;
      margin: 16px;
      padding: 16px;
      border-radius: 8px;
      height: 90%;
    }

    button {
      margin: 5px;
    }
  `]
})
export class BinEstimatorAnalysisSettingsComponent implements OnChanges {

  @Input() activeLocusParameters: BinEstimatorLocusParams[];
  @Input() activeTasks: Task[] = [];
  @Input() failedTasks: Task[] = [];
  @Input() defaultParameters = {

    // Scanning Parameters
    scanning_method: 'relmax',
    maxima_window: 10,
    argrelmax_window: 6,
    trace_smoothing_window: 11,
    trace_smoothing_order: 7,
    tophat_factor: .005,
    cwt_min_width: 4,
    cwt_max_width: 15,
    min_snr: 3,
    noise_perc: 13,
    gap_threshold: 2,

    // Filter Parameters
    min_peak_height: 0,
    max_peak_height: 40000,
    min_peak_height_ratio: 0,
    max_bleedthrough: 10,
    max_crosstalk: 10,
    min_peak_distance: 2.2,

    // Bin Estimator Parameters
    min_peak_frequency: 10,
    default_bin_buffer: .75
  }

  @Output() analyzeLoci = new EventEmitter();

  form: FormGroup = new FormGroup({});
  locusParameterSelection: SelectionModel<BinEstimatorLocusParams>;

  constructor() {
    const initiallocusParameterSelection = [];
    const allowMultiSelect = true;
    this.locusParameterSelection = new SelectionModel<BinEstimatorLocusParams>(allowMultiSelect, initiallocusParameterSelection);
  }

  ngOnChanges(c: SimpleChanges) {
    if (c.activeLocusParameters) {
      const initialLocusParameterSelection = [];
      const allowMultiSelect = true;
      this.locusParameterSelection = new SelectionModel<BinEstimatorLocusParams>(
        allowMultiSelect, initialLocusParameterSelection
      );
    }
  }

  prepareParameterSettings() {
    return Object.assign({},
      this.form.get('bin_estimator_parameters').value,
      this.form.get('scanning_parameters').value,
      this.form.get('filter_parameters').value
    )
  }

  applySettings() {
    this.analyzeLoci.emit({
      locus_parameter_ids: this.locusParameterSelection.selected.map(e => e.id),
      parameter_settings: this.prepareParameterSettings()
    })
    this.locusParameterSelection.clear();
  }

  bulkAnalyze() {
    this.analyzeLoci.emit({
      locus_parameter_ids: this.locusParameterSelection.selected.map(e => e.id),
    })
    this.locusParameterSelection.clear();
  }

  get anySelected() {
    return this.locusParameterSelection.selected.length > 0;
  }

  get oneSelected() {
    return this.locusParameterSelection.selected.length === 1;
  }

  get selectedLocusParameters() {
    if (this.locusParameterSelection.selected.length === 1) {
      return this.locusParameterSelection.selected[0]
    } else {
      return this.defaultParameters;
    }
  }

  get activeTask() {
    return this.activeTasks.length > 0 ? this.activeTasks[0] : false;
  }

  get failedTask() {
    return this.failedTasks.length > 0 ? this.failedTasks[0] : false;
  }

  get anyTask() {
    return this.activeTask || this.failedTask;
  }
}
