import { createSelector, createFeatureSelector } from '@ngrx/store';

import { Locus } from 'app/models/locus/locus';

import * as fromDB from 'app/reducers/db';
import * as LociActions from 'app/actions/loci';
import * as DBActions from 'app/actions/db';

export interface State {
  lociLoaded: boolean;
  loadingLoci: boolean;
  activeLocusID: number;
}

const initialState: State = {
  lociLoaded: false,
  loadingLoci: false,
  activeLocusID: null
};

export function reducer(state = initialState, action: DBActions.Actions | LociActions.Actions): State {
  switch (action.type) {
    case DBActions.LIST_RECEIVED:
      return dbListReceived(state, action);

    case LociActions.LOADING_LOCI:
      return loadingLoci(state, action);

    case LociActions.SELECT_LOCUS:
      return selectLocus(state, action);

    case LociActions.UNSELECT_LOCUS:
      return unselectLocus(state, action);

    default:
      return state
  }
}


function dbListReceived(state: State, action: DBActions.ListReceivedAction) {
  if (action.payload.model === fromDB.models.locus) {
    return Object.assign({}, state, {
      loadingLoci: false,
      lociLoaded: true
    });
  }
  return state;
}

function loadingLoci(state: State, action: LociActions.LoadingLociAction) {
  return Object.assign({}, state, {
    loadingLoci: true
  });
}

function selectLocus(state, action: LociActions.SelectLocusAction) {
  return Object.assign({}, state, {
    activeLocusID: action.payload
  });
}

function unselectLocus(state, action) {
  return Object.assign({}, state, {
    activeLocusID: null
  });
}

export const selectLociState = createFeatureSelector<State>('loci');
export const selectLoadingLoci = createSelector(selectLociState, (state: State) => state.loadingLoci);
export const selectLociLoaded = createSelector(selectLociState, (state: State) => state.lociLoaded);
export const selectActiveLocusID = createSelector(selectLociState, (state: State) => state.activeLocusID);

export const selectActiveLocus = createSelector(fromDB.selectLocusEntities, selectActiveLocusID, (entities, id): Locus => entities[id]);
