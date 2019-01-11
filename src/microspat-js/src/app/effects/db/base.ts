import { Injectable, Injector } from '@angular/core';
import { Action, Store, select } from '@ngrx/store';
import { Effect, Actions, ofType } from '@ngrx/effects';
import { Observable, of } from 'rxjs';
import { tap, take, map, switchMap, filter } from 'rxjs/operators';

import * as db from 'app/actions/db';
import * as fromRoot from 'app/reducers';
import * as fromDB from 'app/reducers/db';
import { modelToService } from 'app/services';

@Injectable()
export class BaseDBEffects {

  @Effect({dispatch: false})
  updated$: Observable<any> = this.actions$.pipe(
    ofType(db.UPDATE_RECEIVED),
    map((action: db.UpdateReceivedAction): db.UpdatedEntityPayload => action.payload),
    tap(updatedEntities => {
      this.store.pipe(
        select(fromDB.modelToEntity[updatedEntities.model]),
        take(1))
      .subscribe(entities => {
          const toGet = updatedEntities.details.filter(detail => {
            return entities[detail.id] && detail.last_updated > entities[detail.id].last_updated;
          });
          const detailed = toGet.filter(k => k.detailed).map(k => k.id);
          const undetailed = toGet.filter(k => !k.detailed).map(k => k.id);
          if (toGet.length > 0) {
            this.store.dispatch(new db.SetStaleAction({model: updatedEntities.model, ids: toGet}));
            this.store.dispatch(new db.UpdateRequestedAction({model: updatedEntities.model, ids: detailed, detailed: true}));
            this.store.dispatch(new db.UpdateRequestedAction({model: updatedEntities.model, ids: undetailed, detailed: false}));
          }
      });
    })
  );

  @Effect({dispatch: false})
  created$: Observable<any> = this.actions$.pipe(
    ofType(db.CREATE_RECEIVED),
    map((action: db.CreateReceivedAction): db.ModifiedEntityPayload => action.payload),
    tap(createdEntities => {
      this.store.dispatch(new db.GetRequestedAction(createdEntities));
    })
  )

  @Effect()
  getRequested$: Observable<Action> = this.actions$.pipe(
    ofType(db.GET_REQUESTED),
    map((action: db.GetRequestedAction) => action.payload),
    switchMap(payload => {
      return this.store.pipe(
        select(fromDB.modelToPendingReqs[payload.model]),
        take(1),
        switchMap(pendingReqs => {
          const uniqueRequest = new Set(payload.ids.filter(id => !(pendingReqs[id])));
          const toRequest = Array.from(uniqueRequest.values());
          const service = this.injector.get(modelToService[payload.model]);
          if (toRequest.length > 0) {
            service.get(toRequest);
          };
          return of({model: payload.model, ids: toRequest});
        })
      );
    }),
    switchMap(payload => {
      return of(new db.GetInFlightAction(payload));
    })
  );

  @Effect()
  updateRequested$: Observable<Action> = this.actions$.pipe(
    ofType(db.UPDATE_REQUESTED),
    map((action: db.UpdateRequestedAction) => action.payload),
    switchMap(payload => {
      return this.store.pipe(
        select(fromDB.modelToPendingReqs[payload.model]),
        take(1),
        switchMap(pendingReqs => {
          const uniqueRequest = new Set(payload.ids.filter(id => !(pendingReqs[id])));
          const toRequest = Array.from(uniqueRequest.values());
          const service = this.injector.get(modelToService[payload.model]);
          if (toRequest.length > 0) {
            service.getUpdated(toRequest, payload.detailed);
          };
          return of({model: payload.model, ids: toRequest});
        })
      )
    }),
    switchMap(payload => {
      return of(new db.GetInFlightAction(payload));
    })
  );

  constructor(private actions$: Actions, private store: Store<fromRoot.AppState>, private injector: Injector) {}
}
