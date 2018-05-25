import { BinEstimatorProject } from 'app/models/bin-estimator/project';
import { generateReducer } from 'app/reducers/db/dbReducer';


export const MODEL = 'bin_estimator_project';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: BinEstimatorProject };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
