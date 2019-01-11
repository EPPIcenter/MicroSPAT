import { BaseModel } from '../base';
import { BinEstimatorProject } from '../bin-estimator/project';

export interface Control extends BaseModel {
  barcode: string;
  bin_estimator: string | number | BinEstimatorProject;
  alleles: {};
}
