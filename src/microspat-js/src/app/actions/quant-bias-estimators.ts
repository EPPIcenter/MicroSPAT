import { Action } from '@ngrx/store';

export const LOAD_QUANTIFICATION_BIAS_ESTIMATOR_PROJECTS = '[Quantification Bias Estimator] Load Quantification Bias Estimator Projects';
export const LOADING_QUANTIFICATION_BIAS_ESTIMATOR_PROJECTS = '[Quantification Bias Estimator] Loading Quantification Bias Estimator Projects';

export const SELECT_QUANTIFICATION_BIAS_ESTIMATOR_PROJECT = '[Quantification Bias Estimator] Select Quantification Bias Estimator Project';
export const ACTIVATE_QUANTIFICATION_BIAS_ESTIMATOR_PROJECT = '[Quantification Bias Estimator] Activate Quantification Bias Estimator Project';
export const ACTIVATE_LIST_PATH = '[Quantification Bias Estimator] Activate List Path';
export const LOADING_QUANTIFICATION_BIAS_ESTIMATOR = '[Quantification Bias Estimator] Loading Quantification Bias Estimator';
export const DEACTIVATE_QUANTIFICATION_BIAS_ESTIMATOR_PROJECT = '[Quantification Bias Estimator] Deactivate Quantification Bias Estimator Project';

export const DELETE_QUANTIFICATION_BIAS_ESTIMATOR_PROJECT = '[Quantification Bias Estimator] Delete Quantification Bias Estimator Project';
export const CREATE_QUANTIFICATION_BIAS_ESTIMATOR_PROJECT = '[Quantification Bias Estimator] Create Quantification Bias Estimator Project';

export const SELECT_SAMPLE = '[Quantification Bias Estimator] Select Sample';
export const ADD_CONTROLS = '[Quantification Bias Estimator] Add Controls';
export const REMOVE_SAMPLES = '[Quantification Bias Estimator] Remove Samples';

export const ANALYZE_LOCI = '[Quantification Bias Estimator] Analyze Loci';

export class LoadQuantificationBiasEstimatorsAction implements Action {
  readonly type = LOAD_QUANTIFICATION_BIAS_ESTIMATOR_PROJECTS;
  constructor() {};
}

export class LoadingQuantificationBiasEstimatorsAction implements Action {
  readonly type = LOADING_QUANTIFICATION_BIAS_ESTIMATOR_PROJECTS;
  constructor() {};
}

export class SelectQuantificationBiasEstimatorProjectAction implements Action {
  readonly type = SELECT_QUANTIFICATION_BIAS_ESTIMATOR_PROJECT;
  constructor(public payload: number) {};
}

export class LoadingQuantificationBiasEstimatorAction implements Action {
  readonly type = LOADING_QUANTIFICATION_BIAS_ESTIMATOR;
  constructor(public payload: number) {};
}

export class ActivateQuantificationBiasEstimatorAction implements Action {
  readonly type = ACTIVATE_QUANTIFICATION_BIAS_ESTIMATOR_PROJECT;
  constructor(public payload: number) {};
}

export class DeactivateQuantificationBiasEstimatorProjectAction implements Action {
  readonly type = DEACTIVATE_QUANTIFICATION_BIAS_ESTIMATOR_PROJECT;
}

export class ActivateListPath implements Action {
  readonly type = ACTIVATE_LIST_PATH;
}

export class DeleteQuantificationBiasEstimatorProjectAction implements Action {
  readonly type = DELETE_QUANTIFICATION_BIAS_ESTIMATOR_PROJECT;
  constructor(public payload: number) {};
}

export class CreateQuantificationBiasEstimatorProjectAction implements Action {
  readonly type = CREATE_QUANTIFICATION_BIAS_ESTIMATOR_PROJECT;
  constructor(public payload: {
    title: string,
    creator: string,
    description: string,
    locus_set_id: number,
    bin_estimator_id: number,
    artifact_estimator_id: number
  }) {}
}

export class SelectSampleAction implements Action {
  readonly type = SELECT_SAMPLE;
  constructor(public payload: number) {};
}

export class AddControlsAction implements Action {
  readonly type = ADD_CONTROLS;
  constructor(public payload: {
    project_id: number,
    file: File
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

export type Actions
= LoadQuantificationBiasEstimatorsAction
| LoadingQuantificationBiasEstimatorsAction
| LoadingQuantificationBiasEstimatorAction
| SelectQuantificationBiasEstimatorProjectAction
| ActivateQuantificationBiasEstimatorAction
| ActivateListPath
| DeactivateQuantificationBiasEstimatorProjectAction
| DeleteQuantificationBiasEstimatorProjectAction
| CreateQuantificationBiasEstimatorProjectAction
| SelectSampleAction
| AddControlsAction
| RemoveSamplesAction
| AnalyzeLociAction;
