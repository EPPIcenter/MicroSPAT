import { Control } from 'app/models/sample/control';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'control';

export interface State {
  ids: string[];
  entities: { [id: string]: Control };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
