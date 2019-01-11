import { Locus } from '../locus/locus';
import { BaseModel } from '../base';

export interface LocusBinSet extends BaseModel {
  locus: string | Locus;
  project: string;
  bins: string[];
}
