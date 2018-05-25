import { SampleLocusAnnotation } from 'app/models/sample/sample-locus-annotation';
import { generateReducer } from 'app/reducers/db/dbReducer';


export const MODEL = 'sample_locus_annotation';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: SampleLocusAnnotation };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};


export const reducer = generateReducer(MODEL, initialState);
