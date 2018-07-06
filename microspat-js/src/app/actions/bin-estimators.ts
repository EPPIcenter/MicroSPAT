import { Action } from '@ngrx/store';

export const LOAD_BIN_ESTIMATORS = '[Bin Estimator] Load Bin Estimators';
export const LOADING_BIN_ESTIMATORS = '[Bin Estimator] Loading Bin Estimators';
export const LOADING_BIN_ESTIMATOR = '[Bin Estimator] Loading Bin Estimator';

export const SELECT_BIN_ESTIMATOR = '[Bin Estimator] Select Bin Estimator';
export const ACTIVATE_BIN_ESTIMATOR = '[Bin Estimator] Activate Bin Estimator';

export class LoadBinEstimatorsAction implements Action {
  readonly type = LOAD_BIN_ESTIMATORS;
  constructor() {};
}

export class LoadingBinEstimatorsAction implements Action {
  readonly type = LOADING_BIN_ESTIMATORS;
  constructor() {};
}

export class  LoadingBinEstimatorAction implements Action {
  readonly type = LOADING_BIN_ESTIMATOR;
  constructor(public payload: number) {};
}

export class SelectBinEstimatorAction implements Action {
  readonly type = SELECT_BIN_ESTIMATOR;
  constructor(public payload: number) {};
}

export class ActivateBinEstimatorAction implements Action {
  readonly type = ACTIVATE_BIN_ESTIMATOR;
  constructor(public payload: number) {};
}



export type Actions
= LoadBinEstimatorsAction
| LoadingBinEstimatorsAction
| LoadingBinEstimatorAction
| SelectBinEstimatorAction
| ActivateBinEstimatorAction;
