import { Effect, Actions, ofType } from '@ngrx/effects';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Action, select } from '@ngrx/store';
import { tap, take, map, switchMap, mergeMap } from 'rxjs/operators';
import * as plates from 'app/actions/plates';
import * as db from 'app/actions/db';
import * as fromRoot from 'app/reducers';
import * as fromDB from 'app/reducers/db';
import * as fromPlates from 'app/reducers/plates/plates';
import { PlateService } from 'app/services/ce/plate';
import { Store } from '@ngrx/store';
import { Plate } from 'app/models/ce/plate';
import { Well } from 'app/models/ce/well';
import { Channel } from 'app/models/ce/channel';
import { WellService } from 'app/services/ce/well';

@Injectable()
export class PlateEffects {

  @Effect()
  selectPlate$: Observable<any> = this.actions$.pipe(
    ofType<plates.SelectPlateAction>(plates.SELECT_PLATE),
    map(action => {
      return action.payload;
    }),
    switchMap((payload: string | number) => {
      return this.store.select(fromDB.selectPlateEntities)
        .pipe(
          map((plateEntities: {[id: string]: Plate}) => {
            if (!plateEntities[payload]) {
              return new plates.ActivatePlateAction(null);
            } else if (plateEntities[payload] && plateEntities[payload].detailed) {
              return new plates.ActivatePlateAction(payload);
            } else {
              return new plates.LoadingPlateAction(payload);
            }
          }),
        );
      })
    );

  @Effect()
  loadingPlate$: Observable<any> = this.actions$.pipe(
    ofType<plates.LoadingPlateAction>(plates.LOADING_PLATE),
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
    map(ids => new db.GetRequestedAction({model: 'plate', ids: ids}))
  );

  @Effect()
  selectWell$: Observable<any> = this.actions$.pipe(
    ofType<plates.SelectWellAction>(plates.SELECT_WELL),
    map(action => {
      return action.payload;
    }),
    switchMap((payload: string | number) => {
      return this.store.select(fromDB.selectWellEntities).pipe(
        map((wellEntities: {[id: string]: Well}) => {
          if (wellEntities[payload] && wellEntities[payload].detailed) {
            return new plates.ActivateWellAction(payload);
          } else {
            return new plates.LoadingWellAction(payload);
          }
        }),
      );
    })
  );

  @Effect()
  loadingWell$: Observable<any> = this.actions$.pipe(
    ofType<plates.LoadingWellAction>(plates.LOADING_WELL),
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
    map(ids => new db.GetRequestedAction({model: 'well', ids: ids}))
  );

  @Effect()
  selectChannel$: Observable<any> = this.actions$.pipe(
    ofType<plates.SelectChannelAction>(plates.SELECT_CHANNEL),
    map(action => {
      return action.payload;
    }),
    switchMap((payload: string | number) => {
      return this.store.select(fromDB.selectChannelEntities).pipe(
        map((channelEntities: {[id: string]: Channel}) => {
          if (channelEntities[payload] && channelEntities[payload].detailed) {
            return new plates.ActivateChannelAction(payload);
          } else {
            return new plates.LoadingChannelAction(payload);
          }
        }),
      );
    })
  );

  @Effect()
  loadingChannel$: Observable<any> = this.actions$.pipe(
    ofType<plates.LoadingChannelAction>(plates.LOADING_CHANNEL),
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
    map(ids => new db.GetRequestedAction({model: 'channel', ids: ids}))
  );

  @Effect({dispatch: false})
  recalculateWellLadder$: Observable<any> = this.actions$.pipe(
    ofType<plates.RecalculateWellLadderAction>(plates.RECALCULATE_WELL_LADDER),
    tap(() => {
      this.store.pipe(
        select(fromPlates.selectRecalculateLadderPayload),
        take(1)
      )
      .subscribe(payload => {
        this.wellService.recalculateLadder(payload.well_id, payload.ladder_peak_indices);
      });
    })
  );

  @Effect({dispatch: false})
  recalculatePlateLadder$: Observable<any> = this.actions$.pipe(
    ofType<plates.RecalculatePlateLadderAction>(plates.RECALCULATE_PLATE_LADDER),
    map(action => {
      return action.payload;
    }),
    map(ladder_id => {
      this.store.pipe(
        select(fromPlates.selectActivePlateId),
        take(1)
      )
      .subscribe(plate_id => {
        this.plateService.recalculateLadder(ladder_id, plate_id);
      });
    })
  );

  constructor(
    private actions$: Actions,
    private store: Store<fromRoot.AppState>,
    private wellService: WellService,
    private plateService: PlateService) {}
}
