import { ChangeDetectionStrategy, Input, Component, Output, EventEmitter, SimpleChanges } from '@angular/core';

import { GenotypingProject } from 'app/models/genotyping/project';
import { BinEstimatorProject } from 'app/models/bin-estimator/project';
import { LocusSet } from 'app/models/locus/locus-set';
import { QuantificationBiasEstimatorProject } from 'app/models/quantification-bias-estimator/project';
import { ArtifactEstimatorProject } from 'app/models/artifact-estimator/project';
import { GenotypingLocusParams } from 'app/models/genotyping/locus-params';
import { Task } from 'app/models/task';
import { Sample } from 'app/models/sample/sample';
import { Locus } from 'app/models/locus/locus';
import { Genotype } from 'app/models/sample/genotype';
import { TraceDisplay } from './genotype-trace-display';
import { MatTabChangeEvent } from '@angular/material';


@Component({
  selector: 'mspat-genotyping-project-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="genotyping-project-details">
      <mat-tab-group (selectedTabChange)="tabChanged($event)">
        <mat-tab [disabled]="!genotypingProject?.detailed || anyTask" label="Details">
          <mspat-genotyping-project-details-tab
            [genotypingProject]="genotypingProject"
            [locusSet]="locusSet"
            [binEstimator]="binEstimatorProject"
            [artifactEstimator]="artifactEstimatorProject"
            [quantificationBiasEstimator]="quantificationBiasEstimatorProject"
            [activeTasks]="activeTasks"
            [failedTasks]="failedTasks"
            (deleteGenotypingProject)="deleteGenotypingProject.emit($event)">
          </mspat-genotyping-project-details-tab>
        </mat-tab>
        <mat-tab [disabled]="!genotypingProject?.detailed || anyTask" label="Samples">
          <mspat-genotyping-project-samples-tab
          [activeSamples]="activeSamples"
          [inactiveSamples]="inactiveSamples"
          [activeTasks]="activeTasks"
          [failedTasks]="failedTasks"
          (addSamples)="addSamples.emit({project_id: genotypingProject.id, sample_ids: $event})"
          (removeSamples)="removeSamples.emit({project_id: genotypingProject.id, sample_ids: $event})"
          (addSamplesFile)="addSamplesFile.emit({samplesFile: $event, projectID: genotypingProject.id})">
          </mspat-genotyping-project-samples-tab>
        </mat-tab>
        <mat-tab [disabled]="!genotypingProject?.detailed || anyTask" label="Analysis Settings">
          <mspat-genotyping-project-analysis-settings
            [activeLocusParameters]="activeLocusParameters"
            [activeTasks]="activeTasks"
            [failedTasks]="failedTasks"
            (analyzeLoci)="analyzeLoci.emit($event)">
          </mspat-genotyping-project-analysis-settings>
        </mat-tab>
        <mat-tab [disabled]="!genotypingProject?.detailed || anyTask" label="Genotypes Viewer">
          <mspat-genotypes-viewer-tab
            [genotypingProject]="genotypingProject"
            [activeSample]="activeSample"
            [allGenotypes]="allGenotypes"
            [sampleGenotypes]="sampleGenotypes"
            [activeGenotypeID]="activeGenotypeID"
            [referenceRunDisplay]="referenceRunDisplay"
            [nonReferenceRunDisplays]="nonReferenceRunDisplays"
            [nonReferenceRunDisplay]="nonReferenceRunDisplay"
            [activeTasks]="activeTasks"
            [failedTasks]="failedTasks"
            (selectSample)="selectSample.emit($event)"
            (selectGenotype)="selectGenotype.emit($event)"
            (toggleShowNonReferenceRuns)="toggleShowNonReferenceRuns.emit()"
            (toggleAllele)="toggleAllele.emit({binID: $event, genotypeID: activeGenotypeID})"
            (getPeakData)="getPeakData.emit($event)"
            (getAlleleData)="getAlleleData.emit($event)"
            (calculatePeakProbabilities)="calculatePeakProbabilities.emit($event)">
          ></mspat-genotypes-viewer-tab>
        </mat-tab>
        <mat-tab [disabled]="!genotypingProject?.detailed || anyTask" label="Genotypes Editor">
          <mspat-genotypes-editor-tab
          [genotypingProject]="genotypingProject"
          [loci]="loci"
          [genotypes]="filteredGenotypes"
          [activeGenotypeID]="activeGenotypeID"
          [loadingGenotype]="loadingGenotype"
          [referenceRunDisplay]="referenceRunDisplay"
          [nonReferenceRunDisplays]="nonReferenceRunDisplays"
          [nonReferenceRunDisplay]="nonReferenceRunDisplay"
          (applyFilter)="applyFilter.emit($event)"
          (clearFilter)="clearFilter.emit($event)"
          (selectFilteredGenotype)="selectFilteredGenotype.emit($event)"
          (toggleShowNonReferenceRuns)="toggleShowNonReferenceRuns.emit()"
          (toggleAllele)="toggleAllele.emit({binID: $event, genotypeID: activeGenotypeID})">
          </mspat-genotypes-editor-tab>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .genotyping-project-details {
      height: 95vh;
    }
  `]
})
export class GenotypingProjectDetailsComponent {
  @Input() genotypingProject: GenotypingProject;
  @Input() locusSet: LocusSet;
  @Input() binEstimatorProject: BinEstimatorProject;
  @Input() artifactEstimatorProject: ArtifactEstimatorProject;
  @Input() quantificationBiasEstimatorProject: QuantificationBiasEstimatorProject;

  @Input() activeSamples: Sample[] = [];
  @Input() inactiveSamples: Sample[] = [];

  @Input() activeLocusParameters: GenotypingLocusParams[] = [];

  @Input() activeSample: Sample;
  @Input() allGenotypes: Genotype[];
  @Input() sampleGenotypes: Genotype[];
  @Input() selectedGenotypeID: number;

  @Input() loci: Locus[] = [];
  @Input() filteredGenotypes: Genotype[] = [];
  @Input() activeGenotypeID: number;
  @Input() loadingGenotype: boolean;
  @Input() referenceRunDisplay: TraceDisplay;
  @Input() nonReferenceRunDisplays: TraceDisplay[];
  @Input() nonReferenceRunDisplay: boolean;

  @Input() activeTasks: Task[] = [];
  @Input() failedTasks: Task[] = [];

  @Output() deleteGenotypingProject: EventEmitter<number> = new EventEmitter();
  @Output() analyzeLoci = new EventEmitter();
  @Output() addSamples = new EventEmitter();
  @Output() removeSamples = new EventEmitter();
  @Output() addSamplesFile = new EventEmitter();

  @Output() applyFilter = new EventEmitter();
  @Output() clearFilter = new EventEmitter();
  @Output() selectGenotype = new EventEmitter();

  @Output() toggleShowNonReferenceRuns = new EventEmitter();
  @Output() toggleAllele = new EventEmitter();
  @Output() selectFilteredGenotype = new EventEmitter();

  // @Output() selectSampleGenotype: EventEmitter<number> = new EventEmitter();
  @Output() selectSample: EventEmitter<number> = new EventEmitter();
  @Output() genotypesDetailTabChange: EventEmitter<string> = new EventEmitter();

  @Output() getPeakData: EventEmitter<number> = new EventEmitter();
  @Output() getAlleleData: EventEmitter<number> = new EventEmitter();
  @Output() calculatePeakProbabilities: EventEmitter<number> = new EventEmitter();

  private tabIndexMap = {
    0: 'details',
    1: 'samples',
    2: 'analysis_settings',
    3: 'genotypes_viewer',
    4: 'genotypes_editor'
  }

  constructor() {};

  get anyTask() {
    return this.activeTasks.length > 0 || this.failedTasks.length > 0;
  }

  tabChanged(e: MatTabChangeEvent) {
    this.genotypesDetailTabChange.emit(this.tabIndexMap[e.index]);
  }


}
