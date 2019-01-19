import { createFeatureSelector, createSelector } from '@ngrx/store';
import * as d3 from 'd3';

import * as DBActions from 'app/actions/db';
import * as NavigationActions from 'app/actions/navigation';
import * as SampleActions from 'app/actions/samples';
import * as fromDB from '../db';

import { Trace } from 'app/containers/components/plots/canvas';
import { EntityMap } from 'app/models/base';
import { Channel } from 'app/models/ce/channel';
import { Plate } from 'app/models/ce/plate';
import { Well } from 'app/models/ce/well';
import { Locus } from 'app/models/locus/locus';
import { Sample } from 'app/models/sample/sample';

export interface State {
  samplesLoaded: boolean;
  loadingSamples: boolean;
  activeSampleID: number;
  activeChannelID: number;
}

export interface ChannelsByLocus {
  locus: string,
  channels: Array<{
    plateLabel: string,
    wellLabel: string,
    lastUpdated: Date,
    sizingQuality: number,
    id: number,
  }>
}

const initialState: State = {
  samplesLoaded: false,
  loadingSamples: false,
  activeSampleID: null,
  activeChannelID: null,
};

export function reducer(state = initialState, action: DBActions.Actions | SampleActions.Actions | NavigationActions.Actions): State {
  switch (action.type) {
    case DBActions.LIST_RECEIVED:
      return dbListReceived(state, action);

    // case DBActions.GET_RECEIVED:
    //   return dbGetReceived(state, action);

    case NavigationActions.ACTIVATE_SAMPLES_PATH:
      return activateSamplesPath(state, action);

    case SampleActions.LOADING_SAMPLES:
      return loadingSamples(state, action);

    case SampleActions.LOADING_SAMPLE:
      return activateSample(state, action);

    case SampleActions.ACTIVATE_SAMPLE:
      return activateSample(state, action);

    case SampleActions.DEACTIVATE_SAMPLE:
      return deactivateSample(state, action);

    case SampleActions.SELECT_CHANNEL:
      return selectChannel(state, action);

    default:
      return state
  }
}

function dbListReceived(state: State, action: DBActions.ListReceivedAction) {
  if (action.payload.model === fromDB.models.sample) {
    return Object.assign({}, state, {
      loadingSamples: false,
      samplesLoaded: true,
    })
  }
  return state;
}

function activateSamplesPath(state: State, action: NavigationActions.ActivateSamplesPathAction) {
  return Object.assign({}, state, {
    activeSampleID: null,
    activeChannelID: null,
  })
}

// function dbGetReceived(state: State, action: DBActions.GetReceivedAction) {
//   if (action.payload.model === fromDB.models.channel) {
//     const channelsLoadingIDs = new Set(state.channelsLoadingIDs);
//     action.payload.entities.forEach(channel => {
//       channelsLoadingIDs.delete(+channel.id);
//     });
//     return Object.assign({}, state, {
//       channelsLoadingIDs: channelsLoadingIDs
//     })
//   }
//   return state;
// }

// function dbGetReceived(state: State, action: DBActions.GetReceivedAction) {
//   switch (action.payload.model) {
//     case fromDB.models.channel:
//       return dbGetChannelReceived(state, action);
//     case fromDB.models.sample:
//       return dbGetSampleReceived(state, action);
//     default:
//       return state
//   }
// }

function loadingSamples(state: State, action: SampleActions.LoadingSamplesAction) {
  return Object.assign({}, state, {
    loadingSamples: true,
  })
}

function activateSample(state: State, action: SampleActions.ActivateSampleAction | SampleActions.LoadingSampleAction) {
  return Object.assign({}, state, {
    activeSampleID: action.payload,
    activeChannelID: null,
  })
}

function deactivateSample(state: State, action: SampleActions.DeactivateSampleAction) {
  return Object.assign({}, state, {
    activeSampleID: null,
    activeChannelID: null,
  })
}

function selectChannel(state: State, action: SampleActions.SelectChannelAction) {
  return Object.assign({}, state, {
    activeChannelID: action.payload,
    loadingChannel: null,
  })
}

export const selectSamplesState = createFeatureSelector<State>('samples');
export const selectLoadingSamples = createSelector(selectSamplesState, (state: State) => state.loadingSamples);
export const selectSamplesLoaded = createSelector(selectSamplesState, (state: State) => state.samplesLoaded);
export const selectActiveSampleID = createSelector(selectSamplesState, (state: State) => state.activeSampleID);
export const selectActiveChannelID = createSelector(selectSamplesState, (state: State) => state.activeChannelID);

export const selectActiveSample = createSelector(fromDB.selectSampleEntities, selectActiveSampleID, (entities, id): Sample => entities[id]);
export const selectSampleChannels = createSelector(selectActiveSample, fromDB.selectChannelEntities, (sample, channels) => {
  if (sample) {
    return sample.channels.map(id => channels[id]).filter(e => e);
  }
  return [];
})

export const selectSampleChannelList = createSelector(
  selectSampleChannels,
  fromDB.selectLocusEntities,
  fromDB.selectWellEntities, fromDB.selectPlateEntities, (channels: Channel[], loci: EntityMap<Locus>, wells: EntityMap<Well>, plates: EntityMap<Plate>): ChannelsByLocus[] => {
    const entries = channels.reduce((prev_val, curr_val) => {
      const locus = loci[curr_val.locus];
      if (!locus) {
        return prev_val;
      }

      const well = wells[curr_val.well];
      if (!well) {
        return prev_val;
      }

      const plate = plates[well.plate];
      if (!plate) {
        return prev_val;
      }

      const channelEntry = {
        plateLabel: plate.label,
        wellLabel: well.well_label,
        lastUpdated: curr_val.last_updated,
        sizingQuality: well.sizing_quality,
        id: curr_val.id,
      };

      if (!(locus.label in prev_val)) {
        prev_val[locus.label] = {
          locus: locus.label,
          channels: [],
        };
      }

      prev_val[locus.label].channels.push(channelEntry)
      return prev_val;
    }, {})

    return Object.keys(entries).map(k => entries[k]);
})

export const selectActiveChannel = createSelector(selectActiveChannelID, fromDB.selectChannelEntities, (id, channels) => id ? channels[id] : null);

export const selectActiveTrace = createSelector(selectActiveChannel, fromDB.selectWellEntities, fromDB.selectLocusEntities, (channel, wells, loci): Trace => {
  if (!channel) {
    return null;
  }

  const well: Well = wells[channel.well];
  const locus: Locus = loci[channel.locus];

  if (well && locus) {
    return {
      data: <[number, number][]> d3.zip(well.base_sizes, channel.data),
      color: locus.color,
    }
  }

  return null;
});

export const selectActiveDomain = createSelector(selectActiveChannel, fromDB.selectLocusEntities, (channel, loci: EntityMap<Locus>): [number, number] => {
  if (channel && loci) {
    const locus = loci[channel.locus];
    return [+locus.min_base_length, +locus.max_base_length]
  } else {
    return null;
  }
})

export const selectActiveRange = createSelector(selectActiveDomain, selectActiveTrace, (domain, trace): [number, number] => {
  if (!domain || !trace) {
    return null;
  }

  const [min_base_size, max_base_size] = domain;
  const data = trace.data;

  const range = data.reduce((prev: [number, number], next) => {
    const [curr_min, curr_max] = prev;
    const [base_size, intensity] = next;
    if (base_size >= min_base_size && base_size <= max_base_size) {
      if (intensity > curr_max) {
        return [curr_min, intensity];
      } else if (intensity < curr_min) {
        return [intensity, curr_max];
      }
    }
    return prev;
  }, [-100, 100])

  range[0] = Math.min(1.1 * range[0], .9 * range[0]);
  range[1] = 1.1 * range[1];

  return range;

})

