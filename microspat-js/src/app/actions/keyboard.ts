import { Action } from '@ngrx/store';

export const KEY_DOWN = '[Keyboard] Key Down';
export const KEY_UP = '[Keyboard] Key Up';

export class KeyDownAction implements Action {
  readonly type = KEY_DOWN;
  constructor(public payload: KeyboardEvent) {}
}

export class KeyUpAction implements Action {
  readonly type = KEY_UP;
  constructor(public payload: KeyboardEvent) {}
}

export type Actions
 = KeyDownAction
 | KeyUpAction;
