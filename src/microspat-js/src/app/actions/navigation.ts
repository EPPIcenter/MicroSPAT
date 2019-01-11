import { Action } from '@ngrx/store';

export const ACTIVATE_SAMPLES_PATH = '[Navigation] Activate Samples Path';
export const ACTIVATE_BIN_ESTIMATOR_PATH = '[Navigation] Activate Bin Estimator Path';
export const ACTIVATE_ARTIFACT_ESTIMATOR_PATH = '[Navigation] Activate Artifact Estimator Path';
export const ACTIVATE_GENOTYPING_PROJECT_PATH = '[Navigation] Activate Genotyping Project Path';
export const ACTIVATE_QUANTIFICATION_BIAS_ESTIMATOR_PROJECT_PATH = '[Navigation] Activate Quantification Bias Estimator Project Path';

export class ActivateSamplesPathAction implements Action {
  readonly type = ACTIVATE_SAMPLES_PATH;
}

export class ActivateBinEstimatorPathAction implements Action {
  readonly type = ACTIVATE_BIN_ESTIMATOR_PATH;
}

export class ActivateArtifactEstimatorPathAction implements Action {
  readonly type = ACTIVATE_ARTIFACT_ESTIMATOR_PATH;
}

export class ActivateGenotypingProjectPathAction implements Action {
  readonly type = ACTIVATE_GENOTYPING_PROJECT_PATH;
}

export class ActivateQuantificationBiasEstimatorPathAction implements Action {
  readonly type = ACTIVATE_QUANTIFICATION_BIAS_ESTIMATOR_PROJECT_PATH;
}

export type Actions
= ActivateSamplesPathAction
| ActivateBinEstimatorPathAction
| ActivateArtifactEstimatorPathAction
| ActivateGenotypingProjectPathAction
| ActivateQuantificationBiasEstimatorPathAction;
