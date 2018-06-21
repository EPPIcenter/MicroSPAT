import { Injectable } from '@angular/core';
import { Actions, Effect, ofType } from '@ngrx/effects';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import * as locusSets from 'app/actions/locus-sets';
import * as fromRoot from 'app/reducers';
import { LocusSetService } from 'app/services/locus/locus-set';


@Injectable()
export class LocusSetEffects {

  @Effect({dispatch: false})
  submitLocusSet$: Observable<any> = this.actions$.pipe(
    ofType<locusSets.SubmitLocusSetAction>(locusSets.SUBMIT_LOCUS_SET),
    map(action => {
      return action.payload;
    }),
    map(l => {
      this.locusSetService.saveLocusSet(l);
    })
  )

  @Effect({dispatch: false})
  deleteLocusSet$: Observable<any> = this.actions$.pipe(
    ofType<locusSets.DeleteLocusSetAction>(locusSets.DELETE_LOCUS_SET),
    map(action => {
      return action.payload;
    }),
    map(l => {
      this.locusSetService.deleteLocusSet(l);
    })
  )

  constructor(
    private actions$: Actions,
    private locusSetService: LocusSetService) {}
}
