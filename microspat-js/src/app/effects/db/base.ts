import { Effect, Actions, ofType } from '@ngrx/effects';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Action } from '@ngrx/store/src/models';
import { tap, take, map, switchMap } from 'rxjs/operators';
import * as db from 'app/actions/db';
import * as fromRoot from 'app/reducers';
import * as fromDB from 'app/reducers/db';
import { modelToService } from 'app/services';
import { Injector } from '@angular/core';
import { Store, select } from '@ngrx/store';

@Injectable()
export class BaseDBEffects {
  @Effect({dispatch: false})
  updated$: Observable<any> = this.actions$.pipe(
    ofType(db.UPDATE_RECEIVED),
    map((action: db.UpdateReceivedAction): db.UpdatedEntityPayload => action.payload),
    tap(updatedEntities => {
      const service = this.injector.get(modelToService[updatedEntities.model]);
      this.store.pipe(
        select(fromDB.modelToEntity[updatedEntities.model]),
        take(1))
      .subscribe(entities => {
          const toGet = updatedEntities.details.filter(detail => {
            return entities[detail.id] && detail.last_updated > entities[detail.id].last_updated;
          }).map(kept => +kept.id);
          this.store.dispatch(new db.SetStaleAction({model: updatedEntities.model, ids: toGet}));
          service.get(toGet);
      });
    })
  );

  @Effect()
  getRequested$: Observable<Action> = this.actions$.pipe(
    ofType(db.GET_REQUESTED),
    map((action: db.GetRequestedAction) => action.payload),
    switchMap(payload => {
      return this.store.pipe(
        select(fromDB.modelToPendingReqs[payload.model]),
        take(1),
        switchMap(pendingReqs => {
          let toRequest = [];
          toRequest = payload.ids.filter(id => !(pendingReqs[id]));
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

  constructor(private actions$: Actions, private store: Store<fromRoot.AppState>, private injector: Injector) { }
}
