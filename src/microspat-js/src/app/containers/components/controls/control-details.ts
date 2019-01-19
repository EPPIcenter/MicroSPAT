import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';

import { Control } from 'app/models/sample/control';
import { Task } from 'app/models/task';
import { AlleleSet } from 'app/reducers/controls/controls';
import { BinEstimatorProject } from 'app/models/bin-estimator/project';

@Component({
  selector: 'mspat-control-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <mat-card>

    <mat-card-header>
      <mat-card-title>
        <h3 *ngIf="selectedControl">Control Details</h3>
        <h3 *ngIf="!selectedControl">Create Control</h3>
      </mat-card-title>
    </mat-card-header>

    <mat-divider [inset]="true"></mat-divider>

    <mat-card-content>
      <form [formGroup]="controlForm">
        <mat-form-field class="half-width"  [floatLabel]="'always'">
          <mat-label>Bin Estimator</mat-label>
          <mat-select [disabled]="selectedControl" matInput (selectionChange)="selectBinEstimator.emit($event.value)" formControlName="bin_estimator">
            <mat-option *ngFor="let be of binEstimators" [value]="be.id">
              {{be.title}}
            </mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field class="half-width" [floatLabel]="'always'">
          <mat-label>Label</mat-label>
          <input type="text" matInput formControlName="barcode">
        </mat-form-field>
        <mat-divider [inset]="true">
        </mat-divider>
        <div class="alleles-panel" formGroupName="alleles">
          <mat-form-field class="col-sm-2" *ngFor="let alleleSet of validAlleles" [floatLabel]="'always'">
            <mat-label>{{alleleSet.locus_label}}</mat-label>
            <mat-select placeholder="Unknown" [formControlName]="alleleSet.locus_id">
              <mat-option *ngFor="let allele of alleleSet.alleles" [value]="allele.id">
                {{allele.label}}
              </mat-option>
              <mat-option [value]="null">
                Unknown
              </mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </form>
    </mat-card-content>

    <mat-card-actions>
      <button mat-raised-button color="warn" *ngIf="selectedControl" (click)="deleteControl.emit(selectedControl.id)">Delete</button>
      <button mat-raised-button color="primary" *ngIf="!selectedControl" (click)="saveControl()" [disabled]="controlForm.invalid">Submit</button>
      <button mat-raised-button color="primary" (click)="cancel.emit()">Cancel</button>
    </mat-card-actions>

    <mat-card-footer>
        <mspat-task-progress-display *ngIf="activeTask" [task]="activeTask"></mspat-task-progress-display>
        <mspat-task-progress-display *ngIf="failedTask" [task]="failedTask"></mspat-task-progress-display>
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

  .alleles-panel {
    margin: 10px 10px
  }
  `],
})
export class ControlDetailsComponent implements OnChanges {
  @Input() public selectedControl: Control;
  @Input() public selectedBinEstimator: BinEstimatorProject;
  @Input() public binEstimators: BinEstimatorProject[];
  @Input() public validAlleles: AlleleSet[] = [];

  @Input() public activeTasks: Task[] = [];
  @Input() public failedTasks: Task[] = [];

  @Output() public deleteControl = new EventEmitter();
  @Output() public submit = new EventEmitter();
  @Output() public cancel = new EventEmitter();
  @Output() public selectBinEstimator = new EventEmitter();

  public controlForm: FormGroup;

  constructor(private fb: FormBuilder) {
    this.createForm();
  }

  createForm() {
    const alleles = this.validAlleles.reduce((prev, next) => {
      return Object.assign({}, prev, {
        [next.locus_id]: [null]
      })
    }, {});

    this.controlForm = this.fb.group({
      barcode: ['', Validators.required],
      bin_estimator: [this.selectedBinEstimator ? this.selectedBinEstimator.id : null, Validators.required],
      alleles: this.fb.group(alleles)
    });
  }

  ngOnChanges(change: SimpleChanges) {
    this.createForm();

    if (this.selectedControl) {
      this.setControl(this.selectedControl);
    }
  }

  setControl(control: Control) {
    const alleles = this.validAlleles.reduce((prev, next) => {
      return Object.assign({}, prev, {
        [next.locus_id]: {value: control.alleles[next.locus_id], disabled: true}
      })
    }, {});

    this.controlForm = this.fb.group({
      barcode: {value: control.barcode, disabled: true},
      bin_estimator: {value: control.bin_estimator, disabled: true},
      alleles: this.fb.group(alleles)
    });

  }

  saveControl() {
    const toSubmit = this.prepareSaveControl();
    this.submit.emit(toSubmit);
    this.createForm();
  }

  prepareSaveControl() {
    const controlModel = this.controlForm.value;
    return controlModel;
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
