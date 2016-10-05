import { Project } from '../project/project.model';
import { QuantificationBiasEstimatorLocusParameters } from './locus-parameters/quantification-bias-estimator-locus-parameters.model';

export class QuantificationBiasEstimatorProject extends Project {
    locus_parameters: Map<number, QuantificationBiasEstimatorLocusParameters>;

    fillFromJSON(obj) {
        super.fillFromJSON(obj);

        let lp = new Map<number, QuantificationBiasEstimatorLocusParameters>();

        for(let key in obj.locus_paramters) {
            let new_lp = new QuantificationBiasEstimatorLocusParameters();
            new_lp.fillFromJSON(obj.locus_paramters[key]);
            lp.set(parseInt(key), new_lp);
        }
        
        this.locus_parameters = lp;       
    }
}