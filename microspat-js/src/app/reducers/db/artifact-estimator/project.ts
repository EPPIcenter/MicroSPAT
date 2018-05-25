import { ArtifactEstimatorProject } from 'app/models/artifact-estimator/project';
import { generateReducer } from 'app/reducers/db/dbReducer';


export const MODEL = 'artifact_estimator_project';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: ArtifactEstimatorProject };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
