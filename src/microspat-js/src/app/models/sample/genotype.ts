import { GenotypePeak } from './../project/peak';
import { SampleLocusAnnotation } from './sample-locus-annotation';

export interface Genotype extends SampleLocusAnnotation {
  alleles: {};
  annotated_peaks: GenotypePeak[];
  flags: {
    failure?: boolean;
    manual_curation?: boolean;
    offscale?: boolean;
  }
}
