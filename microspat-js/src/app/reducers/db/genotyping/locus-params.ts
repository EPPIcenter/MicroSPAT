import { GenotypingLocusParams } from 'app/models/genotyping/locus-params';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'genotyping_locus_params';

export interface State {
  ids: string[];
  entities: { [id: string]: GenotypingLocusParams };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
