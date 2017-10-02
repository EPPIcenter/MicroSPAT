// import { createSelector } from 'reselect';
// import { ActionReducer, Action } from '@ngrx/store';
// import * as db from 'app/actions/db';
import { Ladder } from 'app/models/ce/ladder';
import { generateReducer } from 'app/reducers/db/dbReducer';

const MODEL = 'ladder';

export interface State {
  ids: string[];
  entities: { [id: string]: Ladder };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);

// export function reducer(state = Object.assign({}, initialState), action: db.Actions): State {
//   if ('payload' in action && action.payload.model === MODEL) {
//     switch (action.type) {

//       case db.GET_RECEIVED:
//       case db.LIST_RECEIVED:
//         const entities = action.payload.entities;
//         const newEntries = entities.filter(well => !state.entities[well.id]);

//         const newEntitiesIds = newEntries.map(well => well.id);
//         const newEntities = newEntries.reduce((e: { [id: string]: any }, entity: any) => {

//         return Object.assign(e, {
//             [entity.id]: entity
//           });
//         }, {});

//         return Object.assign({}, state, {
//           ids: [...state.ids, ...newEntitiesIds],
//           entities: Object.assign({}, state.entities, newEntities)
//         });

//       case db.DELETE_RECEIVED:
//         const deletedEntryIds = action.payload.ids;
//         const remainingEntries = state.ids.filter(id => deletedEntryIds.indexOf(id) === -1).map(id => state.entities[id]);
//         const remainingEntities = remainingEntries.reduce((entries: { [id: string]: any }, entry: any) => {
//           return Object.assign(entries, {
//             [entry.id]: entry
//           });
//         }, {});

//         return Object.assign(state, {
//           ids: remainingEntries.map(well => well.id),
//           entities: remainingEntities
//         });


//       default:
//         return state;
//     }
//   } else {
//     return state;
//   }
// };
