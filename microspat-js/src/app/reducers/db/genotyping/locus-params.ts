import { GenotypingLocusParams } from 'app/models/genotyping/locus-params';
import { generateReducer } from 'app/reducers/db/dbReducer';


export const MODEL = 'genotyping_locus_params';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: GenotypingLocusParams };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};


export const reducer = generateReducer(MODEL, initialState);

