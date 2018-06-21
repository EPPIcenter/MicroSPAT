import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Actions, ofType, Effect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { map, switchMap, delay } from 'rxjs/operators';

import * as fromRoot from 'app/reducers';
import * as tasks from 'app/actions/tasks';
import { MatDialog } from '@angular/material';
import { FailedTask, SuccessfulTask } from 'app/models/task';


@Injectable()
export class TaskEffects {

  @Effect()
  taskFailed$: Observable<any> = this.actions$.pipe(
    ofType<tasks.TaskFailureAction>(tasks.TASK_FAILED),
    map(action => action.payload),
    switchMap((payload: FailedTask) => {
      return [new tasks.SetTaskAction(payload), new tasks.DelayedClearTaskAction({delay: 5000, id: payload.id})]
    })
  )

  @Effect()
  taskSuccessful$: Observable<any> = this.actions$.pipe(
    ofType<tasks.TaskSuccessAction>(tasks.TASK_COMPLETED),
    map(action => action.payload),
    switchMap((payload: SuccessfulTask) => {
      return [new tasks.SetTaskAction(payload), new tasks.DelayedClearTaskAction({delay: 5000, id: payload.id})]
    })
  )

  @Effect()
  delayedClearTask$: Observable<any> = this.actions$.pipe(
    ofType<tasks.DelayedClearTaskAction>(tasks.DELAYED_CLEAR_TASK),
    map(action => action.payload),
    switchMap(payload => of(new tasks.ClearTaskAction(payload.id)).pipe(delay(payload.delay)))
  )


  constructor(private actions$: Actions, private store: Store<fromRoot.AppState>) {}
}
