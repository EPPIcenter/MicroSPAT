import { Injectable } from '@angular/core';
import { Actions, Effect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';

import * as samples from 'app/actions/samples';
import * as db from 'app/actions/db';

import * as fromRoot from 'app/reducers';
import * as fromDB from 'app/reducers/db';

import { SampleService } from 'app/services/sample/sample';

import { EntityMap } from 'app/models/base';
import { Sample } from 'app/models/sample/sample';

@Injectable()
export class SampleEffects {

  @Effect()
  selectSample$: Observable<any> = this.actions$.pipe(
    ofType<samples.SelectSampleAction>(samples.SELECT_SAMPLE),
    map(action => action.payload),
    switchMap((payload: number | string) => {
      return this.store.select(fromDB.selectSampleEntities).pipe(
        take(1),
        map((sampleEntities: EntityMap<Sample>) => {
          if (!sampleEntities[payload]) {
            return new samples.DeactivateSampleAction();
          } else if (sampleEntities[payload] && sampleEntities[payload].detailed) {
            return new samples.ActivateSampleAction(+payload);
          } else {
            return new samples.LoadingSampleAction(+payload);
          }
        })
      );
    })
  );

  @Effect()
  loadingSample$: Observable<any> = this.actions$.pipe(
    ofType<samples.LoadingSampleAction>(samples.LOADING_SAMPLE),
    map(action => action.payload),
    map(id => new db.GetRequestedAction({model: 'sample', ids: [id]})),
  )

  // @Effect()
  // selectChannel$: Observable<any> = this.actions$.pipe(
  //   ofType<samples.SelectChannelAction>(samples.SELECT_CHANNEL),
  //   map(action => action.payload),
  //   switchMap((payload: number) => {
  //     return this.store.select(fromDB.selectChannelEntities).pipe(
  //       map((channelEntities: {[id: string]: Channel}) => {
  //         if (!channelEntities[payload]) {
  //           return new samples.ChannelSelectedAction(null);
  //         } else if (channelEntities[payload] && channelEntities[payload].detailed) {
  //           return new samples.ChannelSelectedAction(payload);
  //         } else {
  //           return new samples.LoadingChannelAction(payload);
  //         }
  //       })
  //     );
  //   })
  // );

  // @Effect()
  // loadingChannel$: Observable<any> = this.actions$.pipe(
  //   ofType<samples.LoadingChannelAction>(samples.LOADING_CHANNEL),
  //   map(action => action.payload),
  //   map(ids => {
  //     if (!Array.isArray(ids)) {
  //       return [ids];
  //     } else {
  //       return ids;
  //     }
  //   }),
  //   map(ids => new db.GetRequestedAction({model: 'channel', ids: ids}))
  // );


  constructor(private actions$: Actions, private store: Store<fromRoot.AppState>, private sampleService: SampleService) {}

}
