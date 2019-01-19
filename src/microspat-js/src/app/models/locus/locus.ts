import { BaseModel } from '../base';
import { Colored } from '../attributes';

export interface Locus extends Colored, BaseModel {
  label: string;
  max_base_length: number;
  min_base_length: number;
  nucleotide_repeat_length: number;
  locus_metadata: {};
}
