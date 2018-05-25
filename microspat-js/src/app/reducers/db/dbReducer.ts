import * as db from 'app/actions/db';
import { createSelector } from 'reselect';

export interface State {
  ids: string[];
  entities: { [id: string]: any };
  pendingRequests: {[id: number]: string};
}

export const getEntities = (state: State) => state.entities;
export const getIds = (state: State) => state.ids;
export const getPendingRequests = (state: State) => state.pendingRequests;
export const getList = (state: State) => {
  const items = [];
  Object.keys(state.entities).forEach(k => items.push(state.entities[k]));
  return items;
};

export function generateReducer(model: string, initialState: any) {
  return function reducer(state = initialState, action: db.Actions): State {
    if ('payload' in action && action.payload.model === model) {
      switch (action.type) {

        // case db.GET_REQUESTED:

        case db.GET_RECEIVED:
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

        case db.GET_IN_FLIGHT:
          const ids = action.payload.ids;
          const newRequests = Object.assign({}, state.pendingRequests);
          ids.forEach(id => newRequests[id] = id);
          return Object.assign({}, state, {
            pendingRequests: newRequests
          });

        case db.LIST_RECEIVED:
          const listReqEntities = action.payload.entities;
          const newListReqEntries = listReqEntities.filter(entity => !state.entities[entity.id]);

          const newListReqEntitiesIds = newListReqEntries.map(entity => entity.id);
          const newEntities = newListReqEntries.reduce((e: { [id: string]: any }, entity: any) => {
            return Object.assign(e, {
              [entity.id]: Object.assign({}, entity, {detailed: false})
            });
          }, {});

          return Object.assign({}, state, {
            ids: [...state.ids, ...newListReqEntitiesIds],
            entities: Object.assign({}, state.entities, newEntities)
          });

        case db.DELETE_RECEIVED:
          const deletedEntryIds = action.payload.ids;
          const remainingEntries = state.ids.filter(id => deletedEntryIds.indexOf(id) === -1).map(id => state.entities[id]);
          const remainingEntities = remainingEntries.reduce((entries: { [id: string]: any }, entry: any) => {
            return Object.assign(entries, {
              [entry.id]: entry
            });
          }, {});

          return Object.assign({}, state, {
            ids: remainingEntries.map(well => well.id),
            entities: remainingEntities
          });

        case db.SET_STALE:
          console.log("Setting STALE");
          const staleIds = action.payload.ids;
          const staleEntries = staleIds.map(id => state.entities[id]).map(e => Object.assign({}, e, {stale: true}));
          const setStaleEntities = staleEntries.reduce((entries: { [id: string]: any }, entry: any) => {
            return Object.assign(entries, {
              [entry.id]: entry
            });
          }, {});

          return Object.assign({}, state, {
            entities: Object.assign({}, state.entities, setStaleEntities)
          });

        default:
          return state;
      }
    } else {
      return state;
    }
  };
}
