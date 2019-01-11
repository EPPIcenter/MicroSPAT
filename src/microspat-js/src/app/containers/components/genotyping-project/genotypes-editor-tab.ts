import { TraceDisplay } from './genotype-trace-display';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Genotype } from './../../../models/sample/genotype';
import { GenotypingProject } from 'app/models/genotyping/project';
import { Component, ChangeDetectionStrategy, Input, EventEmitter, Output, SimpleChanges } from '@angular/core';
import { Locus } from 'app/models/locus/locus';
import { GenotypeFilter } from 'app/reducers/genotyping-projects/genotyping-projects';
import { Bar } from 'app/containers/components/plots/canvas';


@Component({
  selector: 'mspat-genotypes-editor-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="genotypes-editor row justify-content-center">
      <mat-card class="genotypes-filter col-sm-3 mat-elevation-z8">
        <mat-card-title><h4>Genotype Filter</h4></mat-card-title>
        <mat-card-content>
          <form [formGroup]="filterForm">

            <mat-form-field floatLabel="always">
              <mat-label>Locus</mat-label>
              <mat-select matInput formControlName="locus">
                <mat-option *ngFor="let locus of sortedLoci" [value]="locus.id">
                  {{locus.label}}
                </mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field floatLabel="always">
              <mat-label>Sample Filter</mat-label>
              <input type="text" matInput formControlName="sample_barcode_regex">
            </mat-form-field>

            <mat-radio-group class="peak-flag-radio-group" matInput formControlName="genotype_flag">
              <h6>Genotype Flags</h6>
              <mat-radio-button class="peak-flag-radio-button" [value]="'failure'">Failures Only</mat-radio-button>
              <mat-radio-button class="peak-flag-radio-button" [value]="'offscale'">Offscale Only</mat-radio-button>
              <mat-radio-button class="peak-flag-radio-button" [value]="'out_of_bin'">Out of Bin Peaks</mat-radio-button>
              <mat-radio-button class="peak-flag-radio-button" [value]="'all'">All Genotypes</mat-radio-button>
            </mat-radio-group>

            <mat-form-field floatLabel="always">
              <mat-label>Crosstalk Limit</mat-label>
              <input type="number" min="0" step=".1" matInput formControlName="crosstalk_limit">
            </mat-form-field>

            <mat-form-field floatLabel="always">
              <mat-label>Bleedthrough Limit</mat-label>
              <input type="number" min="0" step=".1" matInput formControlName="bleedthrough_limit">
            </mat-form-field>

            <mat-form-field floatLabel="always">
              <mat-label>Min. Allele Count</mat-label>
              <input type="number" min="0" step="1" matInput formControlName="min_allele_count">
            </mat-form-field>

            <mat-form-field floatLabel="always">
              <mat-label>Max. Allele Count</mat-label>
              <input type="number" min="0" step="1" matInput formControlName="max_allele_count">
            </mat-form-field>

            <mat-form-field floatLabel="always">
              <mat-label>Min. Main Peak Height</mat-label>
              <input type="number" min="0" step="100" matInput formControlName="min_main_peak_height">
            </mat-form-field>

            <mat-form-field floatLabel="always">
              <mat-label>Max. Main Peak Height</mat-label>
              <input type="number" min="0" step="100" matInput formControlName="max_main_peak_height">
            </mat-form-field>
          </form>
          <mat-card-actions>
            <button mat-raised-button color="primary" (click)="applyFilterClicked()" [disabled]="filterForm.invalid">APPLY FILTER</button>
            <button mat-raised-button color="primary" (click)="clearFilterClicked()">CLEAR FILTER</button>
          </mat-card-actions>
        </mat-card-content>
      </mat-card>
      <div class="filtered-genotypes col-sm-8 row">
        <div class="trace-viewer mat-elevation-z8 col-sm-12">
          <div *ngIf="activeGenotypeID" class="genotype-active">

            <div *ngIf="!referenceRunDisplay">
              <mat-spinner [diameter]="spinnerDiameter"></mat-spinner>
            </div>

            <div *ngIf="referenceRunDisplay" class="reference-run">
              <mspat-genotype-trace-display [traceDisplay]="referenceRunDisplay" (toggleAllele)="toggleAlleleClicked($event)"></mspat-genotype-trace-display>
            </div>

            <div *ngIf="nonReferenceRunDisplay">
              <div *ngFor="let run of nonReferenceRunDisplays" class="non-reference-run">
                <div *ngIf="run">
                  <mspat-genotype-trace-display [traceDisplay]="run"></mspat-genotype-trace-display>
                </div>
                <div *ngIf="!run">
                  <mat-spinner [diameter]="spinnerDiameter"></mat-spinner>
                </div>
              </div>
            </div>

          </div>

          <div *ngIf="!activeGenotypeID" class="genotype-inactive justify-content-center">
            <h3>SELECT GENOTYPE</h3>
          </div>

        </div>

        <mat-card class="genotype-list mat-elevation-z8 col-sm-12">
          <mat-card-content>
            <mspat-genotype-list
            [genotypes]="genotypes"
            [selected]="activeGenotypeID"
            (select)="selectFilteredGenotype.emit($event)">
            </mspat-genotype-list>
          </mat-card-content>
          <mat-card-actions>
            <button mat-raised-button color="primary" (click)="toggleShowNonReferenceRuns.emit()">
              <span *ngIf="nonReferenceRunDisplay">HIDE NON REFERENCE RUNS</span>
              <span *ngIf="!nonReferenceRunDisplay">SHOW NON REFERENCE RUNS</span>
            </button>
          </mat-card-actions>
        </mat-card>

      </div>
    </div>
  `,
  styles: [`
    .genotypes-editor {
      width: 100%
    }

    .filtered-genotypes {
      height: 100%
    }

    .genotypes-filter {
      margin: 16px;
      padding: 16px;
      border-radius: 8px;
      height: 90%;
    }

    .genotype-list {
      margin: 16px;
      padding: 16px;
      border-radius: 8px;
      height: 40vh;
    }

    .genotype-list mat-card-content {
      height: calc(100% - 60px);
    }

    .genotype-list mat-card-actions {
      height: 60px;
    }

    .genotype-inactive {
      height: 5vh;
      margin: 0
    }

    .trace-viewer {
      margin: 16px;
      padding: 16px;
      border-radius: 8px;
      height: 50%;
    }

    form > mat-form-field {
      width: 100%
    }

    .checkbox {
      margin: 0 10px;
    }

    .half-width {
      width: 45%;
      margin: 5px;
    }

    .full-width {
      width: 100%
    }

    .reference-run {
      height: 200px;
      margin: 0 0 5px 0;
    }

    .non-reference-run {
      height: 200px;
      margin: 0 0 5px 0;
    }

    .mat-card-actions > * {
      margin-left: 15px;
    }

    .peak-flag-radio-group {
      display: inline-flex;
      flex-direction: column;
    }

    .peak-flag-radio-button {
      left-margin: 5px;
      bottom-margin: 5px;
    }
  `]
})
export class GenotypeEditorTabComponent {
  @Input() genotypingProject: GenotypingProject;
  @Input() loci: Locus[] = [];
  @Input() genotypes: Genotype[] = [];
  @Input() activeGenotypeID: number;
  @Input() loadingGenotype: boolean;
  @Input() referenceRunDisplay: TraceDisplay;
  @Input() nonReferenceRunDisplays: TraceDisplay[] = [];
  @Input() nonReferenceRunDisplay: boolean;

  @Output() applyFilter: EventEmitter<GenotypeFilter> = new EventEmitter();
  @Output() clearFilter: EventEmitter<void> = new EventEmitter();

  @Output() selectFilteredGenotype: EventEmitter<number> = new EventEmitter();

  @Output() toggleShowNonReferenceRuns: EventEmitter<void> = new EventEmitter();

  @Output() toggleAllele: EventEmitter<number> = new EventEmitter();

  filterForm: FormGroup;

  public spinnerDiameter = 150;

  constructor(private fb: FormBuilder) {
    this.createForm();
  }

  createForm() {
    this.filterForm = this.fb.group({
      locus: [null, Validators.required],
      sample_barcode_regex: [null],
      genotype_flag: ['all', Validators.required],
      crosstalk_limit: [null],
      bleedthrough_limit: [null],
      min_allele_count: [null],
      max_allele_count: [null],
      min_main_peak_height: [null],
      max_main_peak_height: [null]
    })
  }

  applyFilterClicked() {
    this.applyFilter.emit(this.filterForm.value);
  }

  clearFilterClicked() {
    this.clearFilter.emit();
    this.createForm();
  }

  toggleAlleleClicked(e: Bar) {
    this.toggleAllele.emit(e.id);
  }

  get sortedLoci() {
    return this.loci.sort((a, b) => a.label.localeCompare(b.label));
  }
}
