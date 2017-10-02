import { BaseModel } from '../base';
import { TimeStamped } from '../attributes';

export interface ProjectSampleAnnotations extends BaseModel, TimeStamped {
  sample: string;
  project: string;
  moi: number;
  locus_annotations: string[];
  assigned_controls: string[];
}
