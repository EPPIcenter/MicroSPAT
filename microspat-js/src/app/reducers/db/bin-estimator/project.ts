import { BinEstimatorProject } from 'app/models/bin-estimator/project';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'bin_estimator_project';

export interface State {
  ids: string[];
  entities: { [id: string]: BinEstimatorProject };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
