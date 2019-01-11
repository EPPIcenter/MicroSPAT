import { BaseModel } from '../base';

export interface LocusSet extends BaseModel {
  loci: string[];
  label: string;
}
