import { Action } from '@ngrx/store';
import { Control } from 'app/models/sample/control';

export const LOAD_CONTROLS = '[Controls] Load Controls';
export const LOADING_CONTROLS = '[Controls] Loading Controls';

export const SELECT_CONTROL = '[Controls] Select Control';
export const ACTIVATE_CONTROL = '[Controls] Activate Control';
export const LOADING_CONTROL = '[Controls] Loading Control';
export const DEACTIVATE_CONTROL = '[Controls] Deactivate Control';

export const SUBMIT_CONTROL = '[Controls] Submit Control';
export const DELETE_CONTROL = '[Controls] Delete Control';

export const ACTIVATE_BIN_ESTIMATOR_PROJECT = '[Controls] Activate Bin Estimator Project'

export class LoadControlsAction implements Action {
  readonly type = LOAD_CONTROLS;
  constructor() {};
}

export class LoadingControlsAction implements Action {
  readonly type = LOADING_CONTROLS;
  constructor() {};
}

export class SelectControlAction implements Action {
  readonly type = SELECT_CONTROL;
  constructor(public payload: number) {};
}

export class LoadingControlAction implements Action {
  readonly type = LOADING_CONTROL;
  constructor(public payload: number) {};
}

export class ActivateControlAction implements Action {
  readonly type = ACTIVATE_CONTROL;
  constructor(public payload: number) {};
}

export class DeactivateControlAction implements Action {
  readonly type = DEACTIVATE_CONTROL;
  constructor() {};
}

export class SubmitControlAction implements Action {
  readonly type = SUBMIT_CONTROL;
  constructor(public payload: Control) {};
}

export class DeleteControlAction implements Action {
  readonly type = DELETE_CONTROL;
  constructor(public payload: number) {};
}

export class ActivateBinEstimatorProjectAction implements Action {
  readonly type = ACTIVATE_BIN_ESTIMATOR_PROJECT;
  constructor(public payload: number) {};
}

export type Actions
= LoadControlsAction
| LoadingControlsAction
| LoadingControlAction
| SelectControlAction
| ActivateControlAction
| DeactivateControlAction
| SubmitControlAction
| DeleteControlAction
| ActivateBinEstimatorProjectAction;
