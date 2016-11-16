import { DatabaseItem } from '../DatabaseItem';
import { Colored } from '../Colored';
import { PeakScanner } from '../PeakScanner';

export class Ladder extends DatabaseItem implements Colored, PeakScanner {
    label: string;
    base_sizes: number[];
    sq_limit: number;
    unusable_sq_limit: number;
    base_size_precision: number;
    index_overlap: number;
    min_time: number;
    max_peak_height: number;
    min_peak_height: number;
    outlier_limit: number;
    maximum_missing_peak_count: number;
    allow_bleedthrough: boolean;
    remove_outliers: boolean;
    color: string;
    scanning_method: string;
    maxima_window: number;
    argrelmax_window: number;
    trace_smoothing_window: number;
    trace_smoothing_order: number;
    tophat_factor: number;
    cwt_min_width: number;
    cwt_max_width: number;
    min_snr: number;
    noise_perc: number;
    gap_threshold: number;
    
    fillFromJSON(obj) {
        this.isDirty = false;
        for(let p in obj) {
            this[p] = obj[p];
        }
    }
}