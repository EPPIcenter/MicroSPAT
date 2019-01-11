import { Action } from '@ngrx/store';
import { LocusSet } from '../models/locus/locus-set';

export const LOAD_LOCUS_SETS = '[Locus Sets] Load Locus Sets';
export const LOADING_LOCUS_SETS = '[Locus Sets] Loading Locus Sets';
export const SELECT_LOCUS_SET = '[Locus Sets] Select Locus Set';
export const UNSELECT_LOCUS_SET = '[Locus Sets] Unselect Locus Set';
export const SUBMIT_LOCUS_SET = '[Locus Sets] Submit Locus Set';
export const DELETE_LOCUS_SET = '[Locus Sets] Delete Locus Set';

export class LoadLocusSetsAction implements Action {
  readonly type = LOAD_LOCUS_SETS;
  constructor() {};
}

export class LoadingLocusSetsAction implements Action {
  readonly type = LOADING_LOCUS_SETS;
  constructor() {};
}

export class SelectLocusSetAction implements Action {
  readonly type = SELECT_LOCUS_SET;
  constructor(public payload: number | string) {};
}

export class UnselectLocusSetAction implements Action {
  readonly type = UNSELECT_LOCUS_SET;
  constructor() {};
};

export class SubmitLocusSetAction implements Action {
  readonly type = SUBMIT_LOCUS_SET;
  constructor(public payload: {label: string, loci: number[]}) {};
}

export class DeleteLocusSetAction implements Action {
  readonly type = DELETE_LOCUS_SET;
  constructor(public payload: number) {};
}

export type Actions
= LoadLocusSetsAction
| LoadingLocusSetsAction
| SelectLocusSetAction
| UnselectLocusSetAction
| SubmitLocusSetAction
| DeleteLocusSetAction;
