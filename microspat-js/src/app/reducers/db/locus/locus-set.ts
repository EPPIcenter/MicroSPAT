import { LocusSet } from 'app/models/locus/locus-set';
import { generateReducer } from 'app/reducers/db/dbReducer';


export const MODEL = 'locus_set';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: LocusSet };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};


export const reducer = generateReducer(MODEL, initialState);
