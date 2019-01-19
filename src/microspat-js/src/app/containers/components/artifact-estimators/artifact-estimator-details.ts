import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, SimpleChanges, OnChanges } from '@angular/core';

import { ArtifactEstimatorProject } from 'app/models/artifact-estimator/project';
import { ArtifactEstimatorLocusParams } from 'app/models/artifact-estimator/locus-params';
import { LocusArtifactEstimator } from 'app/models/artifact-estimator/locus-artifact-estimator';
import { ArtifactEstimator } from 'app/models/artifact-estimator/artifact-estimator';
import { LocusSet } from 'app/models/locus/locus-set';
import { Task } from 'app/models/task';
import { Sample } from 'app/models/sample/sample';


// <mat-tab [disabled]="!artifactEstimatorProject?.detailed || anyTask" label="Samples">
//           <mspat-artifact-estimator-samples-tab
//             [activeSamples]="activeSamples"
//             [inactiveSamples]="inactiveSamples"
//             [activeTasks]="activeArtifactEstimatorTasks"
//             [failedTasks]="failedArtifactEstimatorTasks"
//             [disabled]="anyTask"
//             (addSamples)="addSamples.emit({project_id: artifactEstimatorProject.id, sample_ids: $event})"
//             (removeSamples)="removeSamples.emit({project_id: artifactEstimatorProject.id, sample_ids: $event})">
//           </mspat-artifact-estimator-samples-tab>
//         </mat-tab>

//         <mat-tab [disabled]="!artifactEstimatorProject?.detailed || anyTask" label="Analysis Settings">
//           <mspat-artifact-estimator-analysis-settings
//             [activeLocusParameters]="activeLocusParameters"
//             [activeTasks]="activeArtifactEstimatorTasks"
//             [failedTasks]="failedArtifactEstimatorTasks"
//             (analyzeLoci)="analyzeLoci.emit($event)">
//           </mspat-artifact-estimator-analysis-settings>
//         </mat-tab>

//         <mat-tab [disabled]="!artifactEstimatorProject?.detailed || anyTask" label="Artifact Estimators">
//           <mspat-artifact-estimator-equations-tab [activeLocusArtifactSets]="activeLocusArtifactSets"
//                                         [activeLocusArtifactSetID]="activeLocusArtifactSetID"
//                                         [selectedLocus]="selectedLocus"
//                                         [artifacts]="activeArtifacts"
//                                         [peakAnnotations]="peakAnnotations"
//                                         [selectedArtifact]="selectedArtifact"
//                                         [activeTasks]="activeArtifactEstimatorTasks"
//                                         (selectLocusArtifactSet)="selectArtifactLocus.emit($event)"
//                                         (selectArtifact)="selectArtifact.emit($event)"
//                                         (addArtifact)="addArtifact.emit($event)"
//                                         (saveArtifact)="saveArtifact.emit($event)"
//                                         (deleteArtifact)="deleteArtifact.emit($event)">
//           </mspat-artifact-estimator-equations-tab>
//         </mat-tab>

@Component({
  selector: 'mspat-artifact-estimator-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="artifact-estimator-details">
      <mat-tab-group>

        <mat-tab [disabled]="!artifactEstimatorProject?.detailed || anyTask" label="Details">
          <mspat-artifact-estimator-details-tab
            [artifactEstimatorProject]="artifactEstimatorProject"
            [locusSet]="locusSet"
            [activeTasks]="activeArtifactEstimatorTasks"
            [failedTasks]="failedArtifactEstimatorTasks"
            (deleteArtifactEstimator)="deleteArtifactEstimator.emit($event)">
          </mspat-artifact-estimator-details-tab>
        </mat-tab>

        <mat-tab [disabled]="!artifactEstimatorProject?.detailed || anyTask" label="Samples">
          <mspat-artifact-estimator-samples-tab
            [activeSamples]="activeSamples"
            [inactiveSamples]="inactiveSamples"
            [activeTasks]="activeArtifactEstimatorTasks"
            [failedTasks]="failedArtifactEstimatorTasks"
            [disabled]="anyTask"
            (addSamples)="addSamples.emit({project_id: artifactEstimatorProject.id, sample_ids: $event})"
            (removeSamples)="removeSamples.emit({project_id: artifactEstimatorProject.id, sample_ids: $event})">
          </mspat-artifact-estimator-samples-tab>
        </mat-tab>
        <mat-tab [disabled]="!artifactEstimatorProject?.detailed || anyTask" label="Analysis Settings">
          <mspat-artifact-estimator-analysis-settings
            [activeLocusParameters]="activeLocusParameters"
            [activeTasks]="activeArtifactEstimatorTasks"
            [failedTasks]="failedArtifactEstimatorTasks"
            (analyzeLoci)="analyzeLoci.emit($event)">
          </mspat-artifact-estimator-analysis-settings>
        </mat-tab>

        <mat-tab [disabled]="!artifactEstimatorProject?.detailed || anyTask" label="Artifact Equations">
          <mspat-artifact-estimator-equations-tab
            [activeLocusArtifactEstimators]='activeLocusArtifactEstimators'
            [activeLocusArtifactEstimatorID]='activeLocusArtifactEstimatorID'
            [activeArtifactEstimators]='activeArtifactEstimators'
            [activeArtifactEstimator]='activeArtifactEstimator'
            [artifactPlot]='artifactPlot'
            [activeTasks]="activeArtifactEstimatorTasks"
            [failedTasks]="failedArtifactEstimatorTasks"
            (selectLocusArtifactEstimator)='selectLocusArtifactEstimator.emit($event)'
            (selectArtifactEstimator)='selectArtifactEstimator.emit($event)'
            (addBreakpoint)="addBreakpoint.emit($event)"
            (deleteEstimator)="deleteEstimator.emit($event)"
            (clearBreakpoints)="clearBreakpoints.emit($event)"
            (recalculateEquation)="recalculateEquation.emit($event)">
          </mspat-artifact-estimator-equations-tab>
        </mat-tab>

      </mat-tab-group>
    </div>
  `,
  styles: [`
    .artifact-estimator-details {
      height: 95vh;
    }
  `]
})
export class ArtifactEstimatorDetailsComponent {
  @Input() artifactEstimatorProject: ArtifactEstimatorProject;
  @Input() locusSet: LocusSet;

  @Input() activeArtifactEstimatorTasks: Task[] = [];
  @Input() failedArtifactEstimatorTasks: Task[] = [];

  @Input() activeSamples: Sample[] = [];
  @Input() inactiveSamples: Sample[] = [];

  @Input() activeLocusParameters: ArtifactEstimatorLocusParams[] = [];
  // @Input() activeLocus: Locus;

  @Input() activeLocusArtifactEstimators: LocusArtifactEstimator[] = [];
  @Input() activeLocusArtifactEstimatorID: number;
  @Input() activeArtifactEstimators: ArtifactEstimator[] = [];
  @Input() activeArtifactEstimator: ArtifactEstimator;
  @Input() artifactPlot;
  // @Input() activeArtifacts: Artifact[] = [];
  // @Input() peakAnnotations: any[];
  // @Input() selectedArtifact: Artifact;

  @Output() deleteArtifactEstimator: EventEmitter<number> = new EventEmitter();
  @Output() addSamples = new EventEmitter();
  @Output() removeSamples = new EventEmitter();
  @Output() analyzeLoci = new EventEmitter();
  @Output() selectLocusArtifactEstimator = new EventEmitter();
  @Output() selectArtifactEstimator = new EventEmitter();
  @Output() addBreakpoint = new EventEmitter();
  @Output() deleteEstimator = new EventEmitter();
  @Output() clearBreakpoints = new EventEmitter();
  @Output() recalculateEquation = new EventEmitter();

  // @Output() selectArtifact = new EventEmitter();
  // @Output() addArtifact = new EventEmitter();
  // @Output() saveArtifact = new EventEmitter();
  // @Output() deleteArtifact = new EventEmitter();

  constructor() {}

  get activeArtifactEstimatorTask() {
    return this.activeArtifactEstimatorTasks.length > 0 ? this.activeArtifactEstimatorTasks[0] : false;
  }

  get failedArtifactEstimatorTask() {
    return this.failedArtifactEstimatorTasks.length > 0 ? this.failedArtifactEstimatorTasks[0] : false;
  }

  get anyTask() {
    return this.activeArtifactEstimatorTask || this.failedArtifactEstimatorTask;
  }
}
