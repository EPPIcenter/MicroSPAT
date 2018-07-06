import { Action } from '@ngrx/store';


export const ACTIVATE_BIN_ESTIMATOR_PATH = '[Navigation] Activate Bin Estimator Path';

export class ActivateBinEstimatorPathAction implements Action {
  readonly type = ACTIVATE_BIN_ESTIMATOR_PATH;
}

export type Actions
= ActivateBinEstimatorPathAction;
