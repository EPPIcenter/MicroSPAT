import * as keyboard from '../actions/keyboard';
import { createFeatureSelector, createSelector } from '@ngrx/store';

export interface State {
  keydown: {[id: string]: undefined};
}

const initialState: State = {
  keydown: {}
};

export function reducer(state = initialState, action: keyboard.Actions): State {
  switch (action.type) {
    case keyboard.KEY_DOWN:
      const keyDownKey = action.payload.key;
      if (!(keyDownKey in state.keydown)) {
        const keydown = Object.assign({}, state.keydown, {
          [keyDownKey]: undefined
        });

        return Object.assign({}, state, {
          keydown: keydown
        });
      }
      return state;

    case keyboard.KEY_UP:
      const keyUpKey = action.payload.key;
      if (keyUpKey in state.keydown) {
        const keydown = Object.assign({}, state.keydown);
        delete keydown[keyUpKey];
        return Object.assign({}, state, {
          keydown: keydown
        });
      }
      return state;

    default:
      return state;
  }
}

export const selectKeyboardState = createFeatureSelector<State>('keyboard');
export const selectShiftDown = createSelector(selectKeyboardState, (state) => {
  return 'Shift' in state.keydown;
});
