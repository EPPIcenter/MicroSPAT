import { Injectable } from '@angular/core';
import { Actions, Effect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { Observable, of, from } from 'rxjs';
import { map, take, switchMap, filter, flatMap, mergeMap, combineLatest, withLatestFrom } from 'rxjs/operators';

import * as controls from 'app/actions/controls';
import * as db from 'app/actions/db';

import * as fromRoot from 'app/reducers';
import * as fromDB from 'app/reducers/db';

import { ControlService } from 'app/services/sample/control';

import { EntityMap } from 'app/models/base';
import { Control } from 'app/models/sample/control';

@Injectable()
export class ControlEffects {

  @Effect({dispatch: false})
  selectControl$: Observable<any> = this.actions$.pipe(
    ofType<controls.SelectControlAction>(controls.SELECT_CONTROL),
    map(action => action.payload),
    withLatestFrom(this.store.select(fromDB.selectControlEntities)),
    map(([payload, controlEntities]) => {
      if (!controlEntities[payload]) {
        this.store.dispatch(new controls.DeactivateControlAction());
      } else if (controlEntities[payload] && controlEntities[payload].detailed) {
          this.store.dispatch(new controls.ActivateControlAction(+payload));  // This is so wrong. need to better understand rxjs to dispatch multiple actions.
          this.store.dispatch(new controls.ActivateBinEstimatorProjectAction(<number>controlEntities[payload].bin_estimator));
      } else {
        this.store.dispatch(new controls.LoadingControlAction(+payload));
      }
    })
  )

  // @Effect()
  // selectControl$: Observable<any> = this.actions$.pipe(
  //   ofType<controls.SelectControlAction>(controls.SELECT_CONTROL),
  //   map(action => action.payload),
  //   withLatestFrom(this.store.select(fromDB.selectControlEntities)),
  //   switchMap(([payload, controlEntities]) => {
  //     if (!controlEntities[payload]) {
  //       return from([new controls.DeactivateControlAction()]);
  //     } else if (controlEntities[payload] && controlEntities[payload].detailed) {
  //       return from([
  //         new controls.ActivateControlAction(+payload),
  //         new controls.ActivateBinEstimatorProjectAction(<number>controlEntities[payload].bin_estimator)
  //       ]);
  //     } else {
  //       return from([new controls.LoadingControlAction(+payload)]);
  //     }
  //   })
  // )


  @Effect()
  loadingControl$: Observable<any> = this.actions$.pipe(
    ofType<controls.LoadingControlAction>(controls.LOADING_CONTROL),
    map(action => action.payload),
    map(id => new db.GetRequestedAction({model: 'control', ids: [id]}))
  )

  @Effect({dispatch: false})
  submitControl$: Observable<any> = this.actions$.pipe(
    ofType<controls.SubmitControlAction>(controls.SUBMIT_CONTROL),
    map(action => action.payload),
    map(ctrl => {
      this.controlService.createControl(ctrl);
    })
  )

  @Effect({dispatch: false})
  deleteControl$: Observable<any> = this.actions$.pipe(
    ofType<controls.DeleteControlAction>(controls.DELETE_CONTROL),
    map(action => action.payload),
    map(id => {
      this.controlService.deleteControl(id);
    })
  )

  constructor(private actions$: Actions, private store: Store<fromRoot.AppState>, private controlService: ControlService) {}
}
