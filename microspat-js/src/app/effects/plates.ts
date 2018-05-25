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
import { Injector } from '@angular/core';
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
            if (plateEntities[payload] && plateEntities[payload].detailed) {
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

    // @Effect()
    // selectChannel$: Observable<any> = this.actions$
    //   .ofType(plates.SELECT_CHANNEL)
    //   .pipe(
    //     map(action => {
      //   return action.payload;
      // }),
    //     withLatestFrom(this.store.select(fromDB.selectChannelEntities), this.store.select(fromDB.selectWellEntities)),
    //     map(([channelId, channelEntities, wellEntities]) => {
    //       const channel = channelEntities[channelId];
    //       const well = wellEntities[channel.well];
    //       if (!well.detailed) {
    //         return of([new plates.LoadWellAction(well.id), new plates.LoadingChannelAction(channelId)]);
    //       };
    //       if (channel && channel.detailed) {
    //         return new plates.ActivateChannelAction(channelId);
    //       } else {
    //         return new plates.LoadingChannelAction(channelId);
    //       }
    //     })
    //   )

    @Effect()
    loadingChannel$: Observable<any> = this.actions$
      .ofType<plates.LoadingChannelAction>(plates.LOADING_CHANNEL)
      .pipe(
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
    recalculateLadder$: Observable<any> = this.actions$.pipe(
      ofType(plates.RECALCULATE_LADDER),
      tap(() => {
        this.store.pipe(
          select(fromPlates.selectRecalculateLadderPayload),
          take(1)
        )
        .subscribe(payload => {
          console.log("Recalculating Ladder")
          this.wellService.recalculateLadder(payload.well_id, payload.ladder_peak_indices);
        });
      })
    );

  constructor(private actions$: Actions, private store: Store<fromRoot.AppState>, private injector: Injector, private wellService: WellService) {}
}
