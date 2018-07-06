import { ArtifactEquation } from 'app/models/artifact-estimator/artifact-equation';
import { generateReducer } from 'app/reducers/db/dbReducer';

// Redo the following implementation
// export interface State extends StateInterface<ArtifactEquation> {}
// export const MODEL = 'artifact_equation';
// export const initialState: State = generateState();
// export const reducer = generateReducer(MODEL, initialState);

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
