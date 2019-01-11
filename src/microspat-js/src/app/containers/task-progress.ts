import { Component, ChangeDetectionStrategy, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material';
import { Observable } from 'rxjs';
import { Store } from '@ngrx/store';

import { Task, InProgressTask } from '../models/task';
import * as fromRoot from '../reducers';
import * as fromTasks from '../reducers/tasks';


@Component({
  selector: 'mspat-task-progress',
  template: `
  <mspat-task-progress-display [task]="task$ | async"></mspat-task-progress-display>
  `
})
export class TaskComponent {

  public task$: Observable<InProgressTask>;

  constructor(
    public dialogRef: MatDialogRef<TaskComponent>,
    private store: Store<fromRoot.AppState>,
    @Inject(MAT_DIALOG_DATA) public data: { taskID: string }
  ) {
    this.task$ = <Observable<InProgressTask>>this.store.select(fromTasks.selectTask(data.taskID));
  };

}
