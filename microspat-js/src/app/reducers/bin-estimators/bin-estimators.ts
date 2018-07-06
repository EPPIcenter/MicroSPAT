import { createSelector, createFeatureSelector } from '@ngrx/store';

import * as fromDB from 'app/reducers/db';
import * as DBActions from 'app/actions/db';
import * as BinEstimatorActions from 'app/actions/bin-estimators';
import * as NavigationActions from 'app/actions/navigation';
import { BinEstimatorProject } from 'app/models/bin-estimator/project';

export interface State {
  appState: 'list' | 'details' | 'create';
  binEstimatorsLoaded: boolean;
  loadingBinEstimators: boolean;
  activeBinEstimatorID: number;
}

const initialState: State = {
  appState: 'list',
  binEstimatorsLoaded: false,
  loadingBinEstimators: false,
  activeBinEstimatorID: null
}

export function reducer(state = initialState, action: DBActions.Actions | BinEstimatorActions.Actions | NavigationActions.Actions): State {
  switch (action.type) {
    case DBActions.LIST_RECEIVED:
      return dbListReceived(state, action);

    case NavigationActions.ACTIVATE_BIN_ESTIMATOR_PATH:
      return activateBinEstimatorPath(state, action);

    case BinEstimatorActions.LOADING_BIN_ESTIMATORS:
      return loadingBinEstimators(state, action);

    case BinEstimatorActions.LOADING_BIN_ESTIMATOR:
      return activateBinEstimator(state, action);

    case BinEstimatorActions.ACTIVATE_BIN_ESTIMATOR:
      return activateBinEstimator(state, action);

    default:
      return state

  }
}

function dbListReceived(state: State, action: DBActions.ListReceivedAction) {
  if (action.payload.model === fromDB.models.binEstimatorProject) {
    return Object.assign({}, state, {
      loadingBinEstimators: false,
      binEstimatorsLoaded: true
    })
  }
  return state;
}

function activateBinEstimatorPath(state: State, action: NavigationActions.ActivateBinEstimatorPathAction) {
  return Object.assign({}, state, {
    appState: 'list',
    activeBinEstimatorID: null
  })
}

function loadingBinEstimators(state: State, action: BinEstimatorActions.LoadingBinEstimatorsAction) {
  return Object.assign({}, state, {
    loadingBinEstimators: true
  })
}

function activateBinEstimator(state: State, action: BinEstimatorActions.LoadingBinEstimatorAction | BinEstimatorActions.ActivateBinEstimatorAction) {
  return Object.assign({}, state, {
    activeBinEstimatorID: action.payload,
    appState: 'details'
  })
}

export const selectBinEstimatorState = createFeatureSelector<State>('binEstimators');
export const selectAppState = createSelector(selectBinEstimatorState, (state: State) => state.appState);
export const selectLoadingBinEstimators = createSelector(selectBinEstimatorState, (state: State) => state.loadingBinEstimators);
export const selectBinEstimatorsLoaded = createSelector(selectBinEstimatorState, (state: State) => state.binEstimatorsLoaded);
export const selectActiveBinEstimatorID = createSelector(selectBinEstimatorState, (state: State) => state.activeBinEstimatorID);

export const selectActiveBinEstimator = createSelector(fromDB.selectBinEstimatorProjectEntities, selectActiveBinEstimatorID, (entities, id): BinEstimatorProject => entities[id]);
