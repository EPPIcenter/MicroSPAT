import { Injectable } from '@angular/core';
import { Actions, Effect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import * as ladders from '../actions/ladders';
import * as fromRoot from '../reducers';
import { LadderService } from '../services/ce/ladder';


@Injectable()
export class LadderEffects {

  @Effect({dispatch: false})
  submitLadder$: Observable<any> = this.actions$.pipe(
    ofType<ladders.SubmitLadderAction>(ladders.SUBMIT_LADDER),
    map(action => {
      return action.payload;
    }),
    map(l => {
      this.ladderService.saveLadder(l);
    })
  )

  constructor(private actions$: Actions, private store: Store<fromRoot.AppState>, private ladderService: LadderService) {}
}
