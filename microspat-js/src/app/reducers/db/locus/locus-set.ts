import { LocusSet } from 'app/models/locus/locus-set';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'locus_set';

export interface State {
  ids: string[];
  entities: { [id: string]: LocusSet };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
