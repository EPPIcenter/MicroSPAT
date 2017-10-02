import { PeakScanner, Colored } from '../attributes';
import { BaseModel } from '../base';


export interface Ladder extends BaseModel, PeakScanner, Colored {
  label: string;
  base_sizes: number[];
  sq_limit: number;
  unusable_sq_limit: number;
  base_size_precision: number;
  index_overlap: number;
  min_time: number;
  max_peak_height: number;
  min_peak_height: number;
  outlier_limit: number;
  maximum_missing_peak_count: number;
  allow_bleedthrough: boolean;
  remove_outliers: boolean;
}
