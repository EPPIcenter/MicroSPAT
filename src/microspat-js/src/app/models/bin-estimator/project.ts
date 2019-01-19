import { SampleBasedProject } from '../project/sample-based-project';

export interface BinEstimatorProject extends SampleBasedProject {
  locus_bin_sets: string[];
}
