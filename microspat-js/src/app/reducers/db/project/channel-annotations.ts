import { ProjectChannelAnnotations } from 'app/models/project/channel-annotations';
import { generateReducer } from 'app/reducers/db/dbReducer';


const MODEL = 'project_channel_annotations';

export interface State {
  ids: string[];
  entities: { [id: string]: ProjectChannelAnnotations };
}

export const initialState: State = {
  ids: [],
  entities: {}
};

export const reducer = generateReducer(MODEL, initialState);
