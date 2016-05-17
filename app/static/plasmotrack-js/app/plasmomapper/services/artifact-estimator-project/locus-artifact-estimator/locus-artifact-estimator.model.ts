import { DatabaseItem } from '../../DatabaseItem';
import { ArtifactEstimator } from './artifact-estimator/artifact-estimator.model'

export class LocusArtifactEstimator extends DatabaseItem {
    locus_id: number;
    project_id: number;
    artifact_estimators: ArtifactEstimator[];
    
    fillFromJSON(obj) {
        this.isDirty = false;
        for(let p in obj) {
            this[p] = obj[p];
        }
        
        let a = <Object[]> obj.artifact_estimators;
        this.artifact_estimators = a.map((obj) => {
            let new_obj = new ArtifactEstimator();
            new_obj.fillFromJSON(obj);
            return new_obj;
        });
    }
}