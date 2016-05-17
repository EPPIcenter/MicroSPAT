import { Project } from '../project/project.model';
import { LocusArtifactEstimator } from './locus-artifact-estimator/locus-artifact-estimator.model';
import { ArtifactEstimatorLocusParameters } from './locus-parameters/artifact-estimator-locus-parameters.model';

export class ArtifactEstimatorProject extends Project {
    bin_estimator_id: number;
    locus_artifact_estimators: Map<number, LocusArtifactEstimator>;
    locus_parameters: Map<number, ArtifactEstimatorLocusParameters>;
    
    fillFromJSON(obj) {
        super.fillFromJSON(obj);

        let lp = new Map<number, ArtifactEstimatorLocusParameters>();
        
        for(let key in obj.locus_parameters) {
            let new_lp = new ArtifactEstimatorLocusParameters()
            new_lp.fillFromJSON(obj.locus_parameters[key]);
            lp.set(parseInt(key), new_lp);
        }
        this.locus_parameters = lp;
        
        let la = new Map<number, LocusArtifactEstimator>();
        for(let key in obj.locus_artifact_estimators) {
            let new_la = new LocusArtifactEstimator();
            new_la.fillFromJSON(obj.locus_artifact_estimators[key]);
            la.set(parseInt(key), new_la);
        }
        this.locus_artifact_estimators = la;
    }
}