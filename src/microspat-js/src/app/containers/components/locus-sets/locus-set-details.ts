import { Component, ChangeDetectionStrategy, OnChanges,
         Input, EventEmitter, Output, ViewChild,
         SimpleChanges, OnInit } from '@angular/core';
import {MatSort, MatTableDataSource} from '@angular/material';
import { SelectionModel } from '@angular/cdk/collections';

import { LocusSet } from '../../../models/locus/locus-set';
import { Locus } from '../../../models/locus/locus';
import { Task } from '../../../models/task';

@Component({
  selector: 'mspat-locus-set-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card>
      <mat-card-header>
        <h3>Locus Set Details</h3>
      </mat-card-header>
      <mat-card-content>
        <mat-divider [inset]='true'></mat-divider>
        <div class="form-fields">
          <mat-form-field [floatLabel]="'always'">
            <mat-label>Locus Set Label</mat-label>
            <input type="text" matInput [disabled]='true' [value]="locusSet.label">
          </mat-form-field>
        </div>
        <div class="locus-table mat-elevation-z1">
          <table mat-table [dataSource]="dataSource" matSort>

            <ng-container matColumnDef="label">
              <th mat-header-cell *matHeaderCellDef mat-sort-header> Label </th>
              <td mat-cell *matCellDef="let element"> {{element.label}} </td>
            </ng-container>

            <ng-container matColumnDef="min_base_length">
              <th mat-header-cell *matHeaderCellDef mat-sort-header> Min. Base Size </th>
              <td mat-cell *matCellDef="let element"> {{element.min_base_length}} </td>
            </ng-container>

            <ng-container matColumnDef="max_base_length">
              <th mat-header-cell *matHeaderCellDef mat-sort-header> Max. Base Size </th>
              <td mat-cell *matCellDef="let element"> {{element.max_base_length}} </td>
            </ng-container>

            <ng-container matColumnDef="nucleotide_repeat_length">
              <th mat-header-cell *matHeaderCellDef mat-sort-header> Nucleotide Repeat Length </th>
              <td mat-cell *matCellDef="let element"> {{element.nucleotide_repeat_length}} </td>
            </ng-container>
            <ng-container matColumnDef="color">
              <th mat-header-cell *matHeaderCellDef mat-sort-header> Color </th>
              <td mat-cell *matCellDef="let element" [style.color]="element.color"> {{ element.color | titlecase }} </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns; sticky: true"></tr>
            <tr mat-row *matRowDef = "let row; columns: displayedColumns;">
            </tr>
          </table>
        </div>
        <mat-card-actions>
          <button mat-raised-button color="primary" [disabled]="activeTasks.length > 0" (click)="cancel.emit()">CANCEL</button>
          <button mat-raised-button color="warn" [disabled]="activeTasks.length > 0" (click)="deletePressed()">DELETE</button>
        </mat-card-actions>
        <mat-card-footer *ngIf="anyTask">
          <mspat-task-progress-display *ngIf="activeLocusSetTask" [task]="activeLocusSetTask"></mspat-task-progress-display>
          <mspat-task-progress-display *ngIf="failedLocusSetTask" [task]="failedLocusSetTask"></mspat-task-progress-display>
        </mat-card-footer>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    mat-card {
      height: 95vh;
    }

    mat-card-header {
      height: 5%;
      margin: 0 0 .5em 0;
    }

    mat-card-content {
      height: 85%;
    }

    .form-fields {
      height: 7vh;
    }

    .locus-table {
      height: 95%;
      width: 100%;
      overflow: auto;
    }

    table.mat-table {
      height: 90%;
      width: 100%;
      overflow: auto
    }

    .mat-row {
      height: 34px;
    }

    .mat-cell {
      font-size: 12px;
    }

    .locus-select {
      padding: 10px 0 0 0;
    }

  `]
})
export class LocusSetDetailsComponent implements OnChanges, OnInit {
  @Input() locusDict: {[id: string]: Locus};
  @Input() locusSet: LocusSet;
  @Input() activeTasks: Task[] = [];
  @Input() activeLocusSetTasks: Task[] = [];
  @Input() failedLocusSetTasks: Task[] = [];
  @Output() cancel = new EventEmitter();
  @Output() delete = new EventEmitter();

  @ViewChild(MatSort) sort: MatSort;
  public selection: SelectionModel<Locus>;
  public dataSource: MatTableDataSource<Locus>;

  public displayedColumns = ['label', 'min_base_length', 'max_base_length',
                             'nucleotide_repeat_length', 'color'];

  constructor() {
    const initialSelection = [];
    const allowMultiSelect = true;
    this.selection = new SelectionModel<Locus>(allowMultiSelect, initialSelection);
    this.dataSource = new MatTableDataSource();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.loci || changes.locusSet) {
      this.dataSource.data = this.locusSet.loci.map(id => this.locusDict[id]);
    }
  }

  deletePressed() {
    this.delete.emit(this.locusSet.id);
  }

  ngOnInit() {
    this.dataSource.sort = this.sort;
  }

  get activeLocusSetTask() {
    return this.activeLocusSetTasks.length > 0 ? this.activeLocusSetTasks[0] : false;
  }

  get failedLocusSetTask() {
    return this.failedLocusSetTasks.length > 0 ? this.failedLocusSetTasks[0] : false;
  }

  get anyTask() {
    return this.activeLocusSetTask || this.failedLocusSetTask;
  }
}
