import { BaseModel } from '../base';
import { TimeStamped } from '../attributes';
import { Sample } from 'app/models/sample/sample';
import { Project } from './project';

export interface ProjectSampleAnnotations extends BaseModel {
  sample: string | Sample;
  project: string | Project;
  moi: number;
  locus_annotations: string[];
  assigned_controls: string[];
}
