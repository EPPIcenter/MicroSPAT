import { SampleBasedProject } from '../sample-based-project/sample-based-project.model';
import { QuantificationBiasEstimatorLocusParameters } from './locus-parameters/quantification-bias-estimator-locus-parameters.model';

export class QuantificationBiasEstimatorProject extends SampleBasedProject {
    locus_parameters: Map<number, QuantificationBiasEstimatorLocusParameters>;

    fillFromJSON(obj) {
        super.fillFromJSON(obj);

        let lp = new Map<number, QuantificationBiasEstimatorLocusParameters>();

        for(let key in obj.locus_parameters) {
            let new_lp = new QuantificationBiasEstimatorLocusParameters();
            new_lp.fillFromJSON(obj.locus_parameters[key]);
            lp.set(parseInt(key), new_lp);
        }
        
        this.locus_parameters = lp;       
    }
}