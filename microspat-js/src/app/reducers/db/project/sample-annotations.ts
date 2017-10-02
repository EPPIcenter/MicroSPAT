import { ProjectSampleAnnotations } from 'app/models/project/sample-annotations';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'project_sample_annotations';

export interface State {
  ids: string[];
  entities: { [id: string]: ProjectSampleAnnotations };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
