import { Genotype } from 'app/models/sample/genotype';
import { generateReducer } from 'app/reducers/db/dbReducer';


export const MODEL = 'genotype';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: Genotype };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};


export const reducer = generateReducer(MODEL, initialState);
