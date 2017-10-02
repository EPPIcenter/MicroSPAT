import { ArtifactEquation } from 'app/models/artifact-estimator/artifact-equation';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'artifact_equation';

export interface State {
  ids: string[];
  entities: { [id: string]: ArtifactEquation };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
