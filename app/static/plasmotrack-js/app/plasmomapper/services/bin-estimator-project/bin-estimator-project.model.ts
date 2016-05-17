import { Project } from '../project/project.model';
import { LocusBinSet } from './locus-bin-set/locus-bin-set.model';
import { BinEstimatorLocusParameters } from './locus-parameters/bin-estimator-locus-parameters.model';

export class BinEstimatorProject extends Project {
    locus_bin_sets: Map<number, LocusBinSet>;
    locus_parameters: Map<number, BinEstimatorLocusParameters>;
    
    fillFromJSON(obj) {
        super.fillFromJSON(obj);
        
        let lp = new Map<number, BinEstimatorLocusParameters>();
        
        for(let key in obj.locus_parameters) {
            let new_lp = new BinEstimatorLocusParameters();
            new_lp.fillFromJSON(obj.locus_parameters[key]);
            lp.set(parseInt(key), new_lp);
        }
        this.locus_parameters = lp;
        
        let lb = new Map<number, LocusBinSet>();
        for(let key in obj.locus_bin_sets) {
            let new_lb = new LocusBinSet();
            new_lb.fillFromJSON(obj.locus_bin_sets[key]);
            lb.set(parseInt(key), new_lb);
        }
        this.locus_bin_sets = lb;
    }
}