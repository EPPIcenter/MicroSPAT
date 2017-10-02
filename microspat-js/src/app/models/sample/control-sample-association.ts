import { BaseModel } from '../base';

export interface ControlSampleAssociation extends BaseModel {
  control: string;
  sample_annotation: string;
  proportion: number;
}
