import { Component, ChangeDetectionStrategy, OnChanges, Input, Output, EventEmitter, SimpleChanges } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';

import { Locus } from 'app/models/locus/locus';
import { Task } from 'app/models/task';


@Component({
  selector: 'mspat-locus-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>
          <h3 *ngIf="locus">Locus Details</h3>
          <h3 *ngIf="!locus">Create New Locus</h3>
        </mat-card-title>
      </mat-card-header>
      <mat-divider [inset]='true'></mat-divider>
      <mat-card-content>
        <form [formGroup]="locusForm">
          <mat-form-field class="half-width" [floatLabel]="'always'">
            <mat-label>Label</mat-label>
            <input type="text" matInput formControlName="label">
          </mat-form-field>

          <mat-form-field class="half-width" [floatLabel]="'always'">
            <mat-label>Min. Base Length</mat-label>
            <input type="number" min="1" step="1" matInput formControlName="minBaseLength">
          </mat-form-field>

          <mat-form-field class="half-width" [floatLabel]="'always'">
            <mat-label>Max. Base Length</mat-label>
            <input type="number" min="1" step="1" matInput formControlName="maxBaseLength">
          </mat-form-field>

          <mat-form-field class="half-width" [floatLabel]="'always'">
            <mat-label>Nucleotide Repeat Length</mat-label>
            <input type="number" min="1" step="1" matInput formControlName="nucleotideRepeatLength">
          </mat-form-field>

          <mat-form-field class="half-width" [floatLabel]="'always'">
            <mat-label>Color</mat-label>
            <mat-select [disabled]="locus" formControlName="color">
              <mat-option *ngFor="let color of VALID_COLORS" [value]="color.value" [style.color]="COLOR_MAP[color.value]">
                {{color.label}}
              </mat-option>
            </mat-select>
          </mat-form-field>
        </form>
      </mat-card-content>
      <mat-card-actions>
      <button mat-raised-button color="primary" *ngIf="!locus" [disabled]="locusForm.invalid" (click)="submitPressed()">SUBMIT</button>
      <button mat-raised-button color="warn" *ngIf="locus" (click)="deletePressed()">DELETE</button>
      <button mat-raised-button color="primary" (click)="cancelPressed()">CANCEL</button>
      </mat-card-actions>
      <mat-card-footer>
        <mspat-task-progress-display *ngIf="activeLocusTask" [task]="activeLocusTask"></mspat-task-progress-display>
        <mspat-task-progress-display *ngIf="failedLocusTask" [task]="failedLocusTask"></mspat-task-progress-display>
      </mat-card-footer>
    </mat-card>
  `,
  styles: [`

  .half-width {
    width: 45%;
    margin: 5px;
  }

  .full-width {
    width: 100%
  }

`],
})
export class LocusEditorComponent implements OnChanges {

  @Input() locus: Locus;
  @Input() activeTasks: Task[];
  @Input() activeLocusTasks: Task[];
  @Input() failedLocusTasks: Task[];
  @Output() cancel = new EventEmitter();
  @Output() submit = new EventEmitter();
  @Output() delete = new EventEmitter();

  public locusForm: FormGroup;
  public VALID_COLORS = [
    {value: 'red', label: 'Red'},
    {value: 'yellow', label: 'Yellow'},
    {value: 'green', label: 'Green'},
    {value: 'blue', label: 'Blue'},
    {value: 'orange', label: 'Orange'}
  ]

  public COLOR_MAP = {
    'yellow': '#D4D300',
    'green': 'green',
    'blue': 'blue',
    'orange': 'orange',
    'red': 'red'
  }

  constructor(private fb: FormBuilder) {
    this.createForm();
  }

  createForm() {
    this.locusForm = this.fb.group({
      label: ['', Validators.required],
      maxBaseLength: [, Validators.required],
      minBaseLength: [, Validators.required],
      nucleotideRepeatLength: [3, Validators.required],
      color: [, Validators.required],
    })
  }

  ngOnChanges(change: SimpleChanges) {
    if (this.locus) {
      this.setLocus(this.locus);
    }
  }

  setLocus(locus: Locus) {
    this.locusForm = this.fb.group({
      label: {value: locus.label, disabled: true},
      maxBaseLength: {value: locus.max_base_length, disabled: true},
      minBaseLength: {value: locus.min_base_length, disabled: true},
      nucleotideRepeatLength: {value: locus.nucleotide_repeat_length, disabled: true},
      color: {value: locus.color, disabled: true}
    })
  }

  prepareSaveLocus(): Locus {
    const locusModel = this.locusForm.value;

    const newLocus: Locus = {
      id: null,
      label: locusModel.label,
      max_base_length: locusModel.maxBaseLength,
      min_base_length: locusModel.minBaseLength,
      nucleotide_repeat_length: locusModel.nucleotideRepeatLength,
      color: locusModel.color,
      locus_metadata: {},
    }

    return newLocus;
  }

  deletePressed() {
    if (this.locus.id) {
      this.delete.emit(this.locus.id);
    };
  }

  submitPressed() {
    if (this.locusForm.valid) {
      const l = this.prepareSaveLocus();
      this.submit.emit(l);
      this.createForm();
    }
  }

  cancelPressed() {
    this.cancel.emit();
    this.createForm();
  }

  get activeLocusTask() {
    return this.activeLocusTasks.length > 0 ? this.activeLocusTasks[0] : false;
  }

  get failedLocusTask() {
    return this.failedLocusTasks.length > 0 ? this.failedLocusTasks[0] : false;
  }

}
