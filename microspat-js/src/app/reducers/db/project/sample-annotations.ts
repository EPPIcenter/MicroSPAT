import { ProjectSampleAnnotations } from 'app/models/project/sample-annotations';
import { generateReducer } from 'app/reducers/db/dbReducer';


export const MODEL = 'project_sample_annotations';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: ProjectSampleAnnotations };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};


export const reducer = generateReducer(MODEL, initialState);
