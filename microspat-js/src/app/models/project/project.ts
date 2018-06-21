import { BaseModel } from '../base';
import { LocusSetAssociated, TimeStamped } from '../attributes';

export interface Project extends BaseModel, LocusSetAssociated {
  title: string;
  date: Date;
  creator: string;
  description: string | null;
  channel_annotations: string[];
  discrimminator: string;
  locus_parameters: string[];
  _detailed: boolean;
}
