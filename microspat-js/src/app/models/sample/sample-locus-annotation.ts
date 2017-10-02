import { BaseModel } from '../base';
import { TimeStamped, Flaggable } from '../attributes';

export interface SampleLocusAnnotation extends BaseModel, TimeStamped, Flaggable {
  project: string;
  sample_annotations: string[];
  locus: string;
  annotated_peaks: {}[];
  reference_run: string;
  discriminator: string;
}
