import { Locus } from 'app/models/locus/locus';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'locus';

export interface State {
  ids: string[];
  entities: { [id: string]: Locus };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
