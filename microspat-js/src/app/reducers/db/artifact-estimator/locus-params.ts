import { ArtifactEstimatorLocusParams } from 'app/models/artifact-estimator/locus-params';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'artifact_estimator_locus_params';

export interface State {
  ids: string[];
  entities: { [id: string]: ArtifactEstimatorLocusParams };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
