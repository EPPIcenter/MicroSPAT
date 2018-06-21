import { BaseModel } from '../base';
import { TimeStamped, Flaggable } from '../attributes';

export interface Sample extends BaseModel, Flaggable {
  barcode: string;
  designation: 'sample' | 'positive_control' | 'negative_control';
  channels: string[];
}
