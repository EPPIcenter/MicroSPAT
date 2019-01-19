import { Action } from '@ngrx/store';

import { BinSettings } from '../services/bin-estimator/bin';

export const LOAD_BIN_ESTIMATORS = '[Bin Estimator] Load Bin Estimators';
export const LOADING_BIN_ESTIMATORS = '[Bin Estimator] Loading Bin Estimators';

export const SELECT_BIN_ESTIMATOR = '[Bin Estimator] Select Bin Estimator';
export const ACTIVATE_BIN_ESTIMATOR = '[Bin Estimator] Activate Bin Estimator';
export const ACTIVATE_LIST_PATH = '[Bin Estimator] Activate List Path';
export const LOADING_BIN_ESTIMATOR = '[Bin Estimator] Loading Bin Estimator';
export const DEACTIVATE_BIN_ESTIMATOR = '[Bin Estimator] Deactivate Bin Estiamtor';

export const DELETE_BIN_ESTIMATOR = '[Bin Estimator] Delete Bin Estimator';
export const CREATE_BIN_ESTIMATOR = '[Bin Estimator] Create Bin Estimator';
export const ADD_SAMPLES = '[Bin Estimator] Add Samples';
export const REMOVE_SAMPLES = '[Bin Estimator] Remove Samples';

export const ANALYZE_LOCI = '[Bin Estimator] Analyze Loci';

export const SELECT_LOCUS_BIN_SET = '[Bin Estimator] Select Locus Bin Set';
export const SELECT_BIN = '[Bin Estimator] Select Bin';
export const ADD_BIN = '[Bin Estimator] Add Bin';
export const SAVE_BIN = '[Bin Estimator] Save Bin';
export const DELETE_BIN = '[Bin Estimator] Delete Bin';

export class LoadBinEstimatorsAction implements Action {
  readonly type = LOAD_BIN_ESTIMATORS;
  constructor() {};
}

export class LoadingBinEstimatorsAction implements Action {
  readonly type = LOADING_BIN_ESTIMATORS;
  constructor() {};
}

export class SelectBinEstimatorAction implements Action {
  readonly type = SELECT_BIN_ESTIMATOR;
  constructor(public payload: number) {};
}

export class  LoadingBinEstimatorAction implements Action {
  readonly type = LOADING_BIN_ESTIMATOR;
  constructor(public payload: number) {};
}

export class ActivateBinEstimatorAction implements Action {
  readonly type = ACTIVATE_BIN_ESTIMATOR;
  constructor(public payload: number) {};
}

export class DeactivateBinEstimatorAction implements Action {
  readonly type = DEACTIVATE_BIN_ESTIMATOR;
}

export class ActivateListPath implements Action {
  readonly type = ACTIVATE_LIST_PATH;
}

export class DeleteBinEstimatorAction implements Action {
  readonly type = DELETE_BIN_ESTIMATOR;
  constructor(public payload: number) {};
}

export class CreateBinEstimatorAction implements Action {
  readonly type = CREATE_BIN_ESTIMATOR;
  constructor(public payload: {
    title: string,
    creator: string,
    description: string,
    locus_set_id: number
  }) {}
}

export class AddSamplesAction implements Action {
  readonly type = ADD_SAMPLES;
  constructor(public payload: {
    project_id: number,
    sample_ids: number[]
  }) {};
}

export class RemoveSamplesAction implements Action {
  readonly type = REMOVE_SAMPLES;
  constructor(public payload: {
    project_id: number,
    sample_ids: number[]
  }) {};
}

export class AnalyzeLociAction implements Action {
  readonly type = ANALYZE_LOCI;
  constructor(public payload: {
    locus_parameter_ids: number[],
    parameter_settings: any
  }) {};
}

export class SelectLocusBinSetAction implements Action {
  readonly type = SELECT_LOCUS_BIN_SET;
  constructor(public payload: number) {};
}

export class SelectBinAction implements Action {
  readonly type = SELECT_BIN;
  constructor(public payload: number) {};
}

export class AddBinAction implements Action {
  readonly type = ADD_BIN;
  constructor(public payload: {base_size: number, locus_bin_set_id: number}) {};
}

export class SaveBinAction implements Action {
  readonly type = SAVE_BIN;
  constructor(public payload: BinSettings) {};
}

export class DeleteBinAction implements Action {
  readonly type = DELETE_BIN;
  constructor(public payload: number) {};
}

export type Actions
= LoadBinEstimatorsAction
| LoadingBinEstimatorsAction
| LoadingBinEstimatorAction
| SelectBinEstimatorAction
| ActivateBinEstimatorAction
| ActivateListPath
| DeactivateBinEstimatorAction
| DeleteBinEstimatorAction
| CreateBinEstimatorAction
| AddSamplesAction
| RemoveSamplesAction
| AnalyzeLociAction
| SelectLocusBinSetAction
| SelectBinAction
| AddBinAction
| DeleteBinAction;
