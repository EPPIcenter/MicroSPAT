import { createSelector } from 'reselect';
import { createFeatureSelector } from '@ngrx/store';

import * as fromDB from 'app/reducers/db';
import * as DBActions from 'app/actions/db';
import * as LaddersActions from 'app/actions/ladders';
import { Ladder } from '../../models/ce/ladder';

export interface State {
  laddersLoaded: boolean;
  loadingLadders: boolean;
  activeLadderID: number | string | null;
}

const initialState: State = {
  laddersLoaded: false,
  loadingLadders: false,
  activeLadderID: null
}

export function reducer(state = initialState, action: DBActions.Actions | LaddersActions.Actions) {
  switch (action.type) {
    case DBActions.LIST_RECEIVED:
      return dbListReceived(state, action);

    // case DBActions.GET_RECEIVED:
    //   return dbGetReceived(state, action);

    // case DBActions.DELETE_RECEIVED:
    //   return dbDeleteReceived(state, action);

    case LaddersActions.LOADING_LADDERS:
      return loadingLadders(state, action);

    case LaddersActions.SELECT_LADDER:
      return selectLadder(state, action);

    case LaddersActions.UNSELECT_LADDER:
      return unselectLadder(state, action);

    default:
      return state
  }
}

function dbListReceived(state: State, action: DBActions.ListReceivedAction) {
  if (action.payload.model === fromDB.models.ladder) {
    return Object.assign({}, state, {
      loadingLadders: false,
      laddersLoaded: true
    });
  }
  return state;
}

function loadingLadders(state, action) {
  return Object.assign({}, state, {
    loadingLadders: true
  });
}

function selectLadder(state, action) {
  return Object.assign({}, state, {
    activeLadderID: action.payload
  });
}

function unselectLadder(state, action) {
  return Object.assign({}, state, {
    activeLadderID: null
  })
}

export const selectLadderState = createFeatureSelector<State>('ladders');
export const selectLoadingLadders = createSelector(selectLadderState, (state: State) => state.loadingLadders);
export const selectLaddersLoaded = createSelector(selectLadderState, (state: State) => state.laddersLoaded);
export const selectActiveLadderID = createSelector(selectLadderState, (state: State) => state.activeLadderID);

export const selectActiveLadder = createSelector(fromDB.selectLadderEntities, selectActiveLadderID, (entities, id): Ladder => entities[id]);
