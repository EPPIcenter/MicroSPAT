import { BaseModel } from '../base';
import { TimeStamped, Flaggable } from '../attributes';

export interface ProjectChannelAnnotations extends BaseModel, Flaggable {
  channel: string;
  project: string;
  annotated_peaks: {}[];
  // peak_indices: number[];
}
