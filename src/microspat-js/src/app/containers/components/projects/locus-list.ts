import { MatTableDataSource } from '@angular/material';
import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, SimpleChanges, OnChanges } from '@angular/core';
import { Locus } from '../../../models/locus/locus';


@Component({
  selector: 'mspat-project-locus-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="locus-list mat-elevation-z8 row">
      <div class="locus-table col-sm-12">
        <table mat-table [dataSource]="dataSource">

          <ng-container matColumnDef="label">
            <th mat-header-cell *matHeaderCellDef> Label </th>
            <td mat-cell *matCellDef="let element"> {{element.label}} </td>
          </ng-container>

          <ng-container matColumnDef="min_base_length">
            <th mat-header-cell *matHeaderCellDef> Min. Size </th>
            <td mat-cell *matCellDef="let element"> {{element.min_base_length}} </td>
          </ng-container>

          <ng-container matColumnDef="max_base_length">
            <th mat-header-cell *matHeaderCellDef> Max. Size </th>
            <td mat-cell *matCellDef="let element"> {{element.max_base_length}} </td>
          </ng-container>

          <ng-container matColumnDef="nucleotide_repeat_length">
            <th mat-header-cell *matHeaderCellDef> Repeat Unit </th>
            <td mat-cell *matCellDef="let element"> {{element.nucleotide_repeat_length}} </td>
          </ng-container>
          <ng-container matColumnDef="color">
            <th mat-header-cell *matHeaderCellDef> Color </th>
            <td mat-cell *matCellDef="let element" [style.color]="element.color"> {{ element.color | titlecase }} </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns; sticky: true"></tr>
          <tr mat-row (click) = "select.emit(row.id)"
                      [style.background] = "+selected === +row.id ? 'lightblue' : ''"
                      *matRowDef = "let row; columns: displayedColumns;">
          </tr>
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
      height: 85vh;
    }

    .locus-table {
      height: 100%;
      overflow: auto;
      padding: 0 1em 0 1em;
    }

    table.mat-table {
      width: 100%
    }

    .mat-row {
      height: 36px;
    }

    .mat-row:hover {
      background-color: #C3CFE5
    }

    .mat-cell {
      font-size: 14px;
    }

    .mat-header-cell {
      font-size: 10px;
    }
  `]
})
export class ProjectLocusListComponent implements OnChanges {
  @Input() loci: Locus[];
  @Input() selected: number;
  @Output() select: EventEmitter<number> = new EventEmitter();

  public dataSource: MatTableDataSource<Locus>;
  public displayedColumns = ['label', 'min_base_length', 'max_base_length', 'nucleotide_repeat_length', 'color'];

  constructor() {
    this.dataSource = new MatTableDataSource(this.loci);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.loci) {
      this.dataSource.data = this.loci;
    }
  }

}
