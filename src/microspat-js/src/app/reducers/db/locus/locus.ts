import { Locus } from '../../../models/locus/locus';
import { generateReducer } from '../dbReducer';


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
