import { LocusArtifactEstimator } from '../../../models/artifact-estimator/locus-artifact-estimator';
import { generateReducer } from '../dbReducer';


export const MODEL = 'locus_artifact_estimator';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: LocusArtifactEstimator };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};


export const reducer = generateReducer(MODEL, initialState);
