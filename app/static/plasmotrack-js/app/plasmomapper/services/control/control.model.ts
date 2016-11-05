import { DatabaseItem } from '../DatabaseItem';
import { TimeStamped } from '../TimeStamped';

import { BinEstimatorProject } from '../bin-estimator-project/bin-estimator-project.model';

type locus_id = number;
type bin_id = number;
// type AlleleSet = {
//     [bin_id: number]: boolean
// }


export class Control extends DatabaseItem implements TimeStamped {
    barcode: string;
    bin_estimator_id: number;
    bin_estimator: BinEstimatorProject;
    alleles: {
        [locus_id: number]: number
    };
    last_updated: Date

    fillFromJSON(obj) {
        this.isDirty = false;
        for(let p in obj) {
            this[p] = obj[p];
        }

        if(obj.last_updated != null) {
            this.last_updated = new Date(obj.last_updated);
        }

        this.alleles = {};
        for(let key in obj.alleles) {
            this.alleles[key] = obj.alleles[key];
        };

        if(obj.bin_estimator) {
            let be = new BinEstimatorProject();
            be.fillFromJSON(obj.bin_estimator);
            this.bin_estimator = be;
        }
    }
}