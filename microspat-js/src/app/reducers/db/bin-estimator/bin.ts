import { Bin } from 'app/models/bin-estimator/bin';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'bin';

export interface State {
  ids: string[];
  entities: { [id: string]: Bin };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
