import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';

import { BinEstimatorProject } from 'app/models/bin-estimator/project';
import { LocusSet } from 'app/models/locus/locus-set';
import { Locus } from 'app/models/locus/locus';
import { Task } from 'app/models/task';
import { BinEstimatorLocusParams } from 'app/models/bin-estimator/locus-params';
import { Sample } from 'app/models/sample/sample';
import { LocusBinSet } from 'app/models/bin-estimator/locus-bin-set';
import { Bin } from 'app/models/bin-estimator/bin';

@Component({
  selector: 'mspat-bin-estimator-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bin-estimator-details">
      <mat-tab-group>

        <mat-tab [disabled]="!binEstimator?.detailed || anyTask" label="Details">
          <mspat-bin-estimator-details-tab
            [binEstimator]="binEstimator"
            [locusSet]="locusSet"
            [activeTasks]="activeBinEstimatorTasks"
            [failedTasks]="failedBinEstimatorTasks"
            (deleteBinEstimator)="deleteBinEstimator.emit($event)">
          </mspat-bin-estimator-details-tab>
        </mat-tab>

        <mat-tab [disabled]="!binEstimator?.detailed || anyTask" label="Samples">
          <mspat-bin-estimator-samples-tab
            [activeSamples]="activeSamples"
            [inactiveSamples]="inactiveSamples"
            [activeTasks]="activeBinEstimatorTasks"
            [failedTasks]="failedBinEstimatorTasks"
            [disabled]="anyTask"
            (addSamples)="addSamples.emit({project_id: binEstimator.id, sample_ids: $event})"
            (removeSamples)="removeSamples.emit({project_id: binEstimator.id, sample_ids: $event})">
          </mspat-bin-estimator-samples-tab>
        </mat-tab>

        <mat-tab [disabled]="!binEstimator?.detailed || anyTask" label="Analysis Settings">
          <mspat-bin-estimator-analysis-settings
            [activeLocusParameters]="activeLocusParameters"
            [activeTasks]="activeBinEstimatorTasks"
            [failedTasks]="failedBinEstimatorTasks"
            (analyzeLoci)="analyzeLoci.emit($event)">
          </mspat-bin-estimator-analysis-settings>
        </mat-tab>

        <mat-tab [disabled]="!binEstimator?.detailed || anyTask" label="Bins">
          <mspat-bin-estimator-bins-tab [activeLocusBinSets]="activeLocusBinSets"
                                        [activeLocusBinSetID]="activeLocusBinSetID"
                                        [selectedLocus]="selectedLocus"
                                        [bins]="activeBins"
                                        [peakAnnotations]="peakAnnotations"
                                        [selectedBin]="selectedBin"
                                        [activeTasks]="activeBinEstimatorTasks"
                                        (selectLocusBinSet)="selectBinLocus.emit($event)"
                                        (selectBin)="selectBin.emit($event)"
                                        (addBin)="addBin.emit($event)"
                                        (saveBin)="saveBin.emit($event)"
                                        (deleteBin)="deleteBin.emit($event)">
          </mspat-bin-estimator-bins-tab>
        </mat-tab>

      </mat-tab-group>
    </div>
  `,
  styles: [`
    .bin-estimator-details {
      height: 95vh;
    }
  `]
})
export class BinEstimatorDetailsComponent {
  @Input() binEstimator: BinEstimatorProject;
  @Input() activeSamples: Sample[] = [];
  @Input() inactiveSamples: Sample[] = [];
  @Input() locusSet: LocusSet;
  @Input() activeLocusParameters: BinEstimatorLocusParams[] = [];
  @Input() selectedLocus: Locus;

  @Input() activeLocusBinSets: LocusBinSet[] = [];
  @Input() activeLocusBinSetID: number;
  @Input() activeBins: Bin[] = [];
  @Input() peakAnnotations: any[];
  @Input() selectedBin: Bin;

  @Input() activeBinEstimatorTasks: Task[] = [];
  @Input() failedBinEstimatorTasks: Task[] = [];

  @Output() deleteBinEstimator: EventEmitter<number> = new EventEmitter();
  @Output() addSamples = new EventEmitter();
  @Output() removeSamples = new EventEmitter();
  @Output() analyzeLoci = new EventEmitter();

  @Output() selectBinLocus = new EventEmitter();
  @Output() selectBin = new EventEmitter();
  @Output() addBin = new EventEmitter();
  @Output() saveBin = new EventEmitter();
  @Output() deleteBin = new EventEmitter();

  constructor() {}

  get activeBinEstimatorTask() {
    return this.activeBinEstimatorTasks.length > 0 ? this.activeBinEstimatorTasks[0] : false;
  }

  get failedBinEstimatorTask() {
    return this.failedBinEstimatorTasks.length > 0 ? this.failedBinEstimatorTasks[0] : false;
  }

  get anyTask() {
    return this.activeBinEstimatorTask || this.failedBinEstimatorTask;
  }

}
