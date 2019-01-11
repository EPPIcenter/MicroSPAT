import { Store } from '@ngrx/store';
import { Effect, Actions, ofType } from '@ngrx/effects';
import { Observable } from 'rxjs';
import { map, switchMap, withLatestFrom } from 'rxjs/operators';
import { Injectable } from '@angular/core';

import * as fromRoot from 'app/reducers';
import * as fromDB from 'app/reducers/db';

import * as quantificationBiasEstimators from 'app/actions/quant-bias-estimators';
import * as db from 'app/actions/db';


import { QuantificationBiasEstimatorProject } from 'app/models/quantification-bias-estimator/project';
import { EntityMap } from 'app/models/base';

import { QuantificationBiasEstimatorProjectService } from '../services/quantification-bias-estimator/project';

@Injectable()
export class QuantificationBiasEstimatorEffects {

  @Effect()
  selectQuantificationBiasEstimatorProject$: Observable<any> = this.actions$.pipe(
    ofType<quantificationBiasEstimators.SelectQuantificationBiasEstimatorProjectAction>(quantificationBiasEstimators.SELECT_QUANTIFICATION_BIAS_ESTIMATOR_PROJECT),
    map(action => {
      return action.payload;
    }),
    withLatestFrom(this.store.select(fromDB.selectQuantificationBiasEstimatorProjectEntities), (id: string | number, quantificationBiasEstimatorEntities: EntityMap<QuantificationBiasEstimatorProject>) => ({id, quantificationBiasEstimatorEntities})),
    map(({id, quantificationBiasEstimatorEntities}) => {
      if (!quantificationBiasEstimatorEntities[id]) {
        return new quantificationBiasEstimators.DeactivateQuantificationBiasEstimatorProjectAction();
      } else if (quantificationBiasEstimatorEntities[id] && quantificationBiasEstimatorEntities[id].detailed) {
        return new quantificationBiasEstimators.ActivateQuantificationBiasEstimatorAction(+id);
      } else {
        return new quantificationBiasEstimators.LoadingQuantificationBiasEstimatorAction(+id);
      }
    })
  );

  @Effect()
  loadingQuantificationBiasEstimator$: Observable<any> = this.actions$.pipe(
    ofType<quantificationBiasEstimators.LoadingQuantificationBiasEstimatorAction>(quantificationBiasEstimators.LOADING_QUANTIFICATION_BIAS_ESTIMATOR),
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
    map(ids => new db.GetRequestedAction({model: 'quantification_bias_estimator_project', ids: ids}))
  );

  @Effect()
  deleteQuantificationBiasEstimatorProject$: Observable<any> = this.actions$.pipe(
    ofType<quantificationBiasEstimators.DeleteQuantificationBiasEstimatorProjectAction>(quantificationBiasEstimators.DELETE_QUANTIFICATION_BIAS_ESTIMATOR_PROJECT),
    map(action => {
      return action.payload;
    }),
    map(id => {
      this.quantificationBiasEstimatorProjectService.deleteQuantificationBiasEstimatorProject(id);
    }),
    map(() => new quantificationBiasEstimators.DeactivateQuantificationBiasEstimatorProjectAction())
  )

  @Effect({dispatch: false})
  createQuantificationBiasEstimator$: Observable<any> = this.actions$.pipe(
    ofType<quantificationBiasEstimators.CreateQuantificationBiasEstimatorProjectAction>(quantificationBiasEstimators.CREATE_QUANTIFICATION_BIAS_ESTIMATOR_PROJECT),
    map(action => action.payload),
    map(qbe => this.quantificationBiasEstimatorProjectService.createQuantificationBiasEstimatorProject(qbe))
  )

  @Effect({dispatch: false})
  addSamples$: Observable<any> = this.actions$.pipe(
    ofType<quantificationBiasEstimators.AddControlsAction>(quantificationBiasEstimators.ADD_CONTROLS),
    map(action => {
      return action.payload;
    }),
    map(payload => {
      this.quantificationBiasEstimatorProjectService.addControls(payload.project_id, payload.file);
    })
  )

  @Effect({dispatch: false})
  removeSamples$: Observable<any> = this.actions$.pipe(
    ofType<quantificationBiasEstimators.RemoveSamplesAction>(quantificationBiasEstimators.REMOVE_SAMPLES),
    map(action => {
      return action.payload;
    }),
    map(payload => {
      this.quantificationBiasEstimatorProjectService.removeSamples(payload.project_id, payload.sample_ids);
    })
  )

  @Effect({dispatch: false})
  analyzeLoci$: Observable<any> = this.actions$.pipe(
    ofType<quantificationBiasEstimators.AnalyzeLociAction>(quantificationBiasEstimators.ANALYZE_LOCI),
    map(action => {
      return action.payload;
    }),
    map(payload => {
      if (payload.parameter_settings) {
        this.quantificationBiasEstimatorProjectService.analyzeLoci(payload.locus_parameter_ids, payload.parameter_settings);
      } else {
        this.quantificationBiasEstimatorProjectService.analyzeLoci(payload.locus_parameter_ids);
      }
    })
  )

  constructor(
    private actions$: Actions,
    private store: Store<fromRoot.AppState>,
    private quantificationBiasEstimatorProjectService: QuantificationBiasEstimatorProjectService
  ) {}
}
