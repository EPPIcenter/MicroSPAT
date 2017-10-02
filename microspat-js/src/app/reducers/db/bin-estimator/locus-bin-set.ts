import { LocusBinSet } from 'app/models/bin-estimator/locus-bin-set';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'locus_bin_set';

export interface State {
  ids: string[];
  entities: { [id: string]: LocusBinSet };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
