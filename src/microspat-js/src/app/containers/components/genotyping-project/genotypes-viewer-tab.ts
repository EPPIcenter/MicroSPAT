import { GenotypingProjectService } from 'app/services/genotyping/project';
import { TraceDisplay } from './genotype-trace-display';
import { GenotypingProject } from 'app/models/genotyping/project';
import { Component, ChangeDetectionStrategy, Input, EventEmitter, Output } from '@angular/core';
import { Sample } from 'app/models/sample/sample';
import { Genotype } from 'app/models/sample/genotype';
import { Bar } from 'app/containers/components/plots/canvas';
import { Task } from 'app/models/task';


@Component({
  selector: 'mspat-genotypes-viewer-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div class="genotypes-viewer row justify-content-center">
    <div class="left-container col-sm-4 row">
      <mat-card class="rounded export-commands col-sm-12 mat-elevation-z8">
        <button [disabled]="anyTask" class="control-button" mat-raised-button color="primary" (click)="calculatePeakProbabilities.emit(genotypingProject.id)">
          CALCULATE PEAK PROBABILITIES
        </button>
        <div *ngIf="anyTask">
          <button [disabled]="true" class="control-button" mat-raised-button color="primary">EXPORT ALLELES</button>
          <button [disabled]="true" class="control-button" mat-raised-button color="primary">EXPORT PEAK DATA</button>
        </div>
        <div *ngIf="!anyTask">
          <a class="control-button" mat-raised-button color="primary" [href]="exportAllelesURL">EXPORT ALLELES</a>
          <a class="control-button" mat-raised-button color="primary" [href]="exportPeaksURL">EXPORT PEAK DATA</a>
        </div>

      </mat-card>
      <mat-card class="rounded sample-list col-sm-12 mat-elevation-z8">
        <mspat-sample-genotyping-list
          [genotypes]="allGenotypes"
          [selectedSample]="activeSample"
          (selectSample)="selectSample.emit($event)">
        </mspat-sample-genotyping-list>
      </mat-card>
    </div>
    <div class="right-container col-sm-7 row">
      <mat-card class="rounded run-container col-sm-12 mat-elevation-z8">
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
      </mat-card>
      <mat-card class="rounded genotype-list col-sm-12 mat-elevation-z8">
        <mat-card-content class="genotype-list-container">
          <mspat-genotype-list by="sample"
            [genotypes]="sampleGenotypes"
            [selected]="activeGenotypeID"
            (select)="selectGenotype.emit($event)">
          </mspat-genotype-list>
        </mat-card-content>
        <mat-card-actions class="genotype-list-actions">
          <button mat-raised-button color="primary" (click)="toggleShowNonReferenceRuns.emit()">
            <span *ngIf="nonReferenceRunDisplay">HIDE NON REFERENCE RUNS</span>
            <span *ngIf="!nonReferenceRunDisplay">SHOW NON REFERENCE RUNS</span>
          </button>
        </mat-card-actions>
      </mat-card>
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
    .genotypes-viewer {
      height: 90vh;
      width: 100%
    }

    .genotypes-viewer > * {
      margin: 0px;
    }

    .control-button {
      width: 98%;
      margin: 5px 4px;
    }

    .left-container {
      height: 100%;
      padding-bottom: 15px;
    }

    .right-container {
      height: 100%;
      padding-bottom: 15px;
    }

    .rounded {
      margin: 8px;
      padding: 8px;
      border-radius: 8px;
    }

    .export-commands {
      height: 150px;
      padding: 6px 6px;
    }

    .sample-list {
      height: calc(100% - 175px);
    }

    .reference-run {
      margin: 0 0 5px 0;
    }

    .non-reference-run {
      margin: 0 0 5px 0;
    }

    .genotype-list {
      min-height: 300px;
      max-height: calc(100% - 200px);
    }

    .genotype-list-container {
      height: calc(100% - 50px);
      margin-bottom: 0px;
    }

    .genotype-list-actions {
      height: 50px;
      margin-left: 16px;
    }

  `]
})
export class GenotypeViewerTabComponent {
  @Input() genotypingProject: GenotypingProject;
  @Input() activeSample: Sample;
  @Input() allGenotypes: Genotype[] = [];
  @Input() sampleGenotypes: Genotype[] = [];
  @Input() referenceRunDisplay: TraceDisplay;
  @Input() nonReferenceRunDisplays: TraceDisplay[] = [];
  @Input() nonReferenceRunDisplay: boolean;
  @Input() activeGenotypeID: number;

  @Input() activeTasks: Task[] = [];
  @Input() failedTasks: Task[] = []

  @Output() selectGenotype: EventEmitter<number> = new EventEmitter();
  @Output() selectSample: EventEmitter<number> = new EventEmitter();
  @Output() toggleAllele: EventEmitter<number> = new EventEmitter();
  @Output() toggleShowNonReferenceRuns: EventEmitter<void> = new EventEmitter();

  @Output() getPeakData: EventEmitter<number> = new EventEmitter();
  @Output() getAlleleData: EventEmitter<number> = new EventEmitter();
  @Output() calculatePeakProbabilities = new EventEmitter();

  public spinnerDiameter = 250;

  constructor(private gps: GenotypingProjectService) {}

  toggleAlleleClicked(e: Bar) {
    this.toggleAllele.emit(e.id);
  }

  get exportAllelesURL() {
    return this.gps.getAllelesURL(this.genotypingProject.id);
  }

  get exportPeaksURL() {
    return this.gps.getPeakDataURL(this.genotypingProject.id);
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
