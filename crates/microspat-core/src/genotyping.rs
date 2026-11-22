//! Allele calling for mixed samples, per locus and project-wide.
//!
//! # Per locus: [`analyze_locus`]
//!
//! For one locus, the storage layer hands over every run (one capillary
//! channel: run id, sample id, whether sizing was acceptable, and its peaks).
//! Each run is annotated in place with bins ([`crate::bins::annotate_bins`]) and
//! artifact expectations ([`crate::artifact::annotate_artifacts`]). Then, per
//! sample:
//!
//! 1. **Reference run** ([`select_reference_run`]): among runs with acceptable
//!    sizing, runs with no in-bin peak above the off-scale threshold and none
//!    at a spectral breakdown come first (saturated peaks do not reflect
//!    template amounts, and at a breakdown the signal may be another dye's);
//!    among those, the one whose tallest in-bin peak (at or below the
//!    threshold) is tallest, the first by run id on ties. A sample whose
//!    every run has such a peak gets the best of those by the same measure,
//!    and its call is flagged.
//! 2. **Flags** ([`flag_peaks`]): a peak is rejected when its relative height is
//!    below `relative_peak_height_limit`; when `height − artifact_contribution −
//!    hard_artifact_sd_limit · artifact_error < absolute_peak_height_limit`
//!    (`artifact`); when another dye explains it (`bleedthrough`, by the
//!    plate's measured pull-up within `pullup_sd_limit` SDs or falling back to
//!    `bleedthrough_filter_limit` for unmeasured dyes / unchecked plates /
//!    unseparated capillaries); when its crosstalk ratio exceeds
//!    `crosstalk_filter_limit`; or when an off-scale source sits at
//!    [`OFFSCALE_BLEEDTHROUGH_MIN_RATIO`] or [`OFFSCALE_CROSSTALK_MIN_RATIO`]
//!    (a peak as tall as a saturated source is a saturated allele, not its
//!    leak); and, only with `reject_spectral_breakdown`, at a spectral
//!    breakdown ([`spectral_breakdown`]). The run is a `failure` when no peak
//!    exceeds `failure_threshold`; `offscale` when any peak, or a source a
//!    peak is flagged for, exceeds `offscale_threshold`; `spectral` when an
//!    in-bin peak sits at a spectral breakdown.
//! 3. **Initial call**: unless the run failed, every unflagged peak that is
//!    `in_bin` is an allele. There is no limit on how many.
//! 4. **Quantification** ([`apply_quantification`]): proportions of the called
//!    peaks, corrected by the locus β when one is given.
//!
//! # Project-wide: [`annotate_probabilities`]
//!
//! An optional second pass weighs each candidate peak's artifact evidence
//! against a prior from the population: how common its allele is and how
//! many clones the sample carries.
//!
//! **Inputs.** Every sample × locus result of the project, which samples are
//! controls, and per-locus parameters. Only true samples (not controls) with
//! non-failed results take part; controls keep their per-locus calls.
//!
//! **Quantities.**
//! - A *candidate* peak is `in_bin`, carries a bin, has no flag, and has
//!   probability `>= bootstrap_probability_threshold`.
//! - *Prevalence* `f(a)` of allele (bin) `a` at a locus: the fraction of samples
//!   with at least one candidate at that locus that have a candidate in `a`.
//!   Prevalences need not sum to 1 (a mixed sample counts for several alleles).
//! - *MOI* of a sample, `m`: the number of candidates at its locus with the
//!   `(1 + moi_offset)`-th largest count (default offset 1: second largest,
//!   which tolerates one locus with a spurious extra peak); 0 when it has no
//!   more than `moi_offset` typed loci.
//! - *Prior.* For a sample's peaks at a locus with probabilities `p_i`,
//!   weights `w_i = p_i · f(a_i)`, `S = Σ w` and `π_i = w_i / S`. The `m`
//!   clones are independent draws of one allele each, in proportion to `w`.
//!   The peak `t` with the greatest `height − artifact_contribution` is taken
//!   as real, so for every other peak the chance that no clone carries it is
//!   conditioned on some clone carrying `t`:
//!   `pn_i = [(1 − π_i)^m − (1 − π_i − π_t)^m] / [1 − (1 − π_t)^m]`.
//!   `t` itself gets `pn_t = (1 − π_t)^m`. `pn = 1` when `S = 0`, and the
//!   unconditioned `(1 − π_i)^m` is used when the denominator is 0 (`m = 0`,
//!   or `t` has no weight).
//!   With `m = 1` every peak but `t` has `pn = 1`: in a sample with one clone
//!   a second peak stands on its artifact evidence alone, however common its
//!   allele. Without the conditioning, a stutter peak on a common allele
//!   beside a rare true allele took most of the prior and was called. The
//!   cost: MOI is a ranked count, so two clones that differ at a single locus
//!   give `m = 1`, and the minor allele at that locus also loses its prior.
//! - The chance of a peak at least this tall from artifact alone is
//!   `q_i = P(Z > (height − artifact_contribution) / max(artifact_error, 1e-6))`.
//! - Bayes: `P(absent | observed) = q·pn / max(q·pn + 1 − pn, 1e-6)` and the
//!   peak's `probability = max(0, 1 − P(absent | observed))`. With no prior
//!   support (`pn = 1`) a peak scores above 0 only if `q < 1e-6`, i.e. more
//!   than ~4.75 artifact SDs above its expected artifact height.
//!
//! **Algorithm.**
//! 1. Initialise every peak's probability to 1 if it could be a candidate, else 0.
//! 2. *Prevalence loop*: compute prevalence from candidates; for each sample,
//!    compute its MOI from its candidate counts, then recompute the probability
//!    of each of its candidates. Repeat while any candidate fell below the
//!    bootstrap threshold. Peaks that leave the candidate set are never
//!    reconsidered, so the set shrinks every round and the loop ends after at
//!    most (number of initial candidates + 1) rounds.
//! 3. *MOI loop*, per sample, from fresh probabilities and the final prevalence:
//!    compute MOI, recompute the sample's candidates, repeat until MOI stops
//!    changing. Candidate counts only fall, so MOI only falls after the first
//!    round, and the loop ends.
//! 4. *Final pass*: per sample, with its MOI, recompute the probability of
//!    every unflagged in-bin peak. The other peaks weigh in at the
//!    probabilities the MOI loop left them with, so a peak the loops rejected
//!    takes little prior support from the rest; a peak's own weight is its
//!    prevalence alone, so its evidence counts once, through `q`. Then call
//!    alleles: an unflagged in-bin peak is an allele when `probability >=
//!    probability_threshold` or `(height − artifact_contribution) /
//!    max(artifact_error, 1) > soft_artifact_sd_limit`. Results the user
//!    edited by hand keep their calls (probabilities are still updated).
//!
//! Iteration order is fixed (sample id, locus id) and every loop has an
//! explicit bound, so results are deterministic.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::artifact::{self, ArtifactModel};
use crate::bins;
use crate::peaks;
use crate::quant_bias;
use crate::stats::normal_sf;
use crate::types::{Bin, Peak};

/// Errors from project-wide genotyping.
#[derive(Debug, Error, Clone, PartialEq)]
pub enum GenotypingError {
    /// A result refers to a locus absent from the settings map.
    #[error("no genotyping settings for locus {0}")]
    MissingLocusSettings(i64),
}

/// Per-locus genotyping parameters (meanings in the module docs).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(default)]
pub struct GenotypingParams {
    /// Peaks within this many artifact SDs of their expected artifact height can
    /// still be called on probability; above it they are called regardless.
    pub soft_artifact_sd_limit: f64,
    /// SDs of artifact error subtracted before the absolute height test.
    pub hard_artifact_sd_limit: f64,
    /// RFU above which signal is saturated.
    pub offscale_threshold: f64,
    /// Fallback maximum bleedthrough ratio before a peak is flagged when
    /// `measured_pullup` is off or plate pull-up was not measured for a dye or
    /// capillary. Pull-up on 3730 instruments is typically 1 to 4% of the
    /// other dye's peak and reaches 14% (ratio 7) on some; at 5, a peak a
    /// fifth of another dye's peak at the same point is flagged.
    pub bleedthrough_filter_limit: f64,
    /// Use each plate's measured pull-up (expected pull-up RFU and spread from
    /// its quality report) instead of a fixed bleedthrough ratio where
    /// available.
    pub measured_pullup: bool,
    /// Standard deviations of the plate's measured pull-up spread added to the
    /// expected pull-up height when flagging a peak.
    pub pullup_sd_limit: f64,
    /// Maximum crosstalk ratio before a peak is flagged. Capillary crosstalk
    /// on 3730 data is about 1% of the neighbor's signal (ratio 90 and up)
    /// and 2.5 to 3% next to a saturated peak (ratio 33 and up).
    pub crosstalk_filter_limit: f64,
    /// Reject peaks at a spectral breakdown ([`spectral_breakdown`]). Off by
    /// default: there the signal of one fragment shows in two dyes, and
    /// either can be the true one, so rejecting both loses the true allele
    /// as often as it removes the copy. The call is flagged either way.
    pub reject_spectral_breakdown: bool,
    /// Minimum height relative to the tallest peak.
    pub relative_peak_height_limit: f64,
    /// Minimum height (RFU) after removing expected artifact.
    pub absolute_peak_height_limit: f64,
    /// At least one peak must exceed this (RFU) or the run failed.
    pub failure_threshold: f64,
    /// Probability needed to call a peak in the final probabilistic pass.
    pub probability_threshold: f64,
    /// Probability needed to stay a candidate while estimating prevalence and MOI.
    pub bootstrap_probability_threshold: f64,
}

impl Default for GenotypingParams {
    fn default() -> Self {
        GenotypingParams {
            soft_artifact_sd_limit: 6.0,
            hard_artifact_sd_limit: 0.0,
            offscale_threshold: 32000.0,
            bleedthrough_filter_limit: 5.0,
            measured_pullup: true,
            pullup_sd_limit: peaks::DEFAULT_PULLUP_SD_LIMIT,
            crosstalk_filter_limit: 30.0,
            reject_spectral_breakdown: false,
            relative_peak_height_limit: 0.01,
            // 200 RFU is 15 times the noise SD of 3730 traces (5 to 14 RFU).
            // On real mixtures 200 and 0.8 each found more than two true
            // minor alleles per false call they added against 300 and 0.9,
            // keeping the false-call rate under 3%; lower values did not.
            absolute_peak_height_limit: 200.0,
            failure_threshold: 500.0,
            probability_threshold: 0.8,
            bootstrap_probability_threshold: 0.99,
        }
    }
}

/// One run (capillary channel) of one sample at the locus being analyzed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct Run {
    /// Opaque storage key of the run (channel).
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub run_id: i64,
    /// Opaque storage key of the sample the run belongs to.
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub sample_id: i64,
    /// False when the well's ladder sizing was judged poor; such runs are never used.
    pub sizing_ok: bool,
    /// Peaks with size, height, relative height and bleedthrough/crosstalk ratios.
    pub peaks: Vec<Peak>,
}

/// Run-level flags of a sample × locus result.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(default)]
pub struct CallFlags {
    /// No peak exceeded the failure threshold; nothing is called.
    pub failure: bool,
    /// Some signal exceeded the off-scale threshold; proportions are unreliable.
    pub offscale: bool,
    /// An allele-bin peak sits where the dyes were not separated (spectral
    /// breakdown, [`spectral_breakdown`]): its signal may be another dye's,
    /// and this dye's own alleles may show in another dye. Derived from the
    /// peaks, so it is not stored separately.
    pub spectral: bool,
    /// The user edited the calls; kept until the locus is re-analyzed.
    pub manual_curation: bool,
}

/// Alleles called for one sample at one locus.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct SampleLocusCall {
    /// Opaque storage key of the sample.
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub sample_id: i64,
    /// Opaque storage key of the locus.
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub locus_id: i64,
    /// Run the call is based on; `None` when the sample has no usable run.
    #[cfg_attr(feature = "ts", ts(type = "number | null"))]
    pub reference_run_id: Option<i64>,
    /// The reference run's peaks with flags, probability and quantification.
    pub peaks: Vec<Peak>,
    /// Bin ids called as alleles. Any number.
    #[cfg_attr(feature = "ts", ts(type = "Array<number>"))]
    pub alleles: BTreeSet<i64>,
    /// Failure, off-scale and manual-curation flags.
    pub flags: CallFlags,
}

// ---------------------------------------------------------------------------
// Per-locus calling
// ---------------------------------------------------------------------------

/// Annotates one run's peaks with bins and (if a model is given) artifact
/// expectations; without a model, artifact fields are reset to 0.
pub fn annotate_run(peaks: &mut [Peak], bins: &[Bin], artifact_model: Option<&ArtifactModel>) {
    bins::annotate_bins(peaks, bins);
    match artifact_model {
        Some(model) => artifact::annotate_artifacts(peaks, model),
        None => artifact::annotate_artifacts(peaks, &ArtifactModel::default()),
    }
}

/// Picks the reference run among one sample's runs (see module docs). Runs
/// must already be bin-annotated.
pub fn select_reference_run<'a>(runs: &[&'a Run], offscale_threshold: f64) -> Option<&'a Run> {
    // Saturated peaks do not reflect template amounts, so a run with an
    // off-scale allele loses to any run without one; in a mixture it would
    // otherwise still win on its other, unsaturated alleles.
    // A spectral breakdown in a bin is as bad: the run's signal may belong
    // to another dye.
    let offscale = |r: &Run| {
        r.peaks.iter().any(|p| {
            p.in_bin && (p.saturation_height() > offscale_threshold || spectral_breakdown(p))
        })
    };
    let strongest = |r: &Run| {
        r.peaks
            .iter()
            .filter(|p| p.saturation_height() <= offscale_threshold && p.in_bin)
            .map(|p| p.height)
            .fold(0.0, f64::max)
    };
    let mut usable: Vec<&'a Run> = runs.iter().copied().filter(|r| r.sizing_ok).collect();
    usable.sort_by_key(|r| r.run_id);
    let mut best: Option<(&'a Run, bool, f64)> = None;
    for r in usable {
        let (clean, s) = (!offscale(r), strongest(r));
        if best.is_none_or(|(_, bc, bs)| (clean, s) > (bc, bs)) {
            best = Some((r, clean, s));
        }
    }
    best.map(|(r, _, _)| r)
}

/// Smallest bleedthrough ratio at which an off-scale other dye explains a
/// peak. Under a clipped peak the other dyes of a 3730 read up to about half
/// the clip level, so pull-up can stand at a ratio as low as 2; a peak taller
/// than that is not the leak of its source, whatever the source's height.
pub const OFFSCALE_BLEEDTHROUGH_MIN_RATIO: f64 = 2.0;

/// Smallest crosstalk ratio at which an off-scale neighbor capillary explains
/// a peak. Leak next to a saturated capillary is 2.5 to 3% of its signal,
/// and a clipped run of 1 to 4 points means the true apex is at most about
/// 1.5 times the clip level, so leak stays under about 5% (ratio 20); 10
/// leaves a factor of two.
pub const OFFSCALE_CROSSTALK_MIN_RATIO: f64 = 10.0;

/// True when the other-dye signal under the peak is off-scale and the peak
/// is small enough beside it to be its pull-up.
fn bleedthrough_source_offscale(p: &Peak, t: f64) -> bool {
    p.bleedthrough_ratio >= OFFSCALE_BLEEDTHROUGH_MIN_RATIO && p.height * p.bleedthrough_ratio > t
}

/// True when a neighbor capillary is off-scale here and the peak is small
/// enough beside it to be its leak.
fn crosstalk_source_offscale(p: &Peak, t: f64) -> bool {
    p.crosstalk_ratio >= OFFSCALE_CROSSTALK_MIN_RATIO && p.height * p.crosstalk_ratio > t
}

/// Fraction of the largest signal at a point by which another dye must dip
/// below its baseline for the point to count as a spectral breakdown.
/// Spectral over-subtraction under a tall peak leaves dips of at most about
/// 6% of it on 3730 data; where a capillary's dyes are not separated, the
/// other dyes read 60 to 100% of the signal, positive and negative.
pub const SPECTRAL_DIP_FRACTION: f64 = 0.25;

/// Smallest dip (RFU, about the peak's height times its dip ratio) that can
/// mark a spectral breakdown: ten times the noise SD of 3730 traces (5 to
/// 14 RFU), so noise under a noise-level peak does not.
pub const SPECTRAL_MIN_DIP_RFU: f64 = 150.0;

/// True when another dye dips below its baseline at the peak by more than
/// [`SPECTRAL_DIP_FRACTION`] of the largest signal there (this peak's or
/// another dye's), and by at least [`SPECTRAL_MIN_DIP_RFU`].
pub fn spectral_breakdown(p: &Peak) -> bool {
    p.spectral_dip_ratio > SPECTRAL_DIP_FRACTION * p.bleedthrough_ratio.max(1.0)
        && p.spectral_dip_ratio * p.height >= SPECTRAL_MIN_DIP_RFU
}

/// True when an allele-bin peak of the run sits at a spectral breakdown.
pub fn has_spectral_breakdown(peaks: &[Peak]) -> bool {
    peaks.iter().any(|p| p.in_bin && spectral_breakdown(p))
}

/// True when another dye in the same well explains `p` as pull-up (using the
/// plate's measured pull-up when enabled and available, falling back to
/// `bleedthrough_filter_limit` for unmeasured dyes, unchecked plates, and
/// unseparated capillaries, plus the off-scale source clause).
pub fn is_bleedthrough(p: &Peak, params: &GenotypingParams) -> bool {
    if bleedthrough_source_offscale(p, params.offscale_threshold) {
        return true;
    }
    if params.measured_pullup {
        if let (Some(epu), Some(spu)) = (p.pullup_contribution, p.pullup_error) {
            let pu_bound = epu + params.pullup_sd_limit * spu;
            let measured_hit =
                if p.height - p.artifact_contribution >= params.absolute_peak_height_limit {
                    (pu_bound > 0.0 && p.height - p.artifact_contribution <= pu_bound)
                        || (epu > 0.0 && p.height - epu < params.absolute_peak_height_limit)
                } else {
                    pu_bound > 0.0 && p.height <= pu_bound
                };
            return measured_hit
                || p.fallback_bleedthrough_ratio > params.bleedthrough_filter_limit;
        }
    }
    p.bleedthrough_ratio > params.bleedthrough_filter_limit
}

/// True when the same dye in a neighboring capillary explains `p` as crosstalk.
pub fn is_crosstalk(p: &Peak, params: &GenotypingParams) -> bool {
    p.crosstalk_ratio > params.crosstalk_filter_limit
        || crosstalk_source_offscale(p, params.offscale_threshold)
}

/// Sets every peak's rejection flags from scratch.
pub fn flag_peaks(peaks: &mut [Peak], params: &GenotypingParams) {
    for p in peaks.iter_mut() {
        p.flags.below_relative_threshold = p.relative_height < params.relative_peak_height_limit;
        p.flags.artifact =
            p.height - p.artifact_contribution - p.artifact_error * params.hard_artifact_sd_limit
                < params.absolute_peak_height_limit;
        p.flags.bleedthrough = is_bleedthrough(p, params);
        p.flags.crosstalk = is_crosstalk(p, params);
        p.flags.spectral = params.reject_spectral_breakdown && spectral_breakdown(p);
    }
}

fn run_flags(peaks: &[Peak], params: &GenotypingParams) -> CallFlags {
    let t = params.offscale_threshold;
    CallFlags {
        failure: !peaks.iter().any(|p| p.height > params.failure_threshold),
        offscale: peaks.iter().any(|p| {
            p.saturation_height() > t
                || bleedthrough_source_offscale(p, t)
                || crosstalk_source_offscale(p, t)
        }),
        spectral: has_spectral_breakdown(peaks),
        manual_curation: false,
    }
}

/// A peak that may be called: binned, inside the bin, no flag.
fn callable(p: &Peak) -> bool {
    p.in_bin && p.bin_id.is_some() && !p.flags.any()
}

/// Recomputes relative and bias-corrected proportions over the called peaks
/// (those holding a called bin). Use after a change of β.
pub fn apply_quantification(call: &mut SampleLocusCall, beta: Option<f64>) {
    let alleles = &call.alleles;
    quant_bias::quantify(
        &mut call.peaks,
        |p| p.bin_id.is_some_and(|b| alleles.contains(&b)),
        beta,
    );
}

fn call_sample(
    sample_id: i64,
    locus_id: i64,
    runs: &[&Run],
    params: &GenotypingParams,
    beta: Option<f64>,
) -> SampleLocusCall {
    let mut call = SampleLocusCall {
        sample_id,
        locus_id,
        reference_run_id: None,
        peaks: Vec::new(),
        alleles: BTreeSet::new(),
        flags: CallFlags::default(),
    };
    let Some(run) = select_reference_run(runs, params.offscale_threshold) else {
        return call;
    };
    call.reference_run_id = Some(run.run_id);
    call.peaks = run.peaks.clone();
    for p in call.peaks.iter_mut() {
        p.probability = None;
    }
    flag_peaks(&mut call.peaks, params);
    call.flags = run_flags(&call.peaks, params);
    if !call.flags.failure {
        call.alleles = call
            .peaks
            .iter()
            .filter(|p| callable(p))
            .filter_map(|p| p.bin_id)
            .collect();
    }
    apply_quantification(&mut call, beta);
    call
}

/// Analyzes one locus: annotates every run in place, then returns one call per
/// sample that has at least one run, ordered by sample id. Any earlier manual
/// edits are discarded. A sample whose runs all have poor sizing gets a call
/// with no reference run and no alleles.
pub fn analyze_locus(
    locus_id: i64,
    runs: &mut [Run],
    bins: &[Bin],
    artifact_model: Option<&ArtifactModel>,
    beta: Option<f64>,
    params: &GenotypingParams,
) -> Vec<SampleLocusCall> {
    for run in runs.iter_mut() {
        annotate_run(&mut run.peaks, bins, artifact_model);
    }
    let mut by_sample: BTreeMap<i64, Vec<&Run>> = BTreeMap::new();
    for run in runs.iter() {
        by_sample.entry(run.sample_id).or_default().push(run);
    }
    by_sample
        .into_iter()
        .map(|(sample_id, rs)| call_sample(sample_id, locus_id, &rs, params, beta))
        .collect()
}

/// Turns a called bin off or on by hand, marks the result as manually curated
/// and recomputes proportions. Any bin id may be toggled.
pub fn toggle_allele(call: &mut SampleLocusCall, bin_id: i64, beta: Option<f64>) {
    if !call.alleles.remove(&bin_id) {
        call.alleles.insert(bin_id);
    }
    call.flags.manual_curation = true;
    apply_quantification(call, beta);
}

// ---------------------------------------------------------------------------
// Project-wide probabilistic annotation
// ---------------------------------------------------------------------------

/// Parameters and bias factor of one locus, for the project-wide pass.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct LocusSettings {
    /// Genotyping parameters of the locus.
    pub params: GenotypingParams,
    /// Amplification-bias factor of the locus, if one was estimated.
    pub beta: Option<f64>,
}

/// Options of the project-wide pass.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(default)]
pub struct ProbabilisticOptions {
    /// MOI is the allele count of the locus ranked `1 + moi_offset` from the top.
    pub moi_offset: u32,
}

impl Default for ProbabilisticOptions {
    fn default() -> Self {
        ProbabilisticOptions { moi_offset: 1 }
    }
}

/// Population estimates from the project-wide pass.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct ProbabilisticSummary {
    /// MOI per true sample (by sample id).
    #[cfg_attr(feature = "ts", ts(type = "Record<number, number>"))]
    pub moi: BTreeMap<i64, u32>,
    /// Allele prevalence per locus id, then per bin id (fraction of typed true samples).
    #[cfg_attr(feature = "ts", ts(type = "Record<number, Record<number, number>>"))]
    pub prevalence: BTreeMap<i64, BTreeMap<i64, f64>>,
}

type Prevalence = BTreeMap<i64, BTreeMap<i64, f64>>;

fn init_probabilities(peaks: &mut [Peak]) {
    for p in peaks.iter_mut() {
        p.probability = Some(if callable(p) { 1.0 } else { 0.0 });
    }
}

fn candidates(peaks: &[Peak], bootstrap: f64) -> Vec<usize> {
    (0..peaks.len())
        .filter(|&i| callable(&peaks[i]) && peaks[i].probability.unwrap_or(0.0) >= bootstrap)
        .collect()
}

fn moi_from_counts(mut counts: Vec<usize>, offset: u32) -> u32 {
    counts.sort_unstable();
    let k = offset as usize;
    if counts.len() > k {
        counts[counts.len() - 1 - k] as u32
    } else {
        0
    }
}

/// Probability the peak is real given the chance `prob_negative` that no clone
/// carries its allele (module docs, "Bayes").
fn posterior(p: &Peak, prob_negative: f64) -> f64 {
    let z = (p.height - p.artifact_contribution) / p.artifact_error.max(1e-6);
    let q = normal_sf(z);
    let num = q * prob_negative;
    let den = num + 1.0 - prob_negative;
    if den >= 1e-6 {
        // 1 − num/den, written without the cancellation.
        ((1.0 - prob_negative) / den).clamp(0.0, 1.0)
    } else {
        (1.0 - num / 1e-6).max(0.0)
    }
}

/// How a peak's own weight enters its prior.
#[derive(Clone, Copy, PartialEq, Eq)]
enum OwnWeight {
    /// `p_i · f(a_i)` with its current probability, as the loops do.
    Current,
    /// `f(a_i)`: the final pass, where the peak's own evidence enters
    /// through the artifact term only.
    Prior,
}

/// Recomputes the probabilities of `idx` peaks against each other.
fn update_probabilities(
    peaks: &mut [Peak],
    idx: &[usize],
    moi: u32,
    prevalence: Option<&BTreeMap<i64, f64>>,
    own: OwnWeight,
) {
    let freq = |p: &Peak| {
        p.bin_id
            .and_then(|b| prevalence.and_then(|m| m.get(&b)).copied())
            .unwrap_or(0.0)
    };
    let w: Vec<f64> = idx
        .iter()
        .map(|&i| peaks[i].probability.unwrap_or(0.0) * freq(&peaks[i]))
        .collect();
    // The peak standing tallest above its expected artifact is taken as
    // real: some clone carries it.
    let tallest = (0..idx.len()).max_by(|&a, &b| {
        let net = |k: usize| peaks[idx[k]].height - peaks[idx[k]].artifact_contribution;
        net(a).total_cmp(&net(b)).then(b.cmp(&a))
    });
    let pn: Vec<f64> = idx
        .iter()
        .enumerate()
        .map(|(k, &i)| {
            let others: f64 = w
                .iter()
                .enumerate()
                .filter(|&(j, _)| j != k)
                .map(|(_, v)| v)
                .sum();
            let own_w = match own {
                OwnWeight::Current => w[k],
                OwnWeight::Prior => freq(&peaks[i]),
            };
            let total = others + own_w;
            if total <= 0.0 {
                return 1.0;
            }
            let plain = (others / total).clamp(0.0, 1.0).powi(moi as i32);
            match tallest {
                Some(t) if t != k => {
                    // P(no clone carries i | some clone carries t).
                    let pi = (own_w / total).clamp(0.0, 1.0);
                    let pt = (w[t] / total).clamp(0.0, 1.0);
                    let m = moi as i32;
                    let den = 1.0 - (1.0 - pt).powi(m);
                    if den > 0.0 {
                        (((1.0 - pi).powi(m) - (1.0 - pi - pt).max(0.0).powi(m)) / den)
                            .clamp(0.0, 1.0)
                    } else {
                        plain
                    }
                }
                _ => plain,
            }
        })
        .collect();
    for (k, &i) in idx.iter().enumerate() {
        peaks[i].probability = Some(posterior(&peaks[i], pn[k]));
    }
}

fn compute_prevalence(
    calls: &[SampleLocusCall],
    active: &[usize],
    settings: &BTreeMap<i64, LocusSettings>,
) -> Prevalence {
    let mut typed: BTreeMap<i64, u32> = BTreeMap::new();
    let mut counts: Prevalence = BTreeMap::new();
    for &c in active {
        let call = &calls[c];
        let boot = settings[&call.locus_id]
            .params
            .bootstrap_probability_threshold;
        let cand = candidates(&call.peaks, boot);
        if cand.is_empty() {
            continue;
        }
        *typed.entry(call.locus_id).or_default() += 1;
        let locus = counts.entry(call.locus_id).or_default();
        let bins: BTreeSet<i64> = cand.iter().filter_map(|&i| call.peaks[i].bin_id).collect();
        for b in bins {
            *locus.entry(b).or_default() += 1.0;
        }
    }
    for (locus, bins) in counts.iter_mut() {
        let n = f64::from(typed[locus]);
        for v in bins.values_mut() {
            *v /= n;
        }
    }
    counts
}

fn sample_moi(
    calls: &[SampleLocusCall],
    sample_calls: &[usize],
    settings: &BTreeMap<i64, LocusSettings>,
    offset: u32,
) -> u32 {
    let counts = sample_calls
        .iter()
        .map(|&c| {
            let call = &calls[c];
            candidates(
                &call.peaks,
                settings[&call.locus_id]
                    .params
                    .bootstrap_probability_threshold,
            )
            .len()
        })
        .collect();
    moi_from_counts(counts, offset)
}

/// Runs the project-wide probabilistic annotation (module docs) over every
/// sample × locus result of a project, updating peak probabilities, calls and
/// proportions in place. `is_control(sample_id)` marks samples that must not
/// inform the population model; their results are left untouched.
pub fn annotate_probabilities(
    calls: &mut [SampleLocusCall],
    is_control: impl Fn(i64) -> bool,
    settings: &BTreeMap<i64, LocusSettings>,
    options: &ProbabilisticOptions,
) -> Result<ProbabilisticSummary, GenotypingError> {
    if let Some(c) = calls.iter().find(|c| !settings.contains_key(&c.locus_id)) {
        return Err(GenotypingError::MissingLocusSettings(c.locus_id));
    }
    // True samples, each with its non-failed results, in (sample, locus) order.
    let mut by_sample: BTreeMap<i64, Vec<usize>> = BTreeMap::new();
    for (i, c) in calls.iter().enumerate() {
        if is_control(c.sample_id) {
            continue;
        }
        let entry = by_sample.entry(c.sample_id).or_default();
        if !c.flags.failure {
            entry.push(i);
        }
    }
    for v in by_sample.values_mut() {
        v.sort_by_key(|&i| calls[i].locus_id);
    }
    let active: Vec<usize> = by_sample.values().flatten().copied().collect();
    let boot = |c: &SampleLocusCall| settings[&c.locus_id].params.bootstrap_probability_threshold;
    let reset = |calls: &mut [SampleLocusCall]| {
        for &c in &active {
            init_probabilities(&mut calls[c].peaks);
        }
    };

    // Prevalence loop.
    reset(calls);
    let max_rounds = active
        .iter()
        .map(|&c| candidates(&calls[c].peaks, boot(&calls[c])).len())
        .sum::<usize>()
        + 1;
    let mut prevalence = Prevalence::new();
    for _ in 0..max_rounds {
        prevalence = compute_prevalence(calls, &active, settings);
        let mut dropped = false;
        for sample_calls in by_sample.values() {
            let moi = sample_moi(calls, sample_calls, settings, options.moi_offset);
            for &c in sample_calls {
                let b = boot(&calls[c]);
                let idx = candidates(&calls[c].peaks, b);
                let locus = calls[c].locus_id;
                update_probabilities(
                    &mut calls[c].peaks,
                    &idx,
                    moi,
                    prevalence.get(&locus),
                    OwnWeight::Current,
                );
                dropped |= idx
                    .iter()
                    .any(|&i| calls[c].peaks[i].probability.unwrap_or(0.0) < b);
            }
        }
        if !dropped {
            break;
        }
    }

    // MOI loop.
    reset(calls);
    let mut moi_of: BTreeMap<i64, u32> = BTreeMap::new();
    for (&sample, sample_calls) in &by_sample {
        let limit = sample_calls
            .iter()
            .map(|&c| calls[c].peaks.len())
            .sum::<usize>()
            + 2;
        let mut moi = 0;
        for _ in 0..limit {
            let next = sample_moi(calls, sample_calls, settings, options.moi_offset);
            if next == moi {
                break;
            }
            moi = next;
            for &c in sample_calls {
                let idx = candidates(&calls[c].peaks, boot(&calls[c]));
                let locus = calls[c].locus_id;
                update_probabilities(
                    &mut calls[c].peaks,
                    &idx,
                    moi,
                    prevalence.get(&locus),
                    OwnWeight::Current,
                );
            }
        }
        moi_of.insert(sample, moi);
    }

    // Final pass. Weights are the probabilities the MOI loop converged to: a
    // peak the loops rejected must not take prior support from the others,
    // as it would at weight 1.
    for (sample, sample_calls) in &by_sample {
        let moi = moi_of[sample];
        for &c in sample_calls {
            let call = &mut calls[c];
            let LocusSettings { params, beta } = settings[&call.locus_id];
            let idx: Vec<usize> = (0..call.peaks.len())
                .filter(|&i| callable(&call.peaks[i]))
                .collect();
            update_probabilities(
                &mut call.peaks,
                &idx,
                moi,
                prevalence.get(&call.locus_id),
                OwnWeight::Prior,
            );
            if !call.flags.manual_curation {
                call.alleles = call
                    .peaks
                    .iter()
                    .filter(|p| {
                        callable(p)
                            && (p.probability.unwrap_or(0.0) >= params.probability_threshold
                                || (p.height - p.artifact_contribution) / p.artifact_error.max(1.0)
                                    > params.soft_artifact_sd_limit)
                    })
                    .filter_map(|p| p.bin_id)
                    .collect();
            }
            apply_quantification(call, beta);
        }
    }

    Ok(ProbabilisticSummary {
        moi: moi_of,
        prevalence,
    })
}

#[cfg(test)]
mod tests;
