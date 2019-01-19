import * as db from 'app/actions/db';
import { EntityMap } from 'app/models/base';

export interface State<T> {
  ids: string[];
  entities: EntityMap<T>;
  pendingRequests: {[id: number]: string};
}

export const getEntities = (state: State<any>) => state.entities;
export const getIds = (state: State<any>) => state.ids;
export const getPendingRequests = (state: State<any>) => state.pendingRequests;
export const getList = (state: State<any>) => {
  const items = [];
  Object.keys(state.entities).forEach(k => items.push(state.entities[k]));
  return items;
};

export function generateReducer(
  model: string,
  initialState: any,
  listDetailed: boolean = false,
  dbCreateReceived = dbCreateReceivedDefault,
  dbGetReceived = dbGetReceivedDefault,
  dbGetFailed = dbGetFailedDefault,
  dbLocalUpdate = dbLocalUpdateDefault,
  dbGetUpdatedReceived = dbGetUpdatedReceivedDefault,
  dbGetInFlight = dbGetInFlightDefault,
  dbListReceived = dbListReceivedDefault,
  dbDeleteReceived = dbDeleteReceivedDefault,
  dbSetStale = dbSetStaleDefault
  ) {
  return function reducer(state = initialState, action: db.Actions): State<any> {
    if ('payload' in action && action.payload !== null && action.payload.model === model) {
      switch (action.type) {

        // case db.GET_REQUESTED:

        case db.CREATE_RECEIVED:
          return dbCreateReceived(state, action);

        case db.GET_RECEIVED:
          return dbGetReceived(state, action);

        case db.GET_FAILED:
          return dbGetFailed(state, action);

        case db.LOCAL_UPDATE:
          return dbLocalUpdate(state, action);

        case db.GET_UPDATED_RECEIVED:
          return dbGetUpdatedReceived(state, action);

        case db.GET_IN_FLIGHT:
          return dbGetInFlight(state, action);

        case db.LIST_RECEIVED:
          return dbListReceived(state, action, listDetailed);

        case db.DELETE_RECEIVED:
          return dbDeleteReceived(state, action);

        case db.SET_STALE:
          return dbSetStale(state, action);

        default:
          return state;
      }
    } else {
      return state;
    }
  };
}

function dbCreateReceivedDefault(state: State<any>, action: db.CreateReceivedAction) {
  return state;
}

function dbGetReceivedDefault(state: State<any>, action: db.GetReceivedAction) {
  const getReqEntities = action.payload.entities;
  const newGetReqEntries = getReqEntities.filter(entity => !state.entities[entity.id] || !state.entities[entity.id].detailed || state.entities[entity.id].stale);

  const newGetReqEntitiesIds = newGetReqEntries.filter(entity => !state.entities[entity.id]).map(entity => entity.id);
  const newGetReqEntities = newGetReqEntries.reduce((e: { [id: string]: any }, entity: any) => {
    return Object.assign(e, {
      [entity.id]: Object.assign({}, entity, {detailed: true})
    });
  }, {});

  const remainingRequests = Object.assign({}, state.pendingRequests);

  getReqEntities.forEach(e => {
    if (state.pendingRequests[e.id]) {
      delete remainingRequests[e.id];
    }
  });

  return Object.assign({}, state, {
    ids: [...state.ids, ...newGetReqEntitiesIds],
    entities: Object.assign({}, state.entities, newGetReqEntities),
    pendingRequests: remainingRequests
  });
}

function dbGetFailedDefault(state: State<any>, action: db.GetFailedAction) {
  const failedIDs = action.payload.entities;
  const remainingRequests = Object.assign({}, state.pendingRequests);

  failedIDs.forEach(id => {
    if (state.pendingRequests[id]) {
      delete remainingRequests[id];
    }
  });

  return Object.assign({}, state, {
    pendingRequests: remainingRequests
  });
}

function dbLocalUpdateDefault(state: State<any>, action: db.LocalUpdateAction) {
  const getReqEntities = action.payload.entities.filter(entity => state.entities[entity.id]);
  const updatedEntities = getReqEntities.map(e => {
    return Object.assign({}, state.entities[e.id], e)
  }).reduce((e: { [id: string]: any }, entity: any) => {
    return Object.assign(e, {
      [entity.id]: entity
    })
  }, {});
  const s = Object.assign({}, state, {
    entities: Object.assign({}, state.entities, updatedEntities)
  })
  return s;
}

function dbGetUpdatedReceivedDefault(state: State<any>, action: db.GetUpdatedReceivedAction) {
  const getReqEntities = action.payload.entities;

  const updatedGetReqEntries = getReqEntities.filter(entity => state.entities[entity.id].last_updated <= entity.last_updated);
  const newGetReqEntries = getReqEntities.filter(entity => !state.entities[entity.id]);

  const newGetReqEntitiesIds = newGetReqEntries.map(entity => entity.id);

  const allGetReqEntries = updatedGetReqEntries.concat(newGetReqEntries);

  const newGetReqEntities = allGetReqEntries.reduce((e: { [id: string]: any }, entity: any) => {
    const objCopy = Object.assign({}, state.entities[entity.id]);
    return Object.assign(e, {
      [entity.id]: Object.assign(objCopy, entity)
    });
  }, {});

  const remainingRequests = Object.assign({}, state.pendingRequests);

  getReqEntities.forEach(e => {
    if (state.pendingRequests[e.id]) {
      delete remainingRequests[e.id];
    }
  });

  const s = Object.assign({}, state, {
    ids: [...state.ids, ...newGetReqEntitiesIds],
    entities: Object.assign({}, state.entities, newGetReqEntities),
    pendingRequests: remainingRequests
  });

  return s;
}

function dbGetInFlightDefault(state: State<any>, action: db.GetInFlightAction) {
  const ids = action.payload.ids;
  const newRequests = Object.assign({}, state.pendingRequests);
  ids.forEach(id => newRequests[id] = id);
  return Object.assign({}, state, {
    pendingRequests: newRequests
  });
}

function dbListReceivedDefault(state: State<any>, action: db.ListReceivedAction, listDetailed: boolean) {
  const listReqEntities = action.payload.entities;
  const newListReqEntries = listReqEntities.filter(entity => !state.entities[entity.id]);

  const newListReqEntitiesIds = newListReqEntries.map(entity => entity.id);
  const newEntities = newListReqEntries.reduce((e: { [id: string]: any }, entity: any) => {
    return Object.assign(e, {
      [entity.id]: Object.assign({}, entity, {detailed: listDetailed})
    });
  }, {});

  return Object.assign({}, state, {
    ids: [...state.ids, ...newListReqEntitiesIds],
    entities: Object.assign({}, state.entities, newEntities)
  });
}

function dbDeleteReceivedDefault(state: State<any>, action: db.DeleteReceivedAction) {
  const deletedEntryIds = action.payload.ids.map(id => +id);
  const remainingEntries = state.ids.filter(id => deletedEntryIds.indexOf(+id) === -1).map(id => state.entities[id]);
  const remainingEntities = remainingEntries.reduce((entries: { [id: string]: any }, entry: any) => {
    return Object.assign(entries, {
      [entry.id]: entry
    });
  }, {});

  return Object.assign({}, state, {
    ids: remainingEntries.map(well => well.id),
    entities: remainingEntities
  });
}

function dbSetStaleDefault(state: State<any>, action: db.SetStaleAction) {
  const staleIds = action.payload.ids;
  const staleEntries = staleIds
    .map(id => state.entities[id])
    .filter(e => e != null)
    .map(e => Object.assign({}, e, {stale: true}));
  const setStaleEntities = staleEntries.reduce((entries: { [id: string]: any }, entry: any) => {
    return Object.assign(entries, {
      [entry.id]: entry
    });
  }, {});

  return Object.assign({}, state, {
    entities: Object.assign({}, state.entities, setStaleEntities)
  });
}

// export function generateState(): State<any> {
//   return {
//     ids: [],
//     pendingRequests: {},
//     entities: {}
//   }
// }
