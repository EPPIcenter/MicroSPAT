export const VALID_COLORS = [
  {value: 'red', label: 'Red'},
  {value: 'yellow', label: 'Yellow'},
  {value: 'green', label: 'Green'},
  {value: 'blue', label: 'Blue'},
  {value: 'orange', label: 'Orange'}
]

export interface Colored {
  color: 'orange' | 'red' | 'yellow' | 'green' | 'blue';
}

export interface PeakScanner {
  scanning_method: 'cwt' | 'relmax';
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
}

export interface TimeStamped {
  last_updated?: Date;
}

export interface Flaggable {
  flags: {} | null;
  comments: string;
}

export interface LocusSetAssociated {
  locus_set: string;
}
