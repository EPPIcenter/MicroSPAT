import { BaseModel } from '../base';
import { Flaggable } from '../attributes';

export interface Sample extends BaseModel, Flaggable {
  barcode: string;
  designation: 'sample' | 'positive_control' | 'negative_control';
  channels: string[];
}
