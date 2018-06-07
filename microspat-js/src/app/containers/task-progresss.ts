import { Component, ChangeDetectionStrategy, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material';
import { Observable } from 'rxjs';
import { Store } from '@ngrx/store';

import { Task, InProgressTask } from 'app/models/task';
import * as fromRoot from 'app/reducers';
import * as fromTasks from 'app/reducers/tasks';


@Component({
  selector: 'mspat-task-progress',
  template: `
  <mspat-task-progress-display [task]="task$ | async"></mspat-task-progress-display>
  `
})
export class TaskComponent {

  private task$: Observable<InProgressTask>;

  constructor(
    public dialogRef: MatDialogRef<TaskComponent>,
    private store: Store<fromRoot.AppState>,
    @Inject(MAT_DIALOG_DATA) public data: { taskID: string }
  ) {
    this.task$ = <Observable<InProgressTask>>this.store.select(fromTasks.selectTask(data.taskID));
  };

}
