import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, ViewChild, SimpleChanges, OnChanges } from "@angular/core";
import { Task } from 'app/models/task';
import { Sample } from 'app/models/sample/sample';
import { ControlSampleAssociation } from 'app/models/sample/control-sample-association';
import { MatTableDataSource, MatSort } from '@angular/material';
import { QuantificationBiasEstimatorProject } from 'app/models/quantification-bias-estimator/project';
import { Control } from 'app/models/sample/control';


interface DisplayedControl {
    barcode: string,
    proportion: number
}

@Component({
  selector: 'mspat-quant-bias-estimator-controls-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div class="control-tab row justify-content-center">
    <div class="samples-list mat-elevation-z8 col-sm-6">
      <div class="sample-table">
        <table mat-table [dataSource]="sampleDataSource">
          <ng-container matColumnDef="barcode">
            <th mat-header-cell *matHeaderCellDef> Sample ID </th>
            <td mat-cell *matCellDef="let element"> {{element.barcode}} </td>
          </ng-container>

          <ng-container matColumnDef="last_updated">
            <th mat-header-cell *matHeaderCellDef> Last Updated </th>
            <td mat-cell *matCellDef="let element"> {{element.last_updated | date}} </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedSampleColumns; sticky: true"></tr>

          <tr mat-row (click) = "selectSample.emit(row.id)"
                      [style.background] = "selectedSample && selectedSample.id === row.id ? 'lightblue' : ''"
                      *matRowDef = "let row; columns: displayedSampleColumns;"></tr>

        </table>
      </div>
    </div>
    <div class="control-info mat-elevation-z8 col-sm-5">
      <div *ngIf="activeControls?.length === 0">
        <h3> Select a Sample for Details </h3>
      </div>
      <div *ngIf="activeControls?.length > 0">
        <table mat-table [dataSource]="controlDataSource">
        <ng-container matColumnDef="barcode">
          <th mat-header-cell *matHeaderCellDef> Control </th>
          <td mat-cell *matCellDef="let element"> {{element.barcode}} </td>
        </ng-container>

        <ng-container matColumnDef="proportion">
          <th mat-header-cell *matHeaderCellDef> Proportion </th>
          <td mat-cell *matCellDef="let element"> {{element.proportion}} </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedControlColumns; sticky: true"></tr>

        <tr mat-row *matRowDef="let row; columns: displayedControlColumns;"></tr>

        </table>
      </div>
    </div>
  </div>
  <div class="row add-controls">
    <div class="col-sm-3">
      <button mat-raised-button [disabled]="anyTask" color="primary" (click)="fileInput.click()">ASSIGN CONTROLS BY CSV</button>
      <input hidden type="file" (change)="fileChangeEvent($event, fileInput)" #fileInput>
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
    .control-tab {
      width: 100%;
    }

    .samples-list {
      height: 80vh;
      margin: 16px;
      padding: 16px;
      border-radius: 8px;
    }

    .sample-table {
      width: 100%;
      height: 100%;
      overflow: auto;
    }

    .control-info {
      margin: 16px;
      padding: 16px;
      border-radius: 8px;
    }

    .add-controls {
      width: 90%;
      margin: 10px;
    }

    .task-progress {
      width: 90%;
    }

    .mat-table {
      width: 100%;
    }

    .mat-row {
      height: 28px;
    }

    .mat-row:hover {
      background-color: #C3CFE5
    }
  `]
})
export class QuantifiactionBiasEstimatorProjectControlsTabComponent implements OnChanges {
  @ViewChild(MatSort) sort: MatSort;

  @Input() activeTasks: Task[] = [];
  @Input() failedTasks: Task[] = [];
  @Input() quantBiasEstimator: QuantificationBiasEstimatorProject;
  @Input() activeSamples: Sample[] = [];
  @Input() selectedSample: Sample = null;
  @Input() activeControls: ControlSampleAssociation[] = [];

  @Output() addControlsFile: EventEmitter<{file: File, project_id: number}> = new EventEmitter();
  @Output() selectSample: EventEmitter<number> = new EventEmitter();

  public sampleDataSource: MatTableDataSource<Sample>;
  public displayedSampleColumns = ['barcode', 'last_updated'];

  public controlDataSource: MatTableDataSource<DisplayedControl>;
  public displayedControlColumns = ['barcode', 'proportion'];

  constructor() {
    this.sampleDataSource = new MatTableDataSource(this.activeSamples);
    this.controlDataSource = new MatTableDataSource(this.activeControlsList);
  }

  ngOnChanges(changes: SimpleChanges): void {
    console.log("QBE Control Changed")
    console.log(changes);
    if (changes.activeSamples) {
      console.log("Setting Samples")
      this.sampleDataSource.data = this.activeSamples;
    }

    if (changes.activeControls) {
      this.controlDataSource.data = this.activeControlsList;
    }
  }

  fileChangeEvent(f, fileInput) {
    if (f && !this.anyTask) {
      this.addControlsFile.emit({file: f.target.files[0], project_id: +this.quantBiasEstimator.id});
      fileInput.value = null;
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

  get activeControlsList() {
    return this.activeControls.map(csa => {
      const ctrl = <Control> csa.control;
      return {
        barcode: ctrl.barcode,
        proportion: csa.proportion
      }
    })
  }
}