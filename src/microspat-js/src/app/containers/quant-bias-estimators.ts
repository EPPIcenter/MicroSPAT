import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { Store } from '@ngrx/store';

import * as quantificationBiasEstimators from 'app/actions/quant-bias-estimators';

import * as fromRoot from 'app/reducers';
import * as fromDB from 'app/reducers/db';
import * as fromTasks from 'app/reducers/tasks';
import * as fromQuantificationBiasEstimators from 'app/reducers/quant-bias-estimators/quant-bias-estimators';

import { QuantificationBiasEstimatorProject } from 'app/models/quantification-bias-estimator/project';
import { LocusSet } from 'app/models/locus/locus-set';
import { BinEstimatorProject } from 'app/models/bin-estimator/project';
import { Task } from 'app/models/task';
import { ArtifactEstimatorProject } from 'app/models/artifact-estimator/project';
import { ControlSampleAssociation } from 'app/models/sample/control-sample-association';
import { Sample } from 'app/models/sample/sample';
import { QuantificationBiasEstimatorLocusParams } from 'app/models/quantification-bias-estimator/locus-params';

@Component({
  selector: 'mspat-quant-bias-estimators',
  template: `
  <div [ngSwitch]="appState$ | async">
    <div *ngSwitchCase="states.list_state" class="container-fluid">
      <div class="row">
        <div class="col-sm-6">
          <mspat-quant-bias-estimator-list
          [quantificationBiasEstimatorProjects]="quantificationBiasEstimatorProjects$ | async"
          [quantificationBiasEstimatorProjectsLoading]="quantificationBiasEstimatorProjectsLoading$ | async"
          [activeTasks]="activeTasks$ | async"
          (selectQuantificationBiasEstimatorProject)="selectQuantificationBiasEstimatorProject($event)">
          </mspat-quant-bias-estimator-list>
        </div>
        <div class="col-sm-6">
          <mspat-quant-bias-estimator-creator
            [locusSets]="locusSets$ | async"
            [binEstimators]="binEstimators$ | async"
            [artifactEstimators]="artifactEstimators$ | async"
            [activeTasks]="activeTasks$ | async"
            [failedTasks]="failedTasks$ | async"
            (submit)="createQuantificationBiasEstimatorProject($event)">
          </mspat-quant-bias-estimator-creator>
        </div>
      </div>
    </div>

    <div *ngSwitchCase="states.details_state" class="container-fluid">
      <div class="row">
        <div class="col-sm-12">
          <mspat-quant-bias-estimator-details
            [quantBiasEstimator]="activeQuantificationBiasEstimatorProject$ | async"
            [locusSet]="activeLocusSet$ | async"
            [binEstimator]="activeBinEstimatorProject$ | async"
            [artifactEstimator]="activeArtifactEstimatorProject$ | async"
            [activeSamples]="activeSamples$ | async"
            [selectedSample]="selectedSample$ | async"
            [activeControls]="activeControls$ | async"
            [activeLocusParameters]="activeLocusParameters$ | async"
            [activeTasks]="activeTasks$ | async"
            [failedTasks]="failedTasks$ | async"
            (deleteAction)="deleteQuantificationBiasEstimatorProject($event)"
            (addControlsAction)="addControls($event)"
            (selectSampleAction)="selectSample($event)"
            (analyzeLoci)="analyzeLoci($event)">
          </mspat-quant-bias-estimator-details>
        </div>
      </div>
    </div>
  </div>

  `
})
export class QuantificationBiasEstimatorsComponent {
  appState$: Observable<string>;

  quantificationBiasEstimatorProjects$: Observable<QuantificationBiasEstimatorProject[]>;
  quantificationBiasEstimatorProjectsLoading$: Observable<boolean>;

  locusSets$: Observable<LocusSet[]>;
  binEstimators$: Observable<BinEstimatorProject[]>;
  artifactEstimators$: Observable<ArtifactEstimatorProject[]>;

  activeQuantificationBiasEstimatorProject$: Observable<QuantificationBiasEstimatorProject>;
  activeLocusSet$: Observable<LocusSet>;
  activeBinEstimatorProject$: Observable<BinEstimatorProject>;
  activeArtifactEstimatorProject$: Observable<ArtifactEstimatorProject>;

  activeSamples$: Observable<Sample[]>;
  selectedSample$: Observable<Sample>;
  activeControls$: Observable<ControlSampleAssociation[]>;

  activeLocusParameters$: Observable<QuantificationBiasEstimatorLocusParams[]>;

  activeTasks$: Observable<Task[]>;
  failedTasks$: Observable<Task[]>;

  states = {
    list_state: 'list',
    details_state: 'details'
  };

  constructor(private store: Store<fromRoot.AppState>) {
    this.appState$ = this.store.select(fromQuantificationBiasEstimators.selectAppState);
    this.quantificationBiasEstimatorProjects$ = this.store.select(fromDB.selectQuantificationBiasEstimatorProjectList);
    this.quantificationBiasEstimatorProjectsLoading$ = this.store.select(fromQuantificationBiasEstimators.selectLoadingQuantificationBiasEstimatorProjects)
    this.locusSets$ = this.store.select(fromDB.selectLocusSetList);
    this.binEstimators$ = this.store.select(fromDB.selectBinEstimatorProjectList);
    this.artifactEstimators$ = this.store.select(fromDB.selectArtifactEstimatorProjectList);

    this.activeQuantificationBiasEstimatorProject$ = this.store.select(fromQuantificationBiasEstimators.selectActiveQuantificationBiasEstimatorProject);
    this.activeLocusSet$ = this.store.select(fromQuantificationBiasEstimators.selectActiveLocusSet);
    this.activeBinEstimatorProject$ = this.store.select(fromQuantificationBiasEstimators.selectActiveBinEstimatorProject);
    this.activeArtifactEstimatorProject$ = this.store.select(fromQuantificationBiasEstimators.selectActiveArtifactEstimatorProject);

    this.activeSamples$ = this.store.select(fromQuantificationBiasEstimators.selectActiveSamples);
    this.selectedSample$ = this.store.select(fromQuantificationBiasEstimators.selectSelectedSample);
    this.activeControls$ = this.store.select(fromQuantificationBiasEstimators.selectActiveControls);

    this.activeLocusParameters$ = this.store.select(fromQuantificationBiasEstimators.selectActiveLocusParameters);

    this.activeTasks$ = this.store.select(fromTasks.selectActiveTasks());
    this.failedTasks$ = this.store.select(fromTasks.selectFailedTasks());
  }

  selectQuantificationBiasEstimatorProject(e: number) {
    this.store.dispatch(new quantificationBiasEstimators.SelectQuantificationBiasEstimatorProjectAction(e));
  }

  createQuantificationBiasEstimatorProject(e) {
    this.store.dispatch(new quantificationBiasEstimators.CreateQuantificationBiasEstimatorProjectAction(e));
  }

  deleteQuantificationBiasEstimatorProject(e: number) {
    this.store.dispatch(new quantificationBiasEstimators.DeleteQuantificationBiasEstimatorProjectAction(e));
  }

  addControls(e: {file: File, project_id: number}) {
    this.store.dispatch(new quantificationBiasEstimators.AddControlsAction(e));
  }

  selectSample(e: number) {
    this.store.dispatch(new quantificationBiasEstimators.SelectSampleAction(e));
  }

  analyzeLoci(e: any) {
    this.store.dispatch(new quantificationBiasEstimators.AnalyzeLociAction(e));
  }
}
