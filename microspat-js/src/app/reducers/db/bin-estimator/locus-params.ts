import { BinEstimatorLocusParams } from 'app/models/bin-estimator/locus-params';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'bin_estimator_locus_params';

export interface State {
  ids: string[];
  entities: { [id: string]: BinEstimatorLocusParams };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
