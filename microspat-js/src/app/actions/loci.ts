import { Action } from '@ngrx/store';
import { Locus } from 'app/models/locus/locus';

export const LOAD_LOCI = '[Loci] Load Loci';
export const LOADING_LOCI = '[Loci] Loading Loci';
export const SELECT_LOCUS = '[Loci] Select Locus';
export const UNSELECT_LOCUS = '[Loci] Unselect Locus';
export const SUBMIT_LOCUS = '[Loci] Submit Locus';
export const DELETE_LOCUS = '[Loci] Delete Locus';

export class LoadLociAction implements Action {
  readonly type = LOAD_LOCI;
  constructor() {};
}

export class LoadingLociAction implements Action {
  readonly type = LOADING_LOCI;
  constructor() {};
}

export class SelectLocusAction implements Action {
  readonly type = SELECT_LOCUS;
  constructor(public payload: number | string) {}
}

export class UnselectLocusAction implements Action {
  readonly type = UNSELECT_LOCUS;
  constructor() {}
}

export class SubmitLocusAction implements Action {
  readonly type = SUBMIT_LOCUS;
  constructor(public payload: Locus) {};
}

export class DeleteLocusAction implements Action {
  readonly type = DELETE_LOCUS;
  constructor(public payload: number) {};
}

export type Actions
= LoadLociAction
| LoadingLociAction
| SelectLocusAction
| UnselectLocusAction
| SubmitLocusAction
| DeleteLocusAction;
