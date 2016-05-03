export interface PeakScanner {
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
}