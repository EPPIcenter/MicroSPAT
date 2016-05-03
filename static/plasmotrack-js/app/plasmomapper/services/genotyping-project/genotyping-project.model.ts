import { SampleBasedProject } from '../sample-based-project/sample-based-project.model';
import { Project } from '../project/project.model';
import { GenotypingLocusParameters } from './locus-parameters/genotyping-locus-parameters.model';

export class GenotypingProject extends SampleBasedProject {
    bin_estimator_id: number;
    artifact_estimator_id: number;
    locus_parameters: Map<number, GenotypingLocusParameters>;
    
    fillFromJSON(obj) {
        super.fillFromJSON(obj);
        
        let lp = new Map<number, GenotypingLocusParameters>();
        
        for(let key in obj.locus_parameters) {
            let new_lp = new GenotypingLocusParameters();
            new_lp.fillFromJSON(obj.locus_parameters[key]);
            lp.set(parseInt(key), new_lp);
        }
        this.locus_parameters = lp;
    }
}