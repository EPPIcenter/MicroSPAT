import { Control } from '../../../models/sample/control';
import { generateReducer } from '../dbReducer';


export const MODEL = 'control';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: Control };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};


export const reducer = generateReducer(MODEL, initialState);
