import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { map, switchMap, withLatestFrom } from 'rxjs/operators';
import { Injectable } from '@angular/core';
import { Effect, Actions, ofType } from '@ngrx/effects';

import * as fromRoot from '../reducers';
import * as fromDB from '../reducers/db';

import * as binEstimators from '../actions/bin-estimators';
import * as db from '../actions/db';

import { BinEstimatorProject } from '../models/bin-estimator/project';
import { EntityMap } from '../models/base';

import { BinService } from '../services/bin-estimator/bin';
import { BinEstimatorProjectService } from '../services/bin-estimator/project';

@Injectable()
export class BinEstimatorEffects {

  @Effect()
  selectBinEstimator$: Observable<any> = this.actions$.pipe(
    ofType<binEstimators.SelectBinEstimatorAction>(binEstimators.SELECT_BIN_ESTIMATOR),
    map(action => action.payload),
    withLatestFrom(this.store.select(fromDB.selectBinEstimatorProjectEntities), (id: string | number, entities: EntityMap<BinEstimatorProject>) => ({id, entities})),
    map( ( {id, entities} ) => {
      if (!entities[id]) {
        return new binEstimators.DeactivateBinEstimatorAction();
      } else if (entities[id].detailed) {
        return new binEstimators.ActivateBinEstimatorAction(+id);
      } else {
        return new binEstimators.LoadingBinEstimatorAction(+id);
      }
    }),
  );

  @Effect()
  loadingBinEstimator$: Observable<any> = this.actions$.pipe(
    ofType<binEstimators.LoadingBinEstimatorAction>(binEstimators.LOADING_BIN_ESTIMATOR),
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
    map(ids => new db.GetRequestedAction({model: 'bin_estimator_project', ids: ids}))
  );

  @Effect()
  deleteBinEstimator$: Observable<any> = this.actions$.pipe(
    ofType<binEstimators.DeleteBinEstimatorAction>(binEstimators.DELETE_BIN_ESTIMATOR),
    map(action => {
      return action.payload;
    }),
    map(id => {
      this.binEstimatorProjectService.deleteBinEstimatorProject(id);
    }),
    map(() => new binEstimators.DeactivateBinEstimatorAction())
  );

  @Effect({dispatch: false})
  createBinEstimator$: Observable<any> = this.actions$.pipe(
    ofType<binEstimators.CreateBinEstimatorAction>(binEstimators.CREATE_BIN_ESTIMATOR),
    map(action => {
      return action.payload;
    }),
    map(be => {
      this.binEstimatorProjectService.createBinEstimatorProject(be);
    })
  )

  @Effect({dispatch: false})
  addSamples$: Observable<any> = this.actions$.pipe(
    ofType<binEstimators.AddSamplesAction>(binEstimators.ADD_SAMPLES),
    map(action => {
      return action.payload;
    }),
    map(payload => {
      this.binEstimatorProjectService.addSamples(payload.project_id, payload.sample_ids);
    })
  )

  @Effect({dispatch: false})
  removeSamples$: Observable<any> = this.actions$.pipe(
    ofType<binEstimators.RemoveSamplesAction>(binEstimators.REMOVE_SAMPLES),
    map(action => {
      return action.payload;
    }),
    map(payload => {
      this.binEstimatorProjectService.removeSamples(payload.project_id, payload.sample_ids);
    })
  )

  @Effect({dispatch: false})
  analyzeLoci$: Observable<any> = this.actions$.pipe(
    ofType<binEstimators.AnalyzeLociAction>(binEstimators.ANALYZE_LOCI),
    map(action => {
      return action.payload;
    }),
    map(payload => {
      if (payload.parameter_settings) {
        this.binEstimatorProjectService.analyzeLoci(payload.locus_parameter_ids, payload.parameter_settings);
      } else {
        this.binEstimatorProjectService.analyzeLoci(payload.locus_parameter_ids);
      }
    })
  )

  @Effect({dispatch: false})
  saveBin$: Observable<any> = this.actions$.pipe(
    ofType<binEstimators.SaveBinAction>(binEstimators.SAVE_BIN),
    map(action => {
      return action.payload;
    }),
    map(payload => {
      this.binService.saveBin(payload);
    })
  )

  @Effect({dispatch: false})
  addBin$: Observable<any> = this.actions$.pipe(
    ofType<binEstimators.AddBinAction>(binEstimators.ADD_BIN),
    map(action => {
      return action.payload;
    }),
    map(payload => {
      this.binService.addBin(payload);
    })
  )

  @Effect({dispatch: false})
  deleteBin$: Observable<any> = this.actions$.pipe(
    ofType<binEstimators.DeleteBinAction>(binEstimators.DELETE_BIN),
    map(action => {
      return action.payload;
    }),
    map(payload => {
      this.binService.deleteBin(payload);
    })
  )

  constructor(
    private actions$: Actions,
    private store: Store<fromRoot.AppState>,
    private binEstimatorProjectService: BinEstimatorProjectService,
    private binService: BinService
  ) {}
}
