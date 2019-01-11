import { LocusArtifactEstimator } from 'app/models/artifact-estimator/locus-artifact-estimator';
import { OnChanges } from '@angular/core/src/metadata/lifecycle_hooks';
import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter } from '@angular/core';
import { Locus } from 'app/models/locus/locus';
import { ArtifactEstimator } from 'app/models/artifact-estimator/artifact-estimator';
import { MatSelectChange } from '@angular/material';
import { Task } from 'app/models/task';


@Component({
  selector: 'mspat-artifact-estimator-equations-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="artifact-estimator-tab row">
      <div class="col-sm-4">
        <mspat-project-locus-list
          [loci]="loci"
          [selected]="activeLocusArtifactEstimatorID"
          (select)="selectLocusArtifactEstimator.emit($event)">
        </mspat-project-locus-list>
      </div>
      <div *ngIf="activeLocusArtifactEstimatorID" class="col-sm-8">

        <div class="row artifact-selector mat-elevation-z8">
          <div class="col-sm-12">
            <mat-form-field>
              <mat-select placeholder="Select Artifact Distance"
                (selectionChange)="selectedArtifactEstimator($event)"
                [value]="activeArtifactEstimator?.id">
                <mat-option *ngFor="let artifactEstimator of activeArtifactEstimators"
                  [value]="artifactEstimator.id">
                  Distance: {{artifactEstimator.label}} | Total Peaks: {{artifactEstimator.peak_data.length}}
                </mat-option>
              </mat-select>
            </mat-form-field>
          </div>
          <div *ngIf="activeArtifactEstimator" class="col-sm-12">
            <button mat-raised-button color="warn" (click)="deleteEstimator.emit(activeArtifactEstimator.id)">DELETE ESTIMATOR</button>
            <button mat-raised-button color="primary" (click)="clearBreakpoints.emit(activeArtifactEstimator.id)">CLEAR BREAKPOINTS</button>
          </div>
        </div>

        <div class="row">
          <div *ngIf="artifactPlot" class="artifact-plot-container mat-elevation-z8 col-sm-12">
            <mspat-artifact-plot
              [artifactPlot]="artifactPlot"
              (addBreakpoint)="addBreakpointAction($event)">
            </mspat-artifact-plot>
          </div>
        </div>

        <div *ngIf="activeArtifactEstimator" class="row equation-details mat-elevation-z8">
          <div class="equation-entry" *ngFor="let eq of activeArtifactEstimator.artifact_equations; index as i; last as isLast">
            <mat-form-field class="equation-parameters">
              <input matInput [disabled]="true" type="number" placeholder="Start" [value]="eq.start_size | number">
            </mat-form-field>
            <mat-form-field class="equation-parameters">
              <input matInput [disabled]="true" type="number" placeholder="End" [value]="eq.end_size | number">
            </mat-form-field>
            <mat-form-field class="equation-parameters">
              <input matInput [disabled]="true" type="number" placeholder="Slope" [value]="eq.slope | number">
            </mat-form-field>
            <mat-form-field class="equation-parameters">
              <input matInput [disabled]="true" type="number" placeholder="Intercept" [value]="eq.intercept | number">
            </mat-form-field>
            <mat-form-field class="equation-parameters">
              <mat-select placeholder="Method" [value]="eq.method" [disabled]="anyTask">
                <mat-option *ngFor="let method of validMethods"
                  [value]="method.value"
                  (click)="recalculateEquation.emit({id: eq.id, method: method.value})">
                  {{method.label}}
                </mat-option>
              </mat-select>
            </mat-form-field>
            <mat-divider *ngIf="!isLast"></mat-divider>
          </div>
        </div>

        <div *ngIf="anyTask" class="row">
          <div class="col-sm-12">
            <mspat-task-progress-display *ngIf="activeTask" [task]="activeTask"></mspat-task-progress-display>
            <mspat-task-progress-display *ngIf="failedTask" [task]="failedTask"></mspat-task-progress-display>
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .container {
      position: relative;
    }

    button {
      margin: 5px;
    }

    mat-form-field {
      width: 100%;
      margin: 5px;
    }

    .artifact-estimator-tab {
      height: 90vh;
      width: 100%
    }

    .artifact-plot-container {
      padding: 0;
      margin: 16px 0px 16px -4px;
      height: 30vh;
    }

    .artifact-selector {
      display: flex;
      margin: 16px -12px 4px -16px;
      padding: 4px 4px 12px 4px;
      border-radius: 4px;
    }

    .equation-details {
      display: flex;
      padding: 4px 4px 8px 4px;
      border-radius: 8px
    }

    .equation-entry {
      width: 100%;
    }

    .equation-parameters {
      width: 19%;
      margin: 4px 4px 0px 4px;
      font-size: 13px;
    }

  `]
})
export class ArtifactEstimatorEquationsTabComponent {
  @Input() activeLocusArtifactEstimators: LocusArtifactEstimator[] = [];
  @Input() activeLocusArtifactEstimatorID: number;

  @Input() activeArtifactEstimators: ArtifactEstimator[] = [];
  @Input() activeArtifactEstimator: ArtifactEstimator;

  @Input() activeTasks: Task[] = [];
  @Input() failedTasks: Task[] = [];

  @Input() artifactPlot;

  @Output() selectLocusArtifactEstimator: EventEmitter<number> = new EventEmitter();
  @Output() selectArtifactEstimator: EventEmitter<number> = new EventEmitter();
  @Output() addBreakpoint: EventEmitter<{base_size: number, id: number | string}> = new EventEmitter();
  @Output() deleteEstimator: EventEmitter<number> = new EventEmitter();
  @Output() clearBreakpoints: EventEmitter<number> = new EventEmitter();
  @Output() recalculateEquation: EventEmitter<{id: number | string, method: 'TSR' | 'LSR' | 'RANSAC' | 'no_slope'}> = new EventEmitter();

  private validMethods = [
    {
      value: 'TSR',
      label: 'Theil-Sen Regression'
    },
    {
      value: 'LSR',
      label: 'Least Squares Regression'
    },
    {
      value: 'RANSAC',
      label: 'Random Sample Consensus'
    },
    {
      value: 'no_slope',
      label: 'Mean Value'
    }
  ]

  get loci() {
    return this.activeLocusArtifactEstimators.map(lbs => {
      const locus = Object.assign({}, lbs.locus as Locus);
      locus.id = lbs.id;
      return locus
    })
  }

  selectedArtifactEstimator(e: MatSelectChange) {
    this.selectArtifactEstimator.emit(e.value);
  }

  addBreakpointAction(base_size: number) {
    this.addBreakpoint.emit({
      base_size: base_size,
      id: this.activeArtifactEstimator.id
    });
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
