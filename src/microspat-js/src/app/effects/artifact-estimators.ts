import { Store } from '@ngrx/store';
import { Effect, Actions, ofType } from '@ngrx/effects';
import { Observable } from 'rxjs';
import { map, switchMap, withLatestFrom } from 'rxjs/operators';
import { Injectable } from '@angular/core';

import * as fromRoot from 'app/reducers';
import * as fromDB from 'app/reducers/db';

import * as artifactEstimators from 'app/actions/artifact-estimators';
import * as db from 'app/actions/db';

import { ArtifactEstimatorProject } from 'app/models/artifact-estimator/project';
import { EntityMap } from 'app/models/base';

import { ArtifactEstimatorProjectService } from 'app/services/artifact-estimator/project';


@Injectable()
export class ArtifactEstimatorEffects {

  @Effect()
  selectArtifactEstimatorProject$: Observable<any> = this.actions$.pipe(
    ofType<artifactEstimators.SelectArtifactEstimatorProjectAction>(artifactEstimators.SELECT_ARTIFACT_ESTIMATOR_PROJECT),
    map(action => action.payload),
    withLatestFrom(this.store.select(fromDB.selectArtifactEstimatorProjectEntities), (id: string | number, entities: EntityMap<ArtifactEstimatorProject>) => ({id, entities})),
    map( ( {id, entities} ) => {
      if (!entities[id]) {
        return new artifactEstimators.DeactivateArtifactEstimatorProjectAction();
      } else if (entities[id].detailed) {
        return new artifactEstimators.ActivateArtifactEstimatorAction(+id);
      } else {
        return new artifactEstimators.LoadingArtifactEstimatorAction(+id);
      }
    }),
  );

  @Effect()
  loadingArtifactEstimator$: Observable<any> = this.actions$.pipe(
    ofType<artifactEstimators.LoadingArtifactEstimatorAction>(artifactEstimators.LOADING_ARTIFACT_ESTIMATOR),
    map(action => {
      return action.payload;
    }),
    map(ids => {
      if (!Array.isArray(ids)) {
        return [ids];
      } else {
        return ids;
      }
    }),
    map(ids => new db.GetRequestedAction({model: 'artifact_estimator_project', ids: ids}))
  );

  @Effect()
  deleteArtifactEstimatorProject$: Observable<any> = this.actions$.pipe(
    ofType<artifactEstimators.DeleteArtifactEstimatorProjectAction>(artifactEstimators.DELETE_ARTIFACT_ESTIMATOR_PROJECT),
    map(action => {
      return action.payload;
    }),
    map(id => {
      this.artifactEstimatorProjectService.deleteArtifactEstimatorProject(id);
    }),
    map(() => new artifactEstimators.DeactivateArtifactEstimatorProjectAction())
  )

  @Effect({dispatch: false})
  createArtifactEstimator$: Observable<any> = this.actions$.pipe(
    ofType<artifactEstimators.CreateArtifactEstimatorProjectAction>(artifactEstimators.CREATE_ARTIFACT_ESTIMATOR_PROJECT),
    map(action => {
      return action.payload;
    }),
    map(ae => {
      this.artifactEstimatorProjectService.createArtifactEstimatorProject(ae);
    })
  )

  @Effect({dispatch: false})
  addSamples$: Observable<any> = this.actions$.pipe(
    ofType<artifactEstimators.AddSamplesAction>(artifactEstimators.ADD_SAMPLES),
    map(action => {
      return action.payload;
    }),
    map(payload => {
      this.artifactEstimatorProjectService.addSamples(payload.project_id, payload.sample_ids);
    })
  )

  @Effect({dispatch: false})
  removeSamples$: Observable<any> = this.actions$.pipe(
    ofType<artifactEstimators.RemoveSamplesAction>(artifactEstimators.REMOVE_SAMPLES),
    map(action => {
      return action.payload;
    }),
    map(payload => {
      this.artifactEstimatorProjectService.removeSamples(payload.project_id, payload.sample_ids);
    })
  )

  @Effect({dispatch: false})
  analyzeLoci$: Observable<any> = this.actions$.pipe(
    ofType<artifactEstimators.AnalyzeLociAction>(artifactEstimators.ANALYZE_LOCI),
    map(action => {
      return action.payload;
    }),
    map(payload => {
      if (payload.parameter_settings) {
        this.artifactEstimatorProjectService.analyzeLoci(payload.locus_parameter_ids, payload.parameter_settings);
      } else {
        this.artifactEstimatorProjectService.analyzeLoci(payload.locus_parameter_ids);
      }
    })
  )

  @Effect({dispatch: false})
  deleteEstimator$: Observable<any> = this.actions$.pipe(
    ofType<artifactEstimators.DeleteArtifactEstimatorAction>(artifactEstimators.DELETE_ARTIFACT_ESTIMATOR),
    map(action => action.payload),
    map(payload => {
      this.artifactEstimatorProjectService.deleteArtifactEstimator(payload);
    })
  )

  @Effect({dispatch: false})
  addBreakpoint$: Observable<any> = this.actions$.pipe(
    ofType<artifactEstimators.AddBreakpointAction>(artifactEstimators.ADD_BREAKPOINT),
    map(action => {
      return action.payload;
    }),
    map(payload => {
      this.artifactEstimatorProjectService.addBreakpoint(payload.id, payload.base_size);
    })
  )

  @Effect({dispatch: false})
  clearBreakpoints$: Observable<any> = this.actions$.pipe(
    ofType<artifactEstimators.ClearBreakpointsAction>(artifactEstimators.CLEAR_BREAKPOINTS),
    map(action => action.payload),
    map(payload => {
      this.artifactEstimatorProjectService.clearBreakpoints(payload);
    })
  )

  @Effect({dispatch: false})
  recalculateEquation$: Observable<any> = this.actions$.pipe(
    ofType<artifactEstimators.RecalculateEquationAction>(artifactEstimators.RECALCULATE_EQUATION),
    map(action => action.payload),
    map(payload => {
      this.artifactEstimatorProjectService.recalculateEquation(payload.id, payload.method);
    })
  )

  constructor(
    private actions$: Actions,
    private store: Store<fromRoot.AppState>,
    private artifactEstimatorProjectService: ArtifactEstimatorProjectService
  ) {}
}
