import { MatTableDataSource } from '@angular/material';
import { SelectionModel } from '@angular/cdk/collections';
import { ChangeDetectionStrategy, Component, OnChanges, Input, SimpleChanges } from '@angular/core';
import { Task } from '../../../models/task';


@Component({
  selector: 'mspat-locus-parameter-selector-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div class="locus-list mat-elevation-z8 row">
    <h5>Locus Parameters</h5>
    <div class="locus-table col-sm-12">
      <table mat-table [dataSource]="dataSource">
        <ng-container matColumnDef="select">
          <th mat-header-cell *matHeaderCellDef>
            <mat-checkbox (change) = "$event ? masterToggle() : null"
                          [checked] = "selection.hasValue() && isAllSelected()"
                          [disabled] = "taskActive"
                          [indeterminate] = "selection.hasValue() && isAllSelected()">
            </mat-checkbox>
          </th>
          <td mat-cell class="locus-select" *matCellDef = "let row">
            <mat-checkbox (click) = "$event.stopPropagation()"
                          (change) = "$event ? selection.toggle(row) : null"
                          [disabled] = "taskActive"
                          [checked] = "selection.isSelected(row)">
            </mat-checkbox>
          </td>
        </ng-container>

        <ng-container matColumnDef="label">
          <th mat-header-cell *matHeaderCellDef> Locus </th>
          <td mat-cell *matCellDef="let element"> {{element.locus.label}} </td>
        </ng-container>

        <ng-container matColumnDef="stale">
          <th mat-header-cell *matHeaderCellDef> Stale </th>
          <td mat-cell *matCellDef="let element">
            <mat-chip-list>
              <mat-chip (click) = "selection.toggle(element)" style="background-color: #3185FC" selected="true" *ngIf="element.scanning_parameters_stale">S</mat-chip>
              <mat-chip (click) = "selection.toggle(element)" style="background-color: #F9DC5C" selected="true" *ngIf="element.filter_parameters_stale">F</mat-chip>
              <mat-chip (click) = "selection.toggle(element)" style="background-color: #E84855" selected="true" *ngIf="element.bin_estimator_parameters_stale">BE</mat-chip>
              <mat-chip (click) = "selection.toggle(element)" style="background-color: #E84855" selected="true" *ngIf="element.artifact_estimator_parameters_stale">AE</mat-chip>
              <mat-chip (click) = "selection.toggle(element)" style="background-color: #E84855" selected="true" *ngIf="element.genotyping_parameters_stale">G</mat-chip>
              <mat-chip (click) = "selection.toggle(element)" style="background-color: #E84855" selected="true" *ngIf="element.quantification_bias_estimator_parameters_stale">QBE</mat-chip>
            </mat-chip-list>

          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns; sticky: true"></tr>
        <tr mat-row (click) = "selection.toggle(row)" *matRowDef = "let row; columns: displayedColumns;"></tr>
      </table>
    </div>
  </div>
  `,
  styles: [`
    .locus-list {
      display: flex;
      margin: 16px;
      padding: 16px;
      border-radius: 8px;
      height: 90vh;
    }

    .locus-table {
      height: 95%;
      overflow: auto;
    }

    table.mat-table {
      width: 100%
    }

    .mat-row {
      height: 28px;
    }

    .mat-cell {
      font-size: 14px;
    }

    .locus-select {
      padding: 10px 0 0 0;
    }
  `]
})
export class LocusSelectorListComponent implements OnChanges {
  @Input() locusParameters: any[];
  @Input() selection: SelectionModel<any>;
  @Input() activeTasks: Task[] = [];

  public dataSource: MatTableDataSource<any>;
  public displayedColumns = ['select', 'label', 'stale'];

  constructor() {
    this.dataSource = new MatTableDataSource(this.locusParameters);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.locusParameters) {
      this.dataSource.data = this.locusParameters;
    }
  }

  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows;
  }

  masterToggle() {
    this.isAllSelected() ?
    this.selection.clear() :
    this.dataSource.filteredData.forEach(row => this.selection.select(row));
  }

  get taskActive() {
    return this.activeTasks.length > 0;
  }
}
