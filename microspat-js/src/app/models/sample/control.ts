import { BaseModel } from '../base';
import { TimeStamped } from '../attributes';

export interface Control extends BaseModel, TimeStamped {
  barcode: string;
  bin_estimator: string;
  alleles: {};
}
