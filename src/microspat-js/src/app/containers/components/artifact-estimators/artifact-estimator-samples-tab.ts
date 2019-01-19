import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { Sample } from 'app/models/sample/sample';
import { Task } from 'app/models/task';


@Component({
  selector: 'mspat-artifact-estimator-samples-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sample-lists row justify-content-center">
      <div class="col-sm-6">
        <mspat-sample-selector-list
          [samples]="activeSamples"
          selectButtonLabel="REMOVE"
          header="Active Samples"
          [disabled]="disabled"
          (selected)="removeSamples.emit($event)">
        </mspat-sample-selector-list>
      </div>
      <div class="col-sm-6">
        <mspat-sample-selector-list
          [samples]="inactiveSamples"
          selectButtonLabel="ADD"
          header="Inactive Samples"
          [disabled]="disabled"
          (selected)="addSamples.emit($event)">
        </mspat-sample-selector-list>
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
    .sample-lists {
      height: 88vh;
      width: 100%;
    }

    .task-progress {
      width: 90%
    }
  `]
})

export class ArtifactEstimatorSamplesTabComponent {
  @Input() activeSamples: Sample[];
  @Input() inactiveSamples: Sample[];
  @Input() activeTasks: Task[] = [];
  @Input() failedTasks: Task[] = [];
  @Input() disabled = false;

  @Output() removeSamples: EventEmitter<number[]> = new EventEmitter();
  @Output() addSamples: EventEmitter<number[]> = new EventEmitter();

  constructor() {}

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
