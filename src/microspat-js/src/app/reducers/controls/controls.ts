import { createFeatureSelector, createSelector } from '@ngrx/store';

import * as fromDB from '../db';
import * as DBActions from 'app/actions/db';
import * as ControlActions from 'app/actions/controls';

import { Control } from 'app/models/sample/control';
import { EntityMap } from 'app/models/base';
import { BinEstimatorProject } from 'app/models/bin-estimator/project';
import { LocusBinSet } from 'app/models/bin-estimator/locus-bin-set';
import { Bin } from 'app/models/bin-estimator/bin';
import { Locus } from 'app/models/locus/locus';

export function byProp(prop: string): (obj1: object, obj2: object) => number {
  return (a: object, b: object) => {
    if (a[prop] > b[prop]) {
      return -1;
    } else if (a[prop] < b[prop]) {
      return 1;
    } else {
      return 0;
    }
  }
}

export interface State {
  controlsLoaded: boolean;
  loadingControls: boolean;
  loadingControl: number;
  activeControlID: number | string;
  activeBinEstimatorProjectID: number | string;
}

export interface AlleleSet {
  locus_label: string;
  locus_id: number | string;
  alleles: {
    id: number | string;
    label: string;
  }[];
};

const initialState: State = {
  controlsLoaded: false,
  loadingControls: false,
  loadingControl: null,
  activeControlID: null,
  activeBinEstimatorProjectID: null
}

export function reducer(state = initialState, action: DBActions.Actions | ControlActions.Actions): State {
  switch (action.type) {

    case DBActions.LIST_RECEIVED:
      return dbListReceived(state, action);

    case DBActions.GET_RECEIVED:
      return dbGetReceived(state, action);

    case ControlActions.LOADING_CONTROLS:
      return loadingControls(state, action);

    case ControlActions.LOADING_CONTROL:
      return loadingControl(state, action);

    case ControlActions.ACTIVATE_CONTROL:
      return activateControl(state, action);

    case ControlActions.DEACTIVATE_CONTROL:
      return deactivateControl(state, action);

    case ControlActions.ACTIVATE_BIN_ESTIMATOR_PROJECT:
      return activateBinEstimatorProject(state, action);

    case ControlActions.DELETE_CONTROL:
      return deleteControl(state, action);

    default:
      return state
  }
}

function dbListReceived(state: State, action: DBActions.ListReceivedAction) {
  if (action.payload.model === fromDB.models.control) {
    return Object.assign({}, state, {
      loadingControls: false,
      controlsLoaded: true
    })
  }
  return state;
}

function dbGetReceived(state: State, action: DBActions.GetReceivedAction) {
  if (action.payload.model === fromDB.models.control) {
    const received = <Control> action.payload.entities.find((c: Control) => +c.id === +state.loadingControl);
    if(received) {
      return Object.assign({}, state, {
        loadingControl: null,
        activeControlID: received.id,
        activeBinEstimatorProjectID: received.bin_estimator
      })
    } else {
      return state;
    }
  } else {
    return state;
  }
}

function loadingControls(state: State, action: ControlActions.LoadingControlsAction) {
  return Object.assign({}, state, {
    loadingControls: true
  })
}

function loadingControl(state: State, action: ControlActions.LoadingControlAction) {
  return Object.assign({}, state, {
    loadingControl: action.payload
  });
}

function activateControl(state: State, action: ControlActions.ActivateControlAction | ControlActions.LoadingControlAction) {
  return Object.assign({}, state, {
    activeControlID: action.payload,
    loadingControl: null
  })
}

function deactivateControl(state: State, action: ControlActions.DeactivateControlAction) {
  return Object.assign({}, state, {
    activeControlID: null,
    activeBinEstimatorProjectID: null,
    loadingControl: null
  })
}

function activateBinEstimatorProject(state: State, action: ControlActions.ActivateBinEstimatorProjectAction) {
  return Object.assign({}, state, {
    activeBinEstimatorProjectID: action.payload
  })
}

function deleteControl(state: State, action: ControlActions.DeleteControlAction) {
  if(state.activeControlID == action.payload) {
    return Object.assign({}, state, {
      activeControlID: null,
      activeBinEstimatorProjectID: null
    })
  }
}

export const selectControlsState = createFeatureSelector<State>('controls');
export const selectLoadingControls = createSelector(selectControlsState, (state: State) => state.loadingControls);
export const selectControlsLoaded = createSelector(selectControlsState, (state: State) => state.controlsLoaded);
export const selectActiveControlID = createSelector(selectControlsState, (state: State) => state.activeControlID);
export const selectActiveBinEstimatorID = createSelector(selectControlsState, (state: State) => state.activeBinEstimatorProjectID);

export const selectActiveControl = createSelector(fromDB.selectControlEntities, selectActiveControlID, (entities, id): Control => entities[id]);
export const selectActiveBinEstimator = createSelector(fromDB.selectBinEstimatorProjectEntities, selectActiveBinEstimatorID, (entities, id): BinEstimatorProject => entities[id]);

export const selectControlList = createSelector(fromDB.selectControlList, fromDB.selectBinEstimatorProjectEntities,
  (controls: Control[], binEstimatorEntities: EntityMap<BinEstimatorProject>): Control[] => {
    return controls.map(c => {
      return Object.assign({}, c, {
        bin_estimator: binEstimatorEntities[<number> c.bin_estimator]
      })
    }).sort(byProp('barcode'))
});

export const selectActiveAlleleSets = createSelector(
  selectActiveControl, selectActiveBinEstimator, fromDB.selectBinEstimatorProjectEntities,
  fromDB.selectLocusBinSetEntities, fromDB.selectBinEntities, fromDB.selectLocusEntities,
  (
    ctrl: Control, binEstimatorProj: BinEstimatorProject, binEstimatorProjects: EntityMap<BinEstimatorProject>,
    locusBinSets: EntityMap<LocusBinSet>, bins: EntityMap<Bin>, loci: EntityMap<Locus>
  ): AlleleSet[] => {
    console.log(ctrl, binEstimatorProj);
    if (ctrl) {
      const be = binEstimatorProjects[<string> ctrl.bin_estimator];
      const alleleSets = be.locus_bin_sets.map(lbs_id => {
        const lbs = locusBinSets[lbs_id];
        const alleles = lbs.bins.map(bin_id => {
          return  {
            id: bin_id,
            label: bins[bin_id].label
          }
        })
        return {
          locus_label: loci[<string>lbs.locus].label,
          locus_id: <string>lbs.locus,
          alleles: alleles
        }
      });
      return alleleSets;
    } else if (binEstimatorProj) {
      const be = binEstimatorProj;
      const alleleSets = be.locus_bin_sets.map(lbs_id => {
        const lbs = locusBinSets[lbs_id];
        const alleles = lbs.bins.map(bin_id => {
          return  {
            id: bin_id,
            label: bins[bin_id].label
          }
        })
        return {
          locus_label: loci[<string>lbs.locus].label,
          locus_id: <string>lbs.locus,
          alleles: alleles
        }
      });
      return alleleSets;
    } else {
      return [];
    }
  })