import { ControlSampleAssociation } from 'app/models/sample/control-sample-association';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'control_sample_association';

export interface State {
  ids: string[];
  entities: { [id: string]: ControlSampleAssociation };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
