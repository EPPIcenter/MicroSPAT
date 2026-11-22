//! Artifact (stutter) model: how much signal a peak is expected to receive
//! from artifacts of the other peaks in the same run.
//!
//! **Estimation** uses mono-allelic runs only ([`is_mono_allelic`]): exactly one
//! peak reaches `max_secondary_relative_peak_height`, so every other peak can be
//! read as an artifact of that main peak. Secondary peaks from all such runs are
//! pooled (in a fixed order, so the model does not depend on the order runs
//! are handed over) and clustered by their distance in bp from their main
//! peak (mean shift, bandwidth half the repeat length). Each distance class
//! (other than 0) with at least `min_artifact_peak_frequency` peaks becomes
//! an [`ArtifactEstimator`] when it also shows in enough runs (below): the
//! artifact's height relative to the main peak is fit as a straight line in
//! the *main peak's* size, separately in each size segment (segments are split
//! by user breakpoints), by a chosen [`RegressionMethod`] (Theil–Sen default).
//!
//! *Which classes are artifacts.* A run whose minor clones stay below the
//! mono-allelic cut-off still carries their alleles, so peaks pile up at the
//! population's allele spacings as well as at stutter positions. An artifact
//! comes with its parent whenever it can be seen; another clone's allele at a
//! fixed spacing shows only in the runs that carry that clone. So a class
//! must show in at least `min_artifact_run_fraction` (default a majority) of
//! the mono-allelic runs whose main peak is tall enough for it to clear the
//! detection floor at the class's lower-quartile ratio. The floor is the 5th
//! percentile of the secondary peaks' heights, which recovers the peak filter
//! upstream. Counting only those runs keeps a weak, faithful artifact (a
//! by-product at 1% of its parent, seen in every tall run and no short one)
//! from looking rare. One run with several peaks in a class counts once.
//! There is no limit on distance: on 3730 data stutter reaches several
//! repeats at some loci, and some loci carry by-products tens of bp from
//! the allele, in single-strain samples as in mixtures.
//!
//! *Fit.* Minor alleles only ever add to a stutter position, so the true
//! ratio is the low, dense part of the observed ones. With the default
//! [`ErrorEstimator::DensestHalf`] the line (Theil–Sen slope) is moved onto
//! the densest half of its residuals and its spread taken from that half.
//! A class whose parents all lie within one repeat of each other (one parent
//! allele) has no measurable slope and is fit flat (`NoSlope`); so is a class
//! whose line would predict a negative ratio between its own parents. The
//! error estimator chosen for a class applies to its flat fit too.
//!
//! *Global class.* Peaks left over model low-level background not tied to a
//! distance. Two kinds of left-over peaks are kept out of it. Those that sit
//! in an allele bin (`in_bin`, when the caller has binned the runs): not
//! explained by any stutter class, they are mostly minor clones. And those
//! within an accepted class's annotation buffer (`3·SD`, at least 0.5 bp,
//! wider than the `2·SD` used to extract the class): annotation already
//! counts them as that class's artifact. It needs as many points as a class
//! and is fit flat at their mean with the MAD spread, whatever the classes
//! use: background is a level, and its heavy tail is part of what a peak
//! must clear. Equations fit each segment's points; segments are closed, so
//! the first covers the locus minimum ([`Segment`]). Every estimator keeps
//! its supporting points so the UI can plot them and refit.
//!
//! **Annotation** ([`annotate_artifacts`]) sets, for each peak `t` of a run,
//!
//! ```text
//! artifact_contribution(t) = Σ_estimators Σ_{parents p ≠ t} max(0, slope·size(p) + intercept) · height(p)
//! artifact_error(t)        = Σ_estimators Σ_{parents p ≠ t} sd · height(p)
//! ```
//!
//! where, for a distance estimator, `p` is a parent of `t` when
//! `|size(t) − size(p) − distance| < buffer`. The global estimator was fit
//! relative to the single main peak of mono-allelic runs, so its only parent is
//! the run's tallest peak; summing it over every peak would overstate background
//! in polyclonal samples and hide true minor alleles. The equation used is the
//! segment containing `size(p)`. Distance-class contributions add over *all*
//! parents: in a mixture one peak can be
//! the −1 repeat stutter of one allele and the −2 of another, and still be a true
//! minor allele itself; genotyping decides that by comparing its height with this
//! expectation. Errors add linearly, a conservative bound.
//!
//! Two refinements were measured and not adopted. Each distance class is
//! fit relative to the main peak of mono-allelic runs, so its ratio already
//! includes higher-order stutter, and counting the −1 stutter peak as a
//! parent of the −2 position counts some of it twice. Annotating from net
//! parent heights (`height − own contribution`) gained about two minor
//! alleles per false call it added on real mixtures, but took the false-call
//! rate over 3%; on the synthetic study it cost 0.20–0.27 points of
//! precision. Adding independent parents' errors in quadrature added about
//! as many false calls as it found alleles.

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::stats::{
    self, ErrorEstimator, LinearFit, MeanShift, RegressionMethod, Seeding, StatsError,
};
use crate::types::{LocusInfo, Peak};

/// Errors from artifact estimation.
#[derive(Debug, Error, Clone, PartialEq)]
pub enum ArtifactError {
    /// The locus repeat length is zero, negative or not finite.
    #[error("nucleotide repeat length must be positive, got {0}")]
    InvalidRepeatLength(f64),
    /// A numerical routine rejected its input.
    #[error(transparent)]
    Stats(#[from] StatsError),
}

/// Artifact estimation settings (old `ArtifactEstimatorLocusParams`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(default)]
pub struct ArtifactParams {
    /// A run is mono-allelic when exactly one peak has relative height at or
    /// above this; all others are then treated as its artifacts.
    pub max_secondary_relative_peak_height: f64,
    /// Minimum number of peaks in a distance class to fit an estimator for it.
    pub min_artifact_peak_frequency: u32,
    /// Minimum share of the mono-allelic runs tall enough to show a distance
    /// class that must show it (0 disables the check). Keeps minor clones'
    /// alleles out of the model (module docs).
    pub min_artifact_run_fraction: f64,
    /// Seed for RANSAC fits.
    #[cfg_attr(feature = "ts", ts(type = "number"))]
    pub seed: u64,
    /// How Theil–Sen, RANSAC and no-slope equations of distance classes
    /// estimate their error (`sd`), which sets how far above its expected
    /// artifact height a peak must be to be called; the densest half also
    /// sets the line's level. The global class always uses MAD.
    pub error_estimator: ErrorEstimator,
}

impl Default for ArtifactParams {
    fn default() -> Self {
        ArtifactParams {
            max_secondary_relative_peak_height: 0.4,
            min_artifact_peak_frequency: 10,
            min_artifact_run_fraction: 0.5,
            seed: 0,
            error_estimator: ErrorEstimator::default(),
        }
    }
}

/// One secondary peak from a mono-allelic run, as used to fit an estimator.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct ArtifactPoint {
    /// Size (bp) of the run's main peak; the regression's x.
    pub parent_size: f64,
    /// Size (bp) of the artifact peak.
    pub size: f64,
    /// Artifact height divided by main-peak height; the regression's y.
    pub relative_height: f64,
}

/// A size segment and the method used to fit it: the user-editable part of an
/// equation. A parent peak belongs to the first segment, in size order, with
/// `start_size <= size <= end_size`: segments are closed so that the first one
/// includes the locus minimum (peaks are kept over the locus range
/// inclusively), and a size shared by two segments (a breakpoint) belongs to
/// the lower one.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct Segment {
    /// Lower bound (inclusive; a breakpoint belongs to the segment below it), bp.
    pub start_size: f64,
    /// Upper bound (inclusive), bp.
    pub end_size: f64,
    /// How the segment's line is fit.
    pub method: RegressionMethod,
    /// How a Theil–Sen, RANSAC or no-slope fit estimates its error. Least
    /// squares always uses RMS. Segments stored without the field were fit
    /// when RMS was the only estimator, so they read as RMS.
    #[serde(default = "rms")]
    pub error: ErrorEstimator,
}

/// A fitted line for one segment: relative artifact height = slope · parent size + intercept.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct ArtifactEquation {
    /// Size range and method.
    pub segment: Segment,
    /// The fitted line and its residual SD (in relative height).
    pub fit: LinearFit,
    /// Number of points the fit used.
    pub n_points: u32,
}

/// One artifact class: a distance from the parent peak, or the global class.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct ArtifactEstimator {
    /// Distance rounded to 0.01 bp, or "Global Artifact".
    pub label: String,
    /// Artifact position relative to its parent, in bp (`None` for global).
    pub artifact_distance: Option<f64>,
    /// Tolerance around `artifact_distance`, in bp (`None` for global).
    pub artifact_distance_buffer: Option<f64>,
    /// Supporting points, kept for plotting and refitting.
    pub points: Vec<ArtifactPoint>,
    /// One equation per non-empty segment, ordered by size.
    pub equations: Vec<ArtifactEquation>,
}

/// Label of the global estimator.
pub const GLOBAL_LABEL: &str = "Global Artifact";

fn rms() -> ErrorEstimator {
    ErrorEstimator::Rms
}

impl Segment {
    fn contains(&self, size: f64) -> bool {
        self.start_size <= size && size <= self.end_size
    }
}

/// Index of the segment a parent of `size` belongs to: the lowest containing it.
fn segment_of(segments: &[Segment], size: f64) -> Option<usize> {
    (0..segments.len())
        .filter(|&i| segments[i].contains(size))
        .min_by(|&a, &b| {
            segments[a]
                .start_size
                .total_cmp(&segments[b].start_size)
                .then(a.cmp(&b))
        })
}

impl ArtifactEstimator {
    /// True for the global (distance-free) estimator.
    pub fn is_global(&self) -> bool {
        self.artifact_distance.is_none()
    }

    /// The current segments, in size order.
    pub fn segments(&self) -> Vec<Segment> {
        self.equations.iter().map(|e| e.segment).collect()
    }

    /// Refits from the stored points over the given segments. Segments with no
    /// points get no equation (parents there contribute nothing).
    pub fn refit(&mut self, segments: &[Segment], seed: u64) -> Result<(), ArtifactError> {
        let mut eqs = Vec::new();
        for (k, seg) in segments.iter().enumerate() {
            let (x, y): (Vec<f64>, Vec<f64>) = self
                .points
                .iter()
                .filter(|p| segment_of(segments, p.parent_size) == Some(k))
                .map(|p| (p.parent_size, p.relative_height))
                .unzip();
            if x.is_empty() {
                continue;
            }
            let mut fit = stats::fit_line(seg.method, &x, &y, seed)?;
            // A no-slope fit stands in for Theil–Sen on one-parent classes
            // and must keep the error the user chose for it.
            let robust = matches!(
                seg.method,
                RegressionMethod::TheilSen | RegressionMethod::Ransac | RegressionMethod::NoSlope
            );
            if robust {
                match seg.error {
                    ErrorEstimator::Mad => {
                        fit.sd = stats::robust_residual_scale(&x, &y, fit.slope, fit.intercept);
                    }
                    ErrorEstimator::DensestHalf => {
                        (fit.intercept, fit.sd) =
                            stats::densest_half_line(&x, &y, fit.slope, fit.intercept);
                        fit.r_squared = stats::r_squared(&x, &y, fit.slope, fit.intercept);
                    }
                    ErrorEstimator::Rms => {}
                }
            }
            eqs.push(ArtifactEquation {
                segment: *seg,
                fit,
                n_points: x.len() as u32,
            });
        }
        eqs.sort_by(|a, b| a.segment.start_size.total_cmp(&b.segment.start_size));
        self.equations = eqs;
        Ok(())
    }

    /// Splits the segment strictly containing `breakpoint` in two (both halves
    /// keep its method) and refits. Returns false, changing nothing, when no
    /// segment contains it.
    pub fn add_breakpoint(&mut self, breakpoint: f64, seed: u64) -> Result<bool, ArtifactError> {
        let mut segs = self.segments();
        let Some(i) = segs
            .iter()
            .position(|s| s.start_size < breakpoint && breakpoint < s.end_size)
        else {
            return Ok(false);
        };
        let s = segs[i];
        segs[i].end_size = breakpoint;
        segs.insert(
            i + 1,
            Segment {
                start_size: breakpoint,
                ..s
            },
        );
        self.refit(&segs, seed)?;
        Ok(true)
    }

    /// Replaces all segments by one spanning `start_size..end_size`, keeping
    /// the error estimator of the current first segment.
    pub fn clear_breakpoints(
        &mut self,
        start_size: f64,
        end_size: f64,
        method: RegressionMethod,
        seed: u64,
    ) -> Result<(), ArtifactError> {
        let error = self
            .equations
            .first()
            .map(|e| e.segment.error)
            .unwrap_or_default();
        self.refit(
            &[Segment {
                start_size,
                end_size,
                method,
                error,
            }],
            seed,
        )
    }

    /// Changes the method of the equation at `equation_index` and refits it.
    /// Returns false when there is no such equation.
    pub fn set_method(
        &mut self,
        equation_index: usize,
        method: RegressionMethod,
        seed: u64,
    ) -> Result<bool, ArtifactError> {
        let mut segs = self.segments();
        let Some(seg) = segs.get_mut(equation_index) else {
            return Ok(false);
        };
        seg.method = method;
        self.refit(&segs, seed)?;
        Ok(true)
    }

    fn equation_for(&self, parent_size: f64) -> Option<&LinearFit> {
        let segments = self.segments();
        segment_of(&segments, parent_size).map(|i| &self.equations[i].fit)
    }
}

/// All artifact estimators for one locus. Deleting an estimator is removing it
/// from `estimators`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct ArtifactModel {
    /// Distance-class estimators and at most one global estimator.
    pub estimators: Vec<ArtifactEstimator>,
}

/// True when exactly one peak has `relative_height >= max_secondary_relative_peak_height`.
pub fn is_mono_allelic(peaks: &[Peak], max_secondary_relative_peak_height: f64) -> bool {
    peaks
        .iter()
        .filter(|p| p.relative_height >= max_secondary_relative_peak_height)
        .count()
        == 1
}

/// A secondary peak of a mono-allelic run, as a candidate artifact point.
struct Candidate {
    /// Distance from the run's main peak, bp.
    distance: f64,
    point: ArtifactPoint,
    in_bin: bool,
    /// Index of the run, to count runs rather than peaks.
    run: usize,
    main_height: f64,
}

/// Height (RFU) below which peaks were not seen: the 5th percentile of the
/// secondary peaks' heights. Peak filters upstream set the real floor; this
/// recovers it without being told, and a few stray peaks below it do not
/// move it.
fn detection_floor(pool: &[Candidate]) -> f64 {
    let mut h: Vec<f64> = pool
        .iter()
        .map(|c| c.point.relative_height * c.main_height)
        .filter(|v| v.is_finite())
        .collect();
    if h.is_empty() {
        return 0.0;
    }
    h.sort_by(f64::total_cmp);
    h[(h.len() - 1) / 20]
}

/// True when a class shows in at least `fraction` of the mono-allelic runs
/// whose main peak is tall enough for it to clear the detection floor at the
/// class's lower-quartile ratio. An artifact comes with its parent whenever
/// it can be seen; another clone's allele at a fixed spacing shows only in
/// the runs that carry that clone, however tall the main peak. Counting
/// only runs where the class could be seen keeps a weak but faithful
/// artifact (seen in every tall run, missed in every short one) from
/// looking rare. A run with several peaks in the class counts once.
fn shows_in_enough_runs(taken: &[Candidate], mains: &[f64], floor: f64, fraction: f64) -> bool {
    let mut ratios: Vec<f64> = taken.iter().map(|c| c.point.relative_height).collect();
    ratios.sort_by(f64::total_cmp);
    let Some(&low) = ratios.get(ratios.len() / 4) else {
        return false;
    };
    let visible = |main: f64| main * low >= floor;
    let detectable = mains.iter().filter(|&&m| visible(m)).count();
    let hits = taken
        .iter()
        .filter(|c| visible(c.main_height))
        .map(|c| c.run)
        .collect::<std::collections::BTreeSet<_>>()
        .len();
    hits >= 1 && hits as f64 >= fraction * detectable as f64
}

/// Estimates the artifact model of a locus from many runs' peaks. Runs that are
/// not mono-allelic are ignored. Estimators come out distance classes first
/// (most supported first), then the global one.
pub fn estimate_artifact_model(
    runs: &[&[Peak]],
    locus: &LocusInfo,
    params: &ArtifactParams,
) -> Result<ArtifactModel, ArtifactError> {
    let repeat = locus.nucleotide_repeat_length;
    if !(repeat.is_finite() && repeat > 0.0) {
        return Err(ArtifactError::InvalidRepeatLength(repeat));
    }
    let mut pool: Vec<Candidate> = Vec::new();
    // Main-peak height of every mono-allelic run.
    let mut mains: Vec<f64> = Vec::new();
    for (run_index, run) in runs.iter().enumerate() {
        if !is_mono_allelic(run, params.max_secondary_relative_peak_height) {
            continue;
        }
        let Some((main_i, main)) = run
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.height.total_cmp(&b.1.height))
        else {
            continue;
        };
        // Also rejects NaN heights.
        if main.height.partial_cmp(&0.0) != Some(std::cmp::Ordering::Greater) {
            continue;
        }
        mains.push(main.height);
        for (i, p) in run.iter().enumerate() {
            if i == main_i {
                continue;
            }
            pool.push(Candidate {
                distance: p.size - main.size,
                point: ArtifactPoint {
                    parent_size: main.size,
                    size: p.size,
                    relative_height: p.height / main.height,
                },
                in_bin: p.in_bin,
                run: run_index,
                main_height: main.height,
            });
        }
    }
    if pool.len() <= 1 {
        return Ok(ArtifactModel::default());
    }
    // Storage hands runs over in whatever order they were imported; RANSAC
    // samples by position, so the model must not depend on that order.
    pool.sort_by(|a, b| {
        a.distance
            .total_cmp(&b.distance)
            .then(a.point.parent_size.total_cmp(&b.point.parent_size))
            .then(a.point.size.total_cmp(&b.point.size))
            .then(a.point.relative_height.total_cmp(&b.point.relative_height))
            .then(a.in_bin.cmp(&b.in_bin))
    });
    let floor = detection_floor(&pool);

    let whole = [Segment {
        start_size: locus.min_base_length,
        end_size: locus.max_base_length,
        method: RegressionMethod::TheilSen,
        error: params.error_estimator,
    }];
    let distances: Vec<f64> = pool.iter().map(|c| c.distance).collect();
    let clusters = stats::mean_shift(
        &distances,
        &MeanShift {
            bandwidth: repeat / 2.0,
            seeding: Seeding::AllPoints,
            cluster_all: false,
        },
    )?;

    let fraction = if params.min_artifact_run_fraction.is_finite() {
        params.min_artifact_run_fraction.clamp(0.0, 1.0)
    } else {
        0.0
    };
    let min_points = u64::from(params.min_artifact_peak_frequency);
    let mut estimators = Vec::new();
    for cluster in clusters {
        if cluster.center == 0.0 {
            continue;
        }
        let radius = 2.0 * cluster.sd;
        // `d == center` keeps a zero-spread class from selecting nothing.
        let (taken, rest): (Vec<_>, Vec<_>) = pool.into_iter().partition(|c| {
            (c.distance - cluster.center).abs() < radius || c.distance == cluster.center
        });
        pool = rest;
        if taken.len() as u64 >= min_points && shows_in_enough_runs(&taken, &mains, floor, fraction)
        {
            let mut est = ArtifactEstimator {
                label: format!("{:.2}", cluster.center),
                artifact_distance: Some(cluster.center),
                artifact_distance_buffer: Some((3.0 * cluster.sd).max(0.5)),
                points: taken.into_iter().map(|c| c.point).collect(),
                equations: Vec::new(),
            };
            let (lo, hi) = est
                .points
                .iter()
                .fold((f64::INFINITY, f64::NEG_INFINITY), |(a, b), p| {
                    (a.min(p.parent_size), b.max(p.parent_size))
                });
            let flat = [Segment {
                method: RegressionMethod::NoSlope,
                ..whole[0]
            }];
            est.refit(if hi - lo < repeat { &flat } else { &whole }, params.seed)?;
            // A ratio cannot be negative: a line that crosses zero between
            // the parents it was fit on is a slope the points do not support.
            let negative = est
                .equations
                .iter()
                .any(|e| e.fit.predict(lo) < 0.0 || e.fit.predict(hi) < 0.0);
            if negative {
                est.refit(&flat, params.seed)?;
            }
            estimators.push(est);
        } else {
            pool.extend(taken);
        }
    }
    // Extraction takes 2 SD around a class center, annotation 3 SD (at least
    // 0.5 bp): a peak in between is already explained by its class when
    // annotating, and as global artifact it would be counted against every
    // peak of every run.
    pool.retain(|c| {
        !c.in_bin
            && !estimators.iter().any(|e: &ArtifactEstimator| {
                matches!(
                    (e.artifact_distance, e.artifact_distance_buffer),
                    (Some(center), Some(b)) if (c.distance - center).abs() < b
                )
            })
    });
    if pool.len() as u64 >= min_points.max(2) {
        let mut est = ArtifactEstimator {
            label: GLOBAL_LABEL.to_string(),
            artifact_distance: None,
            artifact_distance_buffer: None,
            points: pool.into_iter().map(|c| c.point).collect(),
            equations: Vec::new(),
        };
        // Flat, at the mean of its points with the MAD spread, whatever the
        // classes use. Background is a level: a line through a few scattered
        // leftovers (RANSAC's choice) extrapolated to tens of percent of the
        // main peak at the locus edges. And the leftovers' heavy tail
        // (sporadic products that come with tall peaks) is part of what a
        // peak must clear, so it raises the level instead of being fit away
        // as the densest half would.
        est.refit(
            &[Segment {
                method: RegressionMethod::NoSlope,
                error: ErrorEstimator::Mad,
                ..whole[0]
            }],
            params.seed,
        )?;
        estimators.push(est);
    }
    Ok(ArtifactModel { estimators })
}

/// Sets `artifact_contribution` and `artifact_error` (RFU) on every peak of one
/// run, summing over every estimator and every possible parent peak.
pub fn annotate_artifacts(peaks: &mut [Peak], model: &ArtifactModel) {
    let n = peaks.len();
    let mut contribution = vec![0.0; n];
    let mut error = vec![0.0; n];
    let tallest = (0..n).max_by(|&a, &b| peaks[a].height.total_cmp(&peaks[b].height));
    for est in &model.estimators {
        for (pi, parent) in peaks.iter().enumerate() {
            if est.is_global() && Some(pi) != tallest {
                continue;
            }
            let Some(fit) = est.equation_for(parent.size) else {
                continue;
            };
            let expected = fit.predict(parent.size).max(0.0) * parent.height;
            let sd = fit.sd.max(0.0) * parent.height;
            for (ti, target) in peaks.iter().enumerate() {
                if ti == pi {
                    continue;
                }
                let is_parent = match (est.artifact_distance, est.artifact_distance_buffer) {
                    (Some(d), Some(b)) => ((target.size - parent.size) - d).abs() < b,
                    _ => true,
                };
                if is_parent {
                    contribution[ti] += expected;
                    error[ti] += sd;
                }
            }
        }
    }
    for (p, (c, e)) in peaks.iter_mut().zip(contribution.into_iter().zip(error)) {
        p.artifact_contribution = c;
        p.artifact_error = e;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Color;
    use approx::assert_relative_eq;

    fn locus() -> LocusInfo {
        LocusInfo {
            label: "L1".into(),
            min_base_length: 80.0,
            max_base_length: 300.0,
            nucleotide_repeat_length: 3.0,
            color: Color::Blue,
        }
    }

    fn peak(size: f64, height: f64) -> Peak {
        Peak {
            size,
            height,
            ..Peak::default()
        }
    }

    fn with_relative(mut peaks: Vec<Peak>) -> Vec<Peak> {
        let max = peaks.iter().map(|p| p.height).fold(0.0, f64::max);
        for (i, p) in peaks.iter_mut().enumerate() {
            p.index = i;
            p.relative_height = p.height / max;
        }
        peaks
    }

    /// Mono-allelic runs: −3 bp stutter at 0.05 + 0.0004·size, +3 bp at 0.02,
    /// plus one off-distance low peak in every other run.
    fn mono_runs() -> Vec<Vec<Peak>> {
        (0..30)
            .map(|i| {
                let s = 100.0 + 5.0 * i as f64;
                let h = 5000.0;
                let jitter = 0.01 * ((i % 5) as f64 - 2.0);
                let mut v = vec![
                    peak(s, h),
                    peak(s - 3.0 + jitter, h * (0.05 + 0.0004 * s)),
                    peak(s + 3.0 - jitter, h * 0.02),
                ];
                if i % 2 == 0 {
                    v.push(peak(s + 7.3 + 0.7 * i as f64, h * 0.01));
                }
                with_relative(v)
            })
            .collect()
    }

    #[test]
    fn mono_allelic_selection() {
        let runs = mono_runs();
        assert!(is_mono_allelic(&runs[0], 0.4));
        let mixed = with_relative(vec![peak(100.0, 1000.0), peak(110.0, 600.0)]);
        assert!(!is_mono_allelic(&mixed, 0.4));
        assert!(is_mono_allelic(&mixed, 0.7));
        assert!(!is_mono_allelic(&[], 0.4));
    }

    #[test]
    fn estimates_distance_classes_and_global() {
        let mut runs = mono_runs();
        // A two-allele run must be ignored.
        runs.push(with_relative(vec![
            peak(150.0, 3000.0),
            peak(160.0, 2900.0),
        ]));
        let refs: Vec<&[Peak]> = runs.iter().map(|r| r.as_slice()).collect();
        let model = estimate_artifact_model(&refs, &locus(), &ArtifactParams::default()).unwrap();
        assert_eq!(model.estimators.len(), 3);

        let minus = model
            .estimators
            .iter()
            .find(|e| e.artifact_distance.is_some_and(|d| d < 0.0))
            .unwrap();
        assert_relative_eq!(minus.artifact_distance.unwrap(), -3.0, epsilon = 0.011);
        assert_eq!(minus.points.len(), 30);
        assert_eq!(minus.equations.len(), 1);
        let fit = minus.equations[0].fit;
        // Exact linear data: Theil–Sen recovers it.
        assert_relative_eq!(fit.slope, 0.0004, epsilon = 1e-12);
        assert_relative_eq!(fit.intercept, 0.05, epsilon = 1e-10);
        assert_eq!(minus.artifact_distance_buffer, Some(0.5));

        let plus = model
            .estimators
            .iter()
            .find(|e| e.artifact_distance.is_some_and(|d| d > 0.0))
            .unwrap();
        assert_relative_eq!(plus.equations[0].fit.intercept, 0.02, epsilon = 1e-12);

        // The scattered leftovers form the global class: flat, at their
        // mean, with the MAD spread whatever the classes use.
        let global = model.estimators.last().unwrap();
        assert!(global.is_global());
        assert_eq!(global.points.len(), 15);
        let eq = &global.equations[0];
        assert_eq!(eq.segment.method, RegressionMethod::NoSlope);
        assert_eq!(eq.segment.error, ErrorEstimator::Mad);
        assert_relative_eq!(eq.fit.intercept, 0.01, epsilon = 1e-12);

        // Fewer leftovers than a class needs make no global class.
        let few = estimate_artifact_model(
            &refs,
            &locus(),
            &ArtifactParams {
                min_artifact_peak_frequency: 16,
                ..ArtifactParams::default()
            },
        )
        .unwrap();
        assert!(few.estimators.iter().all(|e| !e.is_global()));
    }

    #[test]
    fn run_fraction_drops_rare_classes_and_one_parent_classes_fit_flat() {
        // 40 mono-allelic runs with −3 bp stutter; 12 of them also carry a
        // minor clone 12 bp up (below the mono-allelic cut-off), all from one
        // parent allele.
        let runs: Vec<Vec<Peak>> = (0..40)
            .map(|i| {
                let s = if i < 12 {
                    120.0
                } else {
                    100.0 + 2.0 * i as f64
                };
                let mut v = vec![peak(s, 5000.0), peak(s - 3.0, 400.0)];
                if i < 12 {
                    v.push(peak(s + 12.0 + 0.01 * i as f64, 800.0 + 10.0 * i as f64));
                }
                with_relative(v)
            })
            .collect();
        let refs: Vec<&[Peak]> = runs.iter().map(|r| r.as_slice()).collect();
        let loose = estimate_artifact_model(
            &refs,
            &locus(),
            &ArtifactParams {
                min_artifact_run_fraction: 0.0,
                ..ArtifactParams::default()
            },
        )
        .unwrap();
        let minor = loose
            .estimators
            .iter()
            .find(|e| e.artifact_distance.is_some_and(|d| d > 10.0))
            .expect("without the fraction rule the minor clone forms a class");
        assert_eq!(minor.equations[0].segment.method, RegressionMethod::NoSlope);
        assert_relative_eq!(minor.equations[0].fit.slope, 0.0);
        // The default asks for a majority of runs; the clone is in 12 of 40.
        let strict = estimate_artifact_model(&refs, &locus(), &ArtifactParams::default()).unwrap();
        assert!(strict
            .estimators
            .iter()
            .all(|e| e.artifact_distance.is_none_or(|d| d < 0.0)));
        assert!(strict
            .estimators
            .iter()
            .any(|e| e.artifact_distance.is_some_and(|d| (d + 3.0).abs() < 0.1)));
        // Unbinned, the dropped minor-clone peaks fall to the global class;
        // binned, they are kept out of it.
        assert_eq!(strict.estimators.last().unwrap().points.len(), 12);
        let binned: Vec<Vec<Peak>> = runs
            .iter()
            .map(|r| {
                r.iter()
                    .map(|p| Peak {
                        in_bin: p.relative_height > 0.15 && p.relative_height < 0.5,
                        ..p.clone()
                    })
                    .collect()
            })
            .collect();
        let refs: Vec<&[Peak]> = binned.iter().map(|r| r.as_slice()).collect();
        let strict = estimate_artifact_model(&refs, &locus(), &ArtifactParams::default()).unwrap();
        assert!(strict.estimators.iter().all(|e| !e.is_global()));
    }

    /// A by-product at 1% of its parent is seen only where the parent is
    /// tall; it shows in every such run and is kept although most runs are
    /// too short to show it. A minor clone at a fixed spacing shows in a
    /// minority of runs that could all have shown it, and is dropped.
    #[test]
    fn weak_artifacts_count_only_runs_tall_enough_to_show_them() {
        let runs: Vec<Vec<Peak>> = (0..40)
            .map(|i| {
                let s = 100.0 + 2.0 * i as f64;
                let main = if i < 15 { 20_000.0 } else { 2_000.0 };
                let mut v = vec![peak(s, main), peak(s - 3.0, 0.08 * main)];
                // Filtered at about 100 RFU upstream: only the tall runs keep it.
                if 0.01 * main >= 100.0 {
                    v.push(peak(s - 30.0, 0.01 * main));
                }
                if i % 10 < 3 {
                    v.push(peak(s + 12.0, 0.1 * main));
                }
                with_relative(v)
            })
            .collect();
        let refs: Vec<&[Peak]> = runs.iter().map(|r| r.as_slice()).collect();
        let model = estimate_artifact_model(&refs, &locus(), &ArtifactParams::default()).unwrap();
        let has = |d: f64| {
            model
                .estimators
                .iter()
                .any(|e| e.artifact_distance.is_some_and(|c| (c - d).abs() < 0.5))
        };
        assert!(has(-3.0));
        assert!(has(-30.0), "15 of 15 runs tall enough show the by-product");
        assert!(!has(12.0), "12 of 40 runs show the clone");
    }

    /// The model is a function of the runs, not of the order storage hands
    /// them over in (RANSAC and ties in clustering are order-sensitive).
    #[test]
    fn run_order_does_not_change_the_model() {
        let runs = mono_runs();
        let mut reversed = runs.clone();
        reversed.reverse();
        let a: Vec<&[Peak]> = runs.iter().map(|r| r.as_slice()).collect();
        let b: Vec<&[Peak]> = reversed.iter().map(|r| r.as_slice()).collect();
        let params = ArtifactParams::default();
        assert_eq!(
            estimate_artifact_model(&a, &locus(), &params).unwrap(),
            estimate_artifact_model(&b, &locus(), &params).unwrap()
        );
    }

    /// A line that would predict a negative ratio between its own parents is
    /// replaced by a flat one.
    #[test]
    fn lines_that_cross_zero_fall_back_to_flat() {
        // +3 bp class: high at small parents, near zero at large ones, so
        // Theil–Sen's line goes negative before the largest parent.
        let runs: Vec<Vec<Peak>> = (0..30)
            .map(|i| {
                let s = 100.0 + 3.0 * i as f64;
                let r = if i < 15 { 0.05 } else { 0.004 };
                with_relative(vec![peak(s, 10_000.0), peak(s + 3.0, 10_000.0 * r)])
            })
            .collect();
        let refs: Vec<&[Peak]> = runs.iter().map(|r| r.as_slice()).collect();
        let model = estimate_artifact_model(&refs, &locus(), &ArtifactParams::default()).unwrap();
        let eq = &model.estimators[0].equations[0];
        assert_eq!(eq.segment.method, RegressionMethod::NoSlope);
        assert!(eq.fit.intercept > 0.0);
    }

    #[test]
    fn mad_error_estimator_resists_minor_alleles_and_survives_refits() {
        // −3 bp stutter at 0.1 ± 0.005; a fifth of the runs hide a minor
        // allele at the stutter position (relative height 0.35).
        let runs: Vec<Vec<Peak>> = (0..40)
            .map(|i| {
                let s = 100.0 + 2.0 * i as f64;
                let noise = 0.005 * if i % 2 == 0 { 1.0 } else { -1.0 };
                let r = if i % 5 == 0 { 0.35 } else { 0.1 + noise };
                with_relative(vec![peak(s, 5000.0), peak(s - 3.0, 5000.0 * r)])
            })
            .collect();
        let refs: Vec<&[Peak]> = runs.iter().map(|r| r.as_slice()).collect();
        let class = |m: &ArtifactModel| {
            m.estimators
                .iter()
                .find(|e| e.artifact_distance.is_some())
                .unwrap()
                .clone()
        };
        let rms = class(
            &estimate_artifact_model(
                &refs,
                &locus(),
                &ArtifactParams {
                    error_estimator: ErrorEstimator::Rms,
                    ..ArtifactParams::default()
                },
            )
            .unwrap(),
        );
        let mut mad = class(
            &estimate_artifact_model(
                &refs,
                &locus(),
                &ArtifactParams {
                    error_estimator: ErrorEstimator::Mad,
                    ..ArtifactParams::default()
                },
            )
            .unwrap(),
        );
        assert!(
            rms.equations[0].fit.sd > 0.08,
            "{}",
            rms.equations[0].fit.sd
        );
        let sd = mad.equations[0].fit.sd;
        assert!(sd < 0.02, "{sd}");
        assert_eq!(mad.equations[0].segment.error, ErrorEstimator::Mad);
        // Same line either way.
        assert_relative_eq!(
            mad.equations[0].fit.intercept,
            rms.equations[0].fit.intercept
        );
        // Breakpoints and clearing keep the estimator.
        assert!(mad.add_breakpoint(150.0, 0).unwrap());
        assert!(mad
            .equations
            .iter()
            .all(|e| e.segment.error == ErrorEstimator::Mad));
        mad.clear_breakpoints(80.0, 300.0, RegressionMethod::TheilSen, 0)
            .unwrap();
        assert_relative_eq!(mad.equations[0].fit.sd, sd);
        // Non-robust methods keep RMS.
        assert!(mad
            .set_method(0, RegressionMethod::LeastSquares, 0)
            .unwrap());
        assert!(mad.equations[0].fit.sd > 0.08);
        // A segment stored without the field was fit with RMS.
        let json = r#"{"start_size":1,"end_size":2,"method":"theil_sen"}"#;
        let seg: Segment = serde_json::from_str(json).unwrap();
        assert_eq!(seg.error, ErrorEstimator::Rms);
        assert_eq!(
            serde_json::to_string(&seg).unwrap(),
            r#"{"start_size":1.0,"end_size":2.0,"method":"theil_sen","error":"rms"}"#
        );
        // Parameters stored without it take the default, the densest half.
        let p: ArtifactParams = serde_json::from_str("{}").unwrap();
        assert_eq!(p.error_estimator, ErrorEstimator::DensestHalf);
    }

    /// Minor alleles only ever add to a stutter position. With two in five
    /// runs carrying one (graded shares), the median residual moves up and
    /// Theil–Sen's line with it; the densest half stays on the stutter.
    #[test]
    fn densest_half_keeps_the_class_on_the_stutter() {
        let runs: Vec<Vec<Peak>> = (0..50)
            .map(|i| {
                let s = 100.0 + 2.0 * i as f64;
                let noise = 0.004 * ((i % 3) as f64 - 1.0);
                let r = if i % 5 < 2 {
                    0.1 + 0.02 * (1 + i % 7) as f64
                } else {
                    0.1 + noise
                };
                with_relative(vec![peak(s, 5000.0), peak(s - 3.0, 5000.0 * r)])
            })
            .collect();
        let refs: Vec<&[Peak]> = runs.iter().map(|r| r.as_slice()).collect();
        let fit = |error_estimator| {
            estimate_artifact_model(
                &refs,
                &locus(),
                &ArtifactParams {
                    error_estimator,
                    ..ArtifactParams::default()
                },
            )
            .unwrap()
            .estimators[0]
                .equations[0]
                .fit
        };
        let (mad, dh) = (fit(ErrorEstimator::Mad), fit(ErrorEstimator::DensestHalf));
        let mid = 150.0;
        assert!(
            mad.predict(mid) > dh.predict(mid) + 0.003,
            "{}",
            mad.predict(mid)
        );
        assert!((dh.predict(mid) - 0.1).abs() < 0.003, "{}", dh.predict(mid));
        assert!(dh.sd < 0.006 && dh.sd < mad.sd, "{} vs {}", dh.sd, mad.sd);
    }

    /// (a) Peaks are kept over the locus range inclusively, so a parent at
    /// exactly the locus minimum must have an equation.
    #[test]
    fn segments_cover_the_whole_locus_range() {
        let runs: Vec<Vec<Peak>> = (0..20)
            .map(|i| {
                let s = 80.0 + 3.0 * i as f64; // the first parent is at the minimum
                with_relative(vec![peak(s, 5000.0), peak(s - 3.0, 500.0)])
            })
            .collect();
        let refs: Vec<&[Peak]> = runs.iter().map(|r| r.as_slice()).collect();
        let model = estimate_artifact_model(&refs, &locus(), &ArtifactParams::default()).unwrap();
        let class = &model.estimators[0];
        assert_eq!(class.equations[0].n_points, 20);
        let mut peaks = vec![peak(77.0, 100.0), peak(80.0, 5000.0)];
        annotate_artifacts(&mut peaks, &model);
        assert_relative_eq!(peaks[0].artifact_contribution, 500.0, epsilon = 1e-9);
        // A breakpoint's own size belongs to the lower segment only.
        let mut est = class.clone();
        assert!(est.add_breakpoint(110.0, 0).unwrap());
        let n: u32 = est.equations.iter().map(|e| e.n_points).sum();
        assert_eq!(n, 20);
        assert_eq!(est.equations[0].n_points, 11); // 80, 83, ..., 110
    }

    /// (b) Reviewer's case: stutter at −3.00 bp in 45 runs and −3.15 bp in 5,
    /// all at 15% and out of bin. The −3.15 peaks fall outside the class's
    /// 2·SD extraction radius but inside its annotation buffer: the class
    /// already explains them, and they must not become a 15% global artifact.
    #[test]
    fn leftovers_inside_a_class_buffer_stay_out_of_the_global_class() {
        let runs: Vec<Vec<Peak>> = (0..50)
            .map(|i| {
                let s = 100.0 + 2.0 * i as f64;
                let d = if i % 10 == 0 { 3.15 } else { 3.0 };
                with_relative(vec![peak(s, 5000.0), peak(s - d, 750.0)])
            })
            .collect();
        let refs: Vec<&[Peak]> = runs.iter().map(|r| r.as_slice()).collect();
        let model = estimate_artifact_model(&refs, &locus(), &ArtifactParams::default()).unwrap();
        let class = &model.estimators[0];
        let (d, b) = (
            class.artifact_distance.unwrap(),
            class.artifact_distance_buffer.unwrap(),
        );
        assert!((-3.15 - d).abs() < b, "{d} ± {b}");
        assert!(
            model.estimators.iter().all(|e| !e.is_global()),
            "{:?}",
            model.estimators.last().map(|e| &e.equations)
        );
    }

    /// (c) A class fit flat (one parent allele) keeps the robust error.
    #[test]
    fn flat_classes_use_the_chosen_error_estimator() {
        let runs: Vec<Vec<Peak>> = (0..20)
            .map(|i| {
                let r = if i % 5 == 0 {
                    0.4
                } else {
                    0.1 + 0.002 * (i % 3) as f64
                };
                with_relative(vec![peak(150.0, 5000.0), peak(147.0, 5000.0 * r)])
            })
            .collect();
        let refs: Vec<&[Peak]> = runs.iter().map(|r| r.as_slice()).collect();
        let model = estimate_artifact_model(&refs, &locus(), &ArtifactParams::default()).unwrap();
        let eq = &model.estimators[0].equations[0];
        assert_eq!(eq.segment.method, RegressionMethod::NoSlope);
        let x = vec![150.0; 20];
        let y: Vec<f64> = runs.iter().map(|r| r[1].relative_height).collect();
        let mad = stats::robust_residual_scale(&x, &y, 0.0, eq.fit.intercept);
        assert_relative_eq!(eq.fit.sd, mad, epsilon = 1e-12);
        assert!(eq.fit.sd < 0.05, "{}", eq.fit.sd);
    }

    /// (d) The run fraction counts runs, not peaks: one run contributing
    /// several peaks to a class does not make the class common.
    #[test]
    fn run_fraction_counts_distinct_runs() {
        let runs: Vec<Vec<Peak>> = (0..10)
            .map(|i| {
                let s = 100.0 + 2.0 * i as f64;
                let mut v = vec![peak(s, 5000.0), peak(s - 3.0, 500.0)];
                if i < 2 {
                    // Two runs with a cluster of five noise maxima 12 bp up.
                    for k in 0..5 {
                        v.push(peak(s + 12.0 + 0.04 * k as f64, 200.0));
                    }
                }
                with_relative(v)
            })
            .collect();
        let refs: Vec<&[Peak]> = runs.iter().map(|r| r.as_slice()).collect();
        let params = ArtifactParams {
            min_artifact_peak_frequency: 2,
            min_artifact_run_fraction: 0.5,
            ..ArtifactParams::default()
        };
        let model = estimate_artifact_model(&refs, &locus(), &params).unwrap();
        assert!(
            model
                .estimators
                .iter()
                .all(|e| e.artifact_distance.is_none_or(|d| d < 0.0)),
            "{:?}",
            model
                .estimators
                .iter()
                .map(|e| &e.label)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn too_few_points_give_no_model() {
        let one = with_relative(vec![peak(100.0, 100.0), peak(97.0, 10.0)]);
        let model =
            estimate_artifact_model(&[one.as_slice()], &locus(), &ArtifactParams::default())
                .unwrap();
        assert!(model.estimators.is_empty());
    }

    #[test]
    fn breakpoints_and_method_changes_refit() {
        // Piecewise relation: flat 0.1 below 150 bp, 0.3 above.
        let points: Vec<ArtifactPoint> = (0..40)
            .map(|i| {
                let s = 101.0 + 5.0 * i as f64;
                ArtifactPoint {
                    parent_size: s,
                    size: s - 3.0,
                    relative_height: if s <= 150.0 { 0.1 } else { 0.3 },
                }
            })
            .collect();
        let mut est = ArtifactEstimator {
            label: "-3.00".into(),
            artifact_distance: Some(-3.0),
            artifact_distance_buffer: Some(0.5),
            points,
            equations: Vec::new(),
        };
        est.clear_breakpoints(80.0, 300.0, RegressionMethod::TheilSen, 0)
            .unwrap();
        assert_eq!(est.equations.len(), 1);
        assert!(est.add_breakpoint(150.0, 0).unwrap());
        assert_eq!(est.equations.len(), 2);
        assert_relative_eq!(est.equations[0].fit.intercept, 0.1, epsilon = 1e-12);
        assert_relative_eq!(est.equations[0].fit.slope, 0.0, epsilon = 1e-12);
        assert_relative_eq!(est.equations[1].fit.intercept, 0.3, epsilon = 1e-12);
        assert_eq!(est.equations[0].n_points, 10);
        assert!(!est.add_breakpoint(500.0, 0).unwrap());
        assert!(est.set_method(1, RegressionMethod::NoSlope, 0).unwrap());
        assert_eq!(est.equations[1].segment.method, RegressionMethod::NoSlope);
        assert_eq!(est.equations[0].segment.method, RegressionMethod::TheilSen);
        assert!(!est.set_method(5, RegressionMethod::NoSlope, 0).unwrap());
    }

    fn fixed_estimator(
        distance: Option<f64>,
        slope: f64,
        intercept: f64,
        sd: f64,
    ) -> ArtifactEstimator {
        ArtifactEstimator {
            label: "t".into(),
            artifact_distance: distance,
            artifact_distance_buffer: distance.map(|_| 0.5),
            points: Vec::new(),
            equations: vec![ArtifactEquation {
                segment: Segment {
                    start_size: 0.0,
                    end_size: 1000.0,
                    method: RegressionMethod::TheilSen,
                    error: ErrorEstimator::Mad,
                },
                fit: LinearFit {
                    slope,
                    intercept,
                    sd,
                    r_squared: 0.0,
                },
                n_points: 0,
            }],
        }
    }

    #[test]
    fn contributions_sum_over_every_parent() {
        // −3 bp: 0.0005·size + 0.05 (sd 0.01); −6 bp: flat 0.02 (sd 0.005).
        let model = ArtifactModel {
            estimators: vec![
                fixed_estimator(Some(-3.0), 0.0005, 0.05, 0.01),
                fixed_estimator(Some(-6.0), 0.0, 0.02, 0.005),
            ],
        };
        // Alleles at 106 (4000 RFU) and 103 (2000 RFU); a peak at 100 sits at
        // −1 repeat of 103 and −2 repeats of 106.
        let mut peaks = vec![peak(100.0, 300.0), peak(103.1, 2000.0), peak(106.0, 4000.0)];
        annotate_artifacts(&mut peaks, &model);
        let from_103 = (0.0005 * 103.1 + 0.05) * 2000.0;
        let from_106_m6 = 0.02 * 4000.0;
        assert_relative_eq!(
            peaks[0].artifact_contribution,
            from_103 + from_106_m6,
            epsilon = 1e-9
        );
        assert_relative_eq!(
            peaks[0].artifact_error,
            0.01 * 2000.0 + 0.005 * 4000.0,
            epsilon = 1e-9
        );
        // 103.1 is −2.9 from 106: inside the 0.5 buffer of the −3 class.
        assert_relative_eq!(
            peaks[1].artifact_contribution,
            (0.0005 * 106.0 + 0.05) * 4000.0,
            epsilon = 1e-9
        );
        assert_eq!(peaks[2].artifact_contribution, 0.0);
    }

    #[test]
    fn global_estimator_uses_tallest_peak_only_and_never_self() {
        let model = ArtifactModel {
            estimators: vec![
                fixed_estimator(None, 0.0, 0.01, 0.002),
                // A near-zero distance class must not make a peak its own parent.
                fixed_estimator(Some(0.2), 0.0, 0.5, 0.0),
            ],
        };
        let mut peaks = vec![peak(100.0, 1000.0), peak(120.0, 500.0), peak(140.0, 100.0)];
        annotate_artifacts(&mut peaks, &model);
        assert_relative_eq!(peaks[0].artifact_contribution, 0.0, epsilon = 1e-12);
        assert_relative_eq!(
            peaks[2].artifact_contribution,
            0.01 * 1000.0,
            epsilon = 1e-12
        );
        assert_relative_eq!(peaks[2].artifact_error, 0.002 * 1000.0, epsilon = 1e-12);
    }

    #[test]
    fn negative_predictions_clamp_and_annotation_resets() {
        let model = ArtifactModel {
            estimators: vec![fixed_estimator(Some(-3.0), 0.0, -0.1, 0.01)],
        };
        let mut peaks = vec![peak(97.0, 10.0), peak(100.0, 1000.0)];
        peaks[0].artifact_contribution = 99.0;
        annotate_artifacts(&mut peaks, &model);
        assert_eq!(peaks[0].artifact_contribution, 0.0);
        assert_relative_eq!(peaks[0].artifact_error, 10.0);
        annotate_artifacts(&mut peaks, &ArtifactModel::default());
        assert_eq!(peaks[0].artifact_error, 0.0);
    }
}
