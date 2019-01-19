import { ProjectSampleAnnotations } from 'app/models/project/sample-annotations';
import { Component, ChangeDetectionStrategy, OnChanges, OnInit, Input, Output, EventEmitter, SimpleChanges, ViewChild } from '@angular/core';
import { Sample } from '../../../models/sample/sample';
import { MatTableDataSource, MatSort } from '@angular/material';
import { Genotype } from 'app/models/sample/genotype';

interface SampleGenotypingInfo {
  id: number,
  barcode: string;
  coverage: number;
}

@Component({
  selector: 'mspat-sample-genotyping-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sample-table-container">
      <mat-form-field class="sample-filter">
        <input matInput (keyup)="applyFilter($event.target.value)" placeholder="Filter">
      </mat-form-field>
      <div class="sample-table">
        <table mat-table [dataSource]="dataSource">
          <ng-container matColumnDef="barcode">
            <th mat-header-cell *matHeaderCellDef> Sample ID </th>
            <td mat-cell *matCellDef="let element"> {{element.barcode}} </td>
          </ng-container>

          <ng-container matColumnDef="coverage">
            <th mat-header-cell *matHeaderCellDef> Coverage </th>
            <td mat-cell *matCellDef="let element"> {{(element.coverage / element.totalLoci) | number}} </td>
          </ng-container>

          <ng-container matColumnDef="failures">
            <th mat-header-cell *matHeaderCellDef> Failures </th>
            <td mat-cell *matCellDef="let element"> {{(element.failure / (element.failure + element.coverage)) | number}} </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns; sticky: true"></tr>

          <tr mat-row (click) = "selectSample.emit(row.id)"
                      [style.background] = "selectedSample && selectedSample.id === row.id ? 'lightblue' : ''"
                      *matRowDef = "let row; columns: displayedColumns;"></tr>

        </table>
      </div>
    </div>
  `,
  styles: [`
    mat-spinner {
      margin: 0 auto;
    }

    .sample-table {
      height: calc(100% - 45px);
      overflow: auto;
    }

    .sample-filter {
      width: 100%;
      height: 35px;
      margin-bottom: 12px;
    }

    .sample-table-container {
      height: 100%;
      padding: 2px
    }

    .mat-row {
      height: 28px;
    }

    .mat-header-row {
      height: 28px;
    }

    .mat-cell {
      font-size: 10px;
    }

    table.mat-table {
      width: 100%;
    }
  `]
})
export class SampleGenotypingListComponent implements OnChanges {

  @ViewChild(MatSort) sort: MatSort;

  @Input() genotypes: Genotype[] = [];
  @Input() selectedSample: Sample = null;
  @Output() selectSample: EventEmitter<number> = new EventEmitter();

  designations = {
    'sample': 'Sample',
    'negative_control': 'Negative Control',
    'positive_control': 'Positive Control'
  }

  public spinnerDiameter = 250;

  public dataSource: MatTableDataSource<SampleGenotypingInfo>;
  public displayedColumns = ['barcode', 'coverage', 'failures'];

  constructor() {
    this.dataSource = new MatTableDataSource(this.samples);
    this.dataSource.sort = this.sort;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.genotypes) {
      this.dataSource.data = this.samples;
    }
  }

  applyFilter(filterValue: string) {
    filterValue = filterValue.trim().toLowerCase();
    this.dataSource.filter = filterValue;
  }

  get samples(): SampleGenotypingInfo[] {
    const sampleMap = this.genotypes.reduce((accumulator, genotype) => {
      const sampleAnnotation = genotype.sample_annotations as ProjectSampleAnnotations;
      const sample = sampleAnnotation.sample as Sample;


      if (sample.barcode in accumulator) {
        accumulator[sample.barcode].totalLoci = accumulator[sample.barcode].totalLoci + 1;
      } else {
        accumulator[sample.barcode] = {
          id: sample.id,
          barcode: sample.barcode,
          totalLoci: 1,
          coverage: 0,
          failure: 0
        }
      }

      const binEstimatorValid = Object.keys(genotype.alleles).length > 0;

      if (!binEstimatorValid) {
        return accumulator;
      }

      if (genotype.flags.failure) {
        accumulator[sample.barcode].failure += 1;
      } else if (genotype.alleles && Object.values(genotype.alleles).reduce((a, b) => +a + +b, 0) > 0) {
        accumulator[sample.barcode].coverage += 1;
      }

      return accumulator;
    }, {})
    return Object.values(sampleMap);
  }

}
