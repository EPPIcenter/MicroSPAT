// import { createSelector } from 'reselect';
// import { ActionReducer, Action } from '@ngrx/store';
// import * as db from 'app/actions/db';
import { Channel } from '../../../models/ce/channel';
import { generateReducer } from '../dbReducer';

export const MODEL = 'channel';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: Channel };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
