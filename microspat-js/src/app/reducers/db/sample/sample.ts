import { Sample } from 'app/models/sample/sample';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'sample';

export interface State {
  ids: string[];
  entities: { [id: string]: Sample };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
