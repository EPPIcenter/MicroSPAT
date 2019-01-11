import { BaseModel } from '../base';
import { Flaggable } from '../attributes';

export interface Bin extends BaseModel, Flaggable {
  locus_bin_set: string;
  label: string;
  base_size: number;
  bin_buffer: number;
  peak_count: number;
}
