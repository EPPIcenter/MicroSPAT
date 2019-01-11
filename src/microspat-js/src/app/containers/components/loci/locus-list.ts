import { Component, ChangeDetectionStrategy, Input, EventEmitter, Output, SimpleChanges, OnChanges, ViewChild, OnInit } from '@angular/core';
import { Locus } from '../../../models/locus/locus';
import { MatTableDataSource, MatSort } from '@angular/material';


@Component({
  selector: 'mspat-locus-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card *ngIf="lociLoading">
      <mat-card-content>
        <div>
          <mat-spinner [diameter]='spinnerDiameter'></mat-spinner>
        </div>
      </mat-card-content>
    </mat-card>

    <div *ngIf="!lociLoading" class="locus-table mat-elevation-z8">
      <table mat-table [dataSource]="dataSource" matSort>

        <ng-container matColumnDef="label">
          <th mat-header-cell *matHeaderCellDef mat-sort-header> Label </th>
          <td mat-cell *matCellDef="let element"> {{element.label}} </td>
        </ng-container>

        <ng-container matColumnDef="min_base_length">
          <th mat-header-cell *matHeaderCellDef mat-sort-header> Min. Size </th>
          <td mat-cell *matCellDef="let element"> {{element.min_base_length}} </td>
        </ng-container>

        <ng-container matColumnDef="max_base_length">
          <th mat-header-cell *matHeaderCellDef mat-sort-header> Max. Size </th>
          <td mat-cell *matCellDef="let element"> {{element.max_base_length}} </td>
        </ng-container>

        <ng-container matColumnDef="nucleotide_repeat_length">
          <th mat-header-cell *matHeaderCellDef mat-sort-header> Repeat Unit </th>
          <td mat-cell *matCellDef="let element"> {{element.nucleotide_repeat_length}} </td>
        </ng-container>

        <ng-container matColumnDef="color">
          <th mat-header-cell *matHeaderCellDef mat-sort-header> Color </th>
          <td mat-cell *matCellDef="let element" [style.color]="COLOR_MAP[element.color]"> {{ element.color | titlecase }} </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns; sticky: true"></tr>
        <tr mat-row (click) = "selectLocus.emit(row.id)"
                    [style.background] = "selectedLocus && selectedLocus.id === row.id ? 'lightblue' : ''"
                    *matRowDef = "let row; columns: displayedColumns;">
        </tr>
      </table>
    </div>
  `,
  styles: [`
    mat-spinner {
      margin: 0 auto;
    }

    .locus-table {
      height: 95vh;
      overflow: auto;
    }

    table.mat-table {
      width: 100%;
    }

    .mat-row {
      height: 28px;
    }
  `]
})
export class LocusListComponent implements OnChanges {

  @ViewChild(MatSort) sort: MatSort;

  @Input() loci: Locus[];
  @Input() selectedLocus: Locus = null;
  @Input() lociLoading: boolean;
  @Output() selectLocus: EventEmitter<number> = new EventEmitter();

  public COLOR_MAP = {
    'yellow': '#D4D300',
    'green': 'green',
    'blue': 'blue',
    'orange': 'orange',
    'red': 'red'
  }

  public spinnerDiameter = 250;

  public dataSource: MatTableDataSource<Locus>;
  public displayedColumns = ['label', 'min_base_length', 'max_base_length', 'nucleotide_repeat_length', 'color'];

  constructor() {
    this.dataSource = new MatTableDataSource(this.loci);
    this.dataSource.sort = this.sort;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.loci) {
      this.dataSource.data = this.loci;
      this.dataSource.sort = this.sort;
    }
  }

}
