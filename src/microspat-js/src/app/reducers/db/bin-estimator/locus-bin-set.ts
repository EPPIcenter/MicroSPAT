import { LocusBinSet } from '../../../models/bin-estimator/locus-bin-set';
import { generateReducer } from '../dbReducer';


export const MODEL = 'locus_bin_set';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: LocusBinSet };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
