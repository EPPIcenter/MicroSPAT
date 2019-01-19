export interface AnnotatedPeak {
  peak_index: number;
  peak_size: number;
  peak_height: number;
  bleedthrough_ratio: number;
  crosstalk_ratio: number;
  peak_area: number;
  left_tail: number;
  right_tail: number;
  relative_peak_height: number;
  relative_peak_area: number;
  dist_from_max_peak?: number;
}

export interface GenotypePeak extends AnnotatedPeak {
  bin: string;
  bin_id: number;
  flags: {
    below_relative_threshold: boolean;
    bleedthrough: boolean;
    crosstalk: boolean;
    artifact: boolean;
  };
  in_bin: boolean;
  probability?: number
  artifact_contribution?: number,
  artifact_error?: number
}
