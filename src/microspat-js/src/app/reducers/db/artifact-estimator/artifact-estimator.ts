import { ArtifactEstimator } from '../../../models/artifact-estimator/artifact-estimator';
import { generateReducer } from '../dbReducer';


export const MODEL = 'artifact_estimator';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: ArtifactEstimator };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
