import { createSelector, createFeatureSelector } from '@ngrx/store';

import * as fromDB from '../db';

import * as DBActions from 'app/actions/db';
import * as BinEstimatorActions from 'app/actions/bin-estimators';
import * as NavigationActions from 'app/actions/navigation';

import { Bar } from 'app/containers/components/plots/canvas';

import { EntityMap } from 'app/models/base';
import { ProjectChannelAnnotations } from 'app/models/project/channel-annotations';
import { BinEstimatorProject } from 'app/models/bin-estimator/project';
import { LocusBinSet } from 'app/models/bin-estimator/locus-bin-set';
import { LocusSet } from 'app/models/locus/locus-set';
import { ProjectSampleAnnotations } from 'app/models/project/sample-annotations';
import { Sample } from 'app/models/sample/sample';
import { Bin } from 'app/models/bin-estimator/bin';
import { Channel } from 'app/models/ce/channel';


export interface State {
  appState: 'list' | 'details';
  binEstimatorsLoaded: boolean;
  loadingBinEstimators: boolean;
  activeBinEstimatorID: number;
  activeLocusBinSetID: number;
  selectedBinID: number;
}

const initialState: State = {
  appState: 'list',
  binEstimatorsLoaded: false,
  loadingBinEstimators: false,
  activeBinEstimatorID: null,
  activeLocusBinSetID: null,
  selectedBinID: null
}

export function reducer(state = initialState, action: DBActions.Actions | BinEstimatorActions.Actions | NavigationActions.Actions): State {
  switch (action.type) {
    case DBActions.LIST_RECEIVED:
      return dbListReceived(state, action);

    case DBActions.DELETE_RECEIVED:
      return dbDeleteReceived(state, action);

    case NavigationActions.ACTIVATE_BIN_ESTIMATOR_PATH:
      return activateBinEstimatorPath(state, action);

    case BinEstimatorActions.LOADING_BIN_ESTIMATORS:
      return loadingBinEstimators(state, action);

    case BinEstimatorActions.LOADING_BIN_ESTIMATOR:
      return activateBinEstimator(state, action);

    case BinEstimatorActions.ACTIVATE_BIN_ESTIMATOR:
      return activateBinEstimator(state, action);

    case BinEstimatorActions.ACTIVATE_LIST_PATH:
      return activateListPath(state, action);

    case BinEstimatorActions.DEACTIVATE_BIN_ESTIMATOR:
      return deactivateBinEstimator(state, action);

    case BinEstimatorActions.SELECT_LOCUS_BIN_SET:
      return activateLocusBinSet(state, action)

    case BinEstimatorActions.SELECT_BIN:
      return selectBin(state, action);

    case BinEstimatorActions.DELETE_BIN:
      return deleteBin(state, action);

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

function dbDeleteReceived(state: State, action: DBActions.DeleteReceivedAction) {
  if (action.payload && action.payload.model === fromDB.models.genotypingProject) {
    return initialState;
  }
  return state;
}

function activateBinEstimatorPath(state: State, action: NavigationActions.ActivateBinEstimatorPathAction) {
  return Object.assign({}, state, {
    appState: 'list',
    activeBinEstimatorID: null,
    activeLocusBinSetID: null,
    selectedBinID: null,
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
    activeLocusBinSetID: null,
    selectedBinID: null,
    appState: 'details'
  })
}

function activateListPath(state: State, action: BinEstimatorActions.ActivateListPath) {
  return Object.assign({}, state, {
    activeBinEstimatorID: null,
    activeLocusBinSetID: null,
    selectedBinID: null,
    appState: 'list'
  })
}

function deactivateBinEstimator(state: State, action: BinEstimatorActions.DeactivateBinEstimatorAction) {
  return Object.assign({}, state, {
    activeBinEstimatorID: null,
    activeLocusBinSetID: null,
    selectedBinID: null,
    appState: 'list'
  })
}

function activateLocusBinSet(state: State, action: BinEstimatorActions.SelectLocusBinSetAction) {
  return Object.assign({}, state, {
    activeLocusBinSetID: action.payload,
    selectedBinID: null
  });
}

function selectBin(state: State, action: BinEstimatorActions.SelectBinAction) {
  return Object.assign({}, state, {
    selectedBinID: action.payload
  });
}

function deleteBin(state: State, action: BinEstimatorActions.DeleteBinAction) {
  if (action.payload === state.selectedBinID) {
    return Object.assign({}, state, {
      selectedBinID: null
    })
  } else {
    return state;
  }
}

export const selectBinEstimatorState = createFeatureSelector<State>('binEstimators');
export const selectAppState = createSelector(selectBinEstimatorState, (state: State) => state.appState);
export const selectLoadingBinEstimators = createSelector(selectBinEstimatorState, (state: State) => state.loadingBinEstimators);
export const selectBinEstimatorsLoaded = createSelector(selectBinEstimatorState, (state: State) => state.binEstimatorsLoaded);
export const selectActiveBinEstimatorID = createSelector(selectBinEstimatorState, (state: State) => state.activeBinEstimatorID);
export const selectActiveLocusBinSetID = createSelector(selectBinEstimatorState, (state: State) => state.activeLocusBinSetID);
export const selectSelectedBinID = createSelector(selectBinEstimatorState, (state: State) => state.selectedBinID);

export const selectActiveBinEstimator = createSelector(fromDB.selectBinEstimatorProjectEntities, selectActiveBinEstimatorID, (entities, id): BinEstimatorProject => entities[id]);
export const selectActiveLocusSet = createSelector(fromDB.selectLocusSetEntities, selectActiveBinEstimator, (locusSets, binEstimator): LocusSet => {
  if (locusSets && binEstimator) {
    return locusSets[binEstimator.locus_set];
  } else {
    return null;
  }
});

export const selectActiveBinEstimatorSamples = createSelector(
  selectActiveBinEstimator,
  fromDB.selectProjectSampleAnnotationsEntities,
  fromDB.selectSampleEntities, (binEstimator, psaMap, sampleMap): Sample[] => {
    if (!binEstimator || !binEstimator.detailed) {
      return [];
    }

    return binEstimator.sample_annotations.map(id => {
      const annotation: ProjectSampleAnnotations = psaMap[id];
      if (annotation) {
        return sampleMap[annotation.sample as string];
      } else {
        return null
      }
    }).filter(e => e != null);
  }
);

export const selectInactiveSamples = createSelector(
  selectActiveBinEstimator,
  fromDB.selectProjectSampleAnnotationsEntities,
  fromDB.selectSampleEntities, (binEstimator, psaMap, sampleMap): Sample[] => {
    if (!binEstimator || !binEstimator.detailed) {
      return [];
    }

    const inactiveSamples = Object.assign({}, sampleMap);
    let annotation: ProjectSampleAnnotations;

    binEstimator.sample_annotations.forEach(id => {
      annotation = psaMap[id];
      if (annotation) {
        delete inactiveSamples[annotation.sample as string];
      }
    });

    return Object.keys(inactiveSamples).map(id => inactiveSamples[id]);
  }
);

export const selectActiveLoci = createSelector(selectActiveLocusSet, fromDB.selectLocusEntities, (locusSet, loci) => {
  if (locusSet) {
    return locusSet.loci.map(id => loci[id]);
  } else {
    return [];
  }
});

export const selectActiveLocusParameters = createSelector(selectActiveBinEstimator, fromDB.selectBinEstimatorLocusParamsEntities, fromDB.selectLocusEntities, (be, locusParams, loci) => {
  if (be && locusParams && loci) {
    return be.locus_parameters.map(id => {
      const locusParam = locusParams[id];
      if (locusParam) {
        return Object.assign({}, locusParam, {locus: loci[locusParam.locus]});
      } else {
        return null;
      }
    }).filter(e => e != null)
  } else {
    return [];
  }
});

export const selectActiveLocusBinSets = createSelector(selectActiveBinEstimator, fromDB.selectLocusBinSetEntities, fromDB.selectLocusEntities, (be, locusBinSets, loci) => {
  if (be && locusBinSets && loci) {
    return be.locus_bin_sets.map(id => {
      const lbs = locusBinSets[id];
      if (lbs) {
        return Object.assign({}, lbs, {locus: loci[lbs.locus]});
      } else {
        return null;
      }
    }).filter(e => e != null);
  } else {
    return []
  }
});

export const selectActiveLocusBinSet = createSelector(selectActiveLocusBinSetID, fromDB.selectLocusBinSetEntities, (id, locusBinSets) => locusBinSets[id]);

export const selectActiveBins = createSelector(selectActiveLocusBinSet, fromDB.selectBinEntities, selectSelectedBinID, (lbs: LocusBinSet, bins: EntityMap<Bin>, selectedBinID) => {
  if (lbs && bins) {
    const b = lbs.bins.map(id => bins[id]).filter(bin => bin != null);
    return b.map(bin => {
      const bar: Bar = {
        id: +bin.id,
        color: +bin.id === +selectedBinID ? 'orange' : 'lightblue',
        opacity: .5,
        center: bin.base_size,
        halfWidth: bin.bin_buffer,
        height: 1
      }
      return bar;
    })
  } else {
    return [];
  }
});

export const selectActiveLocusID = createSelector(selectActiveLocusBinSet, (lbs) => lbs ? lbs.locus : null);

export const selectActiveLocus = createSelector(selectActiveLocusID, fromDB.selectLocusEntities, (locusID, loci) => loci[locusID]);

export const selectActiveChannelAnnotations = createSelector(selectActiveBinEstimator, fromDB.selectProjectChannelAnnotationsEntities, (be, channelAnnotations) => {
  if (!be) { return []; }
  return be.channel_annotations.map(id => channelAnnotations[id]).filter(ca => ca != null);
}) ;

export const selectActivePeakAnnotations = createSelector(selectActiveChannelAnnotations, selectActiveLocusID, fromDB.selectChannelEntities,
  (channelAnnotations: ProjectChannelAnnotations[], locusID: number, channels: EntityMap<Channel>) => {
    const peakAnnotations = channelAnnotations.filter(ca => {
      const channel = channels[ca.channel];
      return channel && +channel.locus === +locusID;
    }).map(ca => ca.annotated_peaks).reduce((curr: any[], prev: any[]) => {
      return prev.concat(curr);
    }, [])

    return peakAnnotations.map(peak => {
      const center: [number, number] = [peak.peak_size, peak.relative_peak_area];
      const circle = {
        center: center,
        radius: 2,
        color: 'red',
        opacity: 1,
        // outline: 'white'
      }
      return circle;
    })
})

export const selectSelectedBin = createSelector(selectSelectedBinID, fromDB.selectBinEntities, (binID, bins) => bins[binID]);
