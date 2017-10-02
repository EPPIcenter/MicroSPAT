import { Genotype } from 'app/models/sample/genotype';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'genotype';

export interface State {
  ids: string[];
  entities: { [id: string]: Genotype };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
