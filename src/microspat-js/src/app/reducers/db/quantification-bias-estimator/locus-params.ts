import { QuantificationBiasEstimatorLocusParams } from '../../../models/quantification-bias-estimator/locus-params';
import { generateReducer } from '../dbReducer';


export const MODEL = 'quantification_bias_estimator_locus_params';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: QuantificationBiasEstimatorLocusParams };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};


export const reducer = generateReducer(MODEL, initialState);
