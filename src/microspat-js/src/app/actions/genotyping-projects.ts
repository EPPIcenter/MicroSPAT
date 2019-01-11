import { GenotypeFilter } from './../reducers/genotyping-projects/genotyping-projects';
import { Action } from '@ngrx/store';

export const LOAD_GENOTYPING_PROJECTS = '[Genotyping Project] Load Genotyping Projects';
export const LOADING_GENOTYPING_PROJECTS = '[Genotyping Project] Loading Genotyping Projects';

export const SELECT_GENOTYPING_PROJECT = '[Genotyping Project] Select Genotyping Project';
export const ACTIVATE_GENOTYPING_PROJECT = '[Genotyping Project] Activate Genotyping Project';
export const ACTIVATE_LIST_PATH = '[Genotyping Project] Activate List Path';
export const LOADING_GENOTYPING_PROJECT = '[Genotyping Project] Loading Genotyping Project';
export const DEACTIVATE_GENOTYPING_PROJECT = '[Genotyping Project] Deactivate Genotyping Project';

export const DELETE_GENOTYPING_PROJECT = '[Genotyping Project] Delete Genotyping Project';
export const CREATE_GENOTYPING_PROJECT = '[Genotyping Project] Create Genotyping Project';

export const SET_DETAIL_TAB = '[Genotyping Project] Set Detail Tab';

export const ADD_SAMPLES = '[Genotyping Project] Add Samples';
export const REMOVE_SAMPLES = '[Genotyping Project] Remove Samples';
export const ADD_SAMPLES_FILE = '[Genotyping Project] Add Samples File';

export const ANALYZE_LOCI = '[Genotyping Project] Analyze Loci';

export const APPLY_GENOTYPE_FILTER = '[Genotyping Project] Apply Genotype Filter';
export const CLEAR_GENOTYPE_FILTER = '[Genotyping Project] Clear Genotype Filter';
export const SELECT_GENOTYPE = '[Genotyping Project] Select Genotype';
export const SELECT_FILTERED_GENOTYPE = '[Genotyping Project] Select Filtered Genotype';
export const ACTIVATE_GENOTYPE = '[Genotyping Project] Activate Genotype';
export const LOADING_GENOTYPE = '[Genotyping Project] Loading Genotype';
export const LOAD_CHANNELS = '[Genotyping Project] Load Channels';
export const LOADING_CHANNELS = '[Genotyping Project] Loading Channels';
export const TOGGLE_SHOW_NON_REFERENCE_RUNS = '[Genotyping Project] Toggle Show Non Reference Runs';
export const TOGGLE_ALLELE = '[Genotyping Project] Toggle Allele';

export const SELECT_SAMPLE = '[Genotyping Project] Select Sample';
export const SELECT_SAMPLE_GENOTYPE = '[Genotyping Project] Select Sample Genotype';

export const GET_PEAK_DATA = '[Genotyping Project] Get Peak Data';
export const GET_ALLELE_DATA = '[Genotyping Project] Get Allele Data';
export const CALCULATE_PEAK_PROBABILITIES = '[Genotyping Project] Calculate Peak Probabilities';

export class LoadGenotypingProjectsAction implements Action {
  readonly type = LOAD_GENOTYPING_PROJECTS;
  constructor() {};
}

export class LoadingGenotypingProjectsAction implements Action {
  readonly type = LOADING_GENOTYPING_PROJECTS;
  constructor() {};
}

export class SetDetailTabAction implements Action {
  readonly type = SET_DETAIL_TAB;
  constructor(public payload: string) {};
}

export class SelectGenotypingProjectAction implements Action {
  readonly type = SELECT_GENOTYPING_PROJECT;
  constructor(public payload: number) {};
}

export class  LoadingGenotypingProjectAction implements Action {
  readonly type = LOADING_GENOTYPING_PROJECT;
  constructor(public payload: number) {};
}

export class ActivateGenotypingProjectAction implements Action {
  readonly type = ACTIVATE_GENOTYPING_PROJECT;
  constructor(public payload: number) {};
}

export class DeactivateGenotypingProjectAction implements Action {
  readonly type = DEACTIVATE_GENOTYPING_PROJECT;
}

export class ActivateListPath implements Action {
  readonly type = ACTIVATE_LIST_PATH;
}

export class DeleteGenotypingProjectAction implements Action {
  readonly type = DELETE_GENOTYPING_PROJECT;
  constructor(public payload: number) {};
}

export class CreateGenotypingProjectAction implements Action {
  readonly type = CREATE_GENOTYPING_PROJECT;
  constructor(public payload: {
    title: string,
    creator: string,
    description: string,
    locus_set_id: number,
    bin_estimator_id: number,
    artifact_estimator_id?: number,
    quantification_bias_estimator_id?: number
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

export class AddSamplesFileAction implements Action {
  readonly type = ADD_SAMPLES_FILE;
  constructor(public payload: {
    samplesFile: File,
    projectID: number
  }) {};
}

export class AnalyzeLociAction implements Action {
  readonly type = ANALYZE_LOCI;
  constructor(public payload: {
    locus_parameter_ids: number[],
    parameter_settings: any
  }) {};
}

export class ApplyGenotypeFilterAction implements Action {
  readonly type = APPLY_GENOTYPE_FILTER;
  constructor(public payload: GenotypeFilter) {}
}

export class ClearGenotypeFilterAction implements Action {
  readonly type = CLEAR_GENOTYPE_FILTER;
  constructor() {};
}

export class SelectGenotypeAction implements Action {
  readonly type = SELECT_GENOTYPE;
  constructor(public payload: number) {}
}

export class SelectFilteredGenotypeAction implements Action {
  readonly type = SELECT_FILTERED_GENOTYPE;
  constructor(public payload: number) {};
}

export class ActivateGenotypeAction implements Action {
  readonly type = ACTIVATE_GENOTYPE;
  constructor(public payload: number) {}
}

export class LoadingGenotypeAction implements Action {
  readonly type = LOADING_GENOTYPE;
  constructor(public payload: number) {}
}

export class LoadChannelsAction implements Action {
  readonly type = LOAD_CHANNELS;
  constructor(public payload: (number | string)[]) {}
}

export class LoadingChannelsAction implements Action {
  readonly type = LOADING_CHANNELS;
  constructor(public payload: (number | string)[]) {}
}

export class ToggleShowNonReferenceRunsAction implements Action {
  readonly type = TOGGLE_SHOW_NON_REFERENCE_RUNS;
  constructor() {};
}

export class ToggleAlleleAction implements Action {
  readonly type = TOGGLE_ALLELE;
  constructor(public payload: {binID: number, genotypeID: number}) {};
}

export class SelectSampleAction implements Action {
  readonly type = SELECT_SAMPLE;
  constructor(public payload: number) {};
}

export class SelectSampleGenotypeAction implements Action {
  readonly type = SELECT_SAMPLE_GENOTYPE;
  constructor(public payload: number) {};
}

export class GetPeakDataAction implements Action {
  readonly type = GET_PEAK_DATA;
  constructor(public payload: number) {};
}

export class GetAlleleDataAction implements Action {
  readonly type = GET_ALLELE_DATA;
  constructor(public payload: number) {};
}

export class CalculatePeakProbabilitiesAction implements Action {
  readonly type = CALCULATE_PEAK_PROBABILITIES;
  constructor(public payload: number) {};
}

export type Actions
= LoadGenotypingProjectsAction
| LoadingGenotypingProjectsAction
| SelectGenotypingProjectAction
| LoadingGenotypingProjectAction
| ActivateGenotypingProjectAction
| DeactivateGenotypingProjectAction
| ActivateListPath
| SetDetailTabAction
| DeleteGenotypingProjectAction
| CreateGenotypingProjectAction
| AddSamplesAction
| RemoveSamplesAction
| AddSamplesFileAction
| AnalyzeLociAction
| ApplyGenotypeFilterAction
| ClearGenotypeFilterAction
| SelectGenotypeAction
| SelectFilteredGenotypeAction
| ActivateGenotypeAction
| LoadChannelsAction
| LoadingChannelsAction
| ToggleShowNonReferenceRunsAction
| ToggleAlleleAction
| SelectSampleAction
| SelectSampleGenotypeAction;
