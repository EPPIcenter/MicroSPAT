export const SUCCESS = 'success';
export const FAILURE = 'failure';
export const START = 'start';
export const IN_PROGRESS = 'in_progress';

export interface Task {
  namespace: string;
  task: string;
  status: 'success' | 'failure' | 'start' | 'in_progress';
  id: string;
  payload: any;
  task_args: {
    [args: string]: any
  };
}

export interface InProgressPayload {
  style: 'defined' | 'indefinite',
  total: number | null;
  current_state: number | null;
  message: string | null;
}

export interface SuccessfulTask extends Task {
  status: 'success';
  payload: string;
}

export interface FailedTask extends Task {
  status: 'failure';
  payload: string;
}

export interface StartTask extends Task {
  status: 'start';
}

export interface InProgressTask extends Task {
  status: 'in_progress';
  payload: InProgressPayload;
}

export type ServerTask
= SuccessfulTask
| FailedTask
| StartTask
| InProgressTask;
