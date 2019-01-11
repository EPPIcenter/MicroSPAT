import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from "@angular/core";
import { QuantificationBiasEstimatorProject } from 'app/models/quantification-bias-estimator/project';
import { Task } from 'app/models/task';
import { LocusSet } from 'app/models/locus/locus-set';
import { BinEstimatorProject } from 'app/models/bin-estimator/project';
import { ArtifactEstimatorProject } from 'app/models/artifact-estimator/project';
import { Sample } from 'app/models/sample/sample';
import { ControlSampleAssociation } from 'app/models/sample/control-sample-association';
import { QuantificationBiasEstimatorLocusParams } from 'app/models/quantification-bias-estimator/locus-params';



@Component({
  selector: 'mspat-quant-bias-estimator-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="quant-bias-estimator-details">
      <mat-tab-group>
        <mat-tab [disabled]="!quantBiasEstimator?.detailed || anyTask" label="Details">
          <mspat-quant-bias-estimator-details-tab
            [quantBiasEstimator]="quantBiasEstimator"
            [locusSet]="locusSet"
            [binEstimator]="binEstimator"
            [artifactEstimator]="artifactEstimator"
            [activeTasks]="activeTasks"
            [failedTasks]="failedTasks"
            (deleteAction)="deleteAction.emit($event)">
          </mspat-quant-bias-estimator-details-tab>
        </mat-tab>

        <mat-tab [disabled]="!quantBiasEstimator?.detailed || anyTask" label="Controls">
          <mspat-quant-bias-estimator-controls-tab
            [quantBiasEstimator]="quantBiasEstimator"
            [activeTasks]="activeTasks"
            [failedTasks]="failedTasks"
            [activeSamples]="activeSamples"
            [selectedSample]="selectedSample"
            [activeControls]="activeControls"
            (addControlsFile)="addControlsAction.emit($event)"
            (selectSample)="selectSampleAction.emit($event)">
          </mspat-quant-bias-estimator-controls-tab>
        </mat-tab>

        <mat-tab [disabled]="!quantBiasEstimator?.detailed || anyTask" label="Analysis Settings">
          <mspat-quant-bias-estimator-project-analysis-settings
            [activeLocusParameters]="activeLocusParameters"
            [activeTasks]="activeTasks"
            [failedTasks]="failedTasks"
            (analyzeLoci)="analyzeLoci.emit($event)">
          </mspat-quant-bias-estimator-project-analysis-settings>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .quant-bias-estimator-details {
      height: 95vh;
    }
  `]
})
export class QuantificationBiasEstimatorDetailsComponent {
  @Input() quantBiasEstimator: QuantificationBiasEstimatorProject;
  @Input() locusSet: LocusSet;
  @Input() binEstimator: BinEstimatorProject;
  @Input() artifactEstimator: ArtifactEstimatorProject;
  @Output() deleteAction: EventEmitter<number> = new EventEmitter();

  @Input() activeSamples: Sample[];
  @Input() selectedSample: Sample;
  @Input() activeControls: ControlSampleAssociation[];
  @Output() addControlsAction: EventEmitter<{file: File, project_id: number}> = new EventEmitter();
  @Output() selectSampleAction: EventEmitter<number> = new EventEmitter();

  @Input() activeLocusParameters: QuantificationBiasEstimatorLocusParams[];
  @Output() analyzeLoci = new EventEmitter();

  @Input() activeTasks: Task[] = [];
  @Input() failedTasks: Task[] = [];


  constructor() {

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