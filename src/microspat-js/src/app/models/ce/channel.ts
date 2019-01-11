import { Colored, TimeStamped, Flaggable } from '../attributes';
import { BaseModel } from '../base';

export interface Channel extends BaseModel, Colored, Flaggable {
  annotations: string[];
  data: number[];
  ignored: boolean;
  locus: string;
  max_data_point: number;
  sample: string;
  wavelength: number;
  well: string;
}
