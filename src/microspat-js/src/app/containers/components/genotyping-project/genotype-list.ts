import { Genotype } from 'app/models/sample/genotype';
import { MatTableDataSource } from '@angular/material';
import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, SimpleChanges, OnChanges, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { Locus } from '../../../models/locus/locus';
import { ProjectSampleAnnotations } from '../../../models/project/sample-annotations';
import { Sample } from 'app/models/sample/sample';


@Component({
  selector: 'mspat-genotype-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="genotype-list row">
      <div class="genotype-table col-sm-12">
        <table mat-table [dataSource]="dataSource" id="genotypeTable">

          <ng-container matColumnDef="sampleBarcode">
            <th mat-header-cell *matHeaderCellDef> Sample ID </th>
            <td mat-cell *matCellDef="let element"> {{element.sampleBarcode}} </td>
          </ng-container>

          <ng-container matColumnDef="locusLabel">
          <th mat-header-cell *matHeaderCellDef> Locus </th>
          <td mat-cell *matCellDef="let element"> {{element.locusLabel}} </td>
        </ng-container>

          <ng-container matColumnDef="totalAlleles">
            <th mat-header-cell *matHeaderCellDef> # Alleles </th>
            <td mat-cell *matCellDef="let element"> {{element.totalAlleles}} </td>
          </ng-container>

          <ng-container matColumnDef="totalPeaks">
            <th mat-header-cell *matHeaderCellDef> # Peaks </th>
            <td mat-cell *matCellDef="let element"> {{element.totalPeaks}} </td>
          </ng-container>

          <ng-container matColumnDef="failure">
            <th mat-header-cell *matHeaderCellDef> Failure </th>
            <td mat-cell *matCellDef="let element"><i *ngIf="element.failure" class="material-icons">check</i></td>
          </ng-container>

          <ng-container matColumnDef="offscale">
            <th mat-header-cell *matHeaderCellDef> Offscale </th>
            <td mat-cell *matCellDef="let element"><i *ngIf="element.offscale" class="material-icons">check</i></td>
          </ng-container>

          <ng-container matColumnDef="manualCuration">
            <th mat-header-cell *matHeaderCellDef> Manual </th>
            <td mat-cell *matCellDef="let element"><i *ngIf="element.manualCuration" class="material-icons">check</i></td>
          </ng-container>

          <ng-container matColumnDef="disabled">
            <th mat-header-cell *matHeaderCellDef> No Results </th>
            <td mat-cell *matCellDef="let element"><i *ngIf="element.disabled" class="material-icons">check</i></td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns; sticky: true"></tr>
          <tr mat-row (click) = "selectClicked(row)"
                      [style.background] = "background(row)"
                      *matRowDef = "let row; columns: displayedColumns;">
          </tr>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .genotype-list {
      display: flex;
      height: 98%;
      margin-right: -8px;
    }

    .genotype-table {
      height: 100%;
      overflow: auto;
      padding: 0 1em 0 1em;
    }

    table.mat-table {
      width: 100%;
      height: 100%;
    }

    .mat-row {
      height: 30px;
    }

    .mat-row:hover {
      background-color: #C3CFE5
    }

    .mat-cell {
      font-size: 12px;
    }

    .mat-header-cell {
      font-size: 10px;
    }
  `]
})
export class GenotypeListComponent implements OnChanges {
  @Input() genotypes: Genotype[] = [];
  @Input() selected: number;
  @Input() by = 'locus';
  @Output() select: EventEmitter<number> = new EventEmitter();

  public dataSource: MatTableDataSource<any>;

  constructor() {
    this.dataSource = new MatTableDataSource(this.genotypes);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.genotypes) {
      this.dataSource.data = this.genotypesList;
    }
  }

  get genotypesList() {
    return this.genotypes.map(g => {

      const sampleAnnotations = g.sample_annotations as ProjectSampleAnnotations;
      const sample = sampleAnnotations.sample as Sample;
      const locus = g.locus as Locus
      const sampleBarcode = sample.barcode;
      let totalAlleles;
      let totalPeaks;
      let disabled;

      if (g.reference_run && Object.keys(g.alleles).length > 0) {
        totalAlleles = Object.values(g.alleles).reduce((a, b) => +a + +b);
        totalPeaks = g.annotated_peaks.length;
        disabled = false;
      } else {
        totalAlleles = 0;
        totalPeaks = 0;
        disabled = true;
      }

      return {
        id: g.id,
        sampleBarcode: sampleBarcode,
        locusLabel: locus.label,
        totalAlleles: totalAlleles,
        totalPeaks: totalPeaks,
        failure: g.flags.failure,
        offscale: g.flags.offscale,
        manualCuration: g.flags.manual_curation,
        disabled: disabled
      }
    })
  }

  get displayedColumns() {
    if (this.by === 'locus') {
      return ['sampleBarcode', 'totalAlleles', 'totalPeaks', 'failure', 'offscale', 'manualCuration'];
    } else if (this.by === 'sample') {
      return ['locusLabel', 'totalAlleles', 'totalPeaks', 'failure', 'offscale', 'manualCuration', 'disabled'];
    }
  }

  background(g) {
    if (this.selected === g.id) {
      return 'lightblue';
    }

    if (g.disabled && this.by === 'sample') {
      return '#FF4949';
    }

    return ''
  }

  selectClicked(e) {
    if (!e.disabled) {
      this.select.emit(e.id);
    }
  }

}
