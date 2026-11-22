//! Shared data types. These are the contract between the analysis modules,
//! the engine (storage + API), and the UI. Change them only with care.
//!
//! MicroSPAT analyzes *mixtures*: a sample may carry any number of alleles at
//! a locus (e.g. a polyclonal malaria infection). Nothing here assumes a
//! ploidy, and no type caps the number of alleles per locus.

use serde::{Deserialize, Serialize};

/// Dye channel color as reported by the instrument.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "lowercase")]
pub enum Color {
    Blue,
    Green,
    Yellow,
    Red,
    Orange,
}

/// Reasons a peak is rejected as a true allele during genotyping.
/// A peak with any flag set is never called as an allele.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(default)]
pub struct PeakFlags {
    /// Height relative to the tallest peak is below the project's limit.
    pub below_relative_threshold: bool,
    /// Signal is explained by another dye in the same well.
    pub bleedthrough: bool,
    /// Signal is explained by the same dye in a neighboring capillary.
    pub crosstalk: bool,
    /// Another dye reads far below its baseline here: the dyes were not
    /// separated (spectral breakdown), so this signal may belong to another dye.
    pub spectral: bool,
    /// Height is explained by artifact (stutter etc.) from other peaks.
    pub artifact: bool,
}

impl PeakFlags {
    pub fn any(&self) -> bool {
        self.below_relative_threshold
            || self.bleedthrough
            || self.crosstalk
            || self.spectral
            || self.artifact
    }
}

/// One peak in one channel (run), with every annotation the pipeline adds.
///
/// Stages fill this in progressively: scanning sets `index`, `raw_height`
/// and `area`; annotation sets `size`, `height`, `bleedthrough_ratio`,
/// `crosstalk_ratio`, `spectral_dip_ratio`, `pullup_contribution`,
/// `pullup_error`, `fallback_bleedthrough_ratio`, and `relative_height`;
/// binning sets `bin_*`; the artifact estimator sets `artifact_*`; genotyping
/// sets `flags`, `probability`, and quantification.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(default)]
pub struct Peak {
    /// Data-point index of the peak apex in the raw trace.
    pub index: usize,
    /// Fragment size in base pairs, from the well's ladder.
    pub size: f64,
    /// Height in RFU of the apex above the local baseline. Calling,
    /// thresholds and proportions use this.
    pub height: f64,
    /// Raw trace value at the apex in RFU, before baseline correction.
    /// Saturation is a property of the raw signal: judge off-scale on this.
    /// Missing from serialized peaks of older versions, where it reads as 0.
    pub raw_height: f64,
    /// Integrated area of the peak above the local baseline.
    pub area: f64,
    /// Height divided by the tallest retained peak in the same run (0..=1).
    pub relative_height: f64,
    /// Strongest other-dye signal at this position in the same well, divided
    /// by this peak's signal. Large values mean the peak is likely pull-up.
    pub bleedthrough_ratio: f64,
    /// Strongest same-dye signal in neighboring capillaries at this position,
    /// divided by this peak's signal.
    pub crosstalk_ratio: f64,
    /// Deepest other-dye signal below its own baseline at this position in
    /// the same well, divided by this peak's signal. Spectral
    /// over-subtraction under a tall peak leaves dips of a few percent of
    /// that peak; dips comparable to the signal mean the dyes were not
    /// separated here.
    pub spectral_dip_ratio: f64,
    /// Expected pull-up height (RFU) at this peak predicted from other dyes
    /// whose pull-up into this dye was measured in the plate quality report
    /// (can be negative for a spectral dip); `None` when not measured or
    /// disabled.
    pub pullup_contribution: Option<f64>,
    /// One standard deviation of `pullup_contribution` in RFU; `None` when
    /// `pullup_contribution` is `None`.
    pub pullup_error: Option<f64>,
    /// Largest bleedthrough ratio across other dyes that were not covered by
    /// measured pull-up (unmeasured dye pairs or saturated source windows).
    /// Equals `bleedthrough_ratio` when `pullup_contribution` is `None`.
    pub fallback_bleedthrough_ratio: f64,

    /// Bin (allele) this peak was assigned to, if any.
    #[cfg_attr(feature = "ts", ts(type = "number | null"))]
    pub bin_id: Option<i64>,
    pub bin_label: Option<String>,
    /// True when the peak falls inside the bin's buffer. A peak can be
    /// labeled with a nearby bin (within 2x buffer) without being `in_bin`.
    pub in_bin: bool,

    /// Expected height (RFU) contributed by artifacts of other peaks in the
    /// run, summed over every parent peak. In a mixture a peak can be both a
    /// true allele and the stutter position of several other alleles.
    pub artifact_contribution: f64,
    /// One standard deviation of `artifact_contribution`, in RFU.
    pub artifact_error: f64,

    pub flags: PeakFlags,
    /// Posterior probability that the peak is a true allele (genotyping).
    pub probability: Option<f64>,
    /// Share of the sample's called signal at this locus (0..=1).
    pub relative_quantification: Option<f64>,
    /// `relative_quantification` corrected for size-dependent amplification bias.
    pub corrected_relative_quantification: Option<f64>,
    /// Known proportion, for control mixtures in quantification-bias estimation.
    pub true_proportion: Option<f64>,
}

impl Peak {
    /// The value to compare with a saturation limit: the raw apex, or the
    /// height for a peak that carries no raw value (built by hand or stored
    /// by an older version).
    pub fn saturation_height(&self) -> f64 {
        self.raw_height.max(self.height)
    }
}

impl Default for Peak {
    fn default() -> Self {
        Peak {
            index: 0,
            size: 0.0,
            height: 0.0,
            raw_height: 0.0,
            area: 0.0,
            relative_height: 0.0,
            bleedthrough_ratio: 0.0,
            crosstalk_ratio: 0.0,
            spectral_dip_ratio: 0.0,
            pullup_contribution: None,
            pullup_error: None,
            fallback_bleedthrough_ratio: 0.0,
            bin_id: None,
            bin_label: None,
            in_bin: false,
            artifact_contribution: 0.0,
            artifact_error: 0.0,
            flags: PeakFlags::default(),
            probability: None,
            relative_quantification: None,
            corrected_relative_quantification: None,
            true_proportion: None,
        }
    }
}

/// An allele bin: the size window in which peaks are called as one allele.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct Bin {
    /// Database id; 0 until persisted.
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub id: i64,
    /// Allele name, by default the rounded base size.
    pub label: String,
    /// Bin center in base pairs.
    pub base_size: f64,
    /// Half-width in base pairs. Peaks within `base_size ± bin_buffer` are in the bin.
    pub bin_buffer: f64,
    /// Number of peaks that supported this bin when it was estimated.
    pub peak_count: u32,
}

/// A locus (microsatellite marker) as needed by the analysis code.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct LocusInfo {
    pub label: String,
    pub min_base_length: f64,
    pub max_base_length: f64,
    pub nucleotide_repeat_length: f64,
    pub color: Color,
}
