import { ArtifactEstimatorLocusParams } from 'app/models/artifact-estimator/locus-params';
import { generateReducer } from 'app/reducers/db/dbReducer';


export const MODEL = 'artifact_estimator_locus_params';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: ArtifactEstimatorLocusParams };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
