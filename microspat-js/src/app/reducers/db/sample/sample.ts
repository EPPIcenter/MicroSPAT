import { Sample } from 'app/models/sample/sample';
import { generateReducer } from 'app/reducers/db/dbReducer';


export const MODEL = 'sample';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: Sample };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};


export const reducer = generateReducer(MODEL, initialState);
