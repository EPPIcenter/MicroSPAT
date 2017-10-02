import { TimeStamped, Flaggable } from '../attributes';
import { BaseModel } from '../base';

export interface Well extends BaseModel, TimeStamped, Flaggable {
  plate: string;
  well_label: string;
  sizing_quality: number;
  offscale_indices: number[];
  ladder: string;
  fsa_hash: string;
  channels: string[];
  ladder_peak_indices: number[];
  base_sizes: number[];
}
