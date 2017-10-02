import { TimeStamped, Flaggable } from '../attributes';
import { BaseModel } from '../base';


export interface Plate extends BaseModel, TimeStamped, Flaggable {
  label: string;
  creator: string;
  date_processed: Date;
  date_run: Date;
  well_arrangement: 96 | 384;
  ce_machine: string;
  plate_hash: string;
  wells: string[];
}
