import { BaseModel } from '../base';
import { AnnotatedPeak } from './../project/peak';
import { ProjectSampleAnnotations } from './../project/sample-annotations';
import { Flaggable } from '../attributes';
import { Locus } from '../locus/locus';

export interface SampleLocusAnnotation extends BaseModel, Flaggable {
  project: string;
  sample_annotations: string | ProjectSampleAnnotations;
  locus: string | Locus;
  annotated_peaks: AnnotatedPeak[];
  reference_run: string;
  discriminator: string;
}
