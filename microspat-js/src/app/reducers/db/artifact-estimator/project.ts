import { ArtifactEstimatorProject } from 'app/models/artifact-estimator/project';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'artifact_estimator_project';

export interface State {
  ids: string[];
  entities: { [id: string]: ArtifactEstimatorProject };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
