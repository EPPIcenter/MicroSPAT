import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, SimpleChanges, OnChanges } from '@angular/core';

import { Bar, Circle } from '../plots/canvas';
import { LocusBinSet } from 'app/models/bin-estimator/locus-bin-set';
import { Locus } from 'app/models/locus/locus';
import { Bin } from 'app/models/bin-estimator/bin';
import { Task } from 'app/models/task';


@Component({
  selector: 'mspat-bin-estimator-bins-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bin-estimator-tab row">
      <div class="col-sm-4">
        <mspat-project-locus-list [loci]="loci"
                                  [selected]="activeLocusBinSetID"
                                  (select)="selectLocusBinSet.emit($event)">
        </mspat-project-locus-list>
      </div>
      <div class="col-sm-8">
        <div class="row">
          <div *ngIf="bins.length > 0" class="bin-plot-container mat-elevation-z8 col-sm-12">
            <mspat-bin-plot *ngIf="selectedLocus"
                            [bins]="bins"
                            [peakAnnotations]="peakAnnotations"
                            [domain]="locusDomain"
                            (selectBin)="selectBin.emit($event)"
                            (addBin)="addBinClicked($event)">
            </mspat-bin-plot>
          </div>
          <div *ngIf="selectedBin" class="bin-info-container mat-elevation-z8 col-sm-12">
            <div class="container">
              <div class="bin-form">
                <form [formGroup]="binForm">

                  <mat-form-field floatLabel="always">
                    <mat-label>Label</mat-label>
                    <input type="text" matInput formControlName="label">
                  </mat-form-field>

                  <mat-form-field floatLabel="always">
                    <mat-label>Bin Center</mat-label>
                    <input type="number" min="1" step=".1" matInput formControlName="base_size">
                  </mat-form-field>

                  <mat-form-field floatLabel="always">
                    <mat-label>Bin Buffer</mat-label>
                    <input type="number" min='0' step=".01" matInput formControlName="bin_buffer">
                  </mat-form-field>

                </form>
              </div>
              <div class='bin-buttons'>
                <button mat-raised-button color="primary"
                  [disabled]='binForm.pristine || taskActive'
                  (click)="saveBinClicked()" >SAVE BIN</button>
                <button mat-raised-button color="warn"
                  [disabled]="taskActive"
                  (click)="deleteBinClicked()" >DELETE BIN</button>
              </div>
              <mspat-task-progress-display *ngIf="activeTask" [task]="activeTask"></mspat-task-progress-display>
              <mspat-task-progress-display *ngIf="failedTask" [task]="failedTask"></mspat-task-progress-display>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .bin-buttons button {
      margin: 3px;
    }

    .container {
      position: relative;
    }

    mat-form-field {
      width: 100%;
      margin: 5px;
    }

    .bin-estimator-tab {
      height: 90vh;
      width: 100%
    }

    .bin-plot-container {
      padding: 0;
      margin: 16px 0px 16px -4px;
      height: 30vh;
    }

    .bin-info-container {
      display: flex;
      margin: 16px 0px 16px -4px;
      padding: 16px;
      border-radius: 8px;
    }
  `]
})
export class BinEstimatorBinTabComponent implements OnChanges {
  @Input() activeLocusBinSets: LocusBinSet[] = [];
  @Input() activeLocusBinSetID: number;
  @Input() selectedLocus: Locus;
  @Input() bins: Bar[] = [];
  @Input() peakAnnotations: Circle[] = [];
  @Input() selectedBin: Bin;
  @Input() activeTasks: Task[] = [];
  @Input() failedTasks: Task[] = [];

  @Output() selectLocusBinSet: EventEmitter<number> = new EventEmitter();
  @Output() selectBin: EventEmitter<number> = new EventEmitter();
  @Output() saveBin: EventEmitter<any> = new EventEmitter();
  @Output() deleteBin: EventEmitter<any> = new EventEmitter();
  @Output() addBin: EventEmitter<{base_size: number, locus_bin_set_id: number}> = new EventEmitter();

  private binForm: FormGroup;

  constructor(private fb: FormBuilder) {
    this.createForm();
  }

  createForm() {
    this.binForm = this.fb.group({
      label: [, Validators.required],
      base_size: [, Validators.required],
      bin_buffer: [, Validators.required]
    })
  }

  ngOnChanges(change: SimpleChanges) {
    if (change.selectedBin) {
      this.setBin(this.selectedBin);
    } else if (!this.selectedBin) {
      this.createForm();
    }
  }

  setBin(b: Bin) {
    if (b) {
      this.binForm.patchValue(b);
    }
  }

  saveBinClicked() {
    const binSettings = Object.assign(this.binForm.value, {
      id: this.selectedBin.id
    });
    this.saveBin.emit(binSettings);
  }

  deleteBinClicked() {
    const binID = this.selectedBin.id;
    this.deleteBin.emit(binID);
  }

  addBinClicked(base_size: number) {
    this.addBin.emit({
      base_size: base_size,
      locus_bin_set_id: this.activeLocusBinSetID
    })
  }

  get loci() {
    return this.activeLocusBinSets.map(lbs => {
      const locus = Object.assign({}, lbs.locus as Locus);
      locus.id = lbs.id;
      return locus
    })
  }

  get locusDomain() {
    if (this.selectedLocus) {
      return [this.selectedLocus.min_base_length, this.selectedLocus.max_base_length]
    } else {
      return [0, 400];
    }
  }

  get taskActive() {
    return this.activeTasks.length > 0 || this.failedTasks.length > 0;
  }

  get activeTask() {
    return this.activeTasks.length > 0 ? this.activeTasks[0] : false;
  }

  get failedTask() {
    return this.failedTasks.length > 0 ? this.failedTasks[0] : false;
  }
}
