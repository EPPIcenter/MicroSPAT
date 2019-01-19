import { GenotypingProject } from '../../../models/genotyping/project';
import { generateReducer } from '../dbReducer';


export const MODEL = 'genotyping_project';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: GenotypingProject };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};


export const reducer = generateReducer(MODEL, initialState);
