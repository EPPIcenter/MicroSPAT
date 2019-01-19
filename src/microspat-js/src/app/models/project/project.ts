import { BaseModel } from '../base';
import { LocusSetAssociated } from '../attributes';

export interface Project extends BaseModel, LocusSetAssociated {
  title: string;
  date: Date;
  creator: string;
  description: string | null;
  channel_annotations: string[];
  discriminator: string;
  locus_parameters: string[];
  imported: boolean;
  locked: boolean;
}
