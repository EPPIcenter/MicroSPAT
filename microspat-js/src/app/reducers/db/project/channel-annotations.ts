import { ProjectChannelAnnotations } from 'app/models/project/channel-annotations';
import { generateReducer } from 'app/reducers/db/dbReducer';


export const MODEL = 'project_channel_annotations';

export interface State {
  ids: string[];
  pendingRequests: {[id: number]: string};
  entities: { [id: string]: ProjectChannelAnnotations };
}

export const initialState: State = {
  ids: [],
  pendingRequests: {},
  entities: {}
};


export const reducer = generateReducer(MODEL, initialState);
