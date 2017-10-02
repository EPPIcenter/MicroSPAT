import { LocusArtifactEstimator } from 'app/models/artifact-estimator/locus-artifact-estimator';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'locus_artifact_estimator';

export interface State {
  ids: string[];
  entities: { [id: string]: LocusArtifactEstimator };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
