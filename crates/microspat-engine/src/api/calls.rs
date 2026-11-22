//! Calls (genotyping and quantification-bias projects): the review screens,
//! curation, the project-wide probabilistic pass, summaries, and the β view.

use super::projects::{locus_of, require_calls, require_kind, require_sample, ProjectLocusParams};
use super::samples::Designation;
use super::{some_of, IdParams};
use crate::error::{OrNotFound, Result, RpcError};
use crate::events::entity::PROJECTS;
use crate::fingerprint::Fingerprint;
use crate::projects::analysis::{
    self, artifact_model, load_bins, row_to_call, GenotypingResult, QuantBiasResult,
};
use crate::projects::inputs::{self, AnalysisState, AnalysisStatus, RunsIndex};
use crate::projects::{load_row, locus_params, pipeline, project_loci, ProjectKind, ProjectRow};
use crate::rpc::Registry;
use crate::sizing::SizingState;
use crate::Engine;
use microspat_core::genotyping::{
    self, CallFlags, GenotypingParams, LocusSettings, ProbabilisticOptions, SampleLocusCall,
};
use microspat_core::quant_bias::{
    control_points, BiasEstimate, ControlPeakExclusion, QuantBiasParams,
};
use microspat_core::{Bin, Color, Peak};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use ts_rs::TS;

/// A called allele.
#[derive(Debug, Clone, Serialize, TS)]
pub struct AlleleRef {
    pub bin_id: i64,
    /// Bin label; "?" when the bin no longer exists.
    pub label: String,
    /// Size (bp, 2 decimals) of the allele's peak in the reference run (the
    /// tallest one in the bin). Absent when the reference run has no peak in
    /// the bin (a bin called by hand).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub size: Option<f64>,
    /// Share of the called signal (peak height minus expected artifact, over
    /// every called peak of the reference run), 4 decimals. The same number as
    /// "Proportion" in the exports.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub proportion: Option<f64>,
    /// `proportion` corrected for size-dependent amplification bias (equal to
    /// it when the project has no β at this locus), 4 decimals.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub corrected_proportion: Option<f64>,
    /// Peak probability from the probabilistic pass, 4 decimals.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub probability: Option<f64>,
}

/// Which calling rule rejected a [`NarrowMiss`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum NarrowMissReason {
    /// Too little signal left after subtracting expected artifact.
    Artifact,
    /// Unflagged, but its probability is under the calling threshold.
    Probability,
}

/// A binned peak of the reference run, its bin not called, that one calling
/// rule rejected by a small margin: rejected as artifact only, with its
/// signal after expected artifact short of `absolute_peak_height_limit` by at
/// most one artifact SD (clamped to 10–20% of the limit); or unflagged with a probability
/// in [0.5, `probability_threshold`). Full definition: [`narrow_misses`].
#[derive(Debug, Clone, Serialize, TS)]
pub struct NarrowMiss {
    pub bin_id: i64,
    pub label: String,
    /// bp, 2 decimals.
    pub size: f64,
    /// RFU.
    pub height: f64,
    pub reason: NarrowMissReason,
    /// `artifact`: RFU left after subtracting the expected artifact and
    /// `hard_artifact_sd_limit` artifact SDs; `probability`: the probability.
    pub value: f64,
    /// What `value` had to reach: `absolute_peak_height_limit` or
    /// `probability_threshold`.
    pub limit: f64,
}

/// A locus, by id and label.
#[derive(Debug, Clone, Serialize, TS)]
pub struct LocusRef {
    pub locus_id: i64,
    pub locus_label: String,
}

/// One sample's call at a locus, as a table row.
#[derive(Debug, Clone, Serialize, TS)]
pub struct CallRow {
    pub sample_id: i64,
    pub barcode: String,
    pub designation: Designation,
    /// Null when the sample has no run with usable sizing at this locus.
    pub reference_run_id: Option<i64>,
    /// By size. Any number.
    pub alleles: Vec<AlleleRef>,
    pub flags: CallFlags,
    /// From the probabilistic pass.
    pub moi: Option<u32>,
    pub comment: Option<String>,
    /// Peaks retained in the reference run.
    pub peak_count: u32,
    /// Tallest peak of the reference run (RFU).
    pub max_height: Option<f64>,
    /// Lowest probability among the called alleles. Absent before the
    /// probabilistic pass, or when nothing is called.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub min_probability: Option<f64>,
    /// Binned peaks rejected by a small margin, by size. Absent when none.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    #[ts(optional = nullable)]
    pub narrow_misses: Vec<NarrowMiss>,
    /// Plate of the reference run. Absent without a reference run.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub plate_label: Option<String>,
    /// Well of the reference run (`A01`). Absent without a reference run.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub well_label: Option<String>,
    /// Runs of the sample at this locus whatever their sizing, the reference
    /// run included: above 1 means there are other runs to compare.
    #[ts(optional = nullable)]
    pub run_count: u32,
    /// The call reads as reviewed: a reviewer confirmed it and its alleles,
    /// flags and reference run have not changed since (see `set_call_reviewed`).
    #[ts(optional = nullable)]
    pub reviewed: bool,
    /// A review mark is stored but no longer matches the call: its alleles,
    /// flags or reference run changed since it was reviewed. Absent when false.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    #[ts(optional = nullable)]
    pub review_dropped: bool,
}

/// Every sample's call at one locus.
#[derive(Debug, Clone, Serialize, TS)]
pub struct LocusCalls {
    pub project_id: i64,
    pub locus_id: i64,
    pub locus_label: String,
    pub status: AnalysisStatus,
    /// Genotyping: state of the probabilistic pass.
    pub probabilities: Option<AnalysisStatus>,
    /// Bins of the bin estimator at this locus.
    pub bins: Vec<Bin>,
    pub rows: Vec<CallRow>,
}

/// The reference run of a call with its trace.
#[derive(Debug, Clone, Serialize, TS)]
pub struct ReferenceTrace {
    pub run_id: i64,
    pub channel_id: i64,
    pub color: Color,
    pub trace: Vec<i16>,
    /// Base size of every data point.
    pub base_sizes: Option<Vec<f64>>,
}

/// One run of the sample at the locus, freshly annotated with the project's
/// current parameters, bins and artifact model.
#[derive(Debug, Clone, Serialize, TS)]
pub struct SampleRunView {
    pub run_id: i64,
    pub channel_id: i64,
    pub well_id: i64,
    pub plate_id: i64,
    pub plate_label: String,
    pub well_label: String,
    pub sizing: SizingState,
    pub max_signal: Option<i32>,
    /// True for the call's reference run.
    pub is_reference: bool,
    pub peaks: Vec<Peak>,
    /// Plate-measured pull-up rates targeting this locus's dye for this run's
    /// plate (absent when unchecked, unseparated, or `measured_pullup` is off).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[ts(optional = nullable)]
    pub plate_pull_up: Vec<microspat_core::quality::LeakEstimate>,
}

/// Everything the sample × locus review needs.
#[derive(Debug, Clone, Serialize, TS)]
pub struct SampleLocusCallView {
    pub project_id: i64,
    pub sample_id: i64,
    pub barcode: String,
    pub designation: Designation,
    pub locus_id: i64,
    pub locus_label: String,
    pub color: Color,
    pub min_base_length: f64,
    pub max_base_length: f64,
    pub status: AnalysisStatus,
    pub row: CallRow,
    /// The stored call's peaks (flags, artifact, probability, proportions).
    pub peaks: Vec<Peak>,
    pub bins: Vec<Bin>,
    pub reference: Option<ReferenceTrace>,
    /// All runs of the sample at this locus (including the reference run).
    pub runs: Vec<SampleRunView>,
}

/// A called peak of a sample at a locus, for the per-sample view.
#[derive(Debug, Clone, Serialize, TS)]
pub struct CalledPeak {
    pub bin_id: i64,
    pub label: String,
    pub size: f64,
    pub height: f64,
    pub relative_quantification: Option<f64>,
    pub corrected_relative_quantification: Option<f64>,
    pub probability: Option<f64>,
}

/// One locus in the per-sample view.
#[derive(Debug, Clone, Serialize, TS)]
pub struct SampleLocusSummary {
    pub locus_id: i64,
    pub locus_label: String,
    pub color: Color,
    pub status: AnalysisStatus,
    /// Null when the locus has no call for this sample yet.
    pub row: Option<CallRow>,
    pub called: Vec<CalledPeak>,
}

/// One sample across every locus of a project.
#[derive(Debug, Clone, Serialize, TS)]
pub struct SampleCalls {
    pub project_id: i64,
    pub sample_id: i64,
    pub barcode: String,
    pub designation: Designation,
    /// MOI from the probabilistic model: counts only alleles whose
    /// probability reaches the bootstrap threshold, so it can be below
    /// `max_alleles`.
    pub moi: Option<u32>,
    pub probabilities: Option<AnalysisStatus>,
    pub loci: Vec<SampleLocusSummary>,
    /// Most alleles called at any one locus (over calls with a reference run).
    /// Absent when the sample has no such call.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub max_alleles: Option<u32>,
    /// The loci where `max_alleles` alleles are called, in locus-set order
    /// (empty when `max_alleles` is 0).
    #[ts(optional = nullable)]
    pub max_alleles_loci: Vec<LocusRef>,
}

/// Params naming one call.
#[derive(Debug, Clone, Copy, Deserialize, TS)]
pub struct CallParams {
    pub project_id: i64,
    pub sample_id: i64,
    pub locus_id: i64,
}

/// Params of `toggle_allele`.
#[derive(Debug, Clone, Copy, Deserialize, TS)]
pub struct ToggleAlleleParams {
    pub project_id: i64,
    pub sample_id: i64,
    pub locus_id: i64,
    pub bin_id: i64,
}

/// Params of `set_call_comment`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct SetCallCommentParams {
    pub project_id: i64,
    pub sample_id: i64,
    pub locus_id: i64,
    /// Null or empty clears it.
    pub comment: Option<String>,
}

/// Params of `set_call_reviewed`.
#[derive(Debug, Clone, Copy, Deserialize, TS)]
pub struct SetCallReviewedParams {
    pub project_id: i64,
    pub sample_id: i64,
    pub locus_id: i64,
    /// True confirms the call as it stands now; false clears the mark.
    pub reviewed: bool,
}

/// Params of `set_calls_reviewed`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct SetCallsReviewedParams {
    pub project_id: i64,
    pub locus_id: i64,
    /// Samples whose calls at the locus to mark; omitted = every call at the locus.
    #[serde(default)]
    #[ts(optional)]
    pub sample_ids: Option<Vec<i64>>,
    pub reviewed: bool,
}

/// Result of `set_calls_reviewed`.
#[derive(Debug, Clone, Serialize, TS)]
pub struct SetCallsReviewedResult {
    /// Calls marked (or cleared).
    pub updated: u32,
    /// Requested samples with no call at the locus (not in the project, or
    /// not analyzed yet); nothing was done for them.
    pub missing: Vec<i64>,
}

/// Params of `get_project_sample_calls`.
#[derive(Debug, Clone, Copy, Deserialize, TS)]
pub struct ProjectSampleParams {
    pub project_id: i64,
    pub sample_id: i64,
}

/// Params of `calculate_peak_probabilities`.
#[derive(Debug, Clone, Copy, Deserialize, TS)]
pub struct CalculateProbabilitiesParams {
    pub id: i64,
    /// MOI is the allele count of the locus ranked 1 + offset from the top (default 1).
    #[serde(default)]
    #[ts(optional)]
    pub moi_offset: Option<u32>,
}

/// How many samples have each MOI.
#[derive(Debug, Clone, Serialize, TS)]
pub struct MoiCount {
    pub moi: u32,
    pub samples: u32,
}

/// Result of `calculate_peak_probabilities`.
#[derive(Debug, Clone, Serialize, TS)]
pub struct ProbabilityResult {
    pub samples: u32,
    pub moi: Vec<MoiCount>,
    /// Calls kept because they were curated by hand.
    pub manual_calls_kept: u32,
}

/// An allele's frequency at a locus.
#[derive(Debug, Clone, Serialize, TS)]
pub struct AlleleFrequency {
    pub bin_id: i64,
    pub label: String,
    pub base_size: f64,
    /// Typed samples carrying it.
    pub count: u32,
    /// count / typed samples (prevalences sum past 1 in mixed infections).
    pub prevalence: f64,
    /// From the probabilistic pass, when current.
    pub estimated_prevalence: Option<f64>,
}

/// Per-locus summary.
#[derive(Debug, Clone, Serialize, TS)]
pub struct LocusSummary {
    pub locus_id: i64,
    pub locus_label: String,
    pub status: AnalysisStatus,
    /// True samples (not controls) with a call row.
    pub samples: u32,
    /// With at least one allele.
    pub typed: u32,
    pub failed: u32,
    /// No run with usable sizing.
    pub no_run: u32,
    /// (failed + no_run) / samples.
    pub failure_rate: f64,
    pub alleles: Vec<AlleleFrequency>,
    /// Every call row at the locus, controls included (the review queue).
    #[ts(optional = nullable)]
    pub calls: u32,
    /// Of `calls`, those that read as reviewed.
    #[ts(optional = nullable)]
    pub reviewed: u32,
}

/// Project-wide summary of a genotyping project.
#[derive(Debug, Clone, Serialize, TS)]
pub struct GenotypingSummary {
    pub project_id: i64,
    pub samples: u32,
    pub loci: Vec<LocusSummary>,
    /// MOI distribution over true samples.
    pub moi: Vec<MoiCount>,
    pub mean_moi: Option<f64>,
    /// "probabilistic" when the pass is current, else "allele counts"
    /// (second-highest allele count across loci).
    pub moi_source: String,
    pub probabilities: AnalysisStatus,
}

/// One control peak behind a β fit.
#[derive(Debug, Clone, Serialize, TS)]
pub struct QuantBiasPoint {
    pub sample_id: i64,
    pub barcode: String,
    pub size: f64,
    /// Size minus the mean size of the run's control peaks (the fit's x).
    pub centered_size: f64,
    /// Share of the run's control signal (height minus expected artifact).
    pub observed_proportion: f64,
    pub true_proportion: f64,
    /// The fit's y: 2 · (clr(observed) − clr(true)) over the run's control
    /// peaks (centered log-ratios; `core::quant_bias`), which for two peaks
    /// is logit(observed) − logit(true). The fitted line is β · x. Null when
    /// the run has fewer than two control peaks.
    pub log_odds_error: Option<f64>,
    /// Bias-corrected share with the current β.
    pub corrected_proportion: Option<f64>,
    /// True when the run qualified and the point entered the fit.
    pub used: bool,
    /// Peak height (RFU).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub height: Option<f64>,
    /// The bin (allele) the peak is in, as the fit saw it.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub bin_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub bin_label: Option<String>,
    /// Why the point was left out of the fit; absent when `used`.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub exclusion: Option<ControlPeakExclusion>,
}

/// Why a mixture component has no peak to carry its share.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum MissingControlAllele {
    /// The control has no allele at this locus.
    NotSet,
    /// The control's allele bin was deleted (see `Control.alleles[].deleted_bin`).
    BinDeleted,
    /// The reference run has no peak in the allele's bin.
    NoPeak,
}

/// One control of a mixture at a locus.
#[derive(Debug, Clone, Serialize, TS)]
pub struct QuantBiasComponent {
    pub control_id: i64,
    pub control_label: String,
    pub proportion: f64,
    /// The control's allele at the locus now.
    pub bin_id: Option<i64>,
    pub bin_label: Option<String>,
    /// Why its share is on no peak; absent when a peak carries it (or when
    /// there is no reference run to look in).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub missing: Option<MissingControlAllele>,
}

/// One control mixture at a locus.
#[derive(Debug, Clone, Serialize, TS)]
pub struct QuantBiasMixture {
    pub sample_id: i64,
    pub barcode: String,
    /// The run the fit read; absent when the sample has no usable run at the
    /// locus (the mixture then contributes nothing).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub reference_run_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub plate_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub well_label: Option<String>,
    /// True when some of its points entered the fit.
    pub used: bool,
    pub components: Vec<QuantBiasComponent>,
}

/// β and its supporting points at one locus.
#[derive(Debug, Clone, Serialize, TS)]
pub struct LocusQuantBias {
    pub locus_id: i64,
    pub estimate: Option<BiasEstimate>,
    pub points: Vec<QuantBiasPoint>,
    pub status: AnalysisStatus,
    /// The parameters `used` and `exclusion` were evaluated with: those the
    /// stored fit used, so the points always explain the stored β, stale or not.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub params: Option<QuantBiasParams>,
    /// True only for a stale locus analyzed before the fit's parameters were
    /// recorded: `used` and `exclusion` then come from the current parameters
    /// and may not match the stored β. Re-analyzing clears it.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub params_recomputed: Option<bool>,
    /// Every control mixture of the project: its reference run, whether it
    /// entered the fit, and each control's allele at the locus.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub mixtures: Option<Vec<QuantBiasMixture>>,
}

pub(crate) fn register(r: &mut Registry) {
    r.query(
        "get_locus_calls",
        "Every sample's call at one locus: alleles (size, shares, probability), flags, MOI, comment, narrow misses, reference plate and well, run count, review state; plus the bins and analysis status.",
        locus_calls,
    );
    r.mutation(
        "set_call_reviewed",
        &[PROJECTS],
        "Mark one sample × locus call reviewed (as it stands now) or clear the mark. It reads as reviewed until its alleles, flags or reference run change.",
        set_reviewed,
    );
    r.mutation(
        "set_calls_reviewed",
        &[PROJECTS],
        "Mark the calls of many samples at one locus reviewed, or clear the mark (sample_ids omitted = every call at the locus).",
        set_reviewed_bulk,
    );
    r.query(
        "get_sample_locus_call",
        "One sample at one locus: the call with its peaks, the reference run's trace and sizing, the bins, and every run of the sample at the locus.",
        sample_locus,
    );
    r.query(
        "get_project_sample_calls",
        "One sample across every locus of a project: alleles with proportions and probabilities, flags, comments, review state, model MOI and the most alleles called at any locus.",
        sample_calls,
    );
    r.mutation(
        "toggle_allele",
        &[PROJECTS],
        "Turn a bin on or off as a called allele of a sample at a locus and return the updated row. Marks the call manually curated: kept by the probabilistic pass, discarded by re-analysis. A reviewed call reads as unreviewed until confirmed again.",
        toggle,
    );
    r.mutation(
        "set_call_comment",
        &[PROJECTS],
        "Set or clear the comment on a sample × locus call. Comments survive re-analysis.",
        comment,
    );
    r.task(
        "calculate_peak_probabilities",
        &[PROJECTS],
        "Project-wide probabilistic annotation of a genotyping project: allele prevalence, per-sample MOI, peak probabilities and re-called alleles. Every locus must be current. The MOI offset is stored on the project and reused when omitted.",
        calculate_probabilities,
    );
    r.query(
        "get_genotyping_summary",
        "Per-locus allele frequencies and failure rates, and the MOI distribution, of a genotyping project.",
        summary,
    );
    r.query(
        "get_locus_quant_bias",
        "β with SD and R² at one locus of a quantification-bias estimator, and every control peak behind the fit.",
        quant_bias,
    );
}

fn bins_of(c: &Connection, p: &ProjectRow, locus_id: i64) -> Result<Vec<Bin>> {
    match p.bin_estimator_id {
        Some(be) => load_bins(c, be, locus_id),
        None => Ok(Vec::new()),
    }
}

/// Rounds for table payloads (full precision stays in the call's peaks).
fn round(v: f64, digits: i32) -> f64 {
    let f = 10f64.powi(digits);
    (v * f).round() / f
}

/// One called allele's numbers in the reference run.
#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct AlleleNumbers {
    pub size: Option<f64>,
    pub height: Option<f64>,
    pub proportion: Option<f64>,
    pub corrected: Option<f64>,
    pub probability: Option<f64>,
}

/// Size, height and probability of the tallest reference-run peak in a called
/// bin, and the allele's shares summed over every peak in the bin (each one
/// counts as called signal). Shared by the call rows and the exports so they
/// report the same numbers.
pub(crate) fn allele_numbers(call: &SampleLocusCall, bin_id: i64) -> AlleleNumbers {
    let in_bin: Vec<&Peak> = call
        .peaks
        .iter()
        .filter(|p| p.bin_id == Some(bin_id))
        .collect();
    let Some(top) = in_bin
        .iter()
        .copied()
        .max_by(|a, b| a.height.total_cmp(&b.height))
    else {
        return AlleleNumbers::default();
    };
    let sum = |f: fn(&Peak) -> Option<f64>| in_bin.iter().filter_map(|p| f(p)).reduce(|a, b| a + b);
    AlleleNumbers {
        size: Some(top.size),
        height: Some(top.height),
        proportion: sum(|p| p.relative_quantification),
        corrected: sum(|p| p.corrected_relative_quantification),
        probability: top.probability,
    }
}

/// How close a rejected peak must be to its calling bound to count as a
/// narrow miss: within one artifact SD of the absolute height limit...
const NARROW_ARTIFACT_SDS: f64 = 1.0;
/// ...that SD margin clamped to these fractions of the limit...
const NARROW_MIN_FRACTION: f64 = 0.1;
const NARROW_MAX_FRACTION: f64 = 0.2;
/// ...or a probability at least this high (more likely present than not).
const NARROW_MIN_PROBABILITY: f64 = 0.5;

/// Narrowly rejected peaks of a call: binned peaks of the reference run
/// (`in_bin`, bin not called, call not failed) that one calling rule of
/// `core::genotyping` rejected by a small margin:
///
/// - **artifact**: the artifact flag is its only flag and the signal left
///   after expected artifact, `height − artifact_contribution −
///   hard_artifact_sd_limit · artifact_error`, falls short of
///   `absolute_peak_height_limit` by at most one artifact SD, clamped to
///   10–20% of the limit (30–60 RFU at the default 300). One artifact SD is
///   the uncertainty of the expected artifact height, so the rejection is not
///   firm within it. The floor covers peaks where no artifact is expected
///   (error 0); the cap keeps the stutter of a tall allele, whose expected
///   height and error are both large, from counting when it is far below the
///   limit (unclamped, a third of the demo's binned stutter peaks qualified).
/// - **probability**: unflagged, not above the soft artifact SD limit, and a
///   probability from the probabilistic pass in `[0.5, probability_threshold)`:
///   the model thinks the allele more likely present than not, yet below the
///   calling bar.
///
/// Peaks rejected for relative height, bleedthrough, crosstalk or a spectral
/// breakdown are not counted: those rules judge another signal (the tallest
/// peak, another dye or capillary), not this peak's margin. A bin removed by hand is not a miss.
/// One entry per bin (its tallest qualifying peak), by size.
pub(crate) fn narrow_misses(
    call: &SampleLocusCall,
    params: &GenotypingParams,
    bins: &HashMap<i64, &Bin>,
) -> Vec<NarrowMiss> {
    if call.flags.failure || call.reference_run_id.is_none() {
        return Vec::new();
    }
    let mut by_bin: BTreeMap<i64, (&Peak, NarrowMissReason, f64, f64)> = BTreeMap::new();
    for p in &call.peaks {
        let Some(bin) = p.bin_id else { continue };
        if !p.in_bin || call.alleles.contains(&bin) {
            continue;
        }
        let f = p.flags;
        let hit = if f.artifact
            && !f.below_relative_threshold
            && !f.bleedthrough
            && !f.crosstalk
            && !f.spectral
        {
            let left = p.height
                - p.artifact_contribution
                - params.hard_artifact_sd_limit * p.artifact_error;
            let limit = params.absolute_peak_height_limit;
            let margin = (NARROW_ARTIFACT_SDS * p.artifact_error)
                .clamp(NARROW_MIN_FRACTION * limit, NARROW_MAX_FRACTION * limit);
            (left < limit && limit - left <= margin).then_some((
                NarrowMissReason::Artifact,
                left,
                limit,
            ))
        } else if !f.any() {
            let sds = (p.height - p.artifact_contribution) / p.artifact_error.max(1.0);
            p.probability
                .filter(|&q| {
                    q >= NARROW_MIN_PROBABILITY
                        && q < params.probability_threshold
                        && sds <= params.soft_artifact_sd_limit
                })
                .map(|q| {
                    (
                        NarrowMissReason::Probability,
                        q,
                        params.probability_threshold,
                    )
                })
        } else {
            None
        };
        if let Some((reason, value, limit)) = hit {
            let e = by_bin.entry(bin).or_insert((p, reason, value, limit));
            if p.height > e.0.height {
                *e = (p, reason, value, limit);
            }
        }
    }
    let mut v: Vec<NarrowMiss> = by_bin
        .into_iter()
        .map(|(bin, (p, reason, value, limit))| NarrowMiss {
            bin_id: bin,
            label: bins
                .get(&bin)
                .map_or_else(|| "?".into(), |b| b.label.clone()),
            size: round(p.size, 2),
            height: p.height.round(),
            reason,
            value: match reason {
                // Rounded down: a narrow miss must not read as the limit.
                NarrowMissReason::Artifact => value.floor(),
                NarrowMissReason::Probability => (value * 1e4).floor() / 1e4,
            },
            limit,
        })
        .collect();
    v.sort_by(|a, b| a.size.total_cmp(&b.size));
    v
}

/// What a call row needs besides the call: bins, the locus's genotyping
/// parameters, where each run sits, and how many runs each sample has.
struct RowContext<'a> {
    bins: HashMap<i64, &'a Bin>,
    params: Option<GenotypingParams>,
    /// Run id → (plate label, well label), every run of the locus in scope.
    places: HashMap<i64, (String, String)>,
    /// Sample id → runs at the locus.
    run_counts: HashMap<i64, u32>,
}

fn row_context<'a>(
    c: &Connection,
    proj: &ProjectRow,
    locus_id: i64,
    bins: &'a [Bin],
    sample_id: Option<i64>,
) -> Result<RowContext<'a>> {
    let mut places = HashMap::new();
    let mut run_counts: HashMap<i64, u32> = HashMap::new();
    // Separate statements so each uses its index (run_locus / run_sample).
    let mut st = c.prepare_cached(if sample_id.is_some() {
        "SELECT r.id, r.sample_id, pl.label, w.label FROM run r
         JOIN channel ch ON ch.id = r.channel_id JOIN well w ON w.id = ch.well_id
         JOIN plate pl ON pl.id = w.plate_id
         WHERE r.sample_id = ?2 AND r.locus_id = ?1"
    } else {
        "SELECT r.id, r.sample_id, pl.label, w.label FROM run r
         JOIN channel ch ON ch.id = r.channel_id JOIN well w ON w.id = ch.well_id
         JOIN plate pl ON pl.id = w.plate_id
         WHERE r.locus_id = ?1 AND ?2 IS NULL"
    })?;
    let rows = st.query_map(params![locus_id, sample_id], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, i64>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, String>(3)?,
        ))
    })?;
    for row in rows {
        let (run, sample, plate, well) = row?;
        places.insert(run, (plate, well));
        *run_counts.entry(sample).or_default() += 1;
    }
    Ok(RowContext {
        bins: bins.iter().map(|b| (b.id, b)).collect(),
        params: locus_params(c, proj, locus_id)?.genotyping,
        places,
        run_counts,
    })
}

fn to_row(s: &StoredCall, info: &SampleInfo, ctx: &RowContext) -> CallRow {
    let call = &s.call;
    let mut alleles: Vec<(f64, AlleleRef)> = call
        .alleles
        .iter()
        .map(|&b| {
            let n = allele_numbers(call, b);
            let r = |v: Option<f64>| v.map(|x| round(x, 4));
            let (order, label) = match ctx.bins.get(&b) {
                Some(bin) => (bin.base_size, bin.label.clone()),
                None => (f64::INFINITY, "?".into()),
            };
            (
                order,
                AlleleRef {
                    bin_id: b,
                    label,
                    size: n.size.map(|x| round(x, 2)),
                    proportion: r(n.proportion),
                    corrected_proportion: r(n.corrected),
                    probability: r(n.probability),
                },
            )
        })
        .collect();
    alleles.sort_by(|a, b| a.0.total_cmp(&b.0));
    let alleles: Vec<AlleleRef> = alleles.into_iter().map(|(_, a)| a).collect();
    let place = call.reference_run_id.and_then(|r| ctx.places.get(&r));
    CallRow {
        sample_id: call.sample_id,
        barcode: info.barcode.clone(),
        designation: info.designation,
        reference_run_id: call.reference_run_id,
        min_probability: alleles
            .iter()
            .filter_map(|a| a.probability)
            .reduce(f64::min),
        alleles,
        flags: call.flags,
        moi: info.moi,
        comment: s.comment.clone(),
        peak_count: call.peaks.len() as u32,
        max_height: call.peaks.iter().map(|p| p.height).reduce(f64::max),
        narrow_misses: ctx
            .params
            .as_ref()
            .map(|g| narrow_misses(call, g, &ctx.bins))
            .unwrap_or_default(),
        plate_label: place.map(|p| p.0.clone()),
        well_label: place.map(|p| p.1.clone()),
        run_count: ctx.run_counts.get(&call.sample_id).copied().unwrap_or(0),
        reviewed: s.reviewed(),
        review_dropped: s.review_dropped(),
    }
}

struct SampleInfo {
    barcode: String,
    designation: Designation,
    moi: Option<u32>,
}

fn sample_infos(c: &Connection, pid: i64) -> Result<HashMap<i64, SampleInfo>> {
    sample_infos_for(c, pid, None)
}

/// Project samples, or just one.
fn sample_infos_for(
    c: &Connection,
    pid: i64,
    sample_id: Option<i64>,
) -> Result<HashMap<i64, SampleInfo>> {
    let mut st = c.prepare_cached(if sample_id.is_some() {
        "SELECT s.id, s.barcode, s.designation, ps.moi FROM project_sample ps JOIN sample s ON s.id = ps.sample_id
         WHERE ps.project_id = ?1 AND ps.sample_id = ?2"
    } else {
        "SELECT s.id, s.barcode, s.designation, ps.moi FROM project_sample ps JOIN sample s ON s.id = ps.sample_id
         WHERE ps.project_id = ?1 AND ?2 IS NULL"
    })?;
    let v = st
        .query_map(params![pid, sample_id], |r| {
            Ok((
                r.get(0)?,
                SampleInfo {
                    barcode: r.get(1)?,
                    designation: Designation::from_db(&r.get::<_, String>(2)?),
                    moi: r.get(3)?,
                },
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

/// A stored call with its comment and review mark.
pub(crate) struct StoredCall {
    pub call: SampleLocusCall,
    pub comment: Option<String>,
    /// Review key recorded when the call was marked reviewed.
    pub reviewed_key: Option<String>,
}

impl StoredCall {
    /// Reviewed, and unchanged since: the recorded key is the current one.
    pub fn reviewed(&self) -> bool {
        self.reviewed_key
            .as_deref()
            .is_some_and(|k| k == review_key(&self.call))
    }

    /// A review mark is stored but the call changed since.
    pub fn review_dropped(&self) -> bool {
        self.reviewed_key.is_some() && !self.reviewed()
    }
}

/// What a reviewer confirms when marking a call reviewed: its reference run,
/// called bins and flags (failure, off-scale, manual curation). Proportions
/// and probabilities are left out, so re-estimating β or re-running the
/// probabilistic pass keeps a call reviewed unless its alleles change.
pub(crate) fn review_key(call: &SampleLocusCall) -> String {
    let mut f = Fingerprint::new();
    f.opt_i64(call.reference_run_id)
        .u64(call.alleles.len() as u64);
    for &a in &call.alleles {
        f.i64(a);
    }
    f.u64(u64::from(call.flags.failure))
        .u64(u64::from(call.flags.offscale))
        .u64(u64::from(call.flags.manual_curation));
    f.hex()
}

/// Stored calls of a project, at one locus and for one sample when given.
fn load_calls(
    c: &Connection,
    pid: i64,
    locus_id: Option<i64>,
    sample_id: Option<i64>,
) -> Result<Vec<StoredCall>> {
    let filter = match (locus_id, sample_id) {
        (Some(_), Some(_)) => "locus_id = ?2 AND sample_id = ?3",
        (Some(_), None) => "locus_id = ?2 AND ?3 IS NULL",
        (None, Some(_)) => "sample_id = ?3 AND ?2 IS NULL",
        (None, None) => "?2 IS NULL AND ?3 IS NULL",
    };
    let mut st = c.prepare_cached(&format!(
        "SELECT sample_id, locus_id, reference_run_id, peaks, alleles, failure, offscale, manual_curation, comment,
                reviewed_key
         FROM genotype WHERE project_id = ?1 AND {filter} ORDER BY locus_id, sample_id"
    ))?;
    let rows = st
        .query_map(params![pid, locus_id, sample_id], |r| {
            let s: i64 = r.get(0)?;
            let l: i64 = r.get(1)?;
            Ok((row_to_call(r, s, l, 2)?, r.get::<_, Option<String>>(9)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    rows.into_iter()
        .map(|(r, reviewed_key)| {
            let (call, comment) = r.map_err(RpcError::internal)?;
            Ok(StoredCall {
                call,
                comment,
                reviewed_key,
            })
        })
        .collect()
}

/// Call rows of a project at one locus (one sample when given), by barcode.
fn build_rows(
    c: &Connection,
    proj: &ProjectRow,
    locus_id: i64,
    sample_id: Option<i64>,
    bins: &[Bin],
) -> Result<Vec<CallRow>> {
    let infos = sample_infos_for(c, proj.id, sample_id)?;
    let ctx = row_context(c, proj, locus_id, bins, sample_id)?;
    let mut rows: Vec<CallRow> = load_calls(c, proj.id, Some(locus_id), sample_id)?
        .iter()
        .filter_map(|s| Some(to_row(s, infos.get(&s.call.sample_id)?, &ctx)))
        .collect();
    rows.sort_by(|a, b| a.barcode.cmp(&b.barcode));
    Ok(rows)
}

fn locus_calls(e: &Engine, p: ProjectLocusParams) -> Result<LocusCalls> {
    e.workspace()?.read(|c| {
        let proj = require_calls(c, p.project_id)?;
        let locus = locus_of(c, &proj, p.locus_id)?;
        let bins = bins_of(c, &proj, p.locus_id)?;
        let rows = build_rows(c, &proj, p.locus_id, None, &bins)?;
        Ok(LocusCalls {
            project_id: proj.id,
            locus_id: p.locus_id,
            locus_label: locus.label.clone(),
            status: inputs::locus_status(c, &proj, &locus)?,
            probabilities: (proj.kind == ProjectKind::Genotyping)
                .then(|| inputs::probability_status(c, &proj))
                .transpose()?,
            bins,
            rows,
        })
    })
}

fn sample_locus(e: &Engine, p: CallParams) -> Result<SampleLocusCallView> {
    let ws = e.workspace()?;
    // Read the stored call and load the sample's runs from one snapshot.
    let (proj, locus, status, call, row, info, bins, loaded, params, model, labels) =
        ws.read(|c| {
            let proj = require_calls(c, p.project_id)?;
            let locus = locus_of(c, &proj, p.locus_id)?;
            require_sample(c, &proj, p.sample_id)?;
            let status = inputs::locus_status(c, &proj, &locus)?;
            let (call, _) = analysis::load_call(c, proj.id, p.sample_id, p.locus_id)?;
            let row = row_after(c, &proj, p.sample_id, p.locus_id)?;
            let info = sample_infos_for(c, proj.id, Some(p.sample_id))?
                .remove(&p.sample_id)
                .or_not_found(|| "Sample not in project".into())?;
            let bins = bins_of(c, &proj, p.locus_id)?;
            let one: HashSet<i64> = [p.sample_id].into_iter().collect();
            let loaded = pipeline::load(c, &locus, Some(&one))?;
            let params = locus_params(c, &proj, p.locus_id)?;
            let model = artifact_model(c, proj.artifact_estimator_id, p.locus_id)?;
            let mut labels: HashMap<i64, (String, String, Option<i32>)> = HashMap::new();
            let mut st = c.prepare_cached(
                "SELECT r.id, pl.label, w.label, r.max_signal FROM run r JOIN channel ch ON ch.id = r.channel_id
                 JOIN well w ON w.id = ch.well_id JOIN plate pl ON pl.id = w.plate_id
                 WHERE r.sample_id = ?1 AND r.locus_id = ?2",
            )?;
            for row in st.query_map([p.sample_id, p.locus_id], |r| {
                Ok((r.get::<_, i64>(0)?, (r.get(1)?, r.get(2)?, r.get(3)?)))
            })? {
                let (id, v) = row?;
                labels.insert(id, v);
            }
            Ok((
                proj, locus, status, call, row, info, bins, loaded, params, model, labels,
            ))
        })?;
    let opts = pipeline::AnnotateOptions {
        use_measured_pullup: params.genotyping.is_none_or(|g| g.measured_pullup),
        drop_measured_pullup: false,
    };
    let mut runs = pipeline::annotate(e.scan_cache(), &loaded, &params.scan, &params.filter, opts)?;
    for r in runs.iter_mut() {
        genotyping::annotate_run(&mut r.peaks, &bins, model.as_ref());
        if let Some(g) = &params.genotyping {
            genotyping::flag_peaks(&mut r.peaks, g);
        }
    }
    let reference = call.reference_run_id.and_then(|rid| {
        loaded
            .runs
            .iter()
            .find(|r| r.run_id == rid)
            .map(|r| ReferenceTrace {
                run_id: r.run_id,
                channel_id: r.channel_id,
                color: locus.color,
                trace: r.trace.clone(),
                base_sizes: r.base_sizes.clone(),
            })
    });
    let sizing: HashMap<i64, SizingState> =
        loaded.runs.iter().map(|r| (r.run_id, r.sizing)).collect();
    Ok(SampleLocusCallView {
        project_id: proj.id,
        sample_id: p.sample_id,
        barcode: info.barcode,
        designation: info.designation,
        locus_id: locus.id,
        locus_label: locus.label.clone(),
        color: locus.color,
        min_base_length: locus.min_base_length,
        max_base_length: locus.max_base_length,
        status,
        row,
        peaks: call.peaks,
        reference,
        runs: runs
            .into_iter()
            .map(|r| {
                let (plate_label, well_label, max_signal) =
                    labels.get(&r.run_id).cloned().unwrap_or_default();
                let plate_pull_up = if opts.use_measured_pullup {
                    loaded.plate_pull_up_estimates(r.plate_id, &r.well_label)
                } else {
                    Vec::new()
                };
                SampleRunView {
                    is_reference: call.reference_run_id == Some(r.run_id),
                    run_id: r.run_id,
                    channel_id: r.channel_id,
                    well_id: r.well_id,
                    plate_id: r.plate_id,
                    plate_label,
                    well_label,
                    sizing: sizing
                        .get(&r.run_id)
                        .copied()
                        .unwrap_or(SizingState::Failed),
                    max_signal,
                    peaks: r.peaks,
                    plate_pull_up,
                }
            })
            .collect(),
        bins,
    })
}

fn sample_calls(e: &Engine, p: ProjectSampleParams) -> Result<SampleCalls> {
    e.workspace()?.read(|c| {
        let proj = require_calls(c, p.project_id)?;
        require_sample(c, &proj, p.sample_id)?;
        let info = sample_infos_for(c, proj.id, Some(p.sample_id))?
            .remove(&p.sample_id)
            .or_not_found(|| "Sample not in project".into())?;
        let mut idx = RunsIndex::default();
        let statuses = inputs::locus_statuses(c, &proj, &mut idx)?;
        let mut calls: HashMap<i64, StoredCall> = load_calls(c, proj.id, None, Some(p.sample_id))?
            .into_iter()
            .map(|s| (s.call.locus_id, s))
            .collect();
        let mut loci = Vec::new();
        for (l, status) in statuses {
            let bins = bins_of(c, &proj, l.id)?;
            let (row, called) = match calls.remove(&l.id) {
                Some(stored) => {
                    let ctx = row_context(c, &proj, l.id, &bins, Some(p.sample_id))?;
                    let call = &stored.call;
                    let called = call
                        .peaks
                        .iter()
                        .filter_map(|pk| {
                            let b = pk.bin_id.filter(|b| call.alleles.contains(b))?;
                            Some(CalledPeak {
                                bin_id: b,
                                label: ctx.bins.get(&b).map_or("?".into(), |x| x.label.clone()),
                                size: pk.size,
                                height: pk.height,
                                relative_quantification: pk.relative_quantification,
                                corrected_relative_quantification: pk
                                    .corrected_relative_quantification,
                                probability: pk.probability,
                            })
                        })
                        .collect();
                    (Some(to_row(&stored, &info, &ctx)), called)
                }
                None => (None, Vec::new()),
            };
            loci.push(SampleLocusSummary {
                locus_id: l.id,
                locus_label: l.label,
                color: l.color,
                status,
                row,
                called,
            });
        }
        // Most alleles at one locus, over calls that rest on a run.
        let counts: Vec<(usize, &SampleLocusSummary)> = loci
            .iter()
            .filter_map(|l| {
                let r = l.row.as_ref()?;
                r.reference_run_id.map(|_| (r.alleles.len(), l))
            })
            .collect();
        let max_alleles = counts.iter().map(|(n, _)| *n).max();
        let max_alleles_loci = match max_alleles {
            Some(m) if m > 0 => counts
                .iter()
                .filter(|(n, _)| *n == m)
                .map(|(_, l)| LocusRef {
                    locus_id: l.locus_id,
                    locus_label: l.locus_label.clone(),
                })
                .collect(),
            _ => Vec::new(),
        };
        Ok(SampleCalls {
            project_id: proj.id,
            sample_id: p.sample_id,
            barcode: info.barcode,
            designation: info.designation,
            moi: info.moi,
            probabilities: (proj.kind == ProjectKind::Genotyping)
                .then(|| inputs::probability_status(c, &proj))
                .transpose()?,
            loci,
            max_alleles: max_alleles.map(|m| m as u32),
            max_alleles_loci,
        })
    })
}

/// β the project's calls are quantified with at a locus.
fn beta_for(c: &Connection, p: &ProjectRow, locus_id: i64) -> Result<Option<f64>> {
    match (p.kind, p.quant_bias_estimator_id) {
        (ProjectKind::Genotyping, Some(qb)) => inputs::stored_beta(c, qb, locus_id),
        (ProjectKind::QuantBiasEstimator, _) => Ok(inputs::stored_result(c, p.id, locus_id)?
            .and_then(|v| serde_json::from_value::<QuantBiasResult>(v).ok())
            .and_then(|r| r.estimate.map(|e| e.beta))),
        _ => Ok(None),
    }
}

/// The current row of one call (as `get_locus_calls` would return it).
fn row_after(c: &Connection, proj: &ProjectRow, sample_id: i64, locus_id: i64) -> Result<CallRow> {
    let bins = bins_of(c, proj, locus_id)?;
    build_rows(c, proj, locus_id, Some(sample_id), &bins)?
        .pop()
        .or_not_found(|| {
            "This sample has no call at this locus yet. Analyze the locus first.".into()
        })
}

fn toggle(e: &Engine, p: ToggleAlleleParams) -> Result<CallRow> {
    let row = e.workspace()?.write(|tx| {
        let proj = require_kind(tx, p.project_id, ProjectKind::Genotyping)?;
        locus_of(tx, &proj, p.locus_id)?;
        require_sample(tx, &proj, p.sample_id)?;
        let bins = bins_of(tx, &proj, p.locus_id)?;
        if !bins.iter().any(|b| b.id == p.bin_id) {
            return Err(RpcError::invalid(format!(
                "Bin {} is not a bin of this project's bin estimator at this locus.",
                p.bin_id
            )));
        }
        let (mut call, _) = analysis::load_call(tx, proj.id, p.sample_id, p.locus_id)?;
        let beta = beta_for(tx, &proj, p.locus_id)?;
        genotyping::toggle_allele(&mut call, p.bin_id, beta);
        analysis::update_call(tx, proj.id, &call)?;
        row_after(tx, &proj, p.sample_id, p.locus_id)
    })?;
    e.changed(PROJECTS, Some(vec![p.project_id]));
    Ok(row)
}

fn comment(e: &Engine, p: SetCallCommentParams) -> Result<CallRow> {
    let text = p
        .comment
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    if text.as_ref().is_some_and(|t| t.len() > 5000) {
        return Err(RpcError::invalid("The comment is too long."));
    }
    let row = e.workspace()?.write(|tx| {
        let proj = require_calls(tx, p.project_id)?;
        locus_of(tx, &proj, p.locus_id)?;
        require_sample(tx, &proj, p.sample_id)?;
        let n = tx.execute(
            "UPDATE genotype SET comment = ?1 WHERE project_id = ?2 AND sample_id = ?3 AND locus_id = ?4",
            params![text, proj.id, p.sample_id, p.locus_id],
        )?;
        if n == 0 {
            return Err(RpcError::not_found(
                "This sample has no call at this locus yet. Analyze the locus first.",
            ));
        }
        row_after(tx, &proj, p.sample_id, p.locus_id)
    })?;
    e.changed(PROJECTS, Some(vec![p.project_id]));
    Ok(row)
}

fn set_reviewed(e: &Engine, p: SetCallReviewedParams) -> Result<CallRow> {
    let row = e.workspace()?.write(|tx| {
        let proj = require_calls(tx, p.project_id)?;
        locus_of(tx, &proj, p.locus_id)?;
        require_sample(tx, &proj, p.sample_id)?;
        let (call, _) = analysis::load_call(tx, proj.id, p.sample_id, p.locus_id)?;
        let key = p.reviewed.then(|| review_key(&call));
        tx.execute(
            "UPDATE genotype SET reviewed_key = ?1 WHERE project_id = ?2 AND sample_id = ?3 AND locus_id = ?4",
            params![key, proj.id, p.sample_id, p.locus_id],
        )?;
        row_after(tx, &proj, p.sample_id, p.locus_id)
    })?;
    e.changed(PROJECTS, Some(vec![p.project_id]));
    Ok(row)
}

fn set_reviewed_bulk(e: &Engine, p: SetCallsReviewedParams) -> Result<SetCallsReviewedResult> {
    let r = e.workspace()?.write(|tx| {
        let proj = require_calls(tx, p.project_id)?;
        locus_of(tx, &proj, p.locus_id)?;
        let calls = load_calls(tx, proj.id, Some(p.locus_id), None)?;
        let wanted: Option<HashSet<i64>> = p.sample_ids.as_ref().map(|v| v.iter().copied().collect());
        let present: HashSet<i64> = calls.iter().map(|s| s.call.sample_id).collect();
        let mut missing: Vec<i64> = wanted
            .iter()
            .flatten()
            .copied()
            .filter(|s| !present.contains(s))
            .collect();
        missing.sort_unstable();
        let mut st = tx.prepare_cached(
            "UPDATE genotype SET reviewed_key = ?1 WHERE project_id = ?2 AND sample_id = ?3 AND locus_id = ?4",
        )?;
        let mut updated = 0;
        for s in calls
            .iter()
            .filter(|s| wanted.as_ref().is_none_or(|w| w.contains(&s.call.sample_id)))
        {
            let key = p.reviewed.then(|| review_key(&s.call));
            st.execute(params![key, proj.id, s.call.sample_id, p.locus_id])?;
            updated += 1;
        }
        Ok(SetCallsReviewedResult { updated, missing })
    })?;
    e.changed(PROJECTS, Some(vec![p.project_id]));
    Ok(r)
}

fn moi_counts(moi: impl Iterator<Item = u32>) -> Vec<MoiCount> {
    let mut m: BTreeMap<u32, u32> = BTreeMap::new();
    for v in moi {
        *m.entry(v).or_default() += 1;
    }
    m.into_iter()
        .map(|(moi, samples)| MoiCount { moi, samples })
        .collect()
}

/// Options of the last probabilistic pass (None before the first).
fn stored_options(c: &Connection, pid: i64) -> Result<Option<ProbabilisticOptions>> {
    Ok(c.query_row(
        "SELECT prob_options FROM project WHERE id = ?1",
        [pid],
        |r| r.get::<_, Option<String>>(0),
    )?
    .and_then(|s| serde_json::from_str(&s).ok()))
}

/// Runs the probabilistic pass of a genotyping project (inside a task).
pub(crate) fn run_probabilities(
    e: &Engine,
    pid: i64,
    offset: Option<u32>,
) -> Result<ProbabilityResult> {
    let ws = e.workspace()?;
    let (proj, mut core, settings, controls, options) = ws.read(|c| {
        let proj = require_kind(c, pid, ProjectKind::Genotyping)?;
        let statuses = inputs::locus_statuses(c, &proj, &mut RunsIndex::default())?;
        let bad: Vec<String> = statuses
            .iter()
            .filter(|(_, s)| !s.is_current())
            .map(|(l, s)| {
                format!(
                    "{} ({})",
                    l.label,
                    if s.state == AnalysisState::NotAnalyzed {
                        "not analyzed"
                    } else {
                        "stale"
                    }
                )
            })
            .collect();
        if !bad.is_empty() {
            return Err(RpcError::invalid(format!(
                "Analyze these loci first: {}.",
                some_of(&bad, 8)
            )));
        }
        let stored = stored_options(c, pid)?;
        let mut options = stored.unwrap_or_default();
        if let Some(o) = offset {
            options.moi_offset = o;
        }
        let mut settings = BTreeMap::new();
        for (l, _) in &statuses {
            let params = locus_params(c, &proj, l.id)?.genotyping.unwrap_or_default();
            settings.insert(
                l.id,
                LocusSettings {
                    params,
                    beta: beta_for(c, &proj, l.id)?,
                },
            );
        }
        let calls: Vec<SampleLocusCall> = load_calls(c, pid, None, None)?
            .into_iter()
            .map(|s| s.call)
            .filter(|call| settings.contains_key(&call.locus_id))
            .collect();
        let controls: HashSet<i64> = sample_infos(c, pid)?
            .into_iter()
            .filter(|(_, i)| i.designation != Designation::Sample)
            .map(|(id, _)| id)
            .collect();
        Ok((proj, calls, settings, controls, options))
    })?;
    let summary = genotyping::annotate_probabilities(
        &mut core,
        |s| controls.contains(&s),
        &settings,
        &options,
    )
    .map_err(|e| RpcError::internal(e.to_string()))?;
    let manual = core.iter().filter(|c| c.flags.manual_curation).count() as u32;
    let options_json = serde_json::to_string(&options)?;
    ws.write(|tx| {
        load_row(tx, pid)?;
        for call in &core {
            analysis::update_call(tx, pid, call)?;
        }
        tx.execute(
            "UPDATE project_sample SET moi = NULL WHERE project_id = ?1",
            [pid],
        )?;
        for (s, m) in &summary.moi {
            tx.execute(
                "UPDATE project_sample SET moi = ?1 WHERE project_id = ?2 AND sample_id = ?3",
                params![m, pid, s],
            )?;
        }
        for l in project_loci(tx, &proj)? {
            let result = GenotypingResult {
                prevalence: Some(summary.prevalence.get(&l.id).cloned().unwrap_or_default()),
            };
            tx.execute(
                "UPDATE project_locus SET result = ?1 WHERE project_id = ?2 AND locus_id = ?3",
                params![serde_json::to_string(&result)?, pid, l.id],
            )?;
        }
        tx.execute(
            "UPDATE project SET prob_options = ?1 WHERE id = ?2",
            params![options_json, pid],
        )?;
        let fp = inputs::probability_inputs(tx, &proj)?;
        tx.execute(
            "UPDATE project SET prob_fingerprint = ?1, prob_computed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = ?2",
            params![fp, pid],
        )?;
        Ok(())
    })?;
    Ok(ProbabilityResult {
        samples: summary.moi.len() as u32,
        moi: moi_counts(summary.moi.values().copied()),
        manual_calls_kept: manual,
    })
}

fn calculate_probabilities(
    e: &Engine,
    p: CalculateProbabilitiesParams,
) -> Result<ProbabilityResult> {
    let title = e
        .workspace()?
        .read(|c| Ok(require_kind(c, p.id, ProjectKind::Genotyping)?.title))?;
    e.run_task(
        "calculate_peak_probabilities",
        format!("Calculating peak probabilities for {title}"),
        move |task| {
            crate::tasks::Progress::report(task, 0.1, "Estimating prevalence and MOI");
            let r = run_probabilities(task.engine(), p.id, p.moi_offset)?;
            task.engine().changed(PROJECTS, Some(vec![p.id]));
            Ok(r)
        },
    )
}

fn summary(e: &Engine, p: IdParams) -> Result<GenotypingSummary> {
    e.workspace()?.read(|c| {
        let proj = require_kind(c, p.id, ProjectKind::Genotyping)?;
        let infos = sample_infos(c, proj.id)?;
        let is_sample = |s: &i64| {
            infos
                .get(s)
                .is_some_and(|i| i.designation == Designation::Sample)
        };
        let prob = inputs::probability_status(c, &proj)?;
        let statuses = inputs::locus_statuses(c, &proj, &mut RunsIndex::default())?;
        let calls = load_calls(c, proj.id, None, None)?;
        let mut by_locus: HashMap<i64, Vec<&SampleLocusCall>> = HashMap::new();
        let mut counts: HashMap<i64, Vec<usize>> = HashMap::new();
        // (calls, reviewed) per locus, controls included.
        let mut review: HashMap<i64, (u32, u32)> = HashMap::new();
        for stored in &calls {
            let call = &stored.call;
            if !infos.contains_key(&call.sample_id) {
                continue;
            }
            let r = review.entry(call.locus_id).or_default();
            r.0 += 1;
            r.1 += u32::from(stored.reviewed());
            if !is_sample(&call.sample_id) {
                continue;
            }
            by_locus.entry(call.locus_id).or_default().push(call);
            if call.reference_run_id.is_some() && !call.flags.failure {
                counts
                    .entry(call.sample_id)
                    .or_default()
                    .push(call.alleles.len());
            }
        }
        let mut loci = Vec::new();
        for (l, status) in statuses {
            let bins = bins_of(c, &proj, l.id)?;
            let rows = by_locus.remove(&l.id).unwrap_or_default();
            let failed = rows.iter().filter(|c| c.flags.failure).count() as u32;
            let no_run = rows.iter().filter(|c| c.reference_run_id.is_none()).count() as u32;
            let typed_calls: Vec<&&SampleLocusCall> =
                rows.iter().filter(|c| !c.alleles.is_empty()).collect();
            let typed = typed_calls.len() as u32;
            let estimated: Option<BTreeMap<i64, f64>> = if prob.is_current() {
                inputs::stored_result(c, proj.id, l.id)?
                    .and_then(|v| serde_json::from_value::<GenotypingResult>(v).ok())
                    .and_then(|r| r.prevalence)
            } else {
                None
            };
            let alleles = bins
                .iter()
                .map(|b| {
                    let count = typed_calls
                        .iter()
                        .filter(|c| c.alleles.contains(&b.id))
                        .count() as u32;
                    AlleleFrequency {
                        bin_id: b.id,
                        label: b.label.clone(),
                        base_size: b.base_size,
                        count,
                        prevalence: if typed > 0 {
                            f64::from(count) / f64::from(typed)
                        } else {
                            0.0
                        },
                        estimated_prevalence: estimated
                            .as_ref()
                            .map(|m| m.get(&b.id).copied().unwrap_or(0.0)),
                    }
                })
                .collect();
            let n = rows.len() as u32;
            let (calls, reviewed) = review.get(&l.id).copied().unwrap_or_default();
            loci.push(LocusSummary {
                locus_id: l.id,
                locus_label: l.label,
                status,
                samples: n,
                typed,
                failed,
                no_run,
                failure_rate: if n > 0 {
                    f64::from(failed + no_run) / f64::from(n)
                } else {
                    0.0
                },
                alleles,
                calls,
                reviewed,
            });
        }
        let true_samples: Vec<i64> = infos.keys().copied().filter(|s| is_sample(s)).collect();
        let (moi, source): (Vec<u32>, &str) = if prob.is_current() {
            (
                true_samples.iter().filter_map(|s| infos[s].moi).collect(),
                "probabilistic",
            )
        } else {
            (
                true_samples
                    .iter()
                    .filter_map(|s| counts.get(s))
                    .map(|v| {
                        let mut v = v.clone();
                        v.sort_unstable();
                        // Second-highest count tolerates one locus with a spurious extra peak.
                        if v.len() >= 2 {
                            v[v.len() - 2] as u32
                        } else {
                            0
                        }
                    })
                    .collect(),
                "allele counts",
            )
        };
        let mean = (!moi.is_empty())
            .then(|| moi.iter().map(|&m| f64::from(m)).sum::<f64>() / moi.len() as f64);
        Ok(GenotypingSummary {
            project_id: proj.id,
            samples: true_samples.len() as u32,
            loci,
            moi: moi_counts(moi.into_iter()),
            mean_moi: mean,
            moi_source: source.into(),
            probabilities: prob,
        })
    })
}

/// The quantification-bias parameters a stored fit used at a locus, and
/// whether they are the current parameters standing in for a fit that did
/// not record its own (results stored before parameters were recorded).
pub(crate) fn fit_params(
    c: &Connection,
    proj: &ProjectRow,
    locus_id: i64,
) -> Result<(QuantBiasParams, bool)> {
    let stored = inputs::stored_result(c, proj.id, locus_id)?
        .and_then(|v| serde_json::from_value::<QuantBiasResult>(v).ok())
        .and_then(|r| r.params);
    Ok(match stored {
        Some(q) => (q, false),
        None => (
            locus_params(c, proj, locus_id)?
                .quant_bias
                .unwrap_or_default(),
            true,
        ),
    })
}

/// (plate label, well label) of each reference run of a project at a locus, by sample.
pub(crate) fn reference_wells(
    c: &Connection,
    pid: i64,
    locus_id: Option<i64>,
) -> Result<HashMap<(i64, i64), (String, String)>> {
    let mut st = c.prepare_cached(
        "SELECT g.sample_id, g.locus_id, pl.label, w.label FROM genotype g
         JOIN run r ON r.id = g.reference_run_id JOIN channel ch ON ch.id = r.channel_id
         JOIN well w ON w.id = ch.well_id JOIN plate pl ON pl.id = w.plate_id
         WHERE g.project_id = ?1 AND (?2 IS NULL OR g.locus_id = ?2)",
    )?;
    let v = st
        .query_map(params![pid, locus_id], |r| {
            Ok(((r.get(0)?, r.get(1)?), (r.get(2)?, r.get(3)?)))
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

/// A control's label and allele at one locus: (label, bin id, bin label, bin deleted).
pub(crate) type ControlAtLocus = (String, Option<i64>, Option<String>, bool);

pub(crate) fn controls_at_locus(
    c: &Connection,
    locus_id: i64,
) -> Result<HashMap<i64, ControlAtLocus>> {
    let mut st = c.prepare_cached(
        "SELECT c.id, c.label, a.bin_id, b.label, a.bin_id IS NULL AND a.deleted_bin_label IS NOT NULL
         FROM control c LEFT JOIN control_allele a ON a.control_id = c.id AND a.locus_id = ?1
         LEFT JOIN bin b ON b.id = a.bin_id",
    )?;
    let v = st
        .query_map([locus_id], |r| {
            Ok((
                r.get(0)?,
                (
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get::<_, Option<bool>>(4)?.unwrap_or(false),
                ),
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

fn quant_bias(e: &Engine, p: ProjectLocusParams) -> Result<LocusQuantBias> {
    e.workspace()?.read(|c| {
        let proj = require_kind(c, p.project_id, ProjectKind::QuantBiasEstimator)?;
        let locus = locus_of(c, &proj, p.locus_id)?;
        let status = inputs::locus_status(c, &proj, &locus)?;
        let (params, from_current) = fit_params(c, &proj, p.locus_id)?;
        let estimate = inputs::stored_result(c, proj.id, p.locus_id)?
            .and_then(|v| serde_json::from_value::<QuantBiasResult>(v).ok())
            .and_then(|r| r.estimate);
        let infos = sample_infos(c, proj.id)?;
        let barcode = |s: i64| infos.get(&s).map_or(String::new(), |i| i.barcode.clone());
        let mut points = Vec::new();
        let mut used_samples = HashSet::new();
        let calls: HashMap<i64, SampleLocusCall> = load_calls(c, proj.id, Some(p.locus_id), None)?
            .into_iter()
            .map(|s| (s.call.sample_id, s.call))
            .collect();
        let mut sample_ids: Vec<i64> = calls.keys().copied().collect();
        sample_ids.sort_by_key(|s| barcode(*s));
        for sid in &sample_ids {
            let call = &calls[sid];
            for pt in control_points(&call.peaks, &params) {
                let pk = &call.peaks[pt.peak];
                if pt.exclusion.is_none() {
                    used_samples.insert(call.sample_id);
                }
                points.push(QuantBiasPoint {
                    sample_id: call.sample_id,
                    barcode: barcode(call.sample_id),
                    size: pk.size,
                    centered_size: pt.centered_size,
                    observed_proportion: pt.observed_proportion,
                    true_proportion: pk.true_proportion.unwrap_or(0.0),
                    log_odds_error: pt.log_odds_error,
                    corrected_proportion: pk.corrected_relative_quantification,
                    used: pt.exclusion.is_none(),
                    height: Some(pk.height),
                    bin_id: pk.bin_id,
                    bin_label: pk.bin_label.clone(),
                    exclusion: pt.exclusion,
                });
            }
        }
        let wells = reference_wells(c, proj.id, Some(p.locus_id))?;
        let controls = controls_at_locus(c, p.locus_id)?;
        let mut mixtures = Vec::new();
        for (sid, comps) in analysis::load_mixtures(c, proj.id)? {
            let call = calls.get(&sid);
            let run = call.and_then(|c| c.reference_run_id);
            let well = wells.get(&(sid, p.locus_id));
            let components = comps
                .iter()
                .map(|&(ctl, proportion)| {
                    let (label, bin_id, bin_label, deleted) =
                        controls.get(&ctl).cloned().unwrap_or_default();
                    let missing = match bin_id {
                        None if deleted => Some(MissingControlAllele::BinDeleted),
                        None => Some(MissingControlAllele::NotSet),
                        Some(b) => call
                            .filter(|c| c.reference_run_id.is_some())
                            .filter(|c| !c.peaks.iter().any(|pk| pk.bin_id == Some(b)))
                            .map(|_| MissingControlAllele::NoPeak),
                    };
                    QuantBiasComponent {
                        control_id: ctl,
                        control_label: label,
                        proportion,
                        bin_id,
                        bin_label,
                        missing,
                    }
                })
                .collect();
            mixtures.push(QuantBiasMixture {
                sample_id: sid,
                barcode: barcode(sid),
                reference_run_id: run,
                plate_label: well.map(|w| w.0.clone()),
                well_label: well.map(|w| w.1.clone()),
                used: used_samples.contains(&sid),
                components,
            });
        }
        mixtures.sort_by(|a, b| a.barcode.cmp(&b.barcode));
        Ok(LocusQuantBias {
            locus_id: p.locus_id,
            estimate,
            points,
            params_recomputed: Some(from_current && !status.is_current()),
            status,
            params: Some(params),
            mixtures: Some(mixtures),
        })
    })
}

/// Stored calls of a project (for exports).
pub(crate) fn all_calls(c: &Connection, pid: i64) -> Result<Vec<StoredCall>> {
    load_calls(c, pid, None, None)
}

/// Barcode, designation and MOI of a project sample.
pub(crate) type SampleEntry = (String, Designation, Option<u32>);

/// Sample barcodes and MOI of a project (for exports).
pub(crate) fn sample_table(c: &Connection, pid: i64) -> Result<BTreeMap<i64, SampleEntry>> {
    Ok(sample_infos(c, pid)?
        .into_iter()
        .map(|(id, i)| (id, (i.barcode, i.designation, i.moi)))
        .collect())
}
