//! Plate quality: measurements of each well (capillary) and of the plate as
//! a whole, and the issues a lab should hear about when a plate is imported.
//!
//! # Method
//!
//! Every measurement works on raw traces, above the baseline
//! ([`crate::signal::baseline`]), inside the well's sized range (between its
//! outermost matched ladder peaks; after the ladder's `min_time` when the
//! well has no fit).
//!
//! **Per well.** The ladder height is the median height of the matched
//! ladder peaks (of the tallest candidates when the fit failed), and the
//! ladder fade the median height of the last third of the matched peaks
//! over the first third. The plate error is the ladder's worst disagreement
//! with the plate's other wells ([`LadderPrior::plate_error_of`]). Per dye:
//! the noise SD (1.4826 × the median absolute first difference over √2,
//! which peaks and drift barely move), the baseline level (median),
//! off-scale scans (those the file marks off-scale where this dye carries
//! the largest raw value), and the strongest signal.
//!
//! **Spectral separation.** The well's tall sample-dye peaks (at least
//! [`TALL_PEAK_RFU`], no off-scale point within [`SATURATION_GUARD`]
//! points) are counted once where several dyes peak at one point. A point
//! is at a breakdown by the rule calls use
//! ([`genotyping::spectral_breakdown`]: another dye dips below its baseline
//! by more than a quarter of the largest signal there, and by at least
//! 150 RFU), and has a copy when another dye carries [`COPY_MIN_RATIO`] to
//! [`COPY_MAX_RATIO`] times its signal there. Copies alone are common in
//! healthy capillaries (loci of two dyes at one size), breakdowns are not.
//! Independently of the sample, the ladder dye's pull-up into each other
//! dye (median over the capillary's ladder peaks) is compared with the
//! plate's typical capillary: a capillary whose spectral calibration is off
//! leaks the ladder differently, also on a plate where none of its sample
//! peaks happen to fall in the affected dye. A capillary has unseparated
//! dyes when either is a pattern ([`UNSEPARATED_MIN_PEAKS`],
//! [`SPECTRAL_DEVIATION_LIMIT`]).
//!
//! **Pull-up.** For each ordered pair of dyes, every tall unsaturated
//! source peak (at least [`LEAK_SOURCE_RFU`], no other dye above half its
//! signal) of the plate's capillaries that show no sign of unseparated
//! dyes ([`POOL_DEVIATION_LIMIT`]) gives the target dye's signed
//! signal at the same points over the source's ([`peaks::RATIO_HALF_WINDOW`]
//! window sums). Most sources have no real peak under them in the target,
//! so the leak is the center of the densest half of these ratios
//! ([`stats::densest_half`], as stutter classes are fitted), and its spread
//! is the half's normal-consistent width. Dips come out as negative
//! fractions.
//!
//! **Crosstalk.** The same for the same dye in the capillaries 1, 2 and 3
//! positions away, at the source's data points, from tall sample-dye
//! peaks ([`CROSSTALK_SOURCE_RFU`]); sources with an off-scale point are
//! estimated separately. Ladder peaks are not sources: every capillary has
//! its own ladder peak at nearly the same point.
//!
//! **Negative controls** (once a plate map assigns them): the tallest peak
//! above the calling height limit inside each locus range of a well whose
//! sample is a negative control, and whether crosstalk from a neighboring
//! capillary or pull-up from another dye explains it using the calling rules
//! (a neighbor within [`CONTROL_NEIGHBOR_DISTANCE`] capillaries at least 30
//! times taller there, the plate's measured pull-up into that dye, or the
//! fallback bleedthrough limit of 5 when pull-up was not measured or the
//! capillary has unseparated dyes).
//!
//! **Issues** turn these into a short list ([`derive_issues`]), each with
//! a severity, the wells it affects, the numbers behind it and what to do.
//! The thresholds were set on a mixture-control experiment run on 36
//! plates, and 12 plates of an older study, over four 3730 instruments,
//! with margins; each constant states the measurement behind it.

use crate::genotyping::{self, GenotypingParams};
use crate::ladder::{self, LadderPrior, LadderSpec};
use crate::peaks::{self, Corrected, DyePullUp, FilterParams, RunSignals, ScanParams, SATURATION};
use crate::plate::{self, PlateSize, Well};
use crate::stats::{self, MAD_SCALE};
use crate::types::{Color, Peak};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Version of how the report is measured. Reports of an older version are
/// recomputed when asked to.
pub const QUALITY_VERSION: u32 = 1;

/// Smallest height (RFU above baseline) of a peak whose other-dye signal is
/// judged for spectral separation. The breakdown rule needs a dip of
/// 150 RFU at a quarter of the signal, so shorter peaks cannot show one.
pub const TALL_PEAK_RFU: f64 = 600.0;

/// Maxima of different dyes at most this many points apart are one fragment.
pub const SAME_POINT: usize = 3;

/// Points on each side of a peak that must hold no off-scale scan for it to
/// count as unsaturated: under a clipped peak the other dyes of a 3730 read
/// up to half the clip level, which is neither pull-up nor a breakdown.
pub const SATURATION_GUARD: usize = 3;

/// Another dye's signal of at least this many times a tall peak's, at the
/// same point, makes it a copy: in capillaries with unseparated dyes the
/// copy stands at 0.5 to 2 times its source (1.09 typical), while pull-up
/// is a few percent of it and never above a fifth on the instruments
/// measured.
pub const COPY_MIN_RATIO: f64 = 0.5;
/// See [`COPY_MIN_RATIO`]: a peak more than this many times smaller than
/// the other dye's signal is that dye's pull-up, not a copy.
pub const COPY_MAX_RATIO: f64 = 2.0;

/// A capillary has unseparated dyes when at least this many of its tall
/// sample-dye peaks sit at a spectral breakdown. On 4,600 capillary runs
/// of healthy capillaries over four instruments none had more than one
/// (one in 40 had one: two loci of different dyes at one size, or a peak
/// next to an off-scale one); capillaries with unseparated dyes had two to
/// nine on most plates. Two is the smallest count that is a pattern rather
/// than one peak.
pub const UNSEPARATED_MIN_PEAKS: u32 = 2;

/// A capillary also has unseparated dyes when its ladder's pull-up into
/// another dye differs from the plate's typical capillary by more than
/// this fraction of the ladder signal. Healthy capillaries stayed within
/// 1.6% on 95 in 100 capillary runs and within 2.7% on all 4,150; those
/// with unseparated dyes differed by 2 to 15% (4.3% median) on every
/// plate, also where none of their sample peaks showed a breakdown.
pub const SPECTRAL_DEVIATION_LIMIT: f64 = 0.03;

/// Capillaries whose ladder pull-up differs from the plate's typical one
/// by more than this (or with any breakdown) are left out of the plate's
/// pull-up estimate. It is stricter than [`SPECTRAL_DEVIATION_LIMIT`]: it
/// leaves out 1 in 30 healthy capillaries, which costs the estimate little,
/// and keeps out capillaries with unseparated dyes that fall short of that
/// limit on a plate (2.0 to 3.0% on some).
pub const POOL_DEVIATION_LIMIT: f64 = 0.02;

/// Smallest source peak (RFU above baseline) for pull-up: a 1% leak is then
/// 20 RFU, twice the noise SD of a 3730 trace, and the three-point window
/// sums average noise down further.
pub const LEAK_SOURCE_RFU: f64 = 2000.0;

/// Smallest source peak (RFU above baseline) for crosstalk, which is about
/// 1% at the next capillary: 3,000 RFU gives a 30 RFU leak.
pub const CROSSTALK_SOURCE_RFU: f64 = 3000.0;

/// Capillaries away from a source that crosstalk is measured at.
pub const CROSSTALK_DISTANCES: [u32; 3] = [1, 2, 3];

/// Fewest ladder peaks a capillary's own ladder pull-up needs.
pub const MIN_LADDER_LEAK_PEAKS: usize = 8;

/// Fewest source peaks a leak estimate needs; with fewer it is not reported.
pub const MIN_LEAK_PEAKS: u32 = 20;

/// Pull-up above this fraction of the source is a warning: typical 3730
/// pull-up is 1 to 4% of the other dye, and the highest seen on a working
/// instrument 14%.
pub const PULL_UP_WARNING: f64 = 0.08;

/// Pull-up above this fraction is a problem: the default fallback bleedthrough
/// limit (5) flags an unmeasured pair only when the other dye is at least five
/// times taller, and even with measured plate pull-up a leak above a fifth
/// points to a stale spectral calibration and hides minor alleles.
pub const PULL_UP_PROBLEM: f64 = 0.2;

/// Crosstalk to the next capillaries above this fraction is a warning.
/// Plates of four 3730 instruments measured 0.7 to 2.5% at the next
/// capillary (1.4% median), 0.5 to 1.9% two away and 0.3 to 1.5% three
/// away; this is above the highest with a margin.
pub const CROSSTALK_WARNING: f64 = 0.0275;

/// Crosstalk above this fraction is a problem: the default crosstalk limit
/// (30) flags a peak only when a neighbor within 2 capillaries is at least
/// 30 times taller, so leaks above 1/30 pass as peaks.
pub const CROSSTALK_PROBLEM: f64 = 1.0 / 30.0;

/// Crosstalk next to a saturated peak above this fraction is a warning;
/// typical is 2.5 to 3%.
pub const CROSSTALK_SATURATED_WARNING: f64 = 0.05;

/// Crosstalk next to a saturated peak above this fraction is a problem:
/// the default off-scale rule explains a peak next to a clipped neighbor
/// only when the neighbor is at least 10 times taller.
pub const CROSSTALK_SATURATED_PROBLEM: f64 = 0.1;

/// A well's ladder below this fraction of the plate's median ladder height
/// is low. Ladder heights of one plate's working wells stay within about a
/// factor of three of their median.
pub const LOW_LADDER_FRACTION: f64 = 0.25;

/// A well whose strongest sample-dye signal stays under this (RFU) has no
/// usable sample signal: it is the default failure threshold of a run.
pub const WEAK_SIGNAL_RFU: f64 = 500.0;

/// A plate with at least this share of weak wells (low ladder and no
/// sample signal) had a weak or failed injection rather than a few failed
/// reactions.
pub const WEAK_PLATE_FRACTION: f64 = 0.1;

/// A dye whose noise SD exceeds this many times the plate's median for that
/// dye is noisy. Noise SD of one dye varies within a plate by well under a
/// factor of two.
pub const NOISY_FACTOR: f64 = 2.5;

/// A ladder whose last third of matched peaks reaches less than this share
/// of its first third's height fades along the run.
pub const LADDER_FADE_LIMIT: f64 = 0.2;

/// Share of wells with off-scale sample signal from which the plate's
/// saturation is reported, as information: off-scale peaks are handled by
/// the calling rules, and on real plates calls in off-scale wells (outside
/// capillaries with unseparated dyes) were false at 3.1% against 2.8%
/// elsewhere, so it is not a warning.
pub const SATURATION_INFO_FRACTION: f64 = 0.25;

/// Capillaries on each side searched for the source of a negative
/// control's peak: the calling pipeline's crosstalk reach (leak from 3
/// away is about 0.4%, under the calling limit even from a clipped peak).
pub const CONTROL_NEIGHBOR_DISTANCE: usize = 2;

/// Severity of an issue.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info,
    Warning,
    Problem,
}

/// What an issue is about.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "snake_case")]
pub enum IssueKind {
    UnseparatedDyes,
    PullUp,
    Crosstalk,
    WeakInjection,
    LadderDisagreement,
    LadderFading,
    NoisyCapillaries,
    Saturation,
    NegativeControlSignal,
}

/// A number behind an issue.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct IssueValue {
    pub label: String,
    pub value: f64,
    /// `percent` (a fraction shown as a percentage), `rfu`, `bp`, `count`.
    pub unit: String,
    /// The well it belongs to, when it is a well's own number.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub well: Option<String>,
}

/// One thing a lab should hear about the plate.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct Issue {
    pub kind: IssueKind,
    pub severity: Severity,
    /// A few words, sentence case.
    pub title: String,
    /// What was seen and what to do, in one or two sentences.
    pub message: String,
    /// Wells affected (labels), in capillary order.
    pub wells: Vec<String>,
    pub values: Vec<IssueValue>,
}

/// Something about one well that stands out against its plate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "snake_case")]
pub enum WellFlag {
    UnseparatedDyes,
    LowLadder,
    WeakInjection,
    LadderDisagrees,
    LadderFading,
    Noisy,
    Offscale,
    NegativeControlSignal,
}

/// Measurements of one dye of a well.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct DyeQuality {
    pub color: Color,
    /// Noise SD (RFU).
    pub noise_sd: f64,
    /// Median baseline level (RFU, raw scale).
    pub baseline: f64,
    /// Off-scale scans where this dye carries the largest raw value.
    pub offscale_points: u32,
    /// Strongest signal above baseline (RFU).
    pub max_signal: f64,
    /// Tall unsaturated peaks judged for spectral separation.
    pub tall_peaks: u32,
    /// Of those, peaks at a spectral breakdown.
    pub breakdown_peaks: u32,
    /// Of those, peaks with a copy of comparable height in another dye.
    pub copy_peaks: u32,
}

/// Pull-up from a well's ladder dye into one other dye.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct DyeLeak {
    pub target: Color,
    pub fraction: f64,
}

/// Measurements of one well (capillary).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct WellQuality {
    /// Well label, e.g. `A01`.
    pub well: String,
    /// Capillary (1–96) it ran in.
    #[cfg_attr(feature = "ts", ts(type = "number | null"))]
    pub capillary: Option<u32>,
    /// Sizing quality (bp); null when the ladder could not be fitted.
    pub sizing_quality: Option<f64>,
    /// Largest disagreement (bp) of the ladder with the plate's other wells.
    pub plate_error: Option<f64>,
    /// Median height (RFU) of the matched ladder peaks.
    pub ladder_height: Option<f64>,
    /// Median height of the last third of matched ladder peaks over the first third.
    pub ladder_fade: Option<f64>,
    /// Strongest sample-dye signal (RFU above baseline) in the sized range.
    pub signal: Option<f64>,
    /// Off-scale scans in sample dyes.
    pub offscale_points: u32,
    pub dyes: Vec<DyeQuality>,
    /// Tall unsaturated peaks of the sample dyes, counted once where
    /// several dyes peak at the same point.
    pub tall_peaks: u32,
    /// Of those, points at a spectral breakdown.
    pub breakdowns: u32,
    /// Of those, points with a copy of comparable height in another dye.
    pub copies: u32,
    /// `breakdowns / tall_peaks`; null without tall peaks.
    pub breakdown_fraction: Option<f64>,
    /// The ladder dye's pull-up into each other dye in this capillary
    /// (median over its ladder peaks).
    pub ladder_leaks: Vec<DyeLeak>,
    /// Largest difference (fraction of the ladder signal) between this
    /// capillary's ladder pull-up and the plate's typical capillary: a
    /// capillary whose spectral calibration differs from its plate's.
    pub spectral_deviation: Option<f64>,
    /// What stands out against the plate.
    pub flags: Vec<WellFlag>,
}

/// Leak between two dyes over the plate.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct LeakEstimate {
    pub source: Color,
    pub target: Color,
    /// Fraction of the source signal seen in the target (negative: a dip);
    /// null with fewer than [`MIN_LEAK_PEAKS`] sources.
    pub fraction: Option<f64>,
    /// Normal-consistent spread of the single-peak fractions.
    pub spread: Option<f64>,
    /// Source peaks it rests on.
    pub peaks: u32,
}

/// Crosstalk at one capillary distance over the plate.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct CrosstalkEstimate {
    pub distance: u32,
    /// From sources with an off-scale point.
    pub saturated: bool,
    pub fraction: Option<f64>,
    pub spread: Option<f64>,
    pub peaks: u32,
}

/// What explains a peak in a negative control.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "snake_case")]
pub enum ControlExplanation {
    Crosstalk,
    PullUp,
}

/// The tallest peak above the calling height limit in a negative control at one locus.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct ControlSignal {
    pub well: String,
    pub locus: String,
    pub sample: String,
    pub color: Color,
    /// Size (bp) and height (RFU above baseline) of the tallest peak.
    pub size: f64,
    pub height: f64,
    /// Peaks above the limit inside the locus range.
    pub peaks: u32,
    /// Null when neither crosstalk nor pull-up explains it.
    pub explained_by: Option<ControlExplanation>,
}

/// The values the default calling limits assume, so a report can show
/// when an instrument is outside them.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(default)]
pub struct QualityLimits {
    pub pull_up_warning: f64,
    pub pull_up_problem: f64,
    pub crosstalk_warning: f64,
    pub crosstalk_problem: f64,
    pub crosstalk_saturated_warning: f64,
    pub crosstalk_saturated_problem: f64,
    /// Per-well limits ([`LOW_LADDER_FRACTION`] and the others), so a
    /// view that colors wells by a measure marks the same wells.
    pub low_ladder_fraction: f64,
    pub weak_signal_rfu: f64,
    pub noisy_factor: f64,
    pub unseparated_min_peaks: u32,
    pub spectral_deviation_limit: f64,
    pub ladder_fade_limit: f64,
    pub weak_plate_fraction: f64,
    pub saturation_info_fraction: f64,
    pub control_height_limit: f64,
}

impl Default for QualityLimits {
    fn default() -> Self {
        QualityLimits {
            pull_up_warning: PULL_UP_WARNING,
            pull_up_problem: PULL_UP_PROBLEM,
            crosstalk_warning: CROSSTALK_WARNING,
            crosstalk_problem: CROSSTALK_PROBLEM,
            crosstalk_saturated_warning: CROSSTALK_SATURATED_WARNING,
            crosstalk_saturated_problem: CROSSTALK_SATURATED_PROBLEM,
            low_ladder_fraction: LOW_LADDER_FRACTION,
            weak_signal_rfu: WEAK_SIGNAL_RFU,
            noisy_factor: NOISY_FACTOR,
            unseparated_min_peaks: UNSEPARATED_MIN_PEAKS,
            spectral_deviation_limit: SPECTRAL_DEVIATION_LIMIT,
            ladder_fade_limit: LADDER_FADE_LIMIT,
            weak_plate_fraction: WEAK_PLATE_FRACTION,
            saturation_info_fraction: SATURATION_INFO_FRACTION,
            control_height_limit: control_height_limit(),
        }
    }
}

impl QualityLimits {
    /// Checks all user-editable thresholds before storing in workspace settings.
    pub fn validate(&self) -> std::result::Result<(), String> {
        for (name, v) in [
            ("Pull-up warning", self.pull_up_warning),
            ("Pull-up problem", self.pull_up_problem),
            ("Crosstalk warning", self.crosstalk_warning),
            ("Crosstalk problem", self.crosstalk_problem),
            (
                "Off-scale crosstalk warning",
                self.crosstalk_saturated_warning,
            ),
            (
                "Off-scale crosstalk problem",
                self.crosstalk_saturated_problem,
            ),
            ("Low ladder fraction", self.low_ladder_fraction),
            ("Weak plate fraction", self.weak_plate_fraction),
            ("Ladder fade limit", self.ladder_fade_limit),
            ("Off-scale plate fraction", self.saturation_info_fraction),
            ("Spectral deviation limit", self.spectral_deviation_limit),
        ] {
            if !(v.is_finite() && v > 0.0 && v <= 1.0) {
                return Err(format!("{name} must be between 0% and 100%."));
            }
        }
        if self.pull_up_problem < self.pull_up_warning {
            return Err("Pull-up problem limit must be at least the warning limit.".into());
        }
        if self.crosstalk_problem < self.crosstalk_warning {
            return Err("Crosstalk problem limit must be at least the warning limit.".into());
        }
        if self.crosstalk_saturated_problem < self.crosstalk_saturated_warning {
            return Err(
                "Off-scale crosstalk problem limit must be at least the warning limit.".into(),
            );
        }
        if !(self.weak_signal_rfu.is_finite() && (0.0..=100_000.0).contains(&self.weak_signal_rfu))
        {
            return Err("Weak sample signal limit must be between 0 and 100,000 RFU.".into());
        }
        if !(self.noisy_factor.is_finite() && self.noisy_factor > 1.0 && self.noisy_factor <= 20.0)
        {
            return Err("Noisy capillary multiplier must be between 1 and 20.".into());
        }
        if !(1..=50).contains(&self.unseparated_min_peaks) {
            return Err("Min breakdown peaks must be between 1 and 50.".into());
        }
        if !(self.control_height_limit.is_finite()
            && (10.0..=100_000.0).contains(&self.control_height_limit))
        {
            return Err("Negative-control peak limit must be between 10 and 100,000 RFU.".into());
        }
        Ok(())
    }
}

/// The quality report of a plate.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct PlateQuality {
    /// [`QUALITY_VERSION`] it was measured with.
    pub version: u32,
    /// Wells in capillary order.
    pub wells: Vec<WellQuality>,
    /// Plate median ladder height (RFU).
    pub ladder_height: Option<f64>,
    /// Every ordered pair of the plate's dyes.
    pub pull_up: Vec<LeakEstimate>,
    pub crosstalk: Vec<CrosstalkEstimate>,
    /// Negative-control peaks; empty without a plate map.
    pub controls: Vec<ControlSignal>,
    /// True once negative controls were checked against a plate map.
    pub controls_checked: bool,
    /// Worst first.
    pub issues: Vec<Issue>,
    pub limits: QualityLimits,
}

impl PlateQuality {
    /// Measured pull-up rates from other dyes targeting `target`.
    pub fn pull_up_for(&self, target: Color) -> DyePullUp {
        let sources = self
            .pull_up
            .iter()
            .filter(|l| l.target == target)
            .filter_map(|l| Some((l.source, l.fraction?, l.spread?)))
            .collect();
        DyePullUp { sources }
    }

    /// True when `well` carries [`WellFlag::UnseparatedDyes`].
    pub fn is_unseparated(&self, well: &str) -> bool {
        self.wells
            .iter()
            .any(|w| w.well == well && w.flags.contains(&WellFlag::UnseparatedDyes))
    }
}

/// A well's stored ladder fit.
#[derive(Debug, Clone, Copy)]
pub struct WellLadder<'a> {
    pub peak_indices: &'a [usize],
    pub peak_sizes: &'a [f64],
    pub sizing_quality: f64,
    /// Usable and unambiguous: may stand for the plate's consensus.
    pub reference: bool,
}

/// What [`measure_well`] needs of one well.
#[derive(Debug, Clone)]
pub struct WellInput<'a> {
    pub well: Well,
    /// Every dye channel, in dye order.
    pub dyes: Vec<(Color, &'a [i16])>,
    /// None when the ladder could not be fitted.
    pub ladder: Option<WellLadder<'a>>,
    /// Off-scale scans recorded in the file.
    pub offscale_indices: &'a [usize],
}

/// A well's dye traces, in dye order.
pub type WellDyes<'a> = &'a [(Color, &'a [i16])];

/// A tall sample-dye peak that crosstalk is measured from.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SourcePeak {
    pub color: Color,
    pub index: usize,
    /// Window sum of the source above its baseline.
    pub signal: f64,
    pub saturated: bool,
}

/// One source's leak into another dye.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LeakSample {
    pub source: Color,
    pub target: Color,
    pub fraction: f64,
}

/// One source's leak into a capillary `distance` away.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CrosstalkSample {
    pub distance: u32,
    pub saturated: bool,
    pub fraction: f64,
}

/// Everything measured on one well, before the plate is summarized.
#[derive(Debug, Clone)]
pub struct WellMeasurement {
    pub quality: WellQuality,
    /// Matched ladder peaks, to measure the plate error.
    pub ladder: Option<(Vec<usize>, Vec<f64>, bool)>,
    pub leaks: Vec<LeakSample>,
    pub sources: Vec<SourcePeak>,
}

/// Points measured: the sized range, or after `min_time` without a fit.
fn measured_range(input: &WellInput<'_>, spec: &LadderSpec) -> Option<(usize, usize)> {
    let len = input.dyes.iter().map(|(_, t)| t.len()).min()?;
    if len < 2 {
        return None;
    }
    let (lo, hi) = match input.ladder {
        Some(l) if l.peak_indices.len() >= 2 => {
            (l.peak_indices[0], l.peak_indices[l.peak_indices.len() - 1])
        }
        _ => (spec.min_time, len - 1),
    };
    let hi = hi.min(len - 1);
    (lo + 2 <= hi).then_some((lo, hi))
}

/// Noise SD from the median absolute first difference: peaks and drift
/// occupy few differences, so they barely move it.
fn noise_sd(trace: &[i16]) -> f64 {
    let mut d: Vec<i32> = trace
        .windows(2)
        .map(|w| (i32::from(w[1]) - i32::from(w[0])).abs())
        .collect();
    if d.is_empty() {
        return 0.0;
    }
    let m = d.len() / 2;
    let (_, v, _) = d.select_nth_unstable(m);
    f64::from(*v) * MAD_SCALE / std::f64::consts::SQRT_2
}

fn median(v: &[f64]) -> Option<f64> {
    stats::median(v)
}

/// Local maxima of the corrected trace in `lo..=hi` at least `min` above
/// baseline, the tallest point within ±5 points (first on ties).
fn tall_maxima(c: &Corrected<'_>, lo: usize, hi: usize, min: f64) -> Vec<(usize, f64)> {
    const HALF: usize = 5;
    let mut out = Vec::new();
    let mut i = lo;
    while i <= hi {
        let h = c.above(i);
        if h >= min {
            let a = i.saturating_sub(HALF).max(lo);
            let b = (i + HALF).min(hi);
            let best = (a..=b).fold(
                a,
                |best, j| if c.above(j) > c.above(best) { j } else { best },
            );
            if best == i {
                out.push((i, h));
                i += HALF;
            }
        }
        i += 1;
    }
    out
}

/// Measures one well: ladder, signal, noise, off-scale, spectral separation,
/// and the leak samples and crosstalk sources the plate summary pools.
pub fn measure_well(input: &WellInput<'_>, spec: &LadderSpec, size: PlateSize) -> WellMeasurement {
    let capillary = plate::capillary(input.well, size).map(|c| c.1);
    let ladder_stored = input
        .ladder
        .map(|l| (l.peak_indices.to_vec(), l.peak_sizes.to_vec(), l.reference));
    let mut q = WellQuality {
        well: input.well.label(),
        capillary,
        sizing_quality: input.ladder.map(|l| l.sizing_quality),
        plate_error: None,
        ladder_height: None,
        ladder_fade: None,
        signal: None,
        offscale_points: 0,
        dyes: Vec::new(),
        tall_peaks: 0,
        breakdowns: 0,
        copies: 0,
        breakdown_fraction: None,
        ladder_leaks: Vec::new(),
        spectral_deviation: None,
        flags: Vec::new(),
    };
    let Some((lo, hi)) = measured_range(input, spec) else {
        return WellMeasurement {
            quality: q,
            ladder: ladder_stored,
            leaks: Vec::new(),
            sources: Vec::new(),
        };
    };
    let corrected: Vec<Corrected<'_>> = input
        .dyes
        .iter()
        .map(|(_, t)| Corrected::new(t, lo, hi))
        .collect();
    let ladder_dye = input.dyes.iter().position(|(c, _)| *c == spec.color);

    // Off-scale scans: the file marks the scan; the dye with the largest
    // raw value there is the one that went off-scale.
    let mut offscale = vec![0u32; input.dyes.len()];
    for &i in input.offscale_indices {
        if i < lo || i > hi {
            continue;
        }
        if let Some((k, _)) = input
            .dyes
            .iter()
            .enumerate()
            .filter_map(|(k, (_, t))| t.get(i).map(|&v| (k, v)))
            .max_by_key(|&(k, v)| (v, std::cmp::Reverse(k)))
        {
            offscale[k] += 1;
        }
    }
    let saturated_near = |i: usize| -> bool {
        let a = i.saturating_sub(SATURATION_GUARD);
        let b = i + SATURATION_GUARD;
        let marked = {
            let p = input.offscale_indices.partition_point(|&x| x < a);
            input.offscale_indices.get(p).is_some_and(|&x| x <= b)
        };
        marked
            || input.dyes.iter().any(|(_, t)| {
                t.get(a..=b.min(t.len().saturating_sub(1)))
                    .is_some_and(|w| w.contains(&SATURATION))
            })
    };

    let mut leaks = Vec::new();
    let mut sources = Vec::new();
    let mut points: Vec<(usize, bool, bool)> = Vec::new();
    let mut dyes = Vec::with_capacity(input.dyes.len());
    for (k, (color, trace)) in input.dyes.iter().enumerate() {
        let c = &corrected[k];
        let max_signal = (lo..=hi).map(|i| c.above(i)).fold(0.0, f64::max);
        let mut d = DyeQuality {
            color: *color,
            noise_sd: noise_sd(&trace[lo..=hi]),
            baseline: median(&c.baseline).unwrap_or(0.0),
            offscale_points: offscale[k],
            max_signal,
            tall_peaks: 0,
            breakdown_peaks: 0,
            copy_peaks: 0,
        };
        let is_ladder = Some(k) == ladder_dye;
        // Window sums need a point on each side inside the range.
        for (i, h) in tall_maxima(c, lo + 1, hi - 1, TALL_PEAK_RFU) {
            let own = c.window_sum(i).unwrap_or(0.0).max(peaks::MIN_RATIO_SIGNAL);
            let saturated = saturated_near(i);
            if !is_ladder && h >= CROSSTALK_SOURCE_RFU {
                sources.push(SourcePeak {
                    color: *color,
                    index: i,
                    signal: own,
                    saturated,
                });
            }
            if saturated {
                continue;
            }
            let (mut above, mut dip) = (0.0f64, 0.0f64);
            for (j, o) in corrected.iter().enumerate() {
                if j != k {
                    above = above.max(o.window_sum(i).unwrap_or(0.0));
                    dip = dip.max(o.dip_sum(i).unwrap_or(0.0));
                }
            }
            let peak = Peak {
                index: i,
                height: h,
                bleedthrough_ratio: above / own,
                spectral_dip_ratio: dip / own,
                ..Peak::default()
            };
            d.tall_peaks += 1;
            let breakdown = genotyping::spectral_breakdown(&peak);
            let copy = (COPY_MIN_RATIO..=COPY_MAX_RATIO).contains(&peak.bleedthrough_ratio);
            d.breakdown_peaks += u32::from(breakdown);
            d.copy_peaks += u32::from(copy);
            if !is_ladder {
                points.push((i, breakdown, copy));
            }
            // A source with another dye above half its signal may itself be
            // pull-up, or sit on a real peak of that dye.
            if h >= LEAK_SOURCE_RFU && peak.bleedthrough_ratio <= 0.5 {
                for (j, o) in corrected.iter().enumerate() {
                    if j == k {
                        continue;
                    }
                    if let Some(t) = o.signed_sum(i) {
                        leaks.push(LeakSample {
                            source: *color,
                            target: input.dyes[j].0,
                            fraction: t / own,
                        });
                    }
                }
            }
        }
        dyes.push(d);
    }
    // One fragment whose signal shows in several dyes peaks in each; count it once.
    points.sort_unstable_by_key(|p| p.0);
    let mut last: Option<usize> = None;
    let mut event = (false, false);
    let close = |q: &mut WellQuality, e: (bool, bool)| {
        q.tall_peaks += 1;
        q.breakdowns += u32::from(e.0);
        q.copies += u32::from(e.1);
    };
    for &(i, b, c) in &points {
        match last {
            Some(l) if i - l <= SAME_POINT => event = (event.0 || b, event.1 || c),
            Some(_) => {
                close(&mut q, event);
                event = (b, c);
            }
            None => event = (b, c),
        }
        last = Some(i);
    }
    if last.is_some() {
        close(&mut q, event);
    }
    q.breakdown_fraction =
        (q.tall_peaks > 0).then(|| f64::from(q.breakdowns) / f64::from(q.tall_peaks));
    if let Some(k) = ladder_dye {
        let ladder = input.dyes[k].0;
        for (target, _) in input.dyes.iter().filter(|(c, _)| *c != ladder) {
            let v: Vec<f64> = leaks
                .iter()
                .filter(|l| l.source == ladder && l.target == *target)
                .map(|l| l.fraction)
                .collect();
            if v.len() >= MIN_LADDER_LEAK_PEAKS {
                if let Some(f) = median(&v) {
                    q.ladder_leaks.push(DyeLeak {
                        target: *target,
                        fraction: f,
                    });
                }
            }
        }
    }
    q.offscale_points = dyes
        .iter()
        .enumerate()
        .filter(|(k, _)| Some(*k) != ladder_dye)
        .map(|(_, d)| d.offscale_points)
        .sum();
    q.signal = dyes
        .iter()
        .enumerate()
        .filter(|(k, _)| Some(*k) != ladder_dye)
        .map(|(_, d)| d.max_signal)
        .reduce(f64::max);

    // Ladder height and fade.
    if let Some(k) = ladder_dye {
        let c = &corrected[k];
        match input.ladder {
            Some(l) if !l.peak_indices.is_empty() => {
                let h: Vec<f64> = l
                    .peak_indices
                    .iter()
                    .filter(|&&i| i >= lo && i <= hi)
                    .map(|&i| c.above(i).max(0.0))
                    .collect();
                q.ladder_height = median(&h);
                if h.len() >= 6 {
                    let third = h.len() / 3;
                    let first = median(&h[..third]).unwrap_or(0.0);
                    let last = median(&h[h.len() - third..]).unwrap_or(0.0);
                    q.ladder_fade = (first > 0.0).then(|| last / first);
                }
            }
            _ => {
                let others: Vec<&[i16]> = input
                    .dyes
                    .iter()
                    .filter(|(col, _)| *col != spec.color)
                    .map(|(_, t)| *t)
                    .collect();
                if let Ok(cands) = ladder::ladder_candidates(input.dyes[k].1, &others, spec) {
                    q.ladder_height = ladder::ladder_level(&cands, spec.base_sizes.len());
                }
            }
        }
    }
    q.dyes = dyes;
    WellMeasurement {
        quality: q,
        ladder: ladder_stored,
        leaks,
        sources,
    }
}

/// Leak of a well's sources into the same dye of the given neighbors
/// (capillary distance, that neighbor's traces).
pub fn measure_crosstalk(
    sources: &[SourcePeak],
    neighbors: &[(u32, WellDyes<'_>)],
) -> Vec<CrosstalkSample> {
    let mut out = Vec::new();
    for s in sources {
        for &(distance, dyes) in neighbors {
            let Some((_, t)) = dyes.iter().find(|(c, _)| *c == s.color) else {
                continue;
            };
            if s.index == 0 || s.index + 1 >= t.len() {
                continue;
            }
            let c = Corrected::new(t, s.index - 1, s.index + 1);
            if let Some(v) = c.signed_sum(s.index) {
                out.push(CrosstalkSample {
                    distance,
                    saturated: s.saturated,
                    fraction: v / s.signal,
                });
            }
        }
    }
    out
}

/// Center and spread of the densest half of single-peak fractions.
fn pooled(fractions: &[f64]) -> (Option<f64>, Option<f64>, u32) {
    let n = fractions.len() as u32;
    if n < MIN_LEAK_PEAKS {
        return (None, None, n);
    }
    match stats::densest_half(fractions) {
        Some((center, half)) => (Some(center), Some(MAD_SCALE * half), n),
        None => (None, None, n),
    }
}

/// How many capillaries apart two wells ran; None for the same well, or
/// wells of different injections (which cannot cross-talk).
pub fn capillary_distance(a: Well, b: Well, size: PlateSize) -> Option<u32> {
    let (qa, ca) = plate::capillary(a, size)?;
    let (qb, cb) = plate::capillary(b, size)?;
    (qa == qb && a != b).then(|| ca.abs_diff(cb))
}

/// Assembles the plate report from its wells' measurements and crosstalk
/// samples with default limits, then derives the issues. `controls` are the
/// negative-control peaks once a plate map is applied (None: not checked).
pub fn summarize_plate(
    spec: &LadderSpec,
    measurements: Vec<WellMeasurement>,
    crosstalk: &[CrosstalkSample],
    controls: Option<Vec<ControlSignal>>,
) -> PlateQuality {
    summarize_plate_with_limits(
        spec,
        measurements,
        crosstalk,
        controls,
        QualityLimits::default(),
    )
}

/// Assembles the plate report using custom [`QualityLimits`], then derives the issues.
pub fn summarize_plate_with_limits(
    spec: &LadderSpec,
    measurements: Vec<WellMeasurement>,
    crosstalk: &[CrosstalkSample],
    controls: Option<Vec<ControlSignal>>,
    limits: QualityLimits,
) -> PlateQuality {
    let prior = LadderPrior::from_fits(
        spec,
        measurements
            .iter()
            .filter_map(|m| m.ladder.as_ref())
            .filter(|l| l.2)
            .map(|l| (l.0.as_slice(), l.1.as_slice())),
    );
    let mut wells = Vec::with_capacity(measurements.len());
    let mut leaks = Vec::with_capacity(measurements.len());
    for m in measurements {
        let mut q = m.quality;
        if let (Some(p), Some(l)) = (&prior, &m.ladder) {
            if l.0.len() >= 3 {
                q.plate_error = Some(p.plate_error_of(&l.0, &l.1, spec));
            }
        }
        wells.push(q);
        leaks.push(m.leaks);
    }
    // The plate's typical capillary: median over wells of each ladder leak.
    let mut typical: BTreeMap<Color, Vec<f64>> = BTreeMap::new();
    for w in &wells {
        for l in &w.ladder_leaks {
            typical.entry(l.target).or_default().push(l.fraction);
        }
    }
    let typical: BTreeMap<Color, f64> = typical
        .into_iter()
        .filter_map(|(c, v)| median(&v).map(|m| (c, m)))
        .collect();
    for w in &mut wells {
        w.spectral_deviation = w
            .ladder_leaks
            .iter()
            .filter_map(|l| typical.get(&l.target).map(|t| (l.fraction - t).abs()))
            .reduce(f64::max);
    }
    // Capillaries with unseparated dyes leak by their own rules, and on a
    // plate with few tall peaks in a dye they can outnumber the healthy
    // ones; the plate's pull-up is measured on capillaries that show no
    // sign of it at all.
    let mut by_pair: BTreeMap<(Color, Color), Vec<f64>> = BTreeMap::new();
    for (q, samples) in wells.iter().zip(&leaks) {
        for d in &q.dyes {
            for e in &q.dyes {
                if d.color != e.color {
                    by_pair.entry((d.color, e.color)).or_default();
                }
            }
        }
        let suspect = q.breakdowns > 0
            || q.spectral_deviation
                .is_some_and(|d| d > POOL_DEVIATION_LIMIT);
        if !suspect {
            for l in samples {
                by_pair
                    .entry((l.source, l.target))
                    .or_default()
                    .push(l.fraction);
            }
        }
    }
    wells.sort_by_key(|w| (w.capillary.unwrap_or(u32::MAX), w.well.clone()));
    let pull_up = by_pair
        .into_iter()
        .map(|((source, target), v)| {
            let (fraction, spread, peaks) = pooled(&v);
            LeakEstimate {
                source,
                target,
                fraction,
                spread,
                peaks,
            }
        })
        .collect();
    let mut xt = Vec::new();
    for saturated in [false, true] {
        for d in CROSSTALK_DISTANCES {
            let v: Vec<f64> = crosstalk
                .iter()
                .filter(|s| s.distance == d && s.saturated == saturated)
                .map(|s| s.fraction)
                .collect();
            let (fraction, spread, peaks) = pooled(&v);
            xt.push(CrosstalkEstimate {
                distance: d,
                saturated,
                fraction,
                spread,
                peaks,
            });
        }
    }
    let heights: Vec<f64> = wells.iter().filter_map(|w| w.ladder_height).collect();
    let mut q = PlateQuality {
        version: QUALITY_VERSION,
        wells,
        ladder_height: median(&heights),
        pull_up,
        crosstalk: xt,
        controls_checked: controls.is_some(),
        controls: controls.unwrap_or_default(),
        issues: Vec::new(),
        limits,
    };
    derive_issues(&mut q, spec);
    q
}

/// Measures a whole plate in one thread with default limits: [`measure_well`]
/// on every well, crosstalk from each to its neighbors, then [`summarize_plate`].
pub fn assess_plate(
    wells: &[WellInput<'_>],
    spec: &LadderSpec,
    size: PlateSize,
    controls: Option<Vec<ControlSignal>>,
) -> PlateQuality {
    assess_plate_with_limits(wells, spec, size, controls, QualityLimits::default())
}

/// Measures a whole plate in one thread using custom [`QualityLimits`].
pub fn assess_plate_with_limits(
    wells: &[WellInput<'_>],
    spec: &LadderSpec,
    size: PlateSize,
    controls: Option<Vec<ControlSignal>>,
    limits: QualityLimits,
) -> PlateQuality {
    let measured: Vec<WellMeasurement> =
        wells.iter().map(|w| measure_well(w, spec, size)).collect();
    let mut samples = Vec::new();
    for (k, m) in measured.iter().enumerate() {
        let neighbors = neighbors_of(wells, k, size);
        let refs: Vec<(u32, WellDyes<'_>)> = neighbors
            .iter()
            .map(|&(d, j)| (d, wells[j].dyes.as_slice()))
            .collect();
        samples.extend(measure_crosstalk(&m.sources, &refs));
    }
    summarize_plate_with_limits(spec, measured, &samples, controls, limits)
}

/// Indices of the wells within [`CROSSTALK_DISTANCES`] of well `k`, with
/// their distance.
pub fn neighbors_of(wells: &[WellInput<'_>], k: usize, size: PlateSize) -> Vec<(u32, usize)> {
    let max = CROSSTALK_DISTANCES.iter().copied().max().unwrap_or(0);
    wells
        .iter()
        .enumerate()
        .filter_map(|(j, w)| {
            capillary_distance(wells[k].well, w.well, size)
                .filter(|&d| d >= 1 && d <= max)
                .map(|d| (d, j))
        })
        .collect()
}

/// True when a well's tall peaks show unseparated dyes as a pattern.
fn unseparated(q: &WellQuality, limits: &QualityLimits) -> bool {
    q.breakdowns >= limits.unseparated_min_peaks
        || q.spectral_deviation
            .is_some_and(|d| d > limits.spectral_deviation_limit)
}

/// What a negative-control check needs of one run.
#[derive(Debug, Clone)]
pub struct ControlRun<'a> {
    pub well: String,
    pub locus: String,
    pub sample: String,
    pub color: Color,
    pub trace: &'a [i16],
    pub base_sizes: &'a [f64],
    pub other_dyes: Vec<(Color, &'a [i16])>,
    /// Same dye of the capillaries within [`CONTROL_NEIGHBOR_DISTANCE`].
    pub neighbors: Vec<&'a [i16]>,
    /// Measured pull-up rates targeting `color` on this plate; `None` when not
    /// measured or in a capillary with unseparated dyes.
    pub pull_up: Option<&'a DyePullUp>,
    /// Data-point indices flagged off-scale (`OfSc`) in this well.
    pub offscale_indices: &'a [usize],
    pub min_size: f64,
    pub max_size: f64,
}

/// The tallest peak above `height_limit` inside the locus range of a
/// negative control, and whether crosstalk or pull-up explains it. None
/// when no peak reaches the limit.
pub fn check_negative_control(run: &ControlRun<'_>, height_limit: f64) -> Option<ControlSignal> {
    let candidates = peaks::scan(run.trace, &ScanParams::default()).ok()?;
    let filter = FilterParams {
        min_peak_height: height_limit,
        max_bleedthrough: f64::INFINITY,
        max_crosstalk: f64::INFINITY,
        ..FilterParams::default()
    };
    let signals = RunSignals {
        trace: run.trace,
        base_sizes: run.base_sizes,
        other_dyes: &run.other_dyes,
        neighbor_capillaries: &run.neighbors,
        pull_up: run.pull_up,
        drop_measured_pullup: false,
        offscale_indices: run.offscale_indices,
    };
    let found = peaks::annotate(&candidates, &signals, run.min_size..=run.max_size, &filter);
    let tallest = found.iter().max_by(|a, b| a.height.total_cmp(&b.height))?;
    let defaults = GenotypingParams::default();
    let explained_by = if genotyping::is_crosstalk(tallest, &defaults) {
        Some(ControlExplanation::Crosstalk)
    } else if genotyping::is_bleedthrough(tallest, &defaults) {
        Some(ControlExplanation::PullUp)
    } else {
        None
    };
    Some(ControlSignal {
        well: run.well.clone(),
        locus: run.locus.clone(),
        sample: run.sample.clone(),
        color: run.color,
        size: tallest.size,
        height: tallest.height,
        peaks: found.len() as u32,
        explained_by,
    })
}

/// The calling height limit negative controls are checked against.
pub fn control_height_limit() -> f64 {
    GenotypingParams::default().absolute_peak_height_limit
}

fn color_name(c: Color) -> &'static str {
    match c {
        Color::Blue => "blue",
        Color::Green => "green",
        Color::Yellow => "yellow",
        Color::Red => "red",
        Color::Orange => "orange",
    }
}

fn capitalized(s: &str) -> String {
    let mut c = s.chars();
    c.next()
        .map(|f| f.to_uppercase().chain(c).collect())
        .unwrap_or_default()
}

/// `a`, `a and b`, `a, b and c`.
fn join_and(items: &[String]) -> String {
    match items {
        [] => String::new(),
        [a] => a.clone(),
        [rest @ .., last] => format!("{} and {last}", rest.join(", ")),
    }
}

/// Capillary numbers as runs: `7 to 9, 12, 19 and 20`.
pub fn capillary_ranges(caps: &[u32]) -> String {
    let mut v = caps.to_vec();
    v.sort_unstable();
    v.dedup();
    let mut parts = Vec::new();
    let mut i = 0;
    while i < v.len() {
        let mut j = i;
        while j + 1 < v.len() && v[j + 1] == v[j] + 1 {
            j += 1;
        }
        match j - i {
            0 => parts.push(v[i].to_string()),
            1 => parts.extend([v[i].to_string(), v[j].to_string()]),
            _ => parts.push(format!("{} to {}", v[i], v[j])),
        }
        i = j + 1;
    }
    join_and(&parts)
}

/// "capillary 7 (well E01)" or "capillaries 7 to 9 (wells E01, E02, D01)",
/// with at most eight wells named.
fn where_wells(wells: &[&WellQuality]) -> String {
    let caps: Vec<u32> = wells.iter().filter_map(|w| w.capillary).collect();
    let labels: Vec<String> = wells.iter().map(|w| w.well.clone()).collect();
    let shown = if labels.len() > 8 {
        format!("{}, and {} more", labels[..8].join(", "), labels.len() - 8)
    } else {
        join_and(&labels)
    };
    match (caps.len(), labels.len()) {
        (1, 1) => format!("capillary {} (well {})", caps[0], labels[0]),
        (n, _) if n == labels.len() && n > 0 => {
            format!("capillaries {} (wells {shown})", capillary_ranges(&caps))
        }
        (_, 1) => format!("well {}", labels[0]),
        _ => format!("wells {shown}"),
    }
}

/// A whole number with thousands separators: `4,377`.
fn thousands(v: f64) -> String {
    let n = v.round() as i64;
    let digits = n.unsigned_abs().to_string();
    let mut out = String::new();
    for (k, c) in digits.chars().enumerate() {
        if k > 0 && (digits.len() - k).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    if n < 0 {
        format!("-{out}")
    } else {
        out
    }
}

fn pct(f: f64) -> String {
    let p = 100.0 * f;
    if p.abs() >= 10.0 {
        format!("{p:.0}%")
    } else {
        format!("{p:.1}%")
    }
}

fn value(label: &str, value: f64, unit: &str) -> IssueValue {
    IssueValue {
        label: label.into(),
        value,
        unit: unit.into(),
        well: None,
    }
}

fn well_value(label: &str, v: f64, unit: &str, well: &str) -> IssueValue {
    IssueValue {
        well: Some(well.to_string()),
        ..value(label, v, unit)
    }
}

/// Sets each well's flags and the plate's issues from the measurements and
/// the negative-control peaks using `q.limits`. Pure: running it again gives the same list.
pub fn derive_issues(q: &mut PlateQuality, spec: &LadderSpec) {
    let limits = q.limits.clone();
    let ladder_median = q.ladder_height;
    let mut noise_medians: BTreeMap<Color, f64> = BTreeMap::new();
    {
        let mut by: BTreeMap<Color, Vec<f64>> = BTreeMap::new();
        for w in &q.wells {
            for d in &w.dyes {
                by.entry(d.color).or_default().push(d.noise_sd);
            }
        }
        for (c, v) in by {
            if let Some(m) = median(&v) {
                noise_medians.insert(c, m);
            }
        }
    }
    let control_wells: Vec<String> = q
        .controls
        .iter()
        .filter(|c| c.explained_by.is_none())
        .map(|c| c.well.clone())
        .collect();
    for w in &mut q.wells {
        let mut f = Vec::new();
        if unseparated(w, &limits) {
            f.push(WellFlag::UnseparatedDyes);
        }
        let low_ladder = match (w.ladder_height, ladder_median) {
            (Some(h), Some(m)) => h < limits.low_ladder_fraction * m,
            (None, Some(_)) => true,
            _ => false,
        };
        if low_ladder {
            f.push(WellFlag::LowLadder);
            if w.signal.is_none_or(|s| s < limits.weak_signal_rfu) {
                f.push(WellFlag::WeakInjection);
            }
        }
        if w.plate_error.is_some_and(|e| e > spec.sq_flag_limit) {
            f.push(WellFlag::LadderDisagrees);
        }
        if w.ladder_fade.is_some_and(|r| r < limits.ladder_fade_limit) {
            f.push(WellFlag::LadderFading);
        }
        if w.dyes.iter().any(|d| {
            noise_medians
                .get(&d.color)
                .is_some_and(|&m| m > 0.0 && d.noise_sd > limits.noisy_factor * m)
        }) {
            f.push(WellFlag::Noisy);
        }
        if w.offscale_points > 0 {
            f.push(WellFlag::Offscale);
        }
        if control_wells.contains(&w.well) {
            f.push(WellFlag::NegativeControlSignal);
        }
        w.flags = f;
    }
    let flagged = |flag: WellFlag| -> Vec<&WellQuality> {
        q.wells.iter().filter(|w| w.flags.contains(&flag)).collect()
    };
    let names =
        |ws: &[&WellQuality]| -> Vec<String> { ws.iter().map(|w| w.well.clone()).collect() };
    let mut issues = Vec::new();

    let faulty = flagged(WellFlag::UnseparatedDyes);
    if !faulty.is_empty() {
        let mut values = Vec::new();
        // Only the measure that flagged a well: a tiny ladder deviation next
        // to a breakdown count would read as a reassurance.
        for w in &faulty {
            if w.breakdowns >= limits.unseparated_min_peaks {
                values.push(well_value(
                    "Peaks at a spectral breakdown",
                    f64::from(w.breakdowns),
                    "count",
                    &w.well,
                ));
            }
            if let Some(d) = w
                .spectral_deviation
                .filter(|&d| d > limits.spectral_deviation_limit)
            {
                values.push(well_value(
                    "Ladder pull-up off the plate's",
                    d,
                    "percent",
                    &w.well,
                ));
            }
        }
        issues.push(Issue {
            kind: IssueKind::UnseparatedDyes,
            severity: Severity::Problem,
            title: "Dyes not separated".into(),
            message: format!(
                "The dyes are not separated in {}: a peak of one dye can show in another dye at the same point, as tall as the original, with the other dyes dipping below their baseline. Calls from {} can be in the wrong dye. Rerun {}, and have the instrument's spectral calibration redone if the same capillaries keep showing this.",
                where_wells(&faulty),
                if faulty.len() == 1 { "this well" } else { "these wells" },
                if faulty.len() == 1 { "it" } else { "them" },
            ),
            wells: names(&faulty),
            values,
        });
    }

    for l in &q.pull_up {
        let Some(f) = l.fraction else { continue };
        if f <= limits.pull_up_warning {
            continue;
        }
        let (s, t) = (color_name(l.source), color_name(l.target));
        let (severity, advice) = if f > limits.pull_up_problem {
            (
                Severity::Problem,
                format!(
                    "Calling accounts for this plate's measured pull-up automatically, but pull-up this high points to a stale spectral calibration and hides minor {t} alleles under {s} peaks. Recalibrate the instrument's spectral settings."
                ),
            )
        } else {
            (
                Severity::Warning,
                format!(
                    "Typical pull-up is 1 to 4%. Calling accounts for this plate's measured pull-up automatically, but high pull-up reduces sensitivity for minor {t} alleles under tall {s} peaks."
                ),
            )
        };
        issues.push(Issue {
            kind: IssueKind::PullUp,
            severity,
            title: format!("{} signal shows in {t}", capitalized(s)),
            message: format!(
                "On this plate {pct} of the {s} signal shows in {t} at the same point. {advice}",
                pct = pct(f)
            ),
            wells: Vec::new(),
            values: vec![
                value(&format!("{} into {t}", capitalized(s)), f, "percent"),
                value("Source peaks", f64::from(l.peaks), "count"),
            ],
        });
    }

    for x in &q.crosstalk {
        let Some(f) = x.fraction else { continue };
        let (warn, problem) = if x.saturated {
            (
                limits.crosstalk_saturated_warning,
                limits.crosstalk_saturated_problem,
            )
        } else {
            (limits.crosstalk_warning, limits.crosstalk_problem)
        };
        if f <= warn {
            continue;
        }
        let next = match x.distance {
            1 => "the next capillary".to_string(),
            d => format!("capillaries {d} away"),
        };
        let from = if x.saturated {
            "of off-scale peaks "
        } else {
            ""
        };
        let (severity, advice) = if f > problem && x.distance <= 2 {
            (
                Severity::Problem,
                "That is more than the default crosstalk limit catches, so leaked peaks can be called as alleles. Lower the crosstalk limit of projects that use this plate, and avoid placing strong samples next to weak ones.",
            )
        } else {
            (
                Severity::Warning,
                "Typical crosstalk is about 1% at the next capillary. Check small peaks in wells next to strong ones.",
            )
        };
        issues.push(Issue {
            kind: IssueKind::Crosstalk,
            severity,
            title: "Crosstalk between capillaries".into(),
            message: format!(
                "On this plate {} of the signal {from}leaks into {next}. {advice}",
                pct(f)
            ),
            wells: Vec::new(),
            values: vec![
                value(&format!("Leak at distance {}", x.distance), f, "percent"),
                value("Source peaks", f64::from(x.peaks), "count"),
            ],
        });
    }

    let weak = flagged(WellFlag::WeakInjection);
    let n = q.wells.len().max(1);
    if !weak.is_empty() {
        let plate_wide = weak.len() as f64 >= limits.weak_plate_fraction * n as f64;
        issues.push(Issue {
            kind: IssueKind::WeakInjection,
            severity: if plate_wide {
                Severity::Problem
            } else {
                Severity::Info
            },
            title: if plate_wide {
                "Weak or failed injection".into()
            } else {
                "Weak wells".into()
            },
            message: if plate_wide {
                format!(
                    "{} of {n} wells have a weak ladder and almost no sample signal ({}). The injection likely failed: check the run conditions and rerun the plate.",
                    weak.len(),
                    where_wells(&weak)
                )
            } else {
                format!(
                    "{} {} a weak ladder and almost no sample signal. {}",
                    capitalized(&where_wells(&weak)),
                    if weak.len() == 1 { "has" } else { "have" },
                    if weak.len() == 1 {
                        "Rerun it unless it is an empty well."
                    } else {
                        "Rerun them unless they are empty wells."
                    },
                )
            },
            wells: names(&weak),
            values: weak
                .iter()
                .map(|w| well_value("Strongest sample signal", w.signal.unwrap_or(0.0), "rfu", &w.well))
                .collect(),
        });
    }

    let off = flagged(WellFlag::LadderDisagrees);
    if !off.is_empty() {
        issues.push(Issue {
            kind: IssueKind::LadderDisagreement,
            severity: Severity::Warning,
            title: "Ladder disagrees with the plate".into(),
            message: format!(
                "The ladder of {} places a fragment more than {} bp from where the plate's other wells put it, so sizes there may be off. Check the ladder peaks in the well view and fix them by hand if one was taken from the wrong peak.",
                where_wells(&off),
                spec.sq_flag_limit
            ),
            wells: names(&off),
            values: off
                .iter()
                .filter_map(|w| {
                    w.plate_error
                        .map(|e| well_value("Disagreement", e, "bp", &w.well))
                })
                .collect(),
        });
    }

    let fading = flagged(WellFlag::LadderFading);
    if !fading.is_empty() {
        issues.push(Issue {
            kind: IssueKind::LadderFading,
            severity: Severity::Info,
            title: "Ladder fades along the run".into(),
            message: format!(
                "The ladder of {} loses most of its height toward the long fragments, so long alleles there may be missed. Rerun these wells if long loci matter.",
                where_wells(&fading)
            ),
            wells: names(&fading),
            values: fading
                .iter()
                .filter_map(|w| {
                    w.ladder_fade
                        .map(|f| well_value("Last third over first third", f, "percent", &w.well))
                })
                .collect(),
        });
    }

    let noisy = flagged(WellFlag::Noisy);
    if !noisy.is_empty() {
        let factor_raw = format!("{:.2}", limits.noisy_factor);
        let factor = factor_raw.trim_end_matches('0').trim_end_matches('.');
        issues.push(Issue {
            kind: IssueKind::NoisyCapillaries,
            severity: Severity::Info,
            title: "Noisy capillaries".into(),
            message: format!(
                "The noise in {} is more than {factor} times the plate's typical noise, so small peaks there are less reliable. If the same capillaries are noisy on other plates, the array may need service.",
                where_wells(&noisy)
            ),
            wells: names(&noisy),
            values: noisy
                .iter()
                .map(|w| {
                    let worst = w
                        .dyes
                        .iter()
                        .map(|d| d.noise_sd)
                        .fold(0.0, f64::max);
                    well_value("Noise SD", worst, "rfu", &w.well)
                })
                .collect(),
        });
    }

    let sat = flagged(WellFlag::Offscale);
    let share = sat.len() as f64 / n as f64;
    if share >= limits.saturation_info_fraction {
        issues.push(Issue {
            kind: IssueKind::Saturation,
            severity: Severity::Info,
            title: "Off-scale signal".into(),
            message: format!(
                "{} of {n} wells have sample signal above the instrument's range. Off-scale peaks cannot be measured, and they leak into other dyes and capillaries; if this is common, dilute the products or inject for less time.",
                sat.len()
            ),
            wells: names(&sat),
            values: vec![value("Wells off-scale", sat.len() as f64, "count")],
        });
    }

    let unexplained: Vec<&ControlSignal> = q
        .controls
        .iter()
        .filter(|c| c.explained_by.is_none())
        .collect();
    if !unexplained.is_empty() {
        let mut ws: Vec<String> = unexplained.iter().map(|c| c.well.clone()).collect();
        ws.sort();
        ws.dedup();
        let tallest = unexplained
            .iter()
            .max_by(|a, b| a.height.total_cmp(&b.height))
            .copied();
        let mut loci: Vec<&str> = unexplained.iter().map(|c| c.locus.as_str()).collect();
        loci.sort_unstable();
        loci.dedup();
        let shown: Vec<String> = ws.iter().take(6).cloned().collect();
        let named = if ws.len() > shown.len() {
            format!("{}, and {} more", shown.join(", "), ws.len() - shown.len())
        } else {
            join_and(&shown)
        };
        issues.push(Issue {
            kind: IssueKind::NegativeControlSignal,
            severity: Severity::Problem,
            title: "Signal in negative controls".into(),
            message: format!(
                "{} negative-control {} ({named}) {} peaks above the {:.0} RFU calling limit at {} {} that no neighboring capillary or other dye explains{}. This points to contamination or a mislabeled well: check the plate map and repeat the controls.",
                ws.len(),
                if ws.len() == 1 { "well" } else { "wells" },
                if ws.len() == 1 { "has" } else { "have" },
                limits.control_height_limit,
                loci.len(),
                if loci.len() == 1 { "locus" } else { "loci" },
                tallest.map_or(String::new(), |t| format!(
                    "; the tallest is {} RFU in {} at {}",
                    thousands(t.height), t.well, t.locus
                )),
            ),
            wells: ws,
            values: unexplained
                .iter()
                .map(|c| well_value(&format!("Tallest peak at {}", c.locus), c.height, "rfu", &c.well))
                .collect(),
        });
    }
    // Peaks that calling flags as crosstalk or pull-up stay in `controls`
    // with their explanation but raise no issue: there is nothing to do
    // about them, and on real plates nearly every plate map has some.
    issues.sort_by(|a, b| b.severity.cmp(&a.severity).then(a.kind.cmp(&b.kind)));
    q.issues = issues;
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Deterministic noise in about [-2.5, 2.5] RFU.
    fn noise(n: usize, seed: u64) -> Vec<f64> {
        let mut x = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
        (0..n)
            .map(|_| {
                x = x
                    .wrapping_mul(6364136223846793005)
                    .wrapping_add(1442695040888963407);
                ((x >> 33) as f64 / (1u64 << 31) as f64 - 0.5) * 5.0
            })
            .collect()
    }

    fn add_peak(t: &mut [f64], at: usize, height: f64) {
        for (i, v) in t.iter_mut().enumerate() {
            let d = (i as f64 - at as f64) / 2.5;
            *v += height * (-0.5 * d * d).exp();
        }
    }

    fn to_i16(t: &[f64]) -> Vec<i16> {
        t.iter()
            .map(|v| v.round().clamp(-32768.0, 32767.0) as i16)
            .collect()
    }

    const N: usize = 4000;
    const PEAKS: [usize; 6] = [1500, 1800, 2100, 2400, 2700, 3000];
    const LADDER: [usize; 10] = [1300, 1550, 1700, 1950, 2250, 2550, 2850, 3150, 3400, 3650];

    /// Blue alleles with `leak` of them in green and `dip` in yellow, and a
    /// red ladder; dye order blue, green, yellow, red.
    fn well_traces(leak: f64, dip: f64, seed: u64) -> Vec<Vec<i16>> {
        let mut t: Vec<Vec<f64>> = (0..4).map(|k| noise(N, seed + k)).collect();
        for &p in &PEAKS {
            add_peak(&mut t[0], p, 5000.0);
            add_peak(&mut t[1], p, 5000.0 * leak);
            add_peak(&mut t[2], p, 5000.0 * dip);
        }
        for &p in &LADDER {
            add_peak(&mut t[3], p, 3000.0);
            add_peak(&mut t[0], p, 3000.0 * -0.01);
        }
        t.iter().map(|v| to_i16(v)).collect()
    }

    fn input<'a>(well: &str, traces: &'a [Vec<i16>]) -> WellInput<'a> {
        let colors = [Color::Blue, Color::Green, Color::Yellow, Color::Red];
        WellInput {
            well: Well::parse(well).unwrap(),
            dyes: colors
                .iter()
                .copied()
                .zip(traces.iter().map(|t| t.as_slice()))
                .collect(),
            ladder: None,
            offscale_indices: &[],
        }
    }

    #[test]
    fn capillaries_and_numbers_read_as_text() {
        assert_eq!(
            capillary_ranges(&[9, 7, 8, 12, 19, 20]),
            "7 to 9, 12, 19 and 20"
        );
        assert_eq!(capillary_ranges(&[3]), "3");
        assert_eq!(thousands(4376.9), "4,377");
        assert_eq!(thousands(999.0), "999");
        assert_eq!(pct(0.1402), "14%");
        assert_eq!(pct(0.0123), "1.2%");
    }

    #[test]
    fn noise_sd_ignores_peaks() {
        let mut t = noise(N, 1);
        let quiet = noise_sd(&to_i16(&t));
        for &p in &PEAKS {
            add_peak(&mut t, p, 20000.0);
        }
        let with_peaks = noise_sd(&to_i16(&t));
        assert!(quiet > 0.5 && quiet < 3.0, "{quiet}");
        assert!((with_peaks - quiet).abs() < 0.3, "{quiet} {with_peaks}");
    }

    #[test]
    fn healthy_well_has_no_breakdown_and_measures_its_pull_up() {
        let spec = LadderSpec::default();
        let traces = well_traces(0.04, -0.01, 1);
        let m = measure_well(&input("C03", &traces), &spec, PlateSize::W96);
        assert_eq!(m.quality.breakdowns, 0);
        assert_eq!(m.quality.copies, 0);
        assert_eq!(m.quality.tall_peaks, PEAKS.len() as u32);
        let bg: Vec<f64> = m
            .leaks
            .iter()
            .filter(|l| l.source == Color::Blue && l.target == Color::Green)
            .map(|l| l.fraction)
            .collect();
        assert_eq!(bg.len(), PEAKS.len());
        assert!(bg.iter().all(|f| (f - 0.04).abs() < 0.005), "{bg:?}");
        let by = m
            .leaks
            .iter()
            .find(|l| l.source == Color::Blue && l.target == Color::Yellow)
            .unwrap();
        assert!(by.fraction < 0.0, "a dip reads negative: {}", by.fraction);
        // Sample-dye sources for crosstalk, not the ladder.
        assert_eq!(m.sources.len(), PEAKS.len());
        assert!(m
            .sources
            .iter()
            .all(|s| s.color == Color::Blue && !s.saturated));
    }

    #[test]
    fn unseparated_dyes_show_on_every_peak_counted_once() {
        let spec = LadderSpec::default();
        let traces = well_traces(1.09, -0.97, 2);
        let m = measure_well(&input("C03", &traces), &spec, PlateSize::W96);
        // Blue and its green copy peak at the same points: one event each.
        assert_eq!(m.quality.tall_peaks, PEAKS.len() as u32);
        assert_eq!(m.quality.breakdowns, PEAKS.len() as u32);
        assert_eq!(m.quality.copies, PEAKS.len() as u32);
        assert!(unseparated(&m.quality, &QualityLimits::default()));
    }

    #[test]
    fn one_breakdown_is_not_a_pattern() {
        let spec = LadderSpec::default();
        let mut t: Vec<Vec<f64>> = (0..4).map(|k| noise(N, 30 + k)).collect();
        add_peak(&mut t[0], 2000, 4000.0);
        add_peak(&mut t[2], 2000, -2000.0);
        add_peak(&mut t[0], 2600, 4000.0);
        let traces: Vec<Vec<i16>> = t.iter().map(|v| to_i16(v)).collect();
        let m = measure_well(&input("C03", &traces), &spec, PlateSize::W96);
        assert_eq!(m.quality.breakdowns, 1);
        assert!(!unseparated(&m.quality, &QualityLimits::default()));
    }

    #[test]
    fn plate_pools_healthy_wells_and_flags_the_faulty_one() {
        let spec = LadderSpec::default();
        let labels = ["H01", "H02", "G01", "G02", "F01", "F02"];
        let traces: Vec<Vec<Vec<i16>>> = labels
            .iter()
            .enumerate()
            .map(|(k, _)| {
                if k == 2 {
                    well_traces(1.09, -0.97, 10 + k as u64)
                } else {
                    well_traces(0.14, -0.01, 10 + k as u64)
                }
            })
            .collect();
        let inputs: Vec<WellInput<'_>> = labels
            .iter()
            .zip(&traces)
            .map(|(l, t)| input(l, t))
            .collect();
        let q = assess_plate(&inputs, &spec, PlateSize::W96, None);
        let faulty = q
            .issues
            .iter()
            .find(|i| i.kind == IssueKind::UnseparatedDyes)
            .unwrap();
        assert_eq!(faulty.wells, vec!["G01".to_string()]);
        assert!(
            faulty.message.contains("capillary 3 (well G01)"),
            "{}",
            faulty.message
        );
        let bg = q
            .pull_up
            .iter()
            .find(|l| l.source == Color::Blue && l.target == Color::Green)
            .unwrap();
        assert_eq!(bg.peaks, 5 * PEAKS.len() as u32);
        assert!((bg.fraction.unwrap() - 0.14).abs() < 0.005);
        let pull = q
            .issues
            .iter()
            .find(|i| i.kind == IssueKind::PullUp)
            .unwrap();
        assert_eq!(pull.severity, Severity::Warning);
        // Problems first; deriving again changes nothing.
        assert_eq!(q.issues[0].severity, Severity::Problem);
        let mut again = q.clone();
        derive_issues(&mut again, &spec);
        assert_eq!(again, q);
    }

    #[test]
    fn pull_up_above_the_bleedthrough_limit_is_a_problem() {
        let spec = LadderSpec::default();
        let labels = ["H01", "H02", "G01", "G02"];
        let traces: Vec<Vec<Vec<i16>>> = (0..4).map(|k| well_traces(0.25, -0.01, 40 + k)).collect();
        let inputs: Vec<WellInput<'_>> = labels
            .iter()
            .zip(&traces)
            .map(|(l, t)| input(l, t))
            .collect();
        let q = assess_plate(&inputs, &spec, PlateSize::W96, None);
        let pull = q
            .issues
            .iter()
            .find(|i| i.kind == IssueKind::PullUp)
            .unwrap();
        assert_eq!(pull.severity, Severity::Problem);
        assert!(
            pull.message.contains("Recalibrate") && pull.message.contains("25%"),
            "{}",
            pull.message
        );
    }

    #[test]
    fn crosstalk_is_measured_at_the_neighbor_capillary() {
        let mut src = noise(N, 50);
        let mut next = noise(N, 51);
        for &p in &PEAKS {
            add_peak(&mut src, p, 10000.0);
            add_peak(&mut next, p, 150.0);
        }
        let (src, next) = (to_i16(&src), to_i16(&next));
        let c = Corrected::new(&src, 1000, N - 1);
        let sources: Vec<SourcePeak> = PEAKS
            .iter()
            .map(|&i| SourcePeak {
                color: Color::Blue,
                index: i,
                signal: c.window_sum(i).unwrap(),
                saturated: false,
            })
            .collect();
        let dyes = [(Color::Blue, next.as_slice())];
        let s = measure_crosstalk(&sources, &[(1, &dyes)]);
        assert_eq!(s.len(), PEAKS.len());
        assert!(
            s.iter()
                .all(|x| x.distance == 1 && (x.fraction - 0.015).abs() < 0.002),
            "{s:?}"
        );
    }

    #[test]
    fn negative_control_peaks_are_explained_by_a_much_taller_neighbor() {
        let base: Vec<f64> = (0..N).map(|i| i as f64 * 0.1).collect();
        let mut ntc = noise(N, 60);
        add_peak(&mut ntc, 2000, 400.0);
        let mut neighbor = noise(N, 61);
        add_peak(&mut neighbor, 2000, 20000.0);
        let (ntc, neighbor) = (to_i16(&ntc), to_i16(&neighbor));
        let quiet = to_i16(&noise(N, 62));
        let mut run = ControlRun {
            well: "H12".into(),
            locus: "L1".into(),
            sample: "NTC".into(),
            color: Color::Blue,
            trace: &ntc,
            base_sizes: &base,
            other_dyes: vec![(Color::Green, &quiet)],
            neighbors: vec![&neighbor],
            pull_up: None,
            offscale_indices: &[],
            min_size: 150.0,
            max_size: 250.0,
        };
        let s = check_negative_control(&run, 200.0).unwrap();
        assert_eq!(s.explained_by, Some(ControlExplanation::Crosstalk));
        assert!((s.height - 400.0).abs() < 20.0, "{}", s.height);
        run.neighbors = vec![&quiet];
        let s = check_negative_control(&run, 200.0).unwrap();
        assert_eq!(s.explained_by, None);
        // Measured plate pull-up explains a 25% green pull-up peak under a blue peak
        // even though the bleedthrough ratio (~4) is below the fixed fallback limit (5).
        let mut green_src = noise(N, 63);
        add_peak(&mut green_src, 2000, 1600.0);
        let green_src = to_i16(&green_src);
        let pu = DyePullUp {
            sources: vec![(Color::Green, 0.25, 0.01)],
        };
        run.other_dyes = vec![(Color::Green, &green_src)];
        run.pull_up = Some(&pu);
        let s = check_negative_control(&run, 200.0).unwrap();
        assert_eq!(s.explained_by, Some(ControlExplanation::PullUp));
        run.pull_up = None;
        let s = check_negative_control(&run, 200.0).unwrap();
        assert_eq!(s.explained_by, None);
        // Outside the locus range, or below the limit: nothing.
        run.min_size = 260.0;
        run.max_size = 300.0;
        assert!(check_negative_control(&run, 200.0).is_none());
    }

    #[test]
    fn quality_limits_validate_and_deserialize_defaults() {
        assert!(QualityLimits::default().validate().is_ok());

        let partial: QualityLimits = serde_json::from_str(
            r#"{
                "pull_up_warning": 0.1,
                "pull_up_problem": 0.25,
                "crosstalk_warning": 0.02,
                "crosstalk_problem": 0.05,
                "crosstalk_saturated_warning": 0.05,
                "crosstalk_saturated_problem": 0.1,
                "low_ladder_fraction": 0.25,
                "weak_signal_rfu": 500.0,
                "noisy_factor": 2.5,
                "unseparated_min_peaks": 2,
                "spectral_deviation_limit": 0.03
            }"#,
        )
        .unwrap();
        assert_eq!(partial.ladder_fade_limit, LADDER_FADE_LIMIT);
        assert_eq!(partial.weak_plate_fraction, WEAK_PLATE_FRACTION);
        assert_eq!(partial.saturation_info_fraction, SATURATION_INFO_FRACTION);
        assert_eq!(partial.control_height_limit, control_height_limit());

        for bad in [
            QualityLimits {
                pull_up_problem: 0.05,
                ..Default::default()
            },
            QualityLimits {
                crosstalk_problem: 0.01,
                ..Default::default()
            },
            QualityLimits {
                noisy_factor: 1.0,
                ..Default::default()
            },
            QualityLimits {
                unseparated_min_peaks: 0,
                ..Default::default()
            },
            QualityLimits {
                control_height_limit: 5.0,
                ..Default::default()
            },
        ] {
            assert!(bad.validate().is_err());
        }
    }

    #[test]
    fn derive_issues_uses_custom_quality_limits() {
        let spec = LadderSpec::default();
        let labels = ["H01", "H02", "G01", "G02", "F01", "F02"];
        let traces: Vec<Vec<Vec<i16>>> = labels
            .iter()
            .enumerate()
            .map(|(k, _)| {
                if k == 2 {
                    well_traces(1.09, -0.97, 10 + k as u64)
                } else {
                    well_traces(0.14, -0.01, 10 + k as u64)
                }
            })
            .collect();
        let inputs: Vec<WellInput<'_>> = labels
            .iter()
            .zip(&traces)
            .map(|(l, t)| input(l, t))
            .collect();

        let mut q = assess_plate(&inputs, &spec, PlateSize::W96, None);
        assert!(q
            .issues
            .iter()
            .any(|i| i.kind == IssueKind::UnseparatedDyes));
        assert_eq!(
            q.issues
                .iter()
                .find(|i| i.kind == IssueKind::PullUp)
                .unwrap()
                .severity,
            Severity::Warning
        );

        // Relaxing pull-up warning above 14% clears the pull-up warning;
        // tightening pull-up problem below 14% turns it into a problem;
        // raising unseparated thresholds above G01 clears UnseparatedDyes.
        q.limits.pull_up_warning = 0.05;
        q.limits.pull_up_problem = 0.10;
        q.limits.unseparated_min_peaks = 20;
        q.limits.spectral_deviation_limit = 0.90;
        derive_issues(&mut q, &spec);
        assert!(!q
            .issues
            .iter()
            .any(|i| i.kind == IssueKind::UnseparatedDyes));
        assert_eq!(
            q.issues
                .iter()
                .find(|i| i.kind == IssueKind::PullUp)
                .unwrap()
                .severity,
            Severity::Problem
        );

        q.limits.pull_up_warning = 0.30;
        q.limits.pull_up_problem = 0.40;
        derive_issues(&mut q, &spec);
        assert!(!q.issues.iter().any(|i| i.kind == IssueKind::PullUp));

        // Custom noisy_factor updates both flag and wording.
        q.wells[0].dyes[0].noise_sd = 20.0;
        for w in &mut q.wells[1..] {
            w.dyes[0].noise_sd = 5.0;
        }
        q.limits.noisy_factor = 3.0;
        derive_issues(&mut q, &spec);
        let noisy = q
            .issues
            .iter()
            .find(|i| i.kind == IssueKind::NoisyCapillaries)
            .unwrap();
        assert!(
            noisy.message.contains("more than 3 times"),
            "{}",
            noisy.message
        );

        // Custom control_height_limit appears in negative-control issue text.
        q.controls = vec![ControlSignal {
            well: "A01".into(),
            locus: "L1".into(),
            sample: "NTC".into(),
            color: Color::Blue,
            size: 150.0,
            height: 750.0,
            peaks: 1,
            explained_by: None,
        }];
        q.limits.control_height_limit = 600.0;
        derive_issues(&mut q, &spec);
        let ctrl = q
            .issues
            .iter()
            .find(|i| i.kind == IssueKind::NegativeControlSignal)
            .unwrap();
        assert!(
            ctrl.message.contains("600 RFU calling limit"),
            "{}",
            ctrl.message
        );
    }
}
