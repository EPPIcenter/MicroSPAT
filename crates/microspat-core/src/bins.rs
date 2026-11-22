//! Allele bins: estimating them from pooled peak sizes, and assigning a run's
//! peaks to them.
//!
//! **Estimation.** Peak sizes pooled across many runs of a locus are clustered
//! by one-dimensional mean shift with bandwidth half the repeat length (see
//! [`crate::stats::mean_shift`]). Each cluster supported by at least
//! `min_peak_frequency` peaks becomes a bin centered on the members' median,
//! labelled by that center rounded to a whole base pair, with the default
//! buffer (or, if the default is 0, the members' standard deviation, at least
//! [`MIN_SD_BIN_BUFFER`]).
//!
//! **Annotation.** A peak within `bin_buffer` of a bin center is `in_bin`; a peak
//! within `2 * bin_buffer` carries the bin's id and label but is not `in_bin`
//! (the UI shows it as "near" the bin, genotyping does not call it). Each bin is
//! claimed by at most one peak per run. Peaks claim bins tallest first, and a
//! peak takes the best unclaimed bin whose 2x window contains it: one it is
//! inside the buffer of before one it is merely near, then the nearest center.
//! This works for any user-edited bin set, including overlapping bins.

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::stats::{self, MeanShift, Seeding, StatsError};
use crate::types::{Bin, Peak};

/// Errors from bin estimation.
#[derive(Debug, Error, Clone, PartialEq)]
pub enum BinError {
    /// The locus repeat length is zero, negative or not finite.
    #[error("nucleotide repeat length must be positive, got {0}")]
    InvalidRepeatLength(f64),
    /// A numerical routine rejected its input.
    #[error(transparent)]
    Stats(#[from] StatsError),
}

/// Bin estimation settings (old `BinEstimatorLocusParams`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(default)]
pub struct BinParams {
    /// Minimum number of peaks in a cluster before it becomes a bin.
    pub min_peak_frequency: u32,
    /// Half-width given to new bins, in bp. 0 means "use the cluster's SD".
    pub default_bin_buffer: f64,
}

impl Default for BinParams {
    fn default() -> Self {
        BinParams {
            min_peak_frequency: 10,
            default_bin_buffer: 0.75,
        }
    }
}

/// Smallest buffer (bp) a bin gets from its cluster's SD when
/// `default_bin_buffer` is 0. A cluster of identical sizes has SD 0, and a
/// zero-width bin matches no peak, not even one exactly at its center
/// (annotation skips such bins). 0.05 bp is below the spread of any real
/// cluster, so only degenerate clusters are affected.
pub const MIN_SD_BIN_BUFFER: f64 = 0.05;

/// Estimates bins from the sizes (bp) of peaks pooled over many runs of one
/// locus. Bins come back sorted by size, with `id` 0 (not yet persisted).
pub fn estimate_bins(
    peak_sizes: &[f64],
    nucleotide_repeat_length: f64,
    params: &BinParams,
) -> Result<Vec<Bin>, BinError> {
    if !(nucleotide_repeat_length.is_finite() && nucleotide_repeat_length > 0.0) {
        return Err(BinError::InvalidRepeatLength(nucleotide_repeat_length));
    }
    let clusters = stats::mean_shift(
        peak_sizes,
        &MeanShift {
            bandwidth: nucleotide_repeat_length / 2.0,
            seeding: Seeding::AllPoints,
            cluster_all: false,
        },
    )?;
    let mut bins: Vec<Bin> = clusters
        .into_iter()
        .filter(|c| c.members.len() as u64 >= u64::from(params.min_peak_frequency))
        .map(|c| Bin {
            id: 0,
            label: default_label(c.center),
            base_size: c.center,
            bin_buffer: if params.default_bin_buffer > 0.0 {
                params.default_bin_buffer
            } else {
                c.sd.max(MIN_SD_BIN_BUFFER)
            },
            peak_count: c.members.len() as u32,
        })
        .collect();
    bins.sort_by(|a, b| a.base_size.total_cmp(&b.base_size));
    Ok(bins)
}

/// Default allele name for a bin: its center rounded to whole bp (half to even,
/// as Python's `round` did).
pub fn default_label(base_size: f64) -> String {
    format!("{}", base_size.round_ties_even() as i64)
}

/// Assigns each peak of one run to at most one bin, and each bin to at most one
/// peak; sets `bin_id`, `bin_label` and `in_bin`, clearing any earlier values.
pub fn annotate_bins(peaks: &mut [Peak], bins: &[Bin]) {
    for p in peaks.iter_mut() {
        p.bin_id = None;
        p.bin_label = None;
        p.in_bin = false;
    }
    let usable: Vec<&Bin> = bins
        .iter()
        .filter(|b| b.base_size.is_finite() && b.bin_buffer.is_finite() && b.bin_buffer > 0.0)
        .collect();
    let mut claimed = vec![false; usable.len()];

    let mut order: Vec<usize> = (0..peaks.len())
        .filter(|&i| peaks[i].size.is_finite())
        .collect();
    order.sort_by(|&a, &b| {
        let (pa, pb) = (&peaks[a], &peaks[b]);
        pb.height
            .total_cmp(&pa.height)
            .then(pa.size.total_cmp(&pb.size))
            .then(pa.index.cmp(&pb.index))
    });

    for i in order {
        let size = peaks[i].size;
        let best = usable
            .iter()
            .enumerate()
            .filter(|(k, b)| !claimed[*k] && (size - b.base_size).abs() <= 2.0 * b.bin_buffer)
            .min_by(|(_, a), (_, b)| {
                let (da, db) = ((size - a.base_size).abs(), (size - b.base_size).abs());
                let (outa, outb) = (da > a.bin_buffer, db > b.bin_buffer);
                outa.cmp(&outb)
                    .then(da.total_cmp(&db))
                    .then(a.base_size.total_cmp(&b.base_size))
            });
        if let Some((k, b)) = best {
            claimed[k] = true;
            let p = &mut peaks[i];
            p.bin_id = Some(b.id);
            p.bin_label = Some(b.label.clone());
            p.in_bin = (size - b.base_size).abs() <= b.bin_buffer;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    fn bin(id: i64, base: f64, buffer: f64) -> Bin {
        Bin {
            id,
            label: default_label(base),
            base_size: base,
            bin_buffer: buffer,
            peak_count: 0,
        }
    }

    fn peak(index: usize, size: f64, height: f64) -> Peak {
        Peak {
            index,
            size,
            height,
            ..Peak::default()
        }
    }

    #[test]
    fn estimates_one_bin_per_allele_cluster() {
        let mut sizes = Vec::new();
        for i in 0..12 {
            sizes.push(150.0 + 0.05 * i as f64);
            sizes.push(153.1 + 0.04 * i as f64);
        }
        // Too few to make a bin at the default min frequency of 10.
        sizes.extend([159.0, 159.1, 159.2]);
        let bins = estimate_bins(&sizes, 3.0, &BinParams::default()).unwrap();
        assert_eq!(bins.len(), 2);
        assert_relative_eq!(bins[0].base_size, 150.275, epsilon = 1e-9);
        assert_eq!(bins[0].label, "150");
        assert_eq!(bins[0].peak_count, 12);
        assert_eq!(bins[0].bin_buffer, 0.75);
        assert_relative_eq!(bins[1].base_size, 153.32, epsilon = 1e-9);
        assert_eq!(bins[1].label, "153");

        let loose = BinParams {
            min_peak_frequency: 3,
            default_bin_buffer: 0.0,
        };
        let bins = estimate_bins(&sizes, 3.0, &loose).unwrap();
        assert_eq!(bins.len(), 3);
        // Buffer 0 falls back to the cluster SD.
        assert_relative_eq!(
            bins[2].bin_buffer,
            crate::stats::std_dev(&[159.0, 159.1, 159.2])
        );
        assert!(estimate_bins(&sizes, 0.0, &loose).is_err());
    }

    /// With buffer 0 (use the SD), a cluster of identical sizes used to make
    /// a zero-width bin that matched nothing, not even a peak at its center.
    #[test]
    fn identical_cluster_gets_a_usable_bin() {
        let sizes = vec![150.0; 12];
        let params = BinParams {
            min_peak_frequency: 10,
            default_bin_buffer: 0.0,
        };
        let bins = estimate_bins(&sizes, 3.0, &params).unwrap();
        assert_eq!(bins.len(), 1);
        assert_eq!(bins[0].bin_buffer, MIN_SD_BIN_BUFFER);
        let mut peaks = vec![peak(0, 150.0, 1000.0)];
        annotate_bins(&mut peaks, &bins);
        assert_eq!((peaks[0].bin_id, peaks[0].in_bin), (Some(0), true));
    }

    #[test]
    fn labels_round_half_to_even() {
        assert_eq!(default_label(100.5), "100");
        assert_eq!(default_label(101.5), "102");
        assert_eq!(default_label(101.49), "101");
    }

    #[test]
    fn in_bin_near_bin_and_unbinned() {
        let bins = [bin(1, 100.0, 0.5), bin(2, 103.0, 0.5), bin(3, 106.0, 0.5)];
        let mut peaks = vec![
            peak(0, 100.3, 1000.0),
            peak(1, 103.8, 900.0),
            peak(2, 107.2, 800.0),
        ];
        annotate_bins(&mut peaks, &bins);
        assert_eq!((peaks[0].bin_id, peaks[0].in_bin), (Some(1), true));
        assert_eq!(peaks[0].bin_label.as_deref(), Some("100"));
        assert_eq!((peaks[1].bin_id, peaks[1].in_bin), (Some(2), false));
        assert_eq!((peaks[2].bin_id, peaks[2].in_bin), (None, false));
    }

    #[test]
    fn tallest_peak_claims_a_contested_bin() {
        // The old code let the *shortest* peak claim first, so a shoulder could
        // steal the allele's bin from the true peak.
        let bins = [bin(7, 200.0, 0.5)];
        let mut peaks = vec![peak(0, 200.05, 50.0), peak(1, 200.4, 3000.0)];
        annotate_bins(&mut peaks, &bins);
        assert_eq!(peaks[1].bin_id, Some(7));
        assert!(peaks[1].in_bin);
        assert_eq!(peaks[0].bin_id, None);
    }

    #[test]
    fn overlapping_user_bins() {
        // Wide bin A contains the peak; narrow bin B has the nearer center but
        // its 2x window does not reach the peak. The old code popped the nearest
        // center, found it out of range, and gave up.
        let bins = [bin(1, 100.0, 1.5), bin(2, 101.6, 0.2)];
        let mut peaks = vec![peak(0, 101.0, 500.0)];
        annotate_bins(&mut peaks, &bins);
        assert_eq!(peaks[0].bin_id, Some(1));
        assert!(peaks[0].in_bin);

        // Being inside a buffer beats being merely near a closer center.
        let bins = [bin(1, 100.0, 1.5), bin(2, 101.4, 0.3)];
        annotate_bins(&mut peaks, &bins);
        assert_eq!((peaks[0].bin_id, peaks[0].in_bin), (Some(1), true));

        // Two peaks inside two overlapping bins each get one.
        let bins = [bin(1, 100.0, 1.0), bin(2, 100.6, 1.0)];
        let mut peaks = vec![peak(0, 100.1, 900.0), peak(1, 100.5, 800.0)];
        annotate_bins(&mut peaks, &bins);
        assert_eq!(peaks[0].bin_id, Some(1));
        assert_eq!(peaks[1].bin_id, Some(2));
        assert!(peaks[1].in_bin);
    }

    #[test]
    fn reannotation_clears_old_assignments() {
        let mut peaks = vec![peak(0, 100.0, 10.0)];
        annotate_bins(&mut peaks, &[bin(1, 100.0, 0.5)]);
        assert_eq!(peaks[0].bin_id, Some(1));
        annotate_bins(&mut peaks, &[]);
        assert_eq!(peaks[0].bin_id, None);
        assert_eq!(peaks[0].bin_label, None);
    }
}
