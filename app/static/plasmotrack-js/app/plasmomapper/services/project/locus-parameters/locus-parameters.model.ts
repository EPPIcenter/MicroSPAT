import { DatabaseItem } from '../../DatabaseItem';
import { PeakScanner } from '../../PeakScanner';

export class LocusParameters extends DatabaseItem implements PeakScanner {
    scanning_method: string;
    maxima_window: number;
    
    //relmax params
    argrelmax_window: number;
    trace_smoothing_window: number;
    trace_smoothing_order: number;
    tophat_factor: number;
    //cwt params
    cwt_min_width: number;
    cwt_max_width: number;
    min_snr: number;
    noise_perc: number;
    
    locus_id: number;
    project_id: number;
    
    //peak filtering params
    min_peak_height: number;
    max_peak_height: number;
    min_peak_height_ratio: number;
    max_bleedthrough: number;
    max_crosstalk: number;
    min_peak_distance: number;
    offscale_threshold: number;
    
    scanning_parameters_stale: boolean;
    filter_parameters_stale: boolean;
    
    fillFromJSON(obj) {
        this.isDirty = false;
        for(let p in obj) {
            this[p] = obj[p];
        }
    }
}