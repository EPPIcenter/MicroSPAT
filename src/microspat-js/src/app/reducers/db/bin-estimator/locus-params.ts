import { BinEstimatorLocusParams } from '../../../models/bin-estimator/locus-params';
import { generateReducer } from '../dbReducer';


export const MODEL = 'bin_estimator_locus_params';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: BinEstimatorLocusParams };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
