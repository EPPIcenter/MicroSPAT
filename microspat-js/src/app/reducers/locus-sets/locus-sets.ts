import { createSelector } from 'reselect';
import { createFeatureSelector } from '@ngrx/store';

import { LocusSet } from 'app/models/locus/locus-set';

import * as fromDB from 'app/reducers/db';
import * as LocusSetActions from 'app/actions/locus-sets';
import * as DBActions from 'app/actions/db';


export interface State {
  locusSetsLoaded: boolean;
  loadingLocusSets: boolean;
  activeLocusSetID: number;
}

const initialState: State = {
  locusSetsLoaded: false,
  loadingLocusSets: false,
  activeLocusSetID: null
}

export function reducer(state = initialState, action: DBActions.Actions | LocusSetActions.Actions): State {
  switch (action.type) {
    case DBActions.LIST_RECEIVED:
      return dbListReceived(state, action);

    case LocusSetActions.LOADING_LOCUS_SETS:
      return loadingLocusSets(state, action);

    case LocusSetActions.SELECT_LOCUS_SET:
      return selectLocusSet(state, action);

    case LocusSetActions.UNSELECT_LOCUS_SET:
      return unselectLocusSet(state, action);

    default:
      return state
  }
}

function dbListReceived(state: State, action: DBActions.ListReceivedAction) {
  if (action.payload.model === fromDB.models.locusSet) {
    return Object.assign({}, state, {
      loadingLocusSets: false,
      locusSetsLoaded: true
    });
  }
  return state;
}

function loadingLocusSets(state: State, action: LocusSetActions.LoadingLocusSetsAction) {
  return Object.assign({}, state, {
    loadingLocusSets: true
  });
}

function selectLocusSet(state: State, action: LocusSetActions.SelectLocusSetAction) {
  return Object.assign({}, state, {
    activeLocusSetID: action.payload
  });
}

function unselectLocusSet(state: State, action: LocusSetActions.UnselectLocusSetAction) {
  return Object.assign({}, state, {
    activeLocusSetID: null
  })
}

export const selectLocusSetState = createFeatureSelector<State>('locusSets');
export const selectLoadingLocusSets = createSelector(selectLocusSetState, (state: State) => state.loadingLocusSets);
export const selectLocusSetsLoaded = createSelector(selectLocusSetState, (state: State) => state.locusSetsLoaded);
export const selectActiveLocusSetID = createSelector(selectLocusSetState, (state: State) => state.activeLocusSetID);

export const selectActiveLocusSet = createSelector(fromDB.selectLocusSetEntities, selectActiveLocusSetID, (entities, id): LocusSet => entities[id]);
