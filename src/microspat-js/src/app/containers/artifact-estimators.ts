import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { Component } from '@angular/core';
import { Store } from '@ngrx/store';

import * as artifactEstimators from 'app/actions/artifact-estimators';

import * as fromRoot from 'app/reducers';
import * as fromDB from 'app/reducers/db';
import * as fromTasks from 'app/reducers/tasks';
import * as fromArtifactEstimators from 'app/reducers/artifact-estimators/artifact-estimators';

import { ArtifactEstimator } from 'app/models/artifact-estimator/artifact-estimator';
import { ArtifactEstimatorProject } from 'app/models/artifact-estimator/project';
import { ArtifactEstimatorLocusParams } from 'app/models/artifact-estimator/locus-params';
import { LocusArtifactEstimator } from 'app/models/artifact-estimator/locus-artifact-estimator';
import { LocusSet } from 'app/models/locus/locus-set';
import { Sample } from 'app/models/sample/sample';
import { Task } from 'app/models/task';

@Component({
  selector: 'mspat-artifact-estimators',
  template: `
  <div [ngSwitch]="appState$ | async">
    <div *ngSwitchCase="states.list_state" class="container-fluid">
      <div class="row">
        <div class="col-sm-6">
          <mspat-artifact-estimator-list
          [artifactEstimatorProjects]="artifactEstimatorProjects$ | async"
          [artifactEstimatorProjectsLoading]="artifactEstimatorProjectsLoading$ | async"
          [activeTasks]="activeTasks$ | async"
          (selectArtifactEstimatorProject)="selectArtifactEstimatorProject($event)">
          </mspat-artifact-estimator-list>
        </div>
        <div class="col-sm-6">
          <mspat-artifact-estimator-creator
            [locusSets]="locusSets$ | async"
            [activeTasks]="activeTasks$ | async"
            [failedTasks]="failedTasks$ | async"
            (submit)="createArtifactEstimatorProject($event)">
          </mspat-artifact-estimator-creator>
        </div>
      </div>
    </div>

    <div *ngSwitchCase="states.details_state" class="container-fluid">
      <div class="row">
        <div class="col-sm-12">
          <mspat-artifact-estimator-details
            [artifactEstimatorProject]="activeArtifactEstimatorProject$ | async"
            [locusSet]="activeLocusSet$ | async"
            [activeArtifactEstimatorTasks]="activeTasks$ | async"
            [failedArtifactEstimatorTasks]="failedTasks$ | async"
            [activeSamples]="activeSamples$ | async"
            [inactiveSamples]="inactiveSamples$ | async"
            [activeLocusParameters]="activeLocusParameters$ | async"
            [activeLocusArtifactEstimatorID]="activeLocusArtifactEstimatorID$ | async"
            [activeLocusArtifactEstimators]="activeLocusArtifactEstimators$ | async"
            [activeArtifactEstimators]="activeArtifactEstimators$ | async"
            [activeArtifactEstimator]="activeArtifactEstimator$ | async"
            [artifactPlot]="artifactPlot$ | async"
            (deleteArtifactEstimator)="deleteArtifactEstimatorProject($event)"
            (addSamples)="addSamples($event)"
            (removeSamples)="removeSamples($event)"
            (analyzeLoci)="analyzeLoci($event)"
            (selectLocusArtifactEstimator)="selectLocusArtifactEstimator($event)"
            (selectArtifactEstimator)="selectArtifactEstimator($event)"
            (addBreakpoint)="addBreakpoint($event)"
            (deleteEstimator)="deleteEstimator($event)"
            (clearBreakpoints)="clearBreakpoints($event)"
            (recalculateEquation)="recalculateEquation($event)">
          </mspat-artifact-estimator-details>
        </div>
      </div>
    </div>

  </div>
  `

})
export class ArtifactEstimatorsComponent {
  appState$: Observable<string>;

  artifactEstimatorProjects$: Observable<ArtifactEstimatorProject[]>;
  artifactEstimatorProjectsLoading$: Observable<boolean>;
  locusSets$: Observable<LocusSet[]>;

  activeArtifactEstimatorProject$: Observable<ArtifactEstimatorProject>;
  activeLocusSet$: Observable<LocusSet>;
  activeSamples$: Observable<Sample[]>;
  inactiveSamples$: Observable<Sample[]>;

  activeLocusParameters$: Observable<ArtifactEstimatorLocusParams[]>;

  activeLocusArtifactEstimators$: Observable<LocusArtifactEstimator[]>;
  activeLocusArtifactEstimatorID$: Observable<number>;

  activeArtifactEstimators$: Observable<ArtifactEstimator[]>;
  activeArtifactEstimator$: Observable<ArtifactEstimator>;

  activeTasks$: Observable<Task[]>;
  failedTasks$: Observable<Task[]>;
  artifactPlot$: Observable<any>;

  states = {
    list_state: 'list',
    details_state: 'details',
  }

  constructor(private store: Store<fromRoot.AppState>) {
    this.appState$ = this.store.select(fromArtifactEstimators.selectAppState);

    this.artifactEstimatorProjects$ = this.store.select(fromDB.selectArtifactEstimatorProjectList);
    this.artifactEstimatorProjectsLoading$ = this.store.select(fromArtifactEstimators.selectLoadingArtifactEstimatorProjects);
    this.locusSets$ = this.store.select(fromDB.selectLocusSetList);

    this.activeArtifactEstimatorProject$ = this.store.select(fromArtifactEstimators.selectActiveArtifactEstimatorProject);
    this.activeLocusSet$ = this.store.select(fromArtifactEstimators.selectActiveLocusSet);

    this.activeSamples$ = this.store.select(fromArtifactEstimators.selectActiveArtifactEstimatorSamples);
    this.inactiveSamples$ = this.store.select(fromArtifactEstimators.selectInactiveSamples);

    this.activeLocusParameters$ = this.store.select(fromArtifactEstimators.selectActiveLocusParameters);

    this.activeLocusArtifactEstimators$ = this.store.select(fromArtifactEstimators.selectActiveLocusArtifactEstimators);
    this.activeLocusArtifactEstimatorID$ = this.store.select(fromArtifactEstimators.selectActiveLocusArtifactEstimatorID);

    this.activeArtifactEstimators$ = this.store.select(fromArtifactEstimators.selectActiveArtifactEstimators);
    this.activeArtifactEstimator$ = this.store.select(fromArtifactEstimators.selectActiveArtifactEstimator);

    this.artifactPlot$ = this.store.select(fromArtifactEstimators.selectArtifactPlot);

    this.activeTasks$ = this.store.select(fromTasks.selectActiveTasks());
    this.failedTasks$ = this.store.select(fromTasks.selectFailedTasks());

  //   this.activeArtifactEstimatorTasks$ = combineLatest(
  //     this.store.select(fromTasks.selectActiveTasks('artifact_estimator_project')),
  //     this.store.select(fromTasks.selectActiveTasks('artifact'))
  //   ).pipe(
  //     map(tasks => {
  //       return tasks[0].concat(tasks[1]);
  //     })
  //   );
  //   this.failedArtifactEstimatorTasks$ = combineLatest(
  //     this.store.select(fromTasks.selectFailedTasks('artifact_estimator_project')),
  //     this.store.select(fromTasks.selectFailedTasks('artifact'))
  //   ).pipe(
  //     map(tasks => {
  //       return tasks[0].concat(tasks[1]);
  //     })
  //   );
  }

  selectArtifactEstimatorProject(e: number) {
    this.store.dispatch(new artifactEstimators.SelectArtifactEstimatorProjectAction(e));
  }

  deleteArtifactEstimatorProject(e: number) {
    this.store.dispatch(new artifactEstimators.DeleteArtifactEstimatorProjectAction(e));
  }

  addSamples(e: {project_id: number, sample_ids: number[]}) {
    this.store.dispatch(new artifactEstimators.AddSamplesAction(e));
  }

  removeSamples(e: {project_id: number, sample_ids: number[]}) {
    this.store.dispatch(new artifactEstimators.RemoveSamplesAction(e));
  }

  createArtifactEstimatorProject(e) {
    this.store.dispatch(new artifactEstimators.CreateArtifactEstimatorProjectAction(e));
  }

  analyzeLoci(e: {locus_parameter_ids: number[], parameter_settings: any}) {
    this.store.dispatch(new artifactEstimators.AnalyzeLociAction(e));
    this.store.dispatch(new artifactEstimators.SelectLocusArtifactEstimatorAction(null));
  }

  selectLocusArtifactEstimator(e: number) {
    this.store.dispatch(new artifactEstimators.SelectLocusArtifactEstimatorAction(e));
  }

  selectArtifactEstimator(e: number) {
    this.store.dispatch(new artifactEstimators.SelectArtifactEstimatorAction(e));
  }

  addBreakpoint(e: {base_size: number, id: number | string}) {
    this.store.dispatch(new artifactEstimators.AddBreakpointAction(e));
  }

  deleteEstimator(id: number) {
    this.store.dispatch(new artifactEstimators.DeleteArtifactEstimatorAction(id));
  }

  clearBreakpoints(id: number) {
    this.store.dispatch(new artifactEstimators.ClearBreakpointsAction(id));
  }

  recalculateEquation(e: {id: number, method: string}) {
    this.store.dispatch(new artifactEstimators.RecalculateEquationAction(e));
  }
}
