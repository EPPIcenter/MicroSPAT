import { Action } from '@ngrx/store';

export const LOAD_ARTIFACT_ESTIMATOR_PROJECTS = '[Artifact Estimator] Load Artifact Estimator Projects';
export const LOADING_ARTIFACT_ESTIMATOR_PROJECTS = '[Artifact Estimator] Loading Artifact Estimator Projects';

export const SELECT_ARTIFACT_ESTIMATOR_PROJECT = '[Artifact Estimator] Select Artifact Estimator Project';
export const ACTIVATE_ARTIFACT_ESTIMATOR_PROJECT = '[Artifact Estimator] Activate Artifact Estimator Project';
export const ACTIVATE_LIST_PATH = '[Artifact Estimator] Activate List Path';
export const LOADING_ARTIFACT_ESTIMATOR = '[Artifact Estimator] Loading Artifact Estimator';
export const DEACTIVATE_ARTIFACT_ESTIMATOR_PROJECT = '[Artifact Estimator] Deactivate Artifact Estimator Project';

export const DELETE_ARTIFACT_ESTIMATOR_PROJECT = '[Artifact Estimator] Delete Artifact Estimator Project';
export const CREATE_ARTIFACT_ESTIMATOR_PROJECT = '[Artifact Estimator] Create Artifact Estimator Project';

export const ADD_SAMPLES = '[Artifact Estimator] Add Samples';
export const REMOVE_SAMPLES = '[Artifact Estimator] Remove Samples';

export const ANALYZE_LOCI = '[Artifact Estimator] Analyze Loci';

export const SELECT_LOCUS_ARTIFACT_ESTIMATOR = '[Artifact Estimator] Select Locus Artifact Estimator';
export const SELECT_ARTIFACT_ESTIMATOR = '[Artifact Estimator] Select Artifact Estimator';
export const DELETE_ARTIFACT_ESTIMATOR = '[Artifact Estimator] Delete Artifact Estimator';

export const ADD_BREAKPOINT = '[Artifact Estimator] Add Breakpoint';
export const CLEAR_BREAKPOINTS = '[Artifact Estimator] Clear Breakpoints';
export const RECALCULATE_EQUATION = '[Artifact Estimator] Recalculate Equation';

export class LoadArtifactEstimatorsAction implements Action {
  readonly type = LOAD_ARTIFACT_ESTIMATOR_PROJECTS;
  constructor() {};
}

export class LoadingArtifactEstimatorsAction implements Action {
  readonly type = LOADING_ARTIFACT_ESTIMATOR_PROJECTS;
  constructor() {};
}

export class SelectArtifactEstimatorProjectAction implements Action {
  readonly type = SELECT_ARTIFACT_ESTIMATOR_PROJECT;
  constructor(public payload: number) {};
}

export class  LoadingArtifactEstimatorAction implements Action {
  readonly type = LOADING_ARTIFACT_ESTIMATOR;
  constructor(public payload: number) {};
}

export class ActivateArtifactEstimatorAction implements Action {
  readonly type = ACTIVATE_ARTIFACT_ESTIMATOR_PROJECT;
  constructor(public payload: number) {};
}

export class DeactivateArtifactEstimatorProjectAction implements Action {
  readonly type = DEACTIVATE_ARTIFACT_ESTIMATOR_PROJECT;
}

export class ActivateListPath implements Action {
  readonly type = ACTIVATE_LIST_PATH;
}

export class DeleteArtifactEstimatorProjectAction implements Action {
  readonly type = DELETE_ARTIFACT_ESTIMATOR_PROJECT;
  constructor(public payload: number) {};
}

export class CreateArtifactEstimatorProjectAction implements Action {
  readonly type = CREATE_ARTIFACT_ESTIMATOR_PROJECT;
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

export class SelectLocusArtifactEstimatorAction implements Action {
  readonly type = SELECT_LOCUS_ARTIFACT_ESTIMATOR;
  constructor(public payload: number) {};
};

export class SelectArtifactEstimatorAction implements Action {
  readonly type = SELECT_ARTIFACT_ESTIMATOR;
  constructor(public payload: number) {};
}

export class DeleteArtifactEstimatorAction implements Action {
  readonly type = DELETE_ARTIFACT_ESTIMATOR;
  constructor(public payload: number) {};
}

export class AddBreakpointAction implements Action {
  readonly type = ADD_BREAKPOINT;
  constructor(public payload: {base_size: number, id: number | string}) {};
}

export class ClearBreakpointsAction implements Action {
  readonly type = CLEAR_BREAKPOINTS;
  constructor(public payload: number) {};
}

export class RecalculateEquationAction implements Action {
  readonly type = RECALCULATE_EQUATION;
  constructor(public payload: {id: number, method: string}) {};
}

export type Actions
= LoadArtifactEstimatorsAction
| LoadingArtifactEstimatorsAction
| LoadingArtifactEstimatorAction
| SelectArtifactEstimatorProjectAction
| ActivateArtifactEstimatorAction
| ActivateListPath
| DeactivateArtifactEstimatorProjectAction
| DeleteArtifactEstimatorProjectAction
| CreateArtifactEstimatorProjectAction
| AddSamplesAction
| RemoveSamplesAction
| AnalyzeLociAction
| SelectLocusArtifactEstimatorAction
| SelectArtifactEstimatorAction
| DeleteArtifactEstimatorAction
| AddBreakpointAction
| ClearBreakpointsAction
| RecalculateEquationAction;
