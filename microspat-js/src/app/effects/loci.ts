import { Injectable } from '@angular/core';
import { Actions, Effect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import * as loci from 'app/actions/loci';
import * as fromRoot from 'app/reducers';
import { LocusService } from 'app/services/locus/locus';


@Injectable()
export class LocusEffects {

  @Effect({dispatch: false})
  submitLocus$: Observable<any> = this.actions$.pipe(
    ofType<loci.SubmitLocusAction>(loci.SUBMIT_LOCUS),
    map(action => {
      return action.payload;
    }),
    map(l => {
      this.locusService.saveLocus(l);
    })
  )

  @Effect({dispatch: false})
  deleteLocus$: Observable<any> = this.actions$.pipe(
    ofType<loci.DeleteLocusAction>(loci.DELETE_LOCUS),
    map(action => {
      return action.payload;
    }),
    map(l => {
      this.locusService.deleteLocus(l);
    })
  )

  constructor(private actions$: Actions, private store: Store<fromRoot.AppState>, private locusService: LocusService) {}
}
