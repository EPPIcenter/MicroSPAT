import { ControlSampleAssociation } from 'app/models/sample/control-sample-association';

import { generateReducer } from '../dbReducer';


export const MODEL = 'control_sample_association';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: ControlSampleAssociation };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};


export const reducer = generateReducer(MODEL, initialState);