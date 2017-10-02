import { GenotypingProject } from 'app/models/genotyping/project';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'genotyping_project';

export interface State {
  ids: string[];
  entities: { [id: string]: GenotypingProject };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
