import { DatabaseItem } from '../../../../DatabaseItem';

export class ArtifactEquation extends DatabaseItem {
    artifact_estimator_id: number;
    sd: number;
    r_squared: number;
    slope: number;
    intercept; number;
    start_size: number;
    end_size: number;
    method: "TSR" | "LSR" | "RANSAC" | "no_slope";
    
    fillFromJSON(obj) {
        this.isDirty = false;
        for(let p in obj) {
            this[p] = obj[p];
        }
    }
}