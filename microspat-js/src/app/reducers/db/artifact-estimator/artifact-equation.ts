import { ArtifactEquation } from 'app/models/artifact-estimator/artifact-equation';
import { generateReducer } from 'app/reducers/db/dbReducer';


export const MODEL = 'artifact_equation';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: ArtifactEquation };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
