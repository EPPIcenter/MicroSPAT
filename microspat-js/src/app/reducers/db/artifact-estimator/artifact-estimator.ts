import { ArtifactEstimator } from 'app/models/artifact-estimator/artifact-estimator';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'artifact_estimator';

export interface State {
  ids: string[];
  entities: { [id: string]: ArtifactEstimator };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
