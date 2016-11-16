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
    gap_threshold: number;
    
    locus_id: number;
    project_id: number;
    
    //peak filtering params
    min_peak_height: number;
    max_peak_height: number;
    min_peak_height_ratio: number;
    max_bleedthrough: number;
    max_crosstalk: number;
    min_peak_distance: number;
    
    scanning_parameters_stale: boolean;
    filter_parameters_stale: boolean;

    initialize() {
        this.scanning_method = 'relmax';
        this.maxima_window = 10;
        this.argrelmax_window = 6;
        this.trace_smoothing_window = 11;
        this.trace_smoothing_order = 7;
        this.tophat_factor = .005

        this.cwt_min_width = 4;
        this.cwt_max_width = 15;
        this.min_snr = 3;
        this.noise_perc = 13;
        this.gap_threshold = 2;

        this.min_peak_height = 150;
        this.max_peak_height = 40000;
        this.min_peak_height_ratio = 0;
        this.max_bleedthrough = 4;
        this.max_crosstalk = 4;
        this.min_peak_distance = 2;

    }
    
    fillFromJSON(obj) {
        this.isDirty = false;
        for(let p in obj) {
            this[p] = obj[p];
        }
    }
}