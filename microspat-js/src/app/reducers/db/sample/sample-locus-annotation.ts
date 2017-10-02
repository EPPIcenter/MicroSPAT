import { SampleLocusAnnotation } from 'app/models/sample/sample-locus-annotation';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'sample_locus_annotation';

export interface State {
  ids: string[];
  entities: { [id: string]: SampleLocusAnnotation };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
