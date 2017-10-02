import { QuantificationBiasEstimatorLocusParams } from 'app/models/quantification-bias-estimator/locus-params';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'quantification_bias_estimator_locus_params';

export interface State {
  ids: string[];
  entities: { [id: string]: QuantificationBiasEstimatorLocusParams };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
