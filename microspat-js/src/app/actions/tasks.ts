import { Action } from '@ngrx/store';
import { Task, StartTask, SuccessfulTask, FailedTask, InProgressTask } from 'app/models/task';
import { MatDialogRef } from '@angular/material';
import { TaskDisplayComponent } from '../components/task-progress';
import { TaskComponent } from '../containers/task-progresss';

export const REGISTER_TASK = '[Task] Register Task';
export const TASK_STARTED = '[Task] Task Started';
export const TASK_PROGRESSED = '[Task] Task In Progress';
export const TASK_FAILED = '[Task] Task Failed';
export const TASK_COMPLETED = '[Task] Task Completed';
export const CLEAR_TASK = '[Task] Clear Task';
export const DISPLAY_TASK = '[Task] Display Task';
export const ADD_DISPLAY_TASK = '[Task] Add Display Task';

export class RegisterTaskAction implements Action {
  readonly type = REGISTER_TASK;
  constructor(public payload: {namespace: string, task: string}) {};
}

export class TaskStartedAction implements Action {
  readonly type = TASK_STARTED;
  constructor(public payload: StartTask) {};
}

export class TaskSuccessAction implements Action {
  readonly type = TASK_COMPLETED;
  constructor(public payload: SuccessfulTask) {}
}

export class TaskFailureAction implements Action {
  readonly type = TASK_FAILED;
  constructor(public payload: FailedTask) {}
}

export class TaskProgressAction implements Action {
  readonly type = TASK_PROGRESSED;
  constructor(public payload: InProgressTask) {}
}

export class ClearTaskAction implements Action {
  readonly type = CLEAR_TASK;
  constructor(public payload: string) {}
}

export class DisplayTaskAction implements Action {
  readonly type = DISPLAY_TASK;
  constructor(public payload: string) {}
}

export class AddDisplayTaskAction implements Action {
  readonly type = ADD_DISPLAY_TASK;
  constructor(public payload: {
    taskID: string,
    displayRef: MatDialogRef<TaskComponent>
  }) {}
}

export type ServerTaskActions
= TaskStartedAction
| TaskSuccessAction
| TaskFailureAction
| TaskProgressAction;

export type ClientTaskActions
 = ClearTaskAction
 | DisplayTaskAction
 | AddDisplayTaskAction;

export type Actions = RegisterTaskAction | ServerTaskActions | ClientTaskActions;
