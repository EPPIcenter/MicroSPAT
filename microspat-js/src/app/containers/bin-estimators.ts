import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { Store } from '@ngrx/store';

import * as binEstimators from 'app/actions/bin-estimators';

import * as fromRoot from 'app/reducers';
import * as fromDB from 'app/reducers/db';
import * as fromTasks from 'app/reducers/tasks';
import * as fromBinEstimators from 'app/reducers/bin-estimators/bin-estimators';

import { BinEstimatorProject } from 'app/models/bin-estimator/project';

@Component({
  selector: 'mspat-bin-estimators',
  template: `
  <div [ngSwitch]="appState$ | async">

    <div *ngSwitchCase="states.list_state" class="container-fluid">
      <div class="row">
        <div class="col-sm-12">
          <mspat-bin-estimator-list
            [binEstimators]="binEstimators$ | async"
            [binEstimatorsLoading]="binEstimatorsLoading$ | async"
            (selectBinEstimator)="selectBinEstimator($event)">
          </mspat-bin-estimator-list>
        </div>
      </div>
    </div>

    <div *ngSwitchCase="states.details_state" class="container-fluid">
      <div class="row">
        <div class="col-sm-12">
          <mspat-bin-estimator-details
            [binEstimator]="activeBinEstimator$ | async">
          </mspat-bin-estimator-details>
        </div>
      </div>
    </div>

    <div *ngSwitchCase="states.create_state" class="container-fluid">
      <div class="row">
        <div class="col-sm-12">

        </div>
      </div>
    </div>

  </div>
  `
})
export class BinEstimatorsComponent {
  appState$: Observable<string>;

  binEstimators$: Observable<BinEstimatorProject[]>;
  binEstimatorsLoading$: Observable<boolean>;

  activeBinEstimator$: Observable<BinEstimatorProject>;

  states = {
    list_state: 'list',
    details_state: 'details',
    create_state: 'create'
  }

  constructor(private store: Store<fromRoot.AppState>) {
    this.appState$ = this.store.select(fromBinEstimators.selectAppState);
    this.activeBinEstimator$ = this.store.select(fromBinEstimators.selectActiveBinEstimator);
    this.binEstimators$ = this.store.select(fromDB.selectBinEstimatorProjectList);
    this.binEstimatorsLoading$ = this.store.select(fromBinEstimators.selectLoadingBinEstimators)
  }

  selectBinEstimator(e: number) {
    this.store.dispatch(new binEstimators.ActivateBinEstimatorAction(e));
  }
}
