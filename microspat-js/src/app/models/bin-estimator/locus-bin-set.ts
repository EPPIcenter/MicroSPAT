import { BaseModel } from '../base';

export interface LocusBinSet extends BaseModel {
  locus: string;
  project: string;
  bins: string[];
}
