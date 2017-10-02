import { Project } from './project';

export interface SampleBasedProject extends Project {
  sample_annotations: string[];
}
