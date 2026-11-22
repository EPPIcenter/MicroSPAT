//! Ladder sizing as stored in the workspace.
//!
//! **Base sizes are recomputed, not stored.** A well's fit is stored as its
//! matched ladder peaks (data-point index and assigned size, ~20 pairs).
//! The per-point base sizes (one `f64` per scan, ~9,000 per well) are a pure
//! function of those pairs, so storing them would add ~36–72 KB per well,
//! several times the size of all five compressed traces, and could go stale
//! when a fit is edited. Rebuilding the monotone interpolant takes tens of
//! microseconds per well (see `locus_runs` for the measured cost of loading a
//! locus).
//!
//! Core keeps the interpolant private and rebuilds it from the stored pairs
//! with [`ladder::fit_from_pairs`].
//!
//! **States are computed when read** from the stored quality and matched
//! sizes under the plate's current ladder spec ([`ladder::LadderSpec::assess`]):
//! a fit with fewer matched peaks than the ladder allows is unusable whatever
//! its quality. A *run* is additionally unusable when its locus range is not
//! covered by the well's sized range ([`LadderSpec::covers`]), because sizes
//! there would be extrapolated from a partial ladder; the well is then
//! flagged with a reason that names the loci.
//!
//! **Fitting a plate** takes two passes ([`ladder::resolve_with_plate`]):
//! every well is fitted alone, then wells whose assignment the trace alone
//! cannot settle (a periodic ladder missing peaks at one end) are fitted
//! again against where the plate's unambiguous wells put each ladder size.
//! A well that stays ambiguous keeps a quality of at least the size
//! difference between the rival assignments, so every reader sees it as
//! unusable, and its explanation is stored in `sizing_error` (which, next
//! to a quality, is a note on the fit rather than a failure).

use microspat_core::abif::Fsa;
use microspat_core::ladder::{self, LadderFit, LadderPrior, LadderSpec, SizingStatus};
use microspat_core::peaks;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Sizing state of a well, as shown in the plate view.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum SizingState {
    /// Quality within the ladder's flag limit.
    Good,
    /// Usable, but above the flag limit: worth a look.
    Flagged,
    /// Fitted, but above the unusable limit; excluded from analysis.
    Unusable,
    /// No fit (too few ladder peaks, no ladder signal, ...).
    Failed,
}

impl SizingState {
    /// True when runs of this well may be used for analysis.
    pub fn usable(self) -> bool {
        matches!(self, SizingState::Good | SizingState::Flagged)
    }
}

/// State of a stored fit under a ladder's spec. `quality` is None for a failed fit.
pub fn state(quality: Option<f64>, peak_sizes: &[f64], spec: &LadderSpec) -> SizingState {
    assess(quality, peak_sizes, None, spec).0
}

/// State of a stored fit and, unless good, why. `error` is the stored
/// failure message of a failed fit.
pub fn assess(
    quality: Option<f64>,
    peak_sizes: &[f64],
    error: Option<&str>,
    spec: &LadderSpec,
) -> (SizingState, Option<String>) {
    match quality {
        None => (
            SizingState::Failed,
            Some(
                error
                    .unwrap_or("The ladder could not be fitted.")
                    .to_string(),
            ),
        ),
        Some(q) => {
            let a = spec.assess(q, peak_sizes);
            // A stored note (an ambiguous assignment) explains a poor quality
            // better than the number does; completeness still comes first.
            let reason = match error {
                Some(note)
                    if a.status != SizingStatus::Good
                        && peak_sizes.len() >= spec.required_peaks() =>
                {
                    Some(note.to_string())
                }
                _ => a.reason,
            };
            (a.status.into(), reason)
        }
    }
}

/// State of a run: its well's fit state, but unusable when the locus range
/// `min..=max` lies outside the sized range.
pub fn run_state(
    quality: Option<f64>,
    peak_sizes: &[f64],
    spec: &LadderSpec,
    min: f64,
    max: f64,
) -> SizingState {
    match state(quality, peak_sizes, spec) {
        s if s.usable() && !spec.covers(peak_sizes, min, max) => SizingState::Unusable,
        s => s,
    }
}

/// [`run_state`] with the reason, as [`assess`] gives it for a well: the
/// well's reason, or why the locus range makes the run unusable.
pub fn assess_run(
    quality: Option<f64>,
    peak_sizes: &[f64],
    error: Option<&str>,
    spec: &LadderSpec,
    locus: &WellLocus,
) -> (SizingState, Option<String>) {
    let (state, reason) = assess(quality, peak_sizes, error, spec);
    let (label, min, max) = locus;
    if !state.usable() || spec.covers(peak_sizes, *min, *max) {
        return (state, reason);
    }
    let (lo, hi) = (
        peak_sizes.first().copied().unwrap_or(0.0),
        peak_sizes.last().copied().unwrap_or(0.0),
    );
    let msg = format!(
        "Locus {label} ({min}–{max} bp) lies outside the sized range {lo}–{hi} bp; this run is unusable until the ladder covers it."
    );
    let reason = Some(match reason {
        Some(r) => format!("{r} {msg}"),
        None => msg,
    });
    (SizingState::Unusable, reason)
}

/// A locus assigned to a well: label and size range.
pub type WellLocus = (String, f64, f64);

/// State of a well with the loci assigned to it: [`assess`], but a usable
/// fit that leaves some assigned locus outside its sized range is at least
/// flagged, with the loci named (their runs are unusable).
pub fn assess_well(
    quality: Option<f64>,
    peak_sizes: &[f64],
    error: Option<&str>,
    spec: &LadderSpec,
    loci: &[WellLocus],
) -> (SizingState, Option<String>) {
    let (state, reason) = assess(quality, peak_sizes, error, spec);
    if !state.usable() {
        return (state, reason);
    }
    let mut outside: Vec<String> = loci
        .iter()
        .filter(|(_, min, max)| !spec.covers(peak_sizes, *min, *max))
        .map(|(l, min, max)| format!("{l} ({min}–{max} bp)"))
        .collect();
    outside.sort();
    outside.dedup();
    if outside.is_empty() {
        return (state, reason);
    }
    let (lo, hi) = (
        peak_sizes.first().copied().unwrap_or(0.0),
        peak_sizes.last().copied().unwrap_or(0.0),
    );
    let msg = format!(
        "{} outside the sized range {lo}–{hi} bp; {} unusable until the ladder covers {}.",
        if outside.len() == 1 {
            format!("Locus {} lies", outside[0])
        } else {
            format!("Loci {} lie", outside.join(", "))
        },
        if outside.len() == 1 {
            "its runs are"
        } else {
            "their runs are"
        },
        if outside.len() == 1 { "it" } else { "them" },
    );
    let reason = Some(match reason {
        Some(r) => format!("{r} {msg}"),
        None => msg,
    });
    (SizingState::Flagged, reason)
}

impl From<SizingStatus> for SizingState {
    fn from(s: SizingStatus) -> Self {
        match s {
            SizingStatus::Good => SizingState::Good,
            SizingStatus::Flagged => SizingState::Flagged,
            SizingStatus::Unusable => SizingState::Unusable,
        }
    }
}

/// Fits the ladder of one parsed well alone, or says why it cannot. Fits of
/// a plate's wells then go through [`ladder::resolve_with_plate`] with
/// [`fit_fsa_with_prior`].
pub fn fit_fsa(fsa: &Fsa, spec: &LadderSpec) -> Result<LadderFit, String> {
    fit_fsa_with_prior(fsa, spec, None)
}

/// [`fit_fsa`] with the assignment also scored against the plate's
/// consensus ([`ladder::fit_ladder_with_prior`]).
pub fn fit_fsa_with_prior(
    fsa: &Fsa,
    spec: &LadderSpec,
    prior: Option<&LadderPrior>,
) -> Result<LadderFit, String> {
    let ladder = fsa.channel(spec.color).ok_or_else(|| {
        format!(
            "the file has no {:?} dye channel for the ladder",
            spec.color
        )
        .to_lowercase()
    })?;
    let others: Vec<&[i16]> = fsa
        .channels
        .iter()
        .filter(|c| c.color != spec.color)
        .map(|c| c.data.as_slice())
        .collect();
    ladder::fit_ladder_with_prior(&ladder.data, &others, spec, prior).map_err(|e| e.to_string())
}

/// Base size of every data point, rebuilt from a stored fit. None when there is no fit.
pub fn base_sizes(
    peak_indices: &[usize],
    peak_sizes: &[f64],
    trace_len: usize,
    precision: u32,
) -> Option<Vec<f64>> {
    ladder::fit_from_pairs(trace_len, peak_indices, peak_sizes, precision)
        .ok()
        .map(|f| f.base_sizes)
}

/// Highest raw signal between the outermost ladder peaks (the sized range).
pub fn sized_max_signal(trace: &[i16], peak_indices: &[usize]) -> Option<i16> {
    let (&lo, &hi) = (peak_indices.first()?, peak_indices.last()?);
    trace
        .get(lo..=hi.min(trace.len().saturating_sub(1)))?
        .iter()
        .copied()
        .max()
}

/// Highest raw signal inside a locus size range. None when the well is unsized.
pub fn locus_max_signal(
    trace: &[i16],
    base_sizes: Option<&[f64]>,
    min: f64,
    max: f64,
) -> Option<i16> {
    peaks::max_signal_in_range(trace, base_sizes?, min..=max)
}
