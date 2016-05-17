import { DatabaseItem } from '../../../DatabaseItem';
import { ArtifactEquation } from './artifact-equation/artifact-equation.model'

export class ArtifactEstimator extends DatabaseItem {
    artifact_distance: number;
    artifact_distance_buffer: number;
    locus_artifact_estimator_id: number;
    peak_data: Object[];
    artifact_equations: ArtifactEquation[];
    
    fillFromJSON(obj) {
        this.isDirty = false;
        for(let p in obj) {
            this[p] = obj[p];
        }
        
        let a = <Object[]> obj.artifact_equations;
        this.artifact_equations = a.map((obj) => {
            let new_obj = new ArtifactEquation();
            new_obj.fillFromJSON(obj);
            return new_obj;
        });
    }
}