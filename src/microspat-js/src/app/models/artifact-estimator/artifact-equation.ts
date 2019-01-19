import { BaseModel } from '../base';

export interface ArtifactEquation extends BaseModel {
  artifact_estimator: string;
  sd: number;
  r_squared: number;
  slope: number;
  intercept: number;
  start_size: number;
  end_size: number;
  method: 'TSR' | 'LSR' | 'RANSAC' | 'no_slope';
}
