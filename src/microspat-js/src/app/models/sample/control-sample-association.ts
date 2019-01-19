import { BaseModel } from '../base';
import { Control } from './control';
import { ProjectSampleAnnotations } from '../project/sample-annotations';

export interface ControlSampleAssociation extends BaseModel {
  control: string | Control;
  sample_annotation: string | ProjectSampleAnnotations;
  proportion: number;
}
