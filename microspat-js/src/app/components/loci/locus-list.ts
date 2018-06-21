import { Component, ChangeDetectionStrategy, Input, EventEmitter, Output, SimpleChanges, OnChanges, ViewChild, OnInit } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { Locus } from 'app/models/locus/locus';
import { MatTableDataSource, MatSort } from '@angular/material';


// <ngx-datatable *ngIf="!lociLoading" class="material fullscreen" id="locus-list"
// [rows]="loci"
// [columns]="columns"
// [messages]="messages"
// columnMode="force"
// [headerHeight]="35"
// [footerHeight]="0"
// [rowHeight]="30"
// [scrollbarV]="true"
// [selectionType]="'single'"
// [selected]="[selectedLocus]"
// [trackByProp]="'id'"
// (select)='onSelect($event)'>
// </ngx-datatable>

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

    <div class="locus-table mat-elevation-z8">
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
        <tr mat-row (click) = "selectLocus.emit(row.id)"
                    [style.background] = "selectedLocus && selectedLocus.id === row.id ? 'lightblue' : ''"
                    *matRowDef = "let row; columns: displayedColumns;">
        </tr>
      </table>
    </div>
  `,
  styles: [`
    mat-spinner {
      margin: 0 auto
    }

    .locus-table {
      height: 95vh;
      overflow: auto;
    }

    table.mat-table {
      width: 100%;
    }
  `]
})
export class LocusListComponent implements OnChanges, OnInit {

  @ViewChild(MatSort) sort: MatSort;

  @Input() loci: Locus[];
  @Input() selectedLocus: Locus = null;
  @Input() lociLoading: boolean;
  @Output() selectLocus = new EventEmitter();

  private spinnerDiameter = 250;

  private dataSource: MatTableDataSource<Locus>;
  public displayedColumns = ['label', 'min_base_length', 'max_base_length', 'nucleotide_repeat_length', 'color'];

  constructor() {
    this.dataSource = new MatTableDataSource(this.loci);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.loci) {
      this.dataSource.data = this.loci;
      console.log(this.dataSource);
    }
  }

  ngOnInit() {
    this.dataSource.sort = this.sort;
  }

  onSelect ({ selected }) {
    if (selected[0]) {
      this.selectLocus.emit(selected[0].id);
    }
  }

}
