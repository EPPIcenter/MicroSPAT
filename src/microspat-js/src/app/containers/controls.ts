import { Component } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';

import * as controls from 'app/actions/controls';

import { Control } from 'app/models/sample/control';
import { BinEstimatorProject } from 'app/models/bin-estimator/project';
import { Task } from 'app/models/task';

import * as fromRoot from 'app/reducers';
import * as fromDB from 'app/reducers/db';
import * as fromTasks from 'app/reducers/tasks';
import * as fromControls from 'app/reducers/controls/controls';

import { ControlService } from 'app/services/sample/control';


@Component({
  selector: 'mspat-controls',
  template: `
  <div class="container-fluid">
   <div class="row">
    <div class="col-sm-3">
      <div class="row">
        <div class="control-list col-sm-12">
          <mspat-controls-list
            [controls]="controls$ | async"
            [selectedControl]="selectedControl$ | async"
            (selectControl)="selectControl($event)">
          </mspat-controls-list>
        </div>
      </div>
    </div>
    <div class="col-sm-9">
      <div class="row">
        <div class="control-details col-sm-12">
          <mspat-control-details
            [selectedControl]="selectedControl$ | async"
            [selectedBinEstimator]="selectedBinEstimator$ | async"
            [binEstimators]="binEstimators$ | async"
            [validAlleles]="activeAlleleSets$ | async"
            [activeTasks]="activeTasks$ | async"
            [failedTasks]="failedTasks$ | async"
            (selectBinEstimator)="selectBinEstimator($event)"
            (cancel)="cancel()"
            (submit)="submit($event)"
            (deleteControl)="deleteControl($event)">
          </mspat-control-details>
        </div>
      </div>
    </div>
   </div>
  </div>
  `,
  styles: [`
    .control-list {
      height: 95vh;
    }
  `]
})
export class ControlsComponent {
  controls$: Observable<Control[]>;
  binEstimators$: Observable<BinEstimatorProject[]>;
  selectedControl$: Observable<Control>;
  selectedBinEstimator$: Observable<BinEstimatorProject>;
  activeAlleleSets$: Observable<fromControls.AlleleSet[]>;
  activeTasks$: Observable<Task[]>;
  failedTasks$: Observable<Task[]>;

  constructor(private store: Store<fromRoot.AppState>, private controlService: ControlService) {
    this.controls$ = this.store.select(fromControls.selectControlList);
    this.selectedControl$ = this.store.select(fromControls.selectActiveControl);
    this.selectedBinEstimator$ = this.store.select(fromControls.selectActiveBinEstimator);
    this.activeAlleleSets$ = this.store.select(fromControls.selectActiveAlleleSets);
    this.binEstimators$ = this.store.select(fromDB.selectBinEstimatorProjectList);
    this.activeTasks$ = this.store.select(fromTasks.selectActiveTasks());
    this.failedTasks$ = this.store.select(fromTasks.selectFailedTasks());
  }

  selectControl(id: number) {
    this.store.dispatch(new controls.SelectControlAction(id));
  }

  selectBinEstimator(id: number) {
    this.store.dispatch(new controls.ActivateBinEstimatorProjectAction(id))
  }

  cancel() {
    this.store.dispatch(new controls.DeactivateControlAction());
  }

  submit(ctrl: Control) {
    this.store.dispatch(new controls.SubmitControlAction(ctrl))
  }

  deleteControl(id: number) {
    this.store.dispatch(new controls.DeleteControlAction(id));
  }
}
