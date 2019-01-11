import { Bin } from '../../../models/bin-estimator/bin';
import { generateReducer } from '../dbReducer';


export const MODEL = 'bin';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: Bin };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
