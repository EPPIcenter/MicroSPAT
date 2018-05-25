import { Locus } from 'app/models/locus/locus';
import { generateReducer } from 'app/reducers/db/dbReducer';


export const MODEL = 'locus';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: Locus };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};


export const reducer = generateReducer(MODEL, initialState);
