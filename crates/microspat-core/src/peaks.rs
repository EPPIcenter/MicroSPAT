//! Peak finding and annotation for one run (one dye channel of one well).
//!
//! Two stages with very different costs:
//!
//! 1. [`scan`] depends only on the trace and [`ScanParams`]. The trace is
//!    Savitzky–Golay smoothed and baseline-corrected with a white top-hat;
//!    the relative maxima of that signal (a flat top counts as one, at its
//!    center) are snapped to the tallest raw point within `maxima_window`.
//!    Every run of raw values at the instrument's maximum ([`SATURATION`])
//!    is a candidate too, so an off-scale peak is never missed. Each
//!    candidate gets its area, integrated on the smoothed signal above the
//!    baseline from its apex down to the valleys on either side.
//!    Store the result; rescan only when scanning parameters change.
//! 2. [`annotate`] is cheap and is rerun whenever filter parameters, the locus
//!    range, sizing, or neighboring traces change. It sets size, height above
//!    baseline, bleedthrough and crosstalk ratios, filters, and sets relative
//!    height.
//!
//! **Heights are measured above the baseline** ([`signal::baseline`]), not
//! from the top-hat used for finding peaks. The top-hat's footprint (0.5% of
//! the trace, 45 points on a 9,000-point trace) is narrower than the base of
//! a saturated peak or of a cluster of stutter peaks and would cut into
//! them; the baseline is the level the trace spends most of its time at
//! within [`signal::BASELINE_REACH`] points, which neither those peaks nor
//! the negative dips that tall peaks of other dyes leave (spectral
//! over-subtraction) move by more than a few RFU. Raw 3730 baselines sit
//! anywhere from about −140 to +110 RFU, so a raw apex value would misstate
//! a 300 RFU minor peak by up to about 140 RFU. `raw_height` keeps the raw apex
//! value, because saturation is a property of the raw signal: a peak at
//! 32,767 is off-scale however high its baseline. Relative height,
//! `min_peak_height` and area use the height above baseline;
//! `max_peak_height` compares the raw apex.
//!
//! **Bleedthrough and crosstalk ratios** compare signals above their own
//! baselines, clamped at zero, so a baseline offset or a negative dip
//! (spectral over-subtraction) in either trace does not distort them; see
//! [`annotate`]. The **spectral dip ratio** measures those dips instead: the
//! deepest other-dye signal below its baseline under the peak, over the
//! peak's signal. Over-subtraction under a tall peak leaves a few percent;
//! where a capillary's dyes are not separated (a faulty spectral calibration)
//! the other dyes read large positive and negative values of the signal's
//! size at every peak, at any height, and genotyping flags that.

use crate::signal::{self, SignalError};
use crate::types::{Color, Peak};
use serde::{Deserialize, Serialize};
use std::ops::RangeInclusive;

/// Half-width, in data points, of the window summed for bleedthrough and crosstalk ratios.
pub const RATIO_HALF_WINDOW: usize = 1;

/// Largest value the instrument records; a raw point at this value is off-scale.
pub const SATURATION: i16 = i16::MAX;

/// Version of how peaks are measured. Stored results fingerprint it with
/// their parameters, so results measured by an older version read as stale.
/// Version 2: heights above the valley baseline, ratios on corrected signals,
/// flat tops found, area above the valley baseline. Version 3: the valley
/// baseline (anchored on the lowest stretch, so in spectral dips) replaced
/// by the densest-third baseline. Version 4: the spectral dip ratio.
/// Version 5: plate-measured expected pull-up (`pullup_contribution`,
/// `pullup_error`) and `fallback_bleedthrough_ratio`.
pub const MEASUREMENT_VERSION: u32 = 5;

/// Below this summed own signal (RFU over the ratio window), a ratio's
/// denominator is this value instead.
pub const MIN_RATIO_SIGNAL: f64 = 1.0;

/// Default SD multiplier for measured pull-up bounds. Within healthy 3730
/// plates, peak-to-peak pull-up spread is tight (roughly 0.2% to 1.5% of
/// the source signal); 4 SDs clears true pull-up peaks cleanly while keeping
/// true minor alleles sitting above negative dips or near-zero plate leak.
pub const DEFAULT_PULLUP_SD_LIMIT: f64 = 4.0;

/// Measured pull-up rates from every other dye into one target dye on a plate.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct DyePullUp {
    /// `(source_color, fraction, spread)` into the target dye.
    pub sources: Vec<(Color, f64, f64)>,
}

impl DyePullUp {
    /// Measured `(fraction, spread)` from `source` into this dye, if present.
    pub fn find(&self, source: Color) -> Option<(f64, f64)> {
        self.sources
            .iter()
            .find(|(c, _, _)| *c == source)
            .map(|&(_, frac, spread)| (frac, spread))
    }
}

/// Scanning parameters (the old "Relative Maximum" method).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(default)]
pub struct ScanParams {
    /// Snap each maximum to the tallest raw point within this many points (total window).
    pub maxima_window: usize,
    /// Points on each side a smoothed maximum must exceed (`argrelmax` order).
    pub relmax_window: usize,
    /// Savitzky–Golay window length (odd).
    pub smoothing_window: usize,
    /// Savitzky–Golay polynomial order.
    pub smoothing_order: usize,
    /// Top-hat footprint as a fraction of the trace length.
    pub tophat_factor: f64,
}

impl Default for ScanParams {
    fn default() -> Self {
        ScanParams {
            maxima_window: 10,
            relmax_window: 6,
            smoothing_window: 11,
            smoothing_order: 7,
            tophat_factor: 0.005,
        }
    }
}

/// Filter parameters applied by [`annotate`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(default)]
pub struct FilterParams {
    /// Peaks lower than this (RFU above baseline) are dropped. Default 0, as
    /// in the old application. Engine bin and artifact estimators default to
    /// 100 RFU: noise maxima otherwise form spurious bins, and in the artifact
    /// estimator they inflate the global estimator's error enough to reject
    /// most true minor alleles in the probabilistic pass (engine
    /// `projects::default_filter`).
    pub min_peak_height: f64,
    /// Peaks whose raw apex is taller than this (RFU) are dropped.
    pub max_peak_height: f64,
    /// Peaks whose height relative to the tallest retained peak is not above this are dropped.
    pub min_peak_height_ratio: f64,
    /// Peaks with a bleedthrough ratio at or above this are dropped.
    pub max_bleedthrough: f64,
    /// Peaks with a crosstalk ratio at or above this are dropped.
    pub max_crosstalk: f64,
    /// Of peaks closer than this (bp), only the tallest is kept.
    pub min_peak_distance: f64,
}

impl Default for FilterParams {
    fn default() -> Self {
        FilterParams {
            min_peak_height: 0.0,
            max_peak_height: 40_000.0,
            min_peak_height_ratio: 0.0,
            max_bleedthrough: 10.0,
            max_crosstalk: 100.0,
            min_peak_distance: 2.2,
        }
    }
}

/// Errors from scanning.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum PeakError {
    #[error("invalid scanning parameters: {0}")]
    InvalidParams(#[from] SignalError),
}

/// Signals that [`annotate`] needs besides the candidates.
#[derive(Debug, Clone, Copy)]
pub struct RunSignals<'a> {
    /// Raw trace of this run.
    pub trace: &'a [i16],
    /// Base size of every data point in the well (from the ladder fit).
    pub base_sizes: &'a [f64],
    /// Raw traces of the other dyes in the same well, tagged with their color.
    pub other_dyes: &'a [(Color, &'a [i16])],
    /// Raw traces of the same dye in neighboring capillaries (crosstalk).
    pub neighbor_capillaries: &'a [&'a [i16]],
    /// Plate-measured pull-up rates targeting this run's dye; `None` when not
    /// checked, disabled, or in a capillary with unseparated dyes.
    pub pull_up: Option<&'a DyePullUp>,
    /// Estimators drop any peak explained by measured pull-up (unless
    /// `max_bleedthrough >= 1e6`) so strong pull-up from an off-calibration
    /// instrument never pollutes bins or stutter models. Calling projects keep
    /// peaks below `max_bleedthrough` to flag in review.
    pub drop_measured_pullup: bool,
    /// Data-point indices flagged off-scale (`OfSc`) in this well. Peaks whose
    /// ratio window touches one skip measured pull-up and fall back to
    /// `fallback_bleedthrough_ratio`, because raw saturation happens before
    /// spectral deconvolution.
    pub offscale_indices: &'a [usize],
}

/// Savitzky–Golay smoothed trace, or None when the trace is shorter than the window.
fn smoothed_signal(trace: &[i16], params: &ScanParams) -> Result<Option<Vec<f64>>, PeakError> {
    let x: Vec<f64> = trace.iter().map(|&v| f64::from(v)).collect();
    match signal::savgol_filter(&x, params.smoothing_window, params.smoothing_order) {
        Ok(s) => Ok(Some(s)),
        // A trace shorter than the window has no meaningful peaks.
        Err(SignalError::TooShort { .. }) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Smoothed, top-hat-corrected trace that peak finding works on.
pub fn processed_signal(trace: &[i16], params: &ScanParams) -> Result<Vec<f64>, PeakError> {
    Ok(match smoothed_signal(trace, params)? {
        Some(s) => signal::white_tophat(&s, signal::tophat_size(trace.len(), params.tophat_factor)),
        None => vec![0.0; trace.len()],
    })
}

/// Stage 1: candidate peaks sorted by index, with `index`, `area`, and
/// `height` and `raw_height` both set to the raw apex value.
///
/// `height` stays raw here because the ladder fit compares candidates with
/// raw values of the other dyes; [`annotate`] replaces it with the height
/// above baseline.
pub fn scan(trace: &[i16], params: &ScanParams) -> Result<Vec<Peak>, PeakError> {
    let Some(smoothed) = smoothed_signal(trace, params)? else {
        return Ok(Vec::new());
    };
    let processed = signal::white_tophat(
        &smoothed,
        signal::tophat_size(trace.len(), params.tophat_factor),
    );
    let maxima = signal::argrelmax(&processed, params.relmax_window);
    let half = params.maxima_window / 2;
    let mut indices: Vec<usize> = maxima
        .into_iter()
        .map(|p| snap_to_raw_max(trace, p, half))
        .chain(saturated_runs(trace))
        .collect();
    indices.sort_unstable();
    indices.dedup();
    let baseline = signal::baseline(trace, 0, trace.len().saturating_sub(1));
    let above: Vec<f64> = smoothed.iter().zip(&baseline).map(|(s, b)| s - b).collect();
    Ok(indices
        .into_iter()
        .map(|index| Peak {
            index,
            height: f64::from(trace[index]),
            raw_height: f64::from(trace[index]),
            area: peak_area(&above, index),
            ..Peak::default()
        })
        .collect())
}

/// Centers of the runs of raw values at [`SATURATION`]. Smoothing turns a
/// clipped top into an exact plateau or two equal shoulders, which relative
/// maxima can miss; the off-scale flag depends on these peaks being found.
fn saturated_runs(trace: &[i16]) -> Vec<usize> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < trace.len() {
        if trace[i] == SATURATION {
            let start = i;
            while i + 1 < trace.len() && trace[i + 1] == SATURATION {
                i += 1;
            }
            out.push((start + i) / 2);
        }
        i += 1;
    }
    out
}

/// Tallest raw point within `half` points of `p`; keeps `p` on ties, else the
/// leftmost. On a flat top (a saturated peak) it takes the plateau's center,
/// where the old code took its left edge and so sized such peaks short.
fn snap_to_raw_max(trace: &[i16], p: usize, half: usize) -> usize {
    let lo = p.saturating_sub(half);
    let hi = (p + half).min(trace.len().saturating_sub(1));
    let mut best = p;
    for i in lo..=hi {
        if trace[i] > trace[best] {
            best = i;
        }
    }
    let top = trace[best];
    let mut left = best;
    while left > 0 && trace[left - 1] == top {
        left -= 1;
    }
    let mut right = best;
    while right + 1 < trace.len() && trace[right + 1] == top {
        right += 1;
    }
    let bounded =
        left > 0 && right + 1 < trace.len() && trace[left - 1] < top && trace[right + 1] < top;
    if bounded && right - left >= 2 {
        (left + right) / 2
    } else {
        best
    }
}

/// Area of the signal above baseline from the local apex out to the valleys.
///
/// Each side extends while the signal is positive, rises no more than 0.2%
/// of the apex above the lowest value passed on that side (so rounding
/// ripples on a flat top do not stop it, but the rise into a neighbor does),
/// and still adds more than 0.1% of the area so far. The apex is counted
/// once.
fn peak_area(s: &[f64], index: usize) -> f64 {
    const MIN_RELATIVE_CONTRIBUTION: f64 = 0.001;
    const RISE_TOLERANCE: f64 = 0.002;
    let n = s.len();
    if index >= n {
        return 0.0;
    }
    // The raw apex can sit a point or two off the smoothed apex.
    let mut apex = index;
    while apex + 1 < n && s[apex + 1] > s[apex] {
        apex += 1;
    }
    while apex > 0 && s[apex - 1] > s[apex] {
        apex -= 1;
    }
    if s[apex] <= 0.0 {
        return 0.0;
    }
    let tol = RISE_TOLERANCE * s[apex];
    let mut area = s[apex];
    let (mut i, mut low) = (apex, s[apex]);
    while i > 0
        && s[i - 1] > 0.0
        && s[i - 1] <= low + tol
        && s[i - 1] > area * MIN_RELATIVE_CONTRIBUTION
    {
        i -= 1;
        area += s[i];
        low = low.min(s[i]);
    }
    let (mut j, mut low) = (apex, s[apex]);
    while j + 1 < n
        && s[j + 1] > 0.0
        && s[j + 1] <= low + tol
        && s[j + 1] > area * MIN_RELATIVE_CONTRIBUTION
    {
        j += 1;
        area += s[j];
        low = low.min(s[j]);
    }
    area
}

/// A trace with its baseline over the points `annotate` reads.
pub(crate) struct Corrected<'a> {
    pub(crate) trace: &'a [i16],
    pub(crate) lo: usize,
    pub(crate) baseline: Vec<f64>,
}

impl<'a> Corrected<'a> {
    pub(crate) fn new(trace: &'a [i16], lo: usize, hi: usize) -> Self {
        Corrected {
            trace,
            lo,
            baseline: signal::baseline(trace, lo, hi),
        }
    }

    /// Raw value minus baseline at `i`, which must lie in the range.
    pub(crate) fn above(&self, i: usize) -> f64 {
        f64::from(self.trace[i]) - self.baseline.get(i - self.lo).copied().unwrap_or(0.0)
    }

    /// Signal above baseline, clamped at zero, summed over the ratio window
    /// around `index`; None when the trace does not reach `index`. A window
    /// holding an off-scale point is summed raw instead.
    pub(crate) fn window_sum(&self, index: usize) -> Option<f64> {
        if index >= self.trace.len() {
            return None;
        }
        let lo = index.saturating_sub(RATIO_HALF_WINDOW).max(self.lo);
        let hi = (index + RATIO_HALF_WINDOW).min(self.trace.len() - 1);
        let hi = hi.min(self.lo + self.baseline.len().saturating_sub(1));
        if lo > hi {
            return Some(0.0);
        }
        let points = lo..=hi;
        if self.trace[points.clone()].contains(&SATURATION) {
            return Some(points.map(|i| f64::from(self.trace[i])).sum());
        }
        Some(points.map(|i| self.above(i).max(0.0)).sum())
    }

    /// Signal below baseline (as a positive number) summed over the ratio
    /// window around `index`; None when the trace does not reach `index`.
    pub(crate) fn dip_sum(&self, index: usize) -> Option<f64> {
        if index >= self.trace.len() {
            return None;
        }
        let lo = index.saturating_sub(RATIO_HALF_WINDOW).max(self.lo);
        let hi = (index + RATIO_HALF_WINDOW).min(self.trace.len() - 1);
        let hi = hi.min(self.lo + self.baseline.len().saturating_sub(1));
        Some((lo..=hi).map(|i| (-self.above(i)).max(0.0)).sum())
    }

    /// Signal above baseline, not clamped, summed over the ratio window
    /// around `index`: positive for pull-up or leak, negative in a dip.
    /// None when the trace does not reach `index`.
    pub(crate) fn signed_sum(&self, index: usize) -> Option<f64> {
        if index >= self.trace.len() || index < self.lo {
            return None;
        }
        let lo = index.saturating_sub(RATIO_HALF_WINDOW).max(self.lo);
        let hi = (index + RATIO_HALF_WINDOW).min(self.trace.len() - 1);
        let hi = hi.min(self.lo + self.baseline.len().saturating_sub(1));
        (lo <= hi).then(|| (lo..=hi).map(|i| self.above(i)).sum())
    }

    /// Largest ratio of a source's window sum to this trace's.
    fn ratio_of(&self, sources: impl IntoIterator<Item = &'a Corrected<'a>>, index: usize) -> f64 {
        let own = self.window_sum(index).unwrap_or(0.0).max(MIN_RATIO_SIGNAL);
        sources
            .into_iter()
            .filter_map(|s| s.window_sum(index))
            .map(|s| s / own)
            .fold(0.0, f64::max)
    }

    /// True when any point of the ratio window around `index` is saturated.
    pub(crate) fn is_saturated(&self, index: usize) -> bool {
        if index >= self.trace.len() {
            return false;
        }
        let lo = index.saturating_sub(RATIO_HALF_WINDOW).max(self.lo);
        let hi = (index + RATIO_HALF_WINDOW).min(self.trace.len() - 1);
        let hi = hi.min(self.lo + self.baseline.len().saturating_sub(1));
        lo <= hi && self.trace[lo..=hi].contains(&SATURATION)
    }

    /// Deepest dip of another trace below its baseline, over this trace's signal.
    fn dip_ratio_of(
        &self,
        others: impl IntoIterator<Item = &'a Corrected<'a>>,
        index: usize,
    ) -> f64 {
        let own = self.window_sum(index).unwrap_or(0.0).max(MIN_RATIO_SIGNAL);
        others
            .into_iter()
            .filter_map(|s| s.dip_sum(index))
            .map(|s| s / own)
            .fold(0.0, f64::max)
    }
}

/// Shape ratio `apex / 3-point window sum` fallback when own signal is near
/// baseline: typical 3730 Gaussian width gives ~2.85 points of window sum per
/// unit of apex height.
const DEFAULT_APEX_TO_WINDOW_SUM: f64 = 1.0 / 2.85;

/// Computes `pullup_contribution`, `pullup_error`, and
/// `fallback_bleedthrough_ratio` at `index` from `others`, optional plate
/// pull-up rates, and instrument off-scale scan indices (`OfSc`).
fn measure_pull_up(
    own: &Corrected<'_>,
    index: usize,
    height: f64,
    others: &[(Color, Corrected<'_>)],
    pull_up: Option<&DyePullUp>,
    bleedthrough_ratio: f64,
    offscale_indices: &[usize],
) -> (Option<f64>, Option<f64>, f64) {
    let Some(pu) = pull_up else {
        return (None, None, bleedthrough_ratio);
    };
    let own_ws = own.window_sum(index).unwrap_or(0.0);
    let own_den = own_ws.max(MIN_RATIO_SIGNAL);
    let shape = if own_ws > 3.0 {
        (height / own_ws).clamp(0.2, 0.5)
    } else {
        DEFAULT_APEX_TO_WINDOW_SUM
    };
    let lo = index.saturating_sub(RATIO_HALF_WINDOW).max(own.lo);
    let hi = (index + RATIO_HALF_WINDOW).min(own.trace.len().saturating_sub(1));
    let window_offscale = !own.trace.is_empty()
        && lo <= hi
        && offscale_indices.iter().any(|&i| (lo..=hi).contains(&i));
    let mut epu = 0.0;
    let mut vpu = 0.0;
    let mut any_measured = false;
    let mut fallback = 0.0_f64;
    for (color, corr) in others {
        let Some(s_ws) = corr.window_sum(index) else {
            continue;
        };
        if !window_offscale && !corr.is_saturated(index) {
            if let Some((frac, spread)) = pu.find(*color) {
                epu += frac * s_ws * shape;
                vpu += (spread * s_ws * shape).powi(2);
                any_measured = true;
                continue;
            }
        }
        fallback = fallback.max(s_ws / own_den);
    }
    if any_measured {
        (Some(epu), Some(vpu.sqrt()), fallback)
    } else {
        (None, None, fallback)
    }
}

/// Stage 2: size, measure, and filter candidates for one locus. Returns retained peaks by size.
///
/// The spectral dip ratio is the deepest other-dye signal below its own
/// baseline, summed over the same window, over this trace's signal; it is
/// measured, not filtered on.
///
/// Height is the raw apex value minus the baseline, clamped at zero;
/// `raw_height` is the raw apex value.
///
/// The bleedthrough ratio (other dyes, same well) and the crosstalk ratio
/// (same dye, neighboring capillaries) are the largest source's signal over
/// this trace's, each summed over `±RATIO_HALF_WINDOW` points above its own
/// baseline and clamped at zero. When this trace has less than
/// [`MIN_RATIO_SIGNAL`] above baseline the denominator is that value: a peak
/// with no signal of its own is explained by any source signal, and with no
/// source signal either the ratio is 0. A source window that holds an
/// off-scale point is summed raw, so `height × ratio`, the implied source
/// signal genotyping compares with its off-scale threshold, still reaches
/// the instrument's maximum on a trace with a baseline. Sources too short to
/// cover the peak are skipped.
///
/// When plate-measured pull-up rates are provided (`run.pull_up`), expected
/// pull-up (`pullup_contribution`, `pullup_error`) is summed across all
/// measured source dyes whenever no saturated trace value or instrument
/// off-scale point (`run.offscale_indices`) sits in the ratio window, while
/// unmeasured or off-scale sources fall into `fallback_bleedthrough_ratio`.
/// Peaks with `bleedthrough_ratio >= max_bleedthrough` are always dropped; when
/// `drop_measured_pullup` is true (estimators, and `max_bleedthrough < 1e6`),
/// peaks below `max_bleedthrough` whose height sits within
/// [`DEFAULT_PULLUP_SD_LIMIT`] SDs of expected pull-up are dropped too.
///
/// Filters, in order: size within `size_range`; height at least
/// `min_peak_height` and raw apex at most `max_peak_height`; bleedthrough
/// filters (`max_bleedthrough`, plus measured pull-up in estimators); crosstalk
/// ratio below `max_crosstalk`; of peaks within `min_peak_distance` bp, the
/// tallest; relative height above `min_peak_height_ratio`, repeated until
/// nothing changes.
pub fn annotate(
    candidates: &[Peak],
    run: &RunSignals<'_>,
    size_range: RangeInclusive<f64>,
    params: &FilterParams,
) -> Vec<Peak> {
    let n = run.trace.len().min(run.base_sizes.len());
    let in_range: Vec<(usize, f64, f64)> = candidates
        .iter()
        .filter(|c| c.index < n)
        .map(|c| (c.index, run.base_sizes[c.index], c.area))
        .filter(|(_, size, _)| size_range.contains(size))
        .collect();
    let (Some(first), Some(last)) = (
        in_range.iter().map(|c| c.0).min(),
        in_range.iter().map(|c| c.0).max(),
    ) else {
        return Vec::new();
    };
    let lo = first.saturating_sub(RATIO_HALF_WINDOW);
    let hi = last + RATIO_HALF_WINDOW;
    let own = Corrected::new(run.trace, lo, hi);
    let measured: Vec<Peak> = in_range
        .into_iter()
        .filter_map(|(index, size, area)| {
            let raw_height = f64::from(run.trace[index]);
            let height = own.above(index).max(0.0);
            (height >= params.min_peak_height && raw_height <= params.max_peak_height).then(|| {
                Peak {
                    index,
                    size,
                    height,
                    raw_height,
                    area,
                    ..Peak::default()
                }
            })
        })
        .collect();
    if measured.is_empty() {
        return Vec::new();
    }
    let others: Vec<(Color, Corrected<'_>)> = run
        .other_dyes
        .iter()
        .map(|&(c, t)| (c, Corrected::new(t, lo, hi)))
        .collect();
    let neighbors: Vec<Corrected<'_>> = run
        .neighbor_capillaries
        .iter()
        .map(|t| Corrected::new(t, lo, hi))
        .collect();
    let mut kept: Vec<Peak> = measured
        .into_iter()
        .filter_map(|mut p| {
            p.bleedthrough_ratio = own.ratio_of(others.iter().map(|(_, c)| c), p.index);
            p.spectral_dip_ratio = own.dip_ratio_of(others.iter().map(|(_, c)| c), p.index);
            let (epu, spu, fallback) = measure_pull_up(
                &own,
                p.index,
                p.height,
                &others,
                run.pull_up,
                p.bleedthrough_ratio,
                run.offscale_indices,
            );
            p.pullup_contribution = epu;
            p.pullup_error = spu;
            p.fallback_bleedthrough_ratio = fallback;
            if p.bleedthrough_ratio >= params.max_bleedthrough {
                return None;
            }
            if run.drop_measured_pullup && params.max_bleedthrough < 1e6 {
                if let (Some(e), Some(s)) = (p.pullup_contribution, p.pullup_error) {
                    let bound = e + DEFAULT_PULLUP_SD_LIMIT * s;
                    if bound > 0.0 && p.height <= bound {
                        return None;
                    }
                }
            }
            p.crosstalk_ratio = own.ratio_of(neighbors.iter(), p.index);
            if p.crosstalk_ratio >= params.max_crosstalk {
                return None;
            }
            Some(p)
        })
        .collect();
    kept = keep_tallest_within(kept, params.min_peak_distance);
    loop {
        let max = kept
            .iter()
            .map(|p| p.height)
            .fold(f64::NEG_INFINITY, f64::max);
        for p in &mut kept {
            p.relative_height = p.height / max.max(1e-6);
        }
        let before = kept.len();
        kept.retain(|p| p.relative_height > params.min_peak_height_ratio);
        if kept.len() == before {
            break;
        }
    }
    kept.sort_by(|a, b| a.size.total_cmp(&b.size));
    kept
}

/// Non-maximum suppression in base pairs: visit peaks tallest first and keep
/// each one that is farther than `distance` from every peak already kept.
fn keep_tallest_within(mut peaks: Vec<Peak>, distance: f64) -> Vec<Peak> {
    peaks.sort_by(|a, b| b.height.total_cmp(&a.height).then(a.index.cmp(&b.index)));
    let mut kept: Vec<Peak> = Vec::with_capacity(peaks.len());
    for p in peaks {
        if kept.iter().all(|k| (k.size - p.size).abs() > distance) {
            kept.push(p);
        }
    }
    kept
}

/// Highest raw signal at points whose base size lies in `size_range` (plate-view signal check).
pub fn max_signal_in_range(
    trace: &[i16],
    base_sizes: &[f64],
    size_range: RangeInclusive<f64>,
) -> Option<i16> {
    trace
        .iter()
        .zip(base_sizes)
        .filter(|(_, s)| size_range.contains(s))
        .map(|(&v, _)| v)
        .max()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gaussian_trace(n: usize, peaks: &[(f64, f64, f64)], baseline: f64) -> Vec<i16> {
        (0..n)
            .map(|i| {
                let x = i as f64;
                let mut v = baseline + 0.02 * x;
                for &(c, h, s) in peaks {
                    v += h * (-(x - c).powi(2) / (2.0 * s * s)).exp();
                }
                v.round() as i16
            })
            .collect()
    }

    #[test]
    fn scan_finds_gaussian_peaks_and_areas() {
        let peaks = [
            (500.0, 1000.0, 4.0),
            (800.0, 3000.0, 3.0),
            (1500.0, 200.0, 5.0),
        ];
        let trace = gaussian_trace(8000, &peaks, 100.0);
        let found = scan(&trace, &ScanParams::default()).unwrap();
        // Rounding the sloped baseline leaves tiny steps that are real relative
        // maxima; like the old code, scanning keeps them and filtering drops them.
        let found: Vec<Peak> = found.into_iter().filter(|p| p.height > 300.0).collect();
        let idx: Vec<usize> = found.iter().map(|p| p.index).collect();
        assert_eq!(idx, vec![500, 800, 1500]);
        for (p, &(_, h, s)) in found.iter().zip(&peaks) {
            let expected = h * s * (2.0 * std::f64::consts::PI).sqrt();
            assert!(
                (p.area - expected).abs() / expected < 0.1,
                "{} vs {}",
                p.area,
                expected
            );
        }
    }

    #[test]
    fn scan_handles_tiny_and_empty_traces() {
        assert!(scan(&[], &ScanParams::default()).unwrap().is_empty());
        assert!(scan(&[1, 2, 3], &ScanParams::default()).unwrap().is_empty());
        let bad = ScanParams {
            smoothing_window: 10,
            ..ScanParams::default()
        };
        assert!(scan(&[0; 100], &bad).is_err());
    }

    #[test]
    fn snapping_prefers_raw_maximum() {
        let mut t = vec![0i16; 30];
        t[10] = 5;
        t[13] = 9;
        t[14] = 9;
        assert_eq!(snap_to_raw_max(&t, 10, 5), 13);
        assert_eq!(snap_to_raw_max(&t, 14, 5), 14);
        // Near the end of the trace the window is clipped, not skipped.
        assert_eq!(snap_to_raw_max(&t, 28, 5), 28);
        // A clipped (saturated) top snaps to the plateau center.
        let mut s = vec![0i16; 40];
        for v in &mut s[20..27] {
            *v = i16::MAX;
        }
        s[19] = 30_000;
        assert_eq!(snap_to_raw_max(&s, 21, 5), 23);
    }

    fn run_peaks(sizes: &[(f64, f64)]) -> (Vec<i16>, Vec<f64>, Vec<Peak>) {
        // 10 points per bp starting at 0 bp.
        let n = 8000;
        let base: Vec<f64> = (0..n).map(|i| i as f64 / 10.0).collect();
        let g: Vec<(f64, f64, f64)> = sizes.iter().map(|&(s, h)| (s * 10.0, h, 3.0)).collect();
        let trace = gaussian_trace(n, &g, 20.0);
        let cands = scan(&trace, &ScanParams::default()).unwrap();
        (trace, base, cands)
    }

    #[test]
    fn annotate_sizes_and_filters_by_range_height_and_distance() {
        let (trace, base, cands) = run_peaks(&[
            (100.0, 2000.0),
            (110.0, 120.0),
            (111.5, 1500.0),
            (130.0, 600.0),
            (300.0, 5000.0),
        ]);
        let run = RunSignals {
            trace: &trace,
            base_sizes: &base,
            other_dyes: &[],
            neighbor_capillaries: &[],
            pull_up: None,
            drop_measured_pullup: false,
            offscale_indices: &[],
        };
        let params = FilterParams {
            min_peak_height: 160.0,
            ..FilterParams::default()
        };
        let out = annotate(&cands, &run, 90.0..=200.0, &params);
        let sizes: Vec<f64> = out.iter().map(|p| p.size).collect();
        // 110 is within 2.2 bp of the taller 111.5; 300 is out of range.
        assert_eq!(sizes, vec![100.0, 111.5, 130.0]);
        assert_eq!(out[0].relative_height, 1.0);
        assert!((out[2].relative_height - 0.3).abs() < 0.02);
        assert!(out.iter().all(|p| p.area > 0.0));
        assert_eq!(
            max_signal_in_range(&trace, &base, 290.0..=310.0),
            Some(trace[3000])
        );
        assert_eq!(max_signal_in_range(&trace, &base, 900.0..=1000.0), None);
    }

    #[test]
    fn relative_height_filter_iterates() {
        let (trace, base, cands) = run_peaks(&[(100.0, 2000.0), (120.0, 300.0), (140.0, 150.0)]);
        let run = RunSignals {
            trace: &trace,
            base_sizes: &base,
            other_dyes: &[],
            neighbor_capillaries: &[],
            pull_up: None,
            drop_measured_pullup: false,
            offscale_indices: &[],
        };
        let params = FilterParams {
            min_peak_height: 160.0,
            min_peak_height_ratio: 0.1,
            ..FilterParams::default()
        };
        let out = annotate(&cands, &run, 0.0..=400.0, &params);
        assert_eq!(
            out.iter().map(|p| p.size).collect::<Vec<_>>(),
            vec![100.0, 120.0]
        );
    }

    #[test]
    fn bleedthrough_and_crosstalk_ratios() {
        let (trace, base, cands) = run_peaks(&[(100.0, 1000.0), (200.0, 1000.0)]);
        // Another dye with a tall peak at 200 bp: our 200 bp peak is pull-up.
        let other = gaussian_trace(8000, &[(2000.0, 20_000.0, 3.0)], 0.0);
        // A neighbor capillary that is short (truncated run) must not reset the ratio.
        let neighbor_tall = gaussian_trace(8000, &[(1000.0, 30_000.0, 3.0)], 0.0);
        let neighbor_short = vec![0i16; 500];
        let others: [(Color, &[i16]); 1] = [(Color::Blue, &other)];
        let neighbors: [&[i16]; 2] = [&neighbor_tall, &neighbor_short];
        let run = RunSignals {
            trace: &trace,
            base_sizes: &base,
            other_dyes: &others,
            neighbor_capillaries: &neighbors,
            pull_up: None,
            drop_measured_pullup: false,
            offscale_indices: &[],
        };
        let all = annotate(
            &cands,
            &run,
            0.0..=400.0,
            &FilterParams {
                min_peak_height: 160.0,
                max_bleedthrough: f64::INFINITY,
                max_crosstalk: f64::INFINITY,
                ..FilterParams::default()
            },
        );
        assert_eq!(all.len(), 2);
        assert!(
            (all[0].crosstalk_ratio - 30.0).abs() < 1.0,
            "{}",
            all[0].crosstalk_ratio
        );
        assert!(
            (all[1].bleedthrough_ratio - 20.0).abs() < 1.0,
            "{}",
            all[1].bleedthrough_ratio
        );
        assert!(all[0].bleedthrough_ratio < 0.01);
        // Defaults: bleedthrough 20 is over the limit of 10; crosstalk 30 is
        // under the limit of 100.
        let filtered = annotate(
            &cands,
            &run,
            0.0..=400.0,
            &FilterParams {
                min_peak_height: 160.0,
                ..FilterParams::default()
            },
        );
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].size, 100.0);
        let strict = annotate(
            &cands,
            &run,
            0.0..=400.0,
            &FilterParams {
                min_peak_height: 160.0,
                max_crosstalk: 10.0,
                ..FilterParams::default()
            },
        );
        assert!(strict.is_empty());
    }

    /// Trace from a function of the data point, rounded and clipped like the
    /// instrument's output.
    fn trace_of(n: usize, f: impl Fn(f64) -> f64) -> Vec<i16> {
        (0..n)
            .map(|i| f(i as f64).round().clamp(-32_768.0, 32_767.0) as i16)
            .collect()
    }

    fn gauss(x: f64, c: f64, h: f64, s: f64) -> f64 {
        h * (-(x - c).powi(2) / (2.0 * s * s)).exp()
    }

    /// Deterministic noise with the given SD (sum of uniforms).
    fn noise(n: usize, sd: f64, seed: u64) -> Vec<f64> {
        let mut state = seed;
        let mut u = move || {
            state = state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            (state >> 11) as f64 / (1u64 << 53) as f64
        };
        (0..n)
            .map(|_| ((0..12).map(|_| u()).sum::<f64>() - 6.0) * sd)
            .collect()
    }

    fn sized(trace: &[i16]) -> Vec<f64> {
        (0..trace.len()).map(|i| i as f64 / 10.0).collect()
    }

    /// Annotated peaks of a lone trace with every filter open.
    fn measure(trace: &[i16]) -> Vec<Peak> {
        let base = sized(trace);
        let run = RunSignals {
            trace,
            base_sizes: &base,
            other_dyes: &[],
            neighbor_capillaries: &[],
            pull_up: None,
            drop_measured_pullup: false,
            offscale_indices: &[],
        };
        let open = FilterParams {
            min_peak_distance: 0.0,
            ..FilterParams::default()
        };
        annotate(
            &scan(trace, &ScanParams::default()).unwrap(),
            &run,
            0.0..=1e9,
            &open,
        )
    }

    fn at(peaks: &[Peak], index: usize) -> &Peak {
        peaks
            .iter()
            .min_by_key(|p| p.index.abs_diff(index))
            .filter(|p| p.index.abs_diff(index) <= 3)
            .unwrap_or_else(|| panic!("no peak at {index}"))
    }

    fn assert_close(found: f64, planted: f64, rfu: f64) {
        let tol = (0.01 * planted).max(rfu);
        assert!(
            (found - planted).abs() <= tol,
            "height {found:.1}, planted {planted:.1}"
        );
    }

    /// A wide flat-topped peak (overloaded, not clipped) and a saturated one
    /// are measured from the baseline beside them; the top-hat footprint
    /// (45 points here) is narrower than their bases and cuts into them.
    #[test]
    fn wide_flat_topped_peaks_keep_their_height_and_area() {
        let n = 9000;
        let flat = |x: f64, c: f64, h: f64, w: f64| h * (-((x - c) / w).powi(8)).exp();
        let trace = trace_of(n, |x| {
            250.0 + flat(x, 3000.0, 12_000.0, 40.0) + gauss(x, 6000.0, 200_000.0, 12.0)
        });
        let peaks = measure(&trace);
        assert_close(at(&peaks, 3000).height, 12_000.0, 3.0);
        let saturated = at(&peaks, 6000);
        assert_eq!(saturated.raw_height, 32_767.0);
        assert_close(saturated.height, 32_767.0 - 250.0, 3.0);
        // Area of the flat top: integral of the planted shape.
        let planted: f64 = (0..n).map(|i| flat(i as f64, 3000.0, 12_000.0, 40.0)).sum();
        let p = at(&peaks, 3000);
        assert!(
            (p.area - planted).abs() / planted < 0.02,
            "{} vs {planted}",
            p.area
        );
        // The top-hat signal that peak finding uses has lost most of it.
        let tophat = processed_signal(&trace, &ScanParams::default()).unwrap();
        assert!(tophat[3000] < 0.5 * 12_000.0, "{}", tophat[3000]);
    }

    /// Stutter peaks two bases apart overlap, so the valleys between them
    /// never reach the baseline; each height is the signal above the
    /// baseline at its apex, tails of the neighbors included.
    #[test]
    fn clustered_stutter_peaks_keep_their_heights() {
        let n = 9000;
        // An allele at 4000 with stutter at -1..-3 and +1 repeats (27 points),
        // and a minor allele 4 repeats below with its own stutter.
        let mut planted: Vec<(f64, f64)> = Vec::new();
        for (c, h) in [(4000.0, 8000.0), (4000.0 - 4.0 * 27.0, 900.0)] {
            for (k, r) in [
                (0.0, 1.0),
                (-1.0, 0.25),
                (-2.0, 0.08),
                (-3.0, 0.02),
                (1.0, 0.05),
            ] {
                planted.push((c + k * 27.0, h * r));
            }
        }
        let signal = |x: f64| {
            planted
                .iter()
                .map(|&(c, h)| gauss(x, c, h, 5.0))
                .sum::<f64>()
        };
        let trace = trace_of(n, |x| 180.0 + signal(x));
        let peaks = measure(&trace);
        let tophat = processed_signal(&trace, &ScanParams::default()).unwrap();
        let mut worst_tophat: f64 = 0.0;
        for &(c, _) in &planted {
            let p = at(&peaks, c as usize);
            let truth = signal(p.index as f64);
            assert_close(p.height, truth, 3.0);
            worst_tophat = worst_tophat.max((truth - tophat[p.index]) / truth);
        }
        // The top-hat cuts into the cluster: at least one peak loses over 10%.
        assert!(worst_tophat > 0.1, "{worst_tophat}");
    }

    /// A linear slope is removed exactly; a slow curved drift within a few RFU.
    #[test]
    fn heights_on_a_sloping_or_drifting_baseline() {
        let n = 9000;
        let planted = [
            (2500.0, 6000.0),
            (2600.0, 300.0),
            (5200.0, 1500.0),
            (7000.0, 120.0),
        ];
        let peaks_at = |x: f64| {
            planted
                .iter()
                .map(|&(c, h)| gauss(x, c, h, 4.0))
                .sum::<f64>()
        };
        let sloped = trace_of(n, |x| 400.0 - 0.04 * x + peaks_at(x));
        let drift = |x: f64| 150.0 + 50.0 * (x / 6000.0 * std::f64::consts::TAU + 1.0).sin();
        let drifting = trace_of(n, |x| drift(x) + peaks_at(x));
        for trace in [&sloped, &drifting] {
            let peaks = measure(trace);
            for &(c, h) in &planted {
                assert_close(at(&peaks, c as usize).height, h, 3.0);
            }
        }
    }

    /// On a zero baseline a height is the raw apex value within a few RFU.
    #[test]
    fn heights_on_a_zero_baseline_equal_raw_heights() {
        let n = 9000;
        let e = noise(n, 6.0, 7);
        let trace = trace_of(n, |x| {
            e[x as usize] + gauss(x, 3000.0, 4000.0, 4.0) + gauss(x, 3100.0, 150.0, 4.0)
        });
        let peaks = measure(&trace);
        let mut checked = 0;
        for p in peaks.iter().filter(|p| p.raw_height > 100.0) {
            assert!((p.height - p.raw_height).abs() <= 6.0, "{p:?}");
            checked += 1;
        }
        assert_eq!(checked, 2);
        // Noise maxima are a few RFU above baseline, not the noise's peak-to-peak.
        let noise_max = peaks
            .iter()
            .filter(|p| p.raw_height < 100.0)
            .map(|p| p.height)
            .fold(0.0, f64::max);
        assert!(noise_max < 30.0, "{noise_max}");
    }

    /// Relative heights and minor-allele proportions do not see the baseline.
    #[test]
    fn proportions_do_not_include_the_baseline() {
        let trace = trace_of(9000, |x| {
            300.0 + gauss(x, 4000.0, 3000.0, 4.0) + gauss(x, 4300.0, 300.0, 4.0)
        });
        let peaks = measure(&trace);
        let (major, minor) = (at(&peaks, 4000), at(&peaks, 4300));
        assert!((minor.relative_height - 0.1).abs() < 0.002);
        let p = minor.height / (major.height + minor.height);
        assert!((p - 300.0 / 3300.0).abs() < 0.001, "{p}");
        // Raw heights would report 600 / 3900.
        assert!(minor.raw_height / (major.raw_height + minor.raw_height) > 0.15);
    }

    /// Smoothing turns a clipped top into an exactly flat run, which a strict
    /// relative-maximum test never reports. With the default order-7
    /// smoothing the plateau's edges overshoot and are found instead; a
    /// moving average (order 0 or 1) does not overshoot, and the old scan
    /// missed such peaks.
    #[test]
    fn saturated_peaks_are_always_found() {
        let strict = |x: &[f64], order: usize| -> Vec<usize> {
            (1..x.len() - 1)
                .filter(|&i| {
                    (1..=order).all(|k| {
                        x[i] > x[i.saturating_sub(k)] && x[i] > x[(i + k).min(x.len() - 1)]
                    })
                })
                .collect()
        };
        let trace = trace_of(9000, |x| 400.0 + gauss(x, 4000.0, 90_000.0, 5.0));
        let flat_top: Vec<usize> = (0..trace.len())
            .filter(|&i| trace[i] == SATURATION)
            .collect();
        assert_eq!((flat_top[0], flat_top[flat_top.len() - 1]), (3993, 4007));
        let smoothed = signal::savgol_filter(
            &trace.iter().map(|&v| f64::from(v)).collect::<Vec<_>>(),
            11,
            7,
        )
        .unwrap();
        // Exactly flat (bit for bit) where the whole smoothing window is clipped.
        assert!(smoothed[3998..=4002].iter().all(|&v| v == smoothed[3998]));
        assert!((smoothed[3998] - 32_767.0).abs() < 1e-6);
        for order in [7, 1, 0] {
            let params = ScanParams {
                smoothing_order: order,
                ..ScanParams::default()
            };
            let processed = processed_signal(&trace, &params).unwrap();
            let old_found = strict(&processed, params.relmax_window)
                .into_iter()
                .map(|i| snap_to_raw_max(&trace, i, params.maxima_window / 2))
                .any(|i| (3993..=4007).contains(&i));
            assert_eq!(old_found, order == 7, "order {order}");
            let found = scan(&trace, &params).unwrap();
            assert!(found.iter().any(|p| p.index == 4000), "order {order}");
        }
        // A run of clipped points with no relative maximum at all.
        let mut clipped = vec![0i16; 300];
        for v in &mut clipped[100..200] {
            *v = SATURATION;
        }
        assert!(scan(&clipped, &ScanParams::default())
            .unwrap()
            .iter()
            .any(|p| p.index == 149));
        // Off-scale is judged on the raw apex: `max_peak_height` drops it,
        // whatever the baseline under it.
        let peaks = measure(&trace);
        let p = at(&peaks, 4000);
        assert_eq!(p.raw_height, 32_767.0);
        assert_close(p.height, 32_767.0 - 400.0, 3.0);
        let base = sized(&trace);
        let run = RunSignals {
            trace: &trace,
            base_sizes: &base,
            other_dyes: &[],
            neighbor_capillaries: &[],
            pull_up: None,
            drop_measured_pullup: false,
            offscale_indices: &[],
        };
        let guarded = annotate(
            &scan(&trace, &ScanParams::default()).unwrap(),
            &run,
            0.0..=1e9,
            &FilterParams {
                max_peak_height: 32_700.0,
                ..FilterParams::default()
            },
        );
        assert!(guarded.iter().all(|p| p.index.abs_diff(4000) > 3));
    }

    /// Ratios compare signal above each trace's baseline: an offset or a
    /// negative dip in another dye is not bleedthrough.
    #[test]
    fn ratios_ignore_baselines_and_dips() {
        let n = 9000;
        let own = trace_of(n, |x| gauss(x, 4000.0, 200.0, 4.0));
        // A high, flat other dye; a dip under the peak; a real pull-up source.
        let offset = trace_of(n, |_| 2000.0);
        let dip = trace_of(n, |x| 50.0 - gauss(x, 4000.0, 400.0, 6.0));
        let pullup = trace_of(n, |x| 2000.0 + gauss(x, 4000.0, 4000.0, 4.0));
        let base = sized(&own);
        let ratio = |source: &[i16]| {
            let others: [(Color, &[i16]); 1] = [(Color::Blue, source)];
            let run = RunSignals {
                trace: &own,
                base_sizes: &base,
                other_dyes: &others,
                neighbor_capillaries: &[],
                pull_up: None,
                drop_measured_pullup: false,
                offscale_indices: &[],
            };
            let open = FilterParams {
                max_bleedthrough: f64::INFINITY,
                ..FilterParams::default()
            };
            at(
                &annotate(
                    &scan(&own, &ScanParams::default()).unwrap(),
                    &run,
                    0.0..=1e9,
                    &open,
                ),
                4000,
            )
            .bleedthrough_ratio
        };
        // Raw sums, as before: 6000 / 601 and 450 / 601 (absolute value).
        assert!(ratio(&offset) < 0.01, "{}", ratio(&offset));
        assert!(ratio(&dip) < 0.01, "{}", ratio(&dip));
        assert!((ratio(&pullup) - 20.0).abs() < 0.5, "{}", ratio(&pullup));
    }

    /// The dip ratio reads another dye's signal below its baseline under
    /// the peak: a few percent for spectral over-subtraction, about the
    /// signal itself where the dyes were not separated.
    #[test]
    fn spectral_dip_ratio() {
        let n = 9000;
        let own = trace_of(n, |x| 40.0 + gauss(x, 4000.0, 9000.0, 4.0));
        let normal = trace_of(n, |x| 10.0 - gauss(x, 4000.0, 450.0, 4.0));
        let broken = trace_of(n, |x| -20.0 - gauss(x, 4000.0, 8700.0, 4.0));
        let base = sized(&own);
        let dip = |source: &[i16]| {
            let others: [(Color, &[i16]); 1] = [(Color::Blue, source)];
            let run = RunSignals {
                trace: &own,
                base_sizes: &base,
                other_dyes: &others,
                neighbor_capillaries: &[],
                pull_up: None,
                drop_measured_pullup: false,
                offscale_indices: &[],
            };
            let open = FilterParams {
                max_bleedthrough: f64::INFINITY,
                ..FilterParams::default()
            };
            let peaks = annotate(
                &scan(&own, &ScanParams::default()).unwrap(),
                &run,
                0.0..=1e9,
                &open,
            );
            let p = at(&peaks, 4000);
            (p.spectral_dip_ratio, p.bleedthrough_ratio)
        };
        let (d, b) = dip(&normal);
        assert!((d - 0.05).abs() < 0.005 && b == 0.0, "{d} {b}");
        let (d, _) = dip(&broken);
        assert!((d - 0.967).abs() < 0.02, "{d}");
    }

    /// A ratio's denominator is at least [`MIN_RATIO_SIGNAL`]: a candidate
    /// with nothing above its baseline takes the source's summed signal as
    /// its ratio, and 0 without a source signal.
    #[test]
    fn ratio_of_a_peak_without_own_signal() {
        let n = 9000;
        let flat = trace_of(n, |_| 100.0);
        let source = trace_of(n, |x| 100.0 + gauss(x, 4000.0, 300.0, 4.0));
        let quiet = trace_of(n, |_| -20.0);
        let own = Corrected::new(&flat, 3990, 4010);
        let sources = [Corrected::new(&source, 3990, 4010)];
        assert_eq!(own.window_sum(4000), Some(0.0));
        let summed = 300.0 * (1.0 + 2.0 * (-1.0f64 / 32.0).exp());
        let r = own.ratio_of(sources.iter(), 4000);
        assert!((r - summed).abs() < 3.0, "{r} vs {summed}");
        assert_eq!(
            own.ratio_of([Corrected::new(&quiet, 3990, 4010)].iter(), 4000),
            0.0
        );
        assert_eq!(own.ratio_of(std::iter::empty(), 4000), 0.0);
        // A source too short to reach the peak is skipped.
        let short = [0i16; 100];
        assert_eq!(
            own.ratio_of([Corrected::new(&short, 3990, 4010)].iter(), 4000),
            0.0
        );
    }

    /// A source that reaches the instrument's maximum is summed raw, so the
    /// implied source signal (`height × ratio`) stays off-scale on a trace
    /// with a baseline, as genotyping's off-scale rule expects.
    #[test]
    fn saturated_source_keeps_its_raw_signal() {
        let n = 9000;
        let own = trace_of(n, |x| gauss(x, 4000.0, 1000.0, 4.0));
        let source = trace_of(n, |x| 1500.0 + gauss(x, 4000.0, 90_000.0, 5.0));
        let base = sized(&own);
        let others: [(Color, &[i16]); 1] = [(Color::Blue, &source)];
        let run = RunSignals {
            trace: &own,
            base_sizes: &base,
            other_dyes: &others,
            neighbor_capillaries: &[],
            pull_up: None,
            drop_measured_pullup: false,
            offscale_indices: &[],
        };
        let open = FilterParams {
            max_bleedthrough: f64::INFINITY,
            ..FilterParams::default()
        };
        let peaks = annotate(
            &scan(&own, &ScanParams::default()).unwrap(),
            &run,
            0.0..=1e9,
            &open,
        );
        let p = at(&peaks, 4000);
        let implied = p.height * p.bleedthrough_ratio;
        assert!(implied > 32_767.0, "{implied}");
        // Above its baseline the source would be about 31,267.
        let corrected_source = 3.0 * (32_767.0 - 1500.0);
        assert!(p.height * corrected_source / (3.0 * 1000.0 * 0.98) < 32_000.0);
    }

    #[test]
    fn measured_pull_up_filter_and_expectations() {
        let n = 9000;
        let base: Vec<f64> = (0..n).map(|i| i as f64 / 10.0).collect();
        // Blue sources at 4000 (10k), 5000 (8k), 5500 (12k), 7500 (8k);
        // unmeasured yellow at 6000 (12k); saturated red at 7000.
        let blue = trace_of(n, |x| {
            gauss(x, 4000.0, 10_000.0, 4.0)
                + gauss(x, 5000.0, 8_000.0, 4.0)
                + gauss(x, 5500.0, 12_000.0, 4.0)
                + gauss(x, 7500.0, 8_000.0, 4.0)
        });
        let yellow = trace_of(n, |x| gauss(x, 6000.0, 12_000.0, 4.0));
        let sat_red = trace_of(n, |x| 500.0 + gauss(x, 7000.0, 90_000.0, 5.0));

        // Target green has:
        // - at 4000: 1400 RFU (14% pull-up from 10k blue; ratio ~7.1 < 10)
        // - at 5000: 1200 RFU (true minor allele under 8k blue; ratio ~6.7 in 5..10)
        // - at 5500: 800 RFU (under 12k blue; ratio ~15 >= max_bleedthrough 10)
        // - at 6000: 800 RFU (ratio ~15 >= 10 from unmeasured yellow)
        // - at 7000: 2500 RFU under saturated red (ratio > 10, falls back)
        // - at 7500: 2000 RFU under unsaturated 8k blue flagged OfSc (ratio ~4, falls back)
        let own = trace_of(n, |x| {
            gauss(x, 4000.0, 1400.0, 4.0)
                + gauss(x, 5000.0, 1200.0, 4.0)
                + gauss(x, 5500.0, 800.0, 4.0)
                + gauss(x, 6000.0, 800.0, 4.0)
                + gauss(x, 7000.0, 2500.0, 4.0)
                + gauss(x, 7500.0, 2000.0, 4.0)
        });
        let cands = scan(&own, &ScanParams::default()).unwrap();
        let others: [(Color, &[i16]); 3] = [
            (Color::Blue, &blue),
            (Color::Yellow, &yellow),
            (Color::Red, &sat_red),
        ];

        // 1. Clean plate (0.4% B->G, +/- 0.4% spread):
        // - Calling mode keeps 5000 (1200 RFU >> ~32 RFU EPU, ratio ~6.7 < 10)
        // - max_bleedthrough 10 still drops 5500 (ratio ~15 >= 10), 6000 (unmeasured yellow), and 7000 (sat red)
        // - 7500 touches OfSc index 7500 even though blue < 32,767, so it falls back cleanly
        let clean_pu = DyePullUp {
            sources: vec![(Color::Blue, 0.004, 0.004), (Color::Red, 0.002, 0.002)],
        };
        let kept_clean = annotate(
            &cands,
            &RunSignals {
                trace: &own,
                base_sizes: &base,
                other_dyes: &others,
                neighbor_capillaries: &[],
                pull_up: Some(&clean_pu),
                drop_measured_pullup: false,
                offscale_indices: &[7500],
            },
            0.0..=1e9,
            &FilterParams::default(),
        );
        assert!(kept_clean.iter().any(|p| p.index == 4000));
        let p5000 = at(&kept_clean, 5000);
        assert!(p5000.bleedthrough_ratio > 5.0 && p5000.bleedthrough_ratio < 10.0);
        assert!(p5000.pullup_contribution.unwrap() < 80.0);
        assert!(p5000.fallback_bleedthrough_ratio < 0.05);
        assert!(kept_clean.iter().all(|p| p.index.abs_diff(5500) > 5));
        assert!(kept_clean.iter().all(|p| p.index.abs_diff(6000) > 5));
        assert!(kept_clean.iter().all(|p| p.index.abs_diff(7000) > 5));
        let p7500 = at(&kept_clean, 7500);
        assert_eq!(p7500.pullup_contribution, None);
        assert_eq!(p7500.pullup_error, None);
        assert!((p7500.fallback_bleedthrough_ratio - p7500.bleedthrough_ratio).abs() < 1e-12);
        assert!((p7500.fallback_bleedthrough_ratio - 4.0).abs() < 0.2);

        // Estimator mode on clean plate still keeps 5000 (~1200 >> ~32) while dropping 5500!
        let est_clean = annotate(
            &cands,
            &RunSignals {
                trace: &own,
                base_sizes: &base,
                other_dyes: &others,
                neighbor_capillaries: &[],
                pull_up: Some(&clean_pu),
                drop_measured_pullup: true,
                offscale_indices: &[7500],
            },
            0.0..=1e9,
            &FilterParams::default(),
        );
        assert!(est_clean.iter().any(|p| p.index == 5000));
        assert!(est_clean.iter().all(|p| p.index.abs_diff(5500) > 5));

        // 2. Leaky plate (14% B->G, +/- 1% spread):
        // - Calling mode keeps 4000 (ratio ~7.1 < 10) so UI shows it flagged,
        //   while EPU is ~1400 RFU;
        // - Estimator mode (`drop_measured_pullup: true`) drops 4000!
        let leaky_pu = DyePullUp {
            sources: vec![(Color::Blue, 0.14, 0.01)],
        };
        let calling_leaky = annotate(
            &cands,
            &RunSignals {
                trace: &own,
                base_sizes: &base,
                other_dyes: &others,
                neighbor_capillaries: &[],
                pull_up: Some(&leaky_pu),
                drop_measured_pullup: false,
                offscale_indices: &[],
            },
            0.0..=1e9,
            &FilterParams::default(),
        );
        let p4000 = at(&calling_leaky, 4000);
        assert!((p4000.pullup_contribution.unwrap() - 1400.0).abs() < 150.0);
        assert!((p4000.pullup_error.unwrap() - 100.0).abs() < 20.0);

        let est_leaky = annotate(
            &cands,
            &RunSignals {
                trace: &own,
                base_sizes: &base,
                other_dyes: &others,
                neighbor_capillaries: &[],
                pull_up: Some(&leaky_pu),
                drop_measured_pullup: true,
                offscale_indices: &[],
            },
            0.0..=1e9,
            &FilterParams::default(),
        );
        assert!(est_leaky.iter().all(|p| p.index.abs_diff(4000) > 5));

        // 3. Negative spectral dip (-5% B->G): negative EPU, never dropped.
        let dip_pu = DyePullUp {
            sources: vec![(Color::Blue, -0.05, 0.01)],
        };
        let kept_dip = annotate(
            &cands,
            &RunSignals {
                trace: &own,
                base_sizes: &base,
                other_dyes: &others,
                neighbor_capillaries: &[],
                pull_up: Some(&dip_pu),
                drop_measured_pullup: true,
                offscale_indices: &[],
            },
            0.0..=1e9,
            &FilterParams::default(),
        );
        let p4000_dip = at(&kept_dip, 4000);
        assert!(p4000_dip.pullup_contribution.unwrap() < -400.0);
    }
}
