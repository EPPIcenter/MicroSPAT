// import { Injectable } from '@angular/core';
// import { Observable } from 'rxjs';
// import { Actions, ofType, Effect } from '@ngrx/effects';
// import { Store, select } from '@ngrx/store';
// import { map, tap, take, switchMap } from 'rxjs/operators';

// import * as fromRoot from 'app/reducers';
// import * as fromTask from 'app/reducers/tasks';
// import * as tasks from 'app/actions/tasks';
// import { MatDialog } from '@angular/material';
// import { TaskComponent } from '../containers/task-progresss';


// @Injectable()
// export class TaskEffects {

//   @Effect({dispatch: false})
//   displayTask$: Observable<any> = this.actions$.pipe(
//     ofType<tasks.DisplayTaskAction>(tasks.DISPLAY_TASK),
//     map(action => action.payload),
//     switchMap((taskID: string) => {
//       return this.store.pipe(
//         select(fromTask.selectTask(taskID)),
//         take(1),
//         map(task => {
//         const displayRef = this.dialog.open(TaskComponent, {
//           data: {
//             taskID: taskID
//           }
//         });
//         this.store.dispatch(new tasks.AddDisplayTaskAction({
//           taskID: taskID,
//           displayRef: displayRef
//         }))
//       }))
//     })
//   );

//   @Effect()
//   taskStarted$: Observable<any> = this.actions$.pipe(
//     ofType<tasks.TaskStartedAction>(tasks.TASK_STARTED),

//   )


//   constructor(private actions$: Actions, private store: Store<fromRoot.AppState>, private dialog: MatDialog) {}
// }
