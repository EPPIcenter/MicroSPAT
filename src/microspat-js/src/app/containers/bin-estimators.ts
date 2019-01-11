import { Component } from '@angular/core';
import { Observable, combineLatest } from 'rxjs';
import { Store } from '@ngrx/store';

import * as binEstimators from 'app/actions/bin-estimators';

import * as fromRoot from 'app/reducers';
import * as fromDB from 'app/reducers/db';
import * as fromTasks from 'app/reducers/tasks';
import * as fromBinEstimators from 'app/reducers/bin-estimators/bin-estimators';

import { BinSettings } from 'app/services/bin-estimator/bin';
import { BinEstimatorLocusParams } from 'app/models/bin-estimator/locus-params';
import { BinEstimatorProject } from 'app/models/bin-estimator/project';
import { LocusSet } from 'app/models/locus/locus-set';
import { Sample } from 'app/models/sample/sample';
import { Task } from 'app/models/task';
import { Locus } from 'app/models/locus/locus';
import { LocusBinSet } from 'app/models/bin-estimator/locus-bin-set';
import { Bin } from 'app/models/bin-estimator/bin';
import { Circle, Bar } from './components/plots/canvas';
import { map } from 'rxjs/operators';

@Component({
  selector: 'mspat-bin-estimators',
  template: `
  <div [ngSwitch]="appState$ | async">

    <div *ngSwitchCase="states.list_state" class="container-fluid">
      <div class="row">
        <div class="col-sm-6">
          <mspat-bin-estimator-list
            [binEstimators]="binEstimators$ | async"
            [binEstimatorsLoading]="binEstimatorsLoading$ | async"
            [activeTasks]="activeTasks$ | async"
            (selectBinEstimator)="selectBinEstimator($event)">
          </mspat-bin-estimator-list>
        </div>
        <div class="col-sm-6">
          <mspat-bin-estimator-creator
            [locusSets]="locusSets$ | async"
            [activeTasks]="activeTasks$ | async"
            [failedTasks]="failedTasks$ | async"
            (submit)="createBinEstimator($event)">
          </mspat-bin-estimator-creator>
        </div>
      </div>
    </div>

    <div *ngSwitchCase="states.details_state" class="container-fluid">
      <div class="row">
        <div class="col-sm-12">
          <mspat-bin-estimator-details
            [binEstimator]="activeBinEstimator$ | async"
            [locusSet]="activeLocusSet$ | async"
            [activeLocusParameters]="activeLocusParameters$ | async"
            [activeSamples]="activeSamples$ | async"
            [inactiveSamples]="inactiveSamples$ | async"
            [activeLocusBinSetID]="activeLocusBinSetID$ | async"
            [activeLocusBinSets]="activeLocusBinSets$ | async"
            [activeBins]="activeBins$ | async"
            [peakAnnotations]="peakAnnotations$ | async"
            [selectedLocus]="selectedLocus$ | async"
            [selectedBin]="selectedBin$ | async"
            [activeBinEstimatorTasks]="activeTasks$ | async"
            [failedBinEstimatorTasks]="failedTasks$ | async"
            (addSamples)="addSamples($event)"
            (removeSamples)="removeSamples($event)"
            (deleteBinEstimator)="deleteBinEstimator($event)"
            (analyzeLoci)="analyzeLoci($event)"
            (selectBinLocus)="selectBinLocus($event)"
            (selectBin)="selectBin($event)"
            (addBin)="addBin($event)"
            (saveBin)="saveBin($event)"
            (deleteBin)="deleteBin($event)">
          </mspat-bin-estimator-details>
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
  locusSets$: Observable<LocusSet[]>;


  activeBinEstimator$: Observable<BinEstimatorProject>;
  activeSamples$: Observable<Sample[]>;
  inactiveSamples$: Observable<Sample[]>;
  activeLocusSet$: Observable<LocusSet>;
  activeLocusParameters$: Observable<BinEstimatorLocusParams[]>
  activeLocusBinSets$: Observable<LocusBinSet[]>;
  activeLocusBinSetID$: Observable<number>;
  activeLoci$: Observable<Locus[]>;
  activeLociWithBinSets$: Observable<Locus[]>;
  activeBins$: Observable<Bar[]>;
  peakAnnotations$: Observable<Circle[]>;
  selectedLocus$: Observable<Locus>;
  selectedBin$: Observable<Bin>;

  activeTasks$: Observable<Task[]>;
  failedTasks$: Observable<Task[]>;

  states = {
    list_state: 'list',
    details_state: 'details',
  }

  constructor(private store: Store<fromRoot.AppState>) {
    this.appState$ = this.store.select(fromBinEstimators.selectAppState);
    this.activeBinEstimator$ = this.store.select(fromBinEstimators.selectActiveBinEstimator);
    this.activeLocusSet$ = this.store.select(fromBinEstimators.selectActiveLocusSet);
    this.activeLocusParameters$ = this.store.select(fromBinEstimators.selectActiveLocusParameters);
    this.activeLocusBinSets$ = this.store.select(fromBinEstimators.selectActiveLocusBinSets);
    this.activeBins$ = this.store.select(fromBinEstimators.selectActiveBins);
    this.selectedLocus$ = this.store.select(fromBinEstimators.selectActiveLocus)
    this.peakAnnotations$ = this.store.select(fromBinEstimators.selectActivePeakAnnotations);
    this.activeLocusBinSetID$ = this.store.select(fromBinEstimators.selectActiveLocusBinSetID)
    this.activeLoci$ = this.store.select(fromBinEstimators.selectActiveLoci);
    this.activeSamples$ = this.store.select(fromBinEstimators.selectActiveBinEstimatorSamples);
    this.inactiveSamples$ = this.store.select(fromBinEstimators.selectInactiveSamples);
    this.selectedBin$ = this.store.select(fromBinEstimators.selectSelectedBin);
    this.binEstimators$ = this.store.select(fromDB.selectBinEstimatorProjectList);
    this.locusSets$ = this.store.select(fromDB.selectLocusSetList);
    this.binEstimatorsLoading$ = this.store.select(fromBinEstimators.selectLoadingBinEstimators)
    // this.activeBinEstimatorTasks$ = combineLatest(
    //   this.store.select(fromTasks.selectActiveTasks('bin_estimator_project')),
    //   this.store.select(fromTasks.selectActiveTasks('bin'))
    // ).pipe(
    //   map(tasks => {
    //     return tasks[0].concat(tasks[1]);
    //   })
    // );

    this.activeTasks$ = this.store.select(fromTasks.selectActiveTasks());
    this.failedTasks$ = this.store.select(fromTasks.selectFailedTasks());
    // this.failedBinEstimatorTasks$ = combineLatest(
    //   this.store.select(fromTasks.selectFailedTasks('bin_estimator_project')),
    //   this.store.select(fromTasks.selectFailedTasks('bin'))
    // ).pipe(
    //   map(tasks => {
    //     return tasks[0].concat(tasks[1]);
    //   })
    // );
  }

  selectBinEstimator(e: number) {
    this.store.dispatch(new binEstimators.SelectBinEstimatorAction(e));
  }

  deleteBinEstimator(e: number) {
    this.store.dispatch(new binEstimators.DeleteBinEstimatorAction(e));
  }

  addSamples(e: {project_id: number, sample_ids: number[]}) {
    this.store.dispatch(new binEstimators.AddSamplesAction(e));
  }

  removeSamples(e: {project_id: number, sample_ids: number[]}) {
    this.store.dispatch(new binEstimators.RemoveSamplesAction(e));
  }

  createBinEstimator(e) {
    this.store.dispatch(new binEstimators.CreateBinEstimatorAction(e));
  }

  analyzeLoci(e: {locus_parameter_ids: number[], parameter_settings: any}) {
    this.store.dispatch(new binEstimators.AnalyzeLociAction(e));
    this.store.dispatch(new binEstimators.SelectLocusBinSetAction(null));
  }

  selectBinLocus(e: number) {
    this.store.dispatch(new binEstimators.SelectLocusBinSetAction(e));
  }

  selectBin(e: number) {
    this.store.dispatch(new binEstimators.SelectBinAction(e));
  }

  addBin(e: {base_size: number, locus_bin_set_id: number}) {
    this.store.dispatch(new binEstimators.AddBinAction(e));
  }

  saveBin(b: BinSettings) {
    this.store.dispatch(new binEstimators.SaveBinAction(b));
  }

  deleteBin(e: number) {
    this.store.dispatch(new binEstimators.DeleteBinAction(e));
  }

}
