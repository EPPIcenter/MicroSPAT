import { Action } from '@ngrx/store';
import { Ladder } from '../models/ce/ladder';

export const LOAD_LADDERS = '[Ladder] Load Ladders';
export const LOADING_LADDERS = '[Ladder] Loading Ladders';
export const SELECT_LADDER = '[Ladder] Select Ladder';
export const UNSELECT_LADDER = '[Ladder] Unselect Ladder';
export const SUBMIT_LADDER = '[Ladder] Submit Ladder';

export class LoadLaddersAction implements Action {
  readonly type = LOAD_LADDERS;
  constructor() {};
}

export class LoadingLaddersAction implements Action {
  readonly type = LOADING_LADDERS;
  constructor() {};
}

export class SelectLadderAction implements Action {
  readonly type = SELECT_LADDER;
  constructor(public payload: number | string) {}
}

export class UnselectLadderAction implements Action {
  readonly type = UNSELECT_LADDER;
  constructor() {}
}

export class SubmitLadderAction implements Action {
  readonly type = SUBMIT_LADDER;
  constructor(public payload: Ladder) {};
}

export type Actions
= LoadLaddersAction
| LoadingLaddersAction
| SelectLadderAction
| UnselectLadderAction
| SubmitLadderAction;
