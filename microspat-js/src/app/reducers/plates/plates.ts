import { createSelector } from 'reselect';
import { createFeatureSelector } from '@ngrx/store';

import * as d3 from 'd3';

import * as fromDB from 'app/reducers/db';
import * as fromTasks from 'app/reducers/tasks';

import * as DBActions from 'app/actions/db';
import * as PlatesActions from 'app/actions/plates';

import { Plate } from 'app/models/ce/plate';
import { Ladder } from 'app/models/ce/ladder';
import { Well } from 'app/models/ce/well';
import { Square } from 'app/models/square';
import { Channel } from 'app/models/ce/channel';

import { Trace, Legend } from 'app/components/plots/canvas';
import { Locus } from 'app/models/locus/locus';
import { Task, IN_PROGRESS } from 'app/models/task';

export interface State {
  platesLoaded: boolean;
  loadingPlates: boolean;
  loadingPlate: number | string | null;
  activePlateId: number | string | null;
  loadingWell: number | string | null;
  activeWellId: number | string | null;
  loadingChannels: (number | string)[];
  activeChannels: number[];
  activeLocusId: number;
  ladderPeakIndices: number[] | null;
  selectedLocus: number;
  recalcuatePlateLadderTaskInProgress: boolean;
  createNonExistentSamples: boolean;
}

const initialState: State = {
  platesLoaded: false,
  loadingPlates: false,
  loadingPlate: null,
  activePlateId: null,
  loadingWell: null,
  activeWellId: null,
  loadingChannels: [],
  activeChannels: [],
  activeLocusId: null,
  ladderPeakIndices: null,
  selectedLocus: null,
  recalcuatePlateLadderTaskInProgress: false,
  createNonExistentSamples: true
};

export function reducer(state = initialState, action: DBActions.Actions | PlatesActions.Actions): State {
  switch (action.type) {
    case DBActions.LIST_RECEIVED:
      return dbListReceived(state, action);

    case DBActions.GET_RECEIVED:
      return dbGetReceived(state, action);

    case DBActions.DELETE_RECEIVED:
      return dbDeleteReceived(state, action);

    case PlatesActions.LOADING_PLATE:
      return loadingPlate(state, action);

    case PlatesActions.LOADING_PLATES:
      return loadingPlates(state, action);

    case PlatesActions.ACTIVATE_PLATE:
      return activatePlate(state, action);

    case PlatesActions.LOADING_WELL:
      return loadingWell(state, action);

    case PlatesActions.ACTIVATE_WELL:
      return activateWell(state, action);

    case PlatesActions.LOADING_CHANNEL:
      return loadingChannel(state, action);

    case PlatesActions.ACTIVATE_CHANNEL:
      return activateChannel(state, action);

    case PlatesActions.ACTIVATE_LOCUS:
      return activateLocus(state, action);

    case PlatesActions.CLEAR_SELECTED_CHANNELS:
      return clearSelectedChannels(state, action);

    case PlatesActions.SET_LADDER_PEAK_INDICES:
      return setLadderPeakIndices(state, action);

    case PlatesActions.RECALCULATE_PLATE_LADDER_TASK_IN_PROGRESS:
      return setRecalculatePlateLadderInProgress(state, action, true);

    case PlatesActions.RECALCULATE_PLATE_LADDER_TASK_FINISHED:
      return setRecalculatePlateLadderInProgress(state, action, false);

    case PlatesActions.SET_NON_EXISTENT_SAMPLES:
      return setNonExistentSamples(state, action);

    default:
      return state;
  }
}

function dbListReceived(state: State, action: DBActions.ListReceivedAction): State {
  if (action.payload.model === fromDB.models.plate) {
    return Object.assign({}, state, {
      loadingPlates: false,
      platesLoaded: true
    });
  }
  return state;
}

function dbGetReceived(state: State, action: DBActions.GetReceivedAction): State {
  if (action.payload.model === fromDB.models.plate && state.loadingPlate !== null) {
    let plateReceived = false;

    for (let index = 0; index < action.payload.entities.length; index++) {
      const e = action.payload.entities[index];
      if (+e.id === +state.loadingPlate) {
        plateReceived = true;
        break;
      }
    }

    if (plateReceived) {
      return Object.assign({}, state, {
        loadingPlate: null,
        activePlateId: state.loadingPlate,
        loadingWell: null,
        activeWellId: null,
        loadingChannels: [],
        activeLocusId: null,
        activeChannels: [],
        ladderPeakIndices: null
      });
    }
  } else if (action.payload.model === fromDB.models.well && state.loadingWell !== null) {
    let wellReceived = false;

    for (let index = 0; index < action.payload.entities.length; index++) {
      const e = action.payload.entities[index];
      if (+e.id === +state.loadingWell) {
        wellReceived = true;
        break;
      }
    }

    if (wellReceived) {
      return Object.assign({}, state, {
        loadingWell: null,
        activeWellId: state.loadingWell
      });
    }
  } else if (action.payload.model === fromDB.models.channel && state.loadingChannels.length > 0) {
    const channelsReceived = [];
    const remainingChannels = state.loadingChannels.slice();

    for (let index = 0; index < action.payload.entities.length; index++) {
      const e = action.payload.entities[index];
      const channelReceivedIndex = remainingChannels.indexOf(+e);
      if (channelReceivedIndex !== -1) {
        channelsReceived.push(e);
        remainingChannels.splice(channelReceivedIndex, 1);
      }
    }
    return Object.assign({}, state, {
      loadingChannels: remainingChannels,
      activeChannels: [...state.activeChannels, ...channelsReceived],
    });

  }

  return state;
}

function dbDeleteReceived(state: State, action: DBActions.DeleteReceivedAction): State {
  if (action.payload.model === fromDB.models.plate &&
      action.payload.ids.indexOf(state.activePlateId) >= 0) {
    return Object.assign({}, state, {
      oadingPlate: null,
      activePlateId: null,
      loadingWell: null,
      activeWellId: null,
      activeChannels: [],
      loadingChannels: [],
      ladderPeakIndices: null
    });
  }
}

function loadingPlate(state: State, action: PlatesActions.LoadingPlateAction): State {
  return Object.assign({}, state, {
    loadingPlate: action.payload,
    activePlateId: null
  });
}

function loadingPlates(state: State, action: PlatesActions.LoadingPlatesAction): State {
  return Object.assign({}, state, {
    loadingPlates: true
  });
}

function activatePlate(state: State, action: PlatesActions.ActivatePlateAction): State {
  if (!(+action.payload === +state.activePlateId)) {
    return Object.assign({}, state, {
      loadingPlate: null,
      activePlateId: action.payload,
      loadingWell: null,
      activeWellId: null,
      activeChannels: [],
      activeLocusId: null,
      loadingChannels: [],
      ladderPeakIndices: null
    });
  } else {
    return state;
  }
}

function loadingWell(state: State, action: PlatesActions.LoadingWellAction): State {
  return Object.assign({}, state, {
    loadingWell: action.payload,
    activeWellId: null,
    ladderPeakIndices: null
  });
}

function activateWell(state: State, action: PlatesActions.ActivateWellAction): State {
  if (!(+action.payload === +state.activeWellId)) {
    return Object.assign({}, state, {
      loadingWell: null,
      activeWellId: action.payload,
      ladderPeakIndices: null
    });
  } else {
    return state;
  }
}

function loadingChannel(state: State, action: PlatesActions.LoadingChannelAction): State {
  if (state.loadingChannels.indexOf(+action.payload) === -1) {
    return Object.assign({}, state, {
      loadingChannels: [+action.payload, ...state.loadingChannels]
    });
  }
  return state;
}

function activateChannel(state: State, action: PlatesActions.ActivateChannelAction): State {
  if (state.activeChannels.indexOf(+action.payload) === -1) {
    return Object.assign({}, state, {
      activeChannels: [+action.payload, ...state.activeChannels]
    });
  } else {
    return Object.assign({}, state, {
      activeChannels: state.activeChannels.filter(i => i !== +action.payload)
    });
  }
}

function activateLocus(state: State, action: PlatesActions.ActivateLocusAction): State {
  return Object.assign({}, state, {
    activeLocusId: action.payload
  })
}

function clearSelectedChannels(state: State, action: PlatesActions.ClearSelectedChannelsAction): State {
  return Object.assign({}, state, {
    loadingChannels: [],
    activeChannels: [],
  });
}

function setLadderPeakIndices(state: State, action: PlatesActions.SetLadderPeakIndicesAction): State {
  return Object.assign({}, state, {
    ladderPeakIndices: action.payload
  });
}

function setRecalculatePlateLadderInProgress(state: State, action: PlatesActions.SetRecalculatePlateLadderTaskInProgress, status: boolean): State {
  return Object.assign({}, state, {
    recalcuatePlateLadderTaskInProgress: status
  });
}

function setNonExistentSamples(state: State, action: PlatesActions.SetNonExistentSamplesAction) {
  return Object.assign({}, state, {
    createNonExistentSamples: action.payload
  });
}


export const selectPlateState = createFeatureSelector<State>('plates');
export const selectActivePlateId = createSelector(selectPlateState, (state: State) => state.activePlateId);
export const selectActiveWellId = createSelector(selectPlateState, (state: State) => state.activeWellId);
export const selectActiveChannelIds = createSelector(selectPlateState, (state: State) => state.activeChannels);
export const selectLoadingChannelIds = createSelector(selectPlateState, (state: State) => state.loadingChannels);
export const selectWellLoading = createSelector(selectPlateState, (state: State) => state.loadingWell != null);
export const selectSetLadderPeakIndices = createSelector(selectPlateState, (state: State) => state.ladderPeakIndices);
export const selectSelectedLocus = createSelector(selectPlateState, (state: State) => state.activeLocusId );
export const selectRecalculatePlateLadderInProgress = createSelector(selectPlateState, (state: State) => state.recalcuatePlateLadderTaskInProgress);
export const selectCreateNonExistentSamples = createSelector(selectPlateState, (state: State) => state.createNonExistentSamples);
export const selectActiveLocus = createSelector(selectPlateState, (state: State) => state.activeLocusId);

export const selectPlateList = createSelector(fromDB.selectPlateEntities, (plateEntities) => {
  const plates: Plate[] = [];
  Object.keys(plateEntities).forEach(k => plates.push(plateEntities[k]));
  return plates;
});

export const selectNewPlatesLoading = createSelector(fromDB.selectPlatePendingReqs, fromDB.selectPlateEntities, (pendingReqs, entities) => {
  return Object.keys(pendingReqs).some(id => {
    return !(id in entities)
  })
})

export const selectActivePlate = createSelector(fromDB.selectPlateEntities, selectActivePlateId, (plates, id) => {
  if (id != null) {
    return plates[id];
  }
  return null;
});

export const selectActiveWell = createSelector(fromDB.selectWellEntities, selectActiveWellId, (wells, id): Well => {
  if (id != null) {
    return wells[id];
  }
  return null;
});

export const selectPlateLoading = createSelector(selectPlateState, (state: State) => !(state.loadingPlate == null));

export const selectLadders = fromDB.selectLadderList;

export const selectRenderableLadderInfo = createSelector(selectActivePlate, selectActiveWellId, fromDB.selectWellEntities, fromDB.selectLadderEntities,
  (activePlate: Plate, activeWellId, allWells: {[id: number]: Well}, allLadders: {[id: number]: Ladder}): Square[] => {
    if (activePlate == null) {
      return null;
    };
    const squares = activePlate.wells.map(id => {
      const currWell: Well = allWells[id];
      const currLadder: Ladder = allLadders[currWell.ladder];
      return {
        wellLabel: currWell.well_label,
        color: currWell.sizing_quality < currLadder.sq_limit ? '#5cb85c' : '#d9534f',
        id: currWell.id,
        disabled: false,
        border: activeWellId === currWell.id ? 'blue' : null
      };
    });
    return squares;
  });

export const selectRenderableChannelInfo = createSelector(
  selectActivePlate, selectActiveWellId, selectActiveChannelIds, fromDB.selectWellEntities, fromDB.selectChannelEntities, fromDB.selectLadderEntities,
  (activePlate: Plate, activeWellId, activChannelIds, allWells: {[id: number]: Well}, allChannels: {[id: number]: Channel}, allLadders: {[id: number]: Ladder} ) => {
    if (activePlate == null) {
      return null;
    };
    const color_scale = d3.scaleLinear<string>()
      .domain([0, 3000, 34000])
      .range(['#d9534f', '#5cb85c', '#4292D1']);

    const renderableChannelInfo = {};
    activePlate.wells.forEach(wellId => {
      const well: Well = allWells[wellId];
      const currLadder: Ladder = allLadders[well.ladder];
      if (well == null) {
        return null;
      }
      well.channels.forEach(channelId => {
        const channel = allChannels[channelId];
        if (channel == null) {
          return null;
        }
        const square = {
          wellLabel: well.well_label,
          color: color_scale(channel.max_data_point),
          id: channelId,
          disabled: well.sizing_quality > currLadder.sq_limit,
          border: activChannelIds.indexOf(+channelId) !== -1 ? 'blue' : null
        };
        if (!renderableChannelInfo[channel.color]) {
          renderableChannelInfo[channel.color] = [square];
        } else {
          renderableChannelInfo[channel.color].push(square);
        }
      });
    });
    return renderableChannelInfo;
  });
  export const selectLadderChannel = createSelector(selectActiveWell, fromDB.selectLadderEntities, fromDB.selectChannelEntities, (activeWell, ladders, channels): Channel | null => {

  if (activeWell && ladders) {
    const ladder: Ladder = ladders[activeWell.ladder];
    for (let index = 0; index < activeWell.channels.length; index++) {
      const channel: Channel = channels[activeWell.channels[index]];
      if (channel.color === ladder.color) {
        return channel;
      }
    }
  } else {
    return null;
  }
});

export const selectLadderBaseSizes = createSelector(selectActiveWell, (activeWell): number[] => {
  if (activeWell) {
    return activeWell.base_sizes;
  } else {
    return null;
  }
});

export const selectLadderPeakIndices = createSelector(selectActiveWell, selectSetLadderPeakIndices, (activeWell, peakIndices): number[] => {
  if (peakIndices) {
    return peakIndices;
  } else if (activeWell) {
    return activeWell.ladder_peak_indices;
  } else {
    return null;
  }
});

export const selectLadderData = createSelector(selectLadderChannel, (ladderChannel): number[] => {
  if (ladderChannel != null) {
    return ladderChannel.data;
  } else {
    return null;
  }
});

export const selectRecalculateLadderPayload = createSelector(selectActiveWellId, selectLadderPeakIndices, (wellId, ladderPeakIndices) => {
  return {
    well_id: +wellId,
    ladder_peak_indices: ladderPeakIndices
  };
});

export const selectActiveChannels = createSelector(selectActiveChannelIds, fromDB.selectChannelEntities, (ids, entities): Channel[] => {
  const activeChannels = ids.map(id => entities[id]);
  return activeChannels;
});

export const selectActiveChannelTraces = createSelector(selectActiveChannels, fromDB.selectWellEntities, (channels: Channel[], wells: {[id: string]: Well}): Trace[] => {
  if (channels.length === 0 || Object.keys(wells).length === 0) {
    return [];
  }
  const traces = channels.map(c => {
    return {
      data: <[number, number][]>d3.zip(wells[c.well].base_sizes, c.data),
      color: c.color
    };
  });
  return traces;
});

export const selectActiveChannelRange = createSelector(selectActiveChannels, (channels) => {
  if (!channels) {
    return <[number, number]>[0, 0];
  }
  return <[number, number]>[
    Math.min(...channels.map(c => Math.min(...c.data))) * 1.1,
    Math.max(...channels.map(c => Math.max(...c.data))) * 1.1
    ];
});



export const selectActivePlateDiagnosticTraces = createSelector(selectActivePlate, (plate: Plate) => {
  if (!plate) {
    return [];
  };

  const traces: Trace[] = [
    {
      data: <[number, number][]>d3.zip(d3.range(plate.power.length), plate.power),
      color: 'blue'
    },
    {
      data: <[number, number][]>d3.zip(d3.range(plate.current.length), plate.current),
      color: 'green'
    },
    {
      data: <[number, number][]>d3.zip(d3.range(plate.voltage.length), plate.voltage),
      color: 'yellow'
    },
    {
      data: <[number, number][]>d3.zip(d3.range(plate.temperature.length), plate.temperature),
      color: 'red'
    }
  ];
  return traces;
});

export const selectActivePlateDiagnosticLegend = createSelector(selectActivePlate, (plate: Plate): Legend => {
  if (!plate) {
    return null;
  };

  const legend = {
    legendEntries: [
      {
        label: 'Power',
        color: 'blue'
      },
      {
        label: 'Current',
        color: 'green'
      },
      {
        label: 'Voltage',
        color: 'yellow',
      },
      {
        label: 'Temp.',
        color: 'red'
      }
    ],
    fontSize: 10
  };

  return legend;
});

export const selectActivePlateDiagnosticRange = createSelector(selectActivePlate, (plate: Plate) => {
  if (!plate) {
    return <[number, number]>[0, 0];
  };

  const minVal = Math.min(...plate.power, ...plate.current, ...plate.voltage, ...plate.temperature) - 100;
  const maxVal = Math.max(...plate.power, ...plate.current, ...plate.voltage, ...plate.temperature) + 100;
  return <[number, number]>[minVal, maxVal];
});

export const selectActivePlateDiagnosticDomain = createSelector(selectActivePlate, (plate: Plate) => {
  if (!plate) {
    return <[number, number]>[0, 0];
  };

  return <[number, number]>[0, plate.power.length];
});

export const selectActiveChannelLoci = createSelector(fromDB.selectLocusEntities, selectActiveChannels, (loci: {[id: string]: Locus}, channels): {[id: string]: Locus} => {
  const locusIDs = channels.filter(c => c.locus).map(c => c.locus);
  const activeLoci = locusIDs.reduce((prev: { [id: string]: Locus }, next: string) => {
    return Object.assign(prev, {
      [next]: loci[next]
    });
  }, {})
  return activeLoci;
});

export const selectInactiveLoci = createSelector(selectActiveChannelLoci, fromDB.selectLocusEntities, (activeLoci, allLoci) => {
  return Object.keys(allLoci).filter(id => !(id in activeLoci)).map(id => allLoci[id]);
})


export const selectActiveChannelLociList = createSelector(selectActiveChannelLoci, (activeLoci): Locus[] => {
  return Object.keys(activeLoci).map(id => activeLoci[id]);
})


export const selectActiveLocusDomain = createSelector(selectActiveLocus, fromDB.selectLocusEntities, (chosenLocus, allLoci) => {
  if (chosenLocus && allLoci) {
    return <[number, number]>[+allLoci[chosenLocus].min_base_length, +allLoci[chosenLocus].max_base_length];
  } else {
    return <[number, number]>[0, 500];
  }
})

export const selectLocusWindow = createSelector(selectSelectedLocus, fromDB.selectLocusEntities, (locusId, locusEntities) => {
  if (locusId) {
    return locusEntities[locusId];
  } else {
    return null;
  }
});

export const selectActiveRecalculatePlateLadderTasks = fromTasks.selectActiveTasks('plate', 'recalculate_ladder');

export const selectActiveRecalculatePlateLadderTask = createSelector(selectActivePlateId, selectActiveRecalculatePlateLadderTasks, (plateId, tasks) => {
  const taskIds = Object.keys(tasks);
  for (const taskId of taskIds) {
    const task = tasks[taskId];
    if (task.status === IN_PROGRESS && task.task_args['plate_id'] === plateId) {
      return task;
    }
  }
})
