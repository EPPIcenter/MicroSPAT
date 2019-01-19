import { Locus } from '../locus/locus';
import { BaseModel } from '../base';
import { PeakScanner } from '../attributes';

export interface ProjectLocusParams extends BaseModel, PeakScanner {
  locus: string | Locus;
  project: string;
  locked: boolean;
  min_peak_height: number;
  max_peak_height: number;
  min_peak_height_ratio: number;
  max_bleedthrough: number;
  max_crosstalk: number;
  min_peak_distance: number;
  scanning_parameters_stale: boolean;
  filter_parameters_stale: boolean;
  discriminator: string;
}
