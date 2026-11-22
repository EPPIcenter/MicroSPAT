//! Small numerical toolkit for the calling modules: one-dimensional mean-shift
//! clustering, four straight-line regressions, and the standard normal
//! survival function.
//!
//! Mean shift follows scikit-learn's `MeanShift` (flat kernel), which the
//! previous MicroSPAT used: every seed climbs to the mean of the points within
//! `bandwidth` until it moves less than `1e-3 * bandwidth` (or 300 steps);
//! converged centers are ranked by how many points they cover and
//! near-duplicates (within `bandwidth` of a better-supported center) are
//! dropped; each point joins its nearest center, or stays unassigned when it is
//! farther than `bandwidth` and `cluster_all` is false. A cluster is then
//! reported by the *median* and population standard deviation of its members,
//! not by the mode, exactly as the old code did. The 1-D case lets every
//! window query be a binary search over sorted points with prefix sums.
//!
//! Regressions all report slope, intercept, residual standard deviation (root
//! mean squared residual, no degrees-of-freedom correction) and R², matching
//! the scikit-learn metrics the old code used.

use rand::{RngExt, SeedableRng};
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Errors from the numerical routines.
#[derive(Debug, Error, Clone, PartialEq)]
pub enum StatsError {
    /// Paired inputs differ in length.
    #[error("x and y have different lengths ({0} vs {1})")]
    LengthMismatch(usize, usize),
    /// An input value is NaN or infinite.
    #[error("input contains a NaN or infinite value")]
    NonFinite,
    /// Mean-shift bandwidth is zero, negative or not finite.
    #[error("bandwidth must be positive and finite, got {0}")]
    InvalidBandwidth(f64),
}

fn check_finite(values: &[f64]) -> Result<(), StatsError> {
    if values.iter().all(|v| v.is_finite()) {
        Ok(())
    } else {
        Err(StatsError::NonFinite)
    }
}

// ---------------------------------------------------------------------------
// Descriptive helpers
// ---------------------------------------------------------------------------

/// Arithmetic mean; 0 for an empty slice.
pub fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.iter().sum::<f64>() / values.len() as f64
}

/// Population standard deviation (numpy's default `ddof=0`); 0 for an empty slice.
pub fn std_dev(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let m = mean(values);
    (values.iter().map(|v| (v - m).powi(2)).sum::<f64>() / values.len() as f64).sqrt()
}

/// Median (mean of the two middle values for even counts); `None` when empty.
pub fn median(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    let mut v = values.to_vec();
    v.sort_by(f64::total_cmp);
    let n = v.len();
    Some(if n % 2 == 1 {
        v[n / 2]
    } else {
        (v[n / 2 - 1] + v[n / 2]) / 2.0
    })
}

/// Standard normal survival function, `P(Z > z)`, accurate far into the tail.
pub fn normal_sf(z: f64) -> f64 {
    0.5 * libm::erfc(z / std::f64::consts::SQRT_2)
}

// ---------------------------------------------------------------------------
// Mean shift
// ---------------------------------------------------------------------------

/// Where mean-shift starts its hill climbs.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub enum Seeding {
    /// Every point is a seed. This is scikit-learn's default (`bin_seeding=False`)
    /// and what the old MicroSPAT actually ran: it passed `min_bin_freq` but never
    /// enabled bin seeding, so that value had no effect on clustering.
    AllPoints,
    /// Seeds are grid cells of width `bandwidth` holding at least
    /// `min_bin_freq` points (scikit-learn's `bin_seeding=True`).
    Binned {
        /// Minimum points in a cell for it to seed a climb.
        min_bin_freq: usize,
    },
}

/// Mean-shift settings.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct MeanShift {
    /// Flat-kernel radius, in the units of the data.
    pub bandwidth: f64,
    /// Where climbs start.
    pub seeding: Seeding,
    /// When false, points farther than `bandwidth` from every center are left out.
    pub cluster_all: bool,
}

/// One mean-shift cluster.
#[derive(Debug, Clone, PartialEq)]
pub struct Cluster {
    /// Median of the member values.
    pub center: f64,
    /// Population standard deviation of the member values.
    pub sd: f64,
    /// Indices into the input slice, ascending.
    pub members: Vec<usize>,
}

const MEAN_SHIFT_MAX_ITER: usize = 300;

/// Sorted points with prefix sums, so a window mean is two binary searches.
struct SortedPoints {
    sorted: Vec<f64>,
    offset: f64,
    prefix: Vec<f64>,
}

impl SortedPoints {
    fn new(points: &[f64]) -> Self {
        let mut sorted = points.to_vec();
        sorted.sort_by(f64::total_cmp);
        // Summing offsets from the minimum keeps prefix sums small and precise.
        let offset = sorted.first().copied().unwrap_or(0.0);
        let mut prefix = Vec::with_capacity(sorted.len() + 1);
        prefix.push(0.0);
        let mut acc = 0.0;
        for v in &sorted {
            acc += v - offset;
            prefix.push(acc);
        }
        SortedPoints {
            sorted,
            offset,
            prefix,
        }
    }

    /// Count and mean of points with `|x - center| <= radius`.
    fn window(&self, center: f64, radius: f64) -> (usize, f64) {
        let lo = self.sorted.partition_point(|&x| x < center - radius);
        let hi = self.sorted.partition_point(|&x| x <= center + radius);
        let n = hi.saturating_sub(lo);
        if n == 0 {
            return (0, center);
        }
        let mean = (self.prefix[hi] - self.prefix[lo]) / n as f64 + self.offset;
        (n, mean)
    }
}

fn bin_seeds(points: &[f64], bandwidth: f64, min_bin_freq: usize) -> Vec<f64> {
    use std::collections::BTreeMap;
    let mut counts: BTreeMap<i64, usize> = BTreeMap::new();
    for p in points {
        // numpy rounds half to even.
        *counts
            .entry((p / bandwidth).round_ties_even() as i64)
            .or_default() += 1;
    }
    let seeds: Vec<f64> = counts
        .into_iter()
        .filter(|&(_, c)| c >= min_bin_freq)
        .map(|(b, _)| b as f64 * bandwidth)
        .collect();
    if seeds.len() == points.len() {
        // scikit-learn falls back to the points themselves when binning saves nothing.
        return points.to_vec();
    }
    seeds
}

/// Clusters one-dimensional values by mean shift. Clusters come back in
/// scikit-learn's label order: most-supported center first (ties broken by the
/// larger center value). Empty input gives no clusters.
pub fn mean_shift(points: &[f64], params: &MeanShift) -> Result<Vec<Cluster>, StatsError> {
    let bw = params.bandwidth;
    if !(bw.is_finite() && bw > 0.0) {
        return Err(StatsError::InvalidBandwidth(bw));
    }
    check_finite(points)?;
    if points.is_empty() {
        return Ok(Vec::new());
    }
    let index = SortedPoints::new(points);

    let mut seeds = match params.seeding {
        Seeding::AllPoints => points.to_vec(),
        Seeding::Binned { min_bin_freq } => bin_seeds(points, bw, min_bin_freq),
    };
    // Identical seeds climb identically; scikit-learn's dict of centers collapses them anyway.
    seeds.sort_by(f64::total_cmp);
    seeds.dedup();

    let stop = 1e-3 * bw;
    // (center, intensity) after each climb; identical centers collapse as in a dict.
    let mut centers: Vec<(f64, usize)> = Vec::new();
    for &seed in &seeds {
        let mut m = seed;
        let mut within;
        let mut iterations = 0;
        loop {
            let (n, window_mean) = index.window(m, bw);
            // scikit-learn reports the count of the window the last step was taken from.
            within = n;
            if n == 0 {
                break;
            }
            let old = m;
            m = window_mean;
            if (m - old).abs() < stop || iterations == MEAN_SHIFT_MAX_ITER {
                break;
            }
            iterations += 1;
        }
        if within > 0 {
            centers.push((m, within));
        }
    }
    // Collapse exact duplicates (later seeds overwrite, like a Python dict).
    centers.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut collapsed: Vec<(f64, usize)> = Vec::with_capacity(centers.len());
    for c in centers {
        match collapsed.last_mut() {
            Some(last) if last.0 == c.0 => *last = c,
            _ => collapsed.push(c),
        }
    }
    // Rank by intensity then center, both descending.
    let mut ranked = collapsed;
    ranked.sort_by(|a, b| b.1.cmp(&a.1).then(b.0.total_cmp(&a.0)));

    // Suppress centers within `bw` of a better-ranked surviving center.
    let mut by_value: Vec<(f64, usize)> = ranked
        .iter()
        .enumerate()
        .map(|(rank, c)| (c.0, rank))
        .collect();
    by_value.sort_by(|a, b| a.0.total_cmp(&b.0));
    let values: Vec<f64> = by_value.iter().map(|v| v.0).collect();
    let mut unique = vec![true; ranked.len()];
    for rank in 0..ranked.len() {
        if !unique[rank] {
            continue;
        }
        let c = ranked[rank].0;
        let lo = values.partition_point(|&x| x < c - bw);
        let hi = values.partition_point(|&x| x <= c + bw);
        for &(v, other) in &by_value[lo..hi] {
            if (v - c).abs() <= bw {
                unique[other] = false;
            }
        }
        unique[rank] = true;
    }
    let cluster_centers: Vec<f64> = ranked
        .iter()
        .zip(&unique)
        .filter(|(_, &u)| u)
        .map(|(c, _)| c.0)
        .collect();

    // Nearest-center labelling; ties go to the better-ranked center.
    let mut members: Vec<Vec<usize>> = vec![Vec::new(); cluster_centers.len()];
    for (i, &p) in points.iter().enumerate() {
        let mut best: Option<(usize, f64)> = None;
        for (k, &c) in cluster_centers.iter().enumerate() {
            let d = (p - c).abs();
            if best.is_none_or(|(_, bd)| d < bd) {
                best = Some((k, d));
            }
        }
        if let Some((k, d)) = best {
            if params.cluster_all || d <= bw {
                members[k].push(i);
            }
        }
    }

    Ok(members
        .into_iter()
        .filter(|m| !m.is_empty())
        .map(|m| {
            let vals: Vec<f64> = m.iter().map(|&i| points[i]).collect();
            Cluster {
                center: median(&vals).unwrap_or(f64::NAN),
                sd: std_dev(&vals),
                members: m,
            }
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Straight-line regressions
// ---------------------------------------------------------------------------

/// How a straight line is fit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "snake_case")]
pub enum RegressionMethod {
    /// Ordinary least squares.
    LeastSquares,
    /// Theil–Sen: median pairwise slope, median residual intercept. Robust.
    #[default]
    TheilSen,
    /// RANSAC around least squares (needs a seed). Robust, erratic on little data.
    Ransac,
    /// Mean of `y`; slope fixed at 0.
    NoSlope,
}

/// How the error (`LinearFit::sd`) of a fitted line is estimated.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "snake_case")]
pub enum ErrorEstimator {
    /// Root mean squared residual of the points the fit used.
    Rms,
    /// 1.4826 × the median absolute residual over every point: the normal-
    /// consistent robust scale. A few large residuals (true minor alleles in
    /// runs that passed as mono-allelic) barely move it, where they inflate
    /// the RMS.
    Mad,
    /// Moves the line to the middle of the densest half of the residuals
    /// (the shortest interval holding half of them) and takes the spread
    /// from that half: half its width × 1.4826, the normal-consistent scale.
    /// Points that only ever lie above the true line (artifact positions
    /// that a minor allele can add to) neither raise the line nor widen the
    /// spread while they are fewer than half.
    #[default]
    DensestHalf,
}

/// Normal-consistency factor of the median absolute deviation.
pub const MAD_SCALE: f64 = 1.4826;

/// Center and half-width of the shortest interval holding `⌊n/2⌋ + 1` of the
/// values (the "shorth"); `None` when empty. Ties keep the lowest interval.
pub fn densest_half(values: &[f64]) -> Option<(f64, f64)> {
    let mut v: Vec<f64> = values.iter().copied().filter(|x| x.is_finite()).collect();
    if v.is_empty() {
        return None;
    }
    v.sort_by(f64::total_cmp);
    let h = v.len() / 2 + 1;
    let (lo, width) = (0..=v.len() - h).map(|i| (v[i], v[i + h - 1] - v[i])).fold(
        (v[0], f64::INFINITY),
        |best, c| if c.1 < best.1 { c } else { best },
    );
    Some((lo + width / 2.0, width / 2.0))
}

/// The line `slope · x + intercept` moved onto the densest half of its
/// residuals: the new intercept and the half's normal-consistent spread.
pub fn densest_half_line(x: &[f64], y: &[f64], slope: f64, intercept: f64) -> (f64, f64) {
    let r: Vec<f64> = x
        .iter()
        .zip(y)
        .map(|(xi, yi)| yi - (slope * xi + intercept))
        .collect();
    match densest_half(&r) {
        Some((center, half)) => (intercept + center, MAD_SCALE * half),
        None => (intercept, 0.0),
    }
}

/// `MAD_SCALE` × the median absolute residual of the points around a line.
pub fn robust_residual_scale(x: &[f64], y: &[f64], slope: f64, intercept: f64) -> f64 {
    let r: Vec<f64> = x
        .iter()
        .zip(y)
        .map(|(xi, yi)| (yi - (slope * xi + intercept)).abs())
        .collect();
    median(&r).map_or(0.0, |m| MAD_SCALE * m)
}

/// A fitted line `y = slope * x + intercept` and how well it fits.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct LinearFit {
    /// Change in y per unit x.
    pub slope: f64,
    /// Value at x = 0.
    pub intercept: f64,
    /// Residual scale: root mean squared residual unless another
    /// [`ErrorEstimator`] was chosen.
    pub sd: f64,
    /// Coefficient of determination (scikit-learn's `r2_score` convention).
    pub r_squared: f64,
}

impl LinearFit {
    /// Value of the line at `x`.
    pub fn predict(&self, x: f64) -> f64 {
        self.slope * x + self.intercept
    }
}

fn check_xy(x: &[f64], y: &[f64]) -> Result<(), StatsError> {
    if x.len() != y.len() {
        return Err(StatsError::LengthMismatch(x.len(), y.len()));
    }
    check_finite(x)?;
    check_finite(y)
}

/// RMSE and R² of a line over the given points. R² follows scikit-learn:
/// a constant `y` scores 1 if fit exactly, else 0.
fn goodness(x: &[f64], y: &[f64], slope: f64, intercept: f64) -> (f64, f64) {
    if y.is_empty() {
        return (0.0, 0.0);
    }
    let n = y.len() as f64;
    let ss_res: f64 = x
        .iter()
        .zip(y)
        .map(|(xi, yi)| (yi - (slope * xi + intercept)).powi(2))
        .sum();
    let my = mean(y);
    let ss_tot: f64 = y.iter().map(|yi| (yi - my).powi(2)).sum();
    let r2 = if ss_tot > 0.0 {
        1.0 - ss_res / ss_tot
    } else if ss_res == 0.0 {
        1.0
    } else {
        0.0
    };
    ((ss_res / n).sqrt(), r2)
}

/// R² of a line over the given points (scikit-learn's convention).
pub fn r_squared(x: &[f64], y: &[f64], slope: f64, intercept: f64) -> f64 {
    goodness(x, y, slope, intercept).1
}

fn finish(x: &[f64], y: &[f64], slope: f64, intercept: f64) -> LinearFit {
    let (sd, r_squared) = goodness(x, y, slope, intercept);
    LinearFit {
        slope,
        intercept,
        sd,
        r_squared,
    }
}

fn ols_coefficients(x: &[f64], y: &[f64]) -> (f64, f64) {
    let mx = mean(x);
    let my = mean(y);
    let sxx: f64 = x.iter().map(|v| (v - mx).powi(2)).sum();
    if sxx == 0.0 {
        // Minimum-norm solution, as numpy's lstsq gives: flat line through the mean.
        return (0.0, my);
    }
    let sxy: f64 = x.iter().zip(y).map(|(a, b)| (a - mx) * (b - my)).sum();
    let slope = sxy / sxx;
    (slope, my - slope * mx)
}

/// Ordinary least squares with intercept.
pub fn least_squares(x: &[f64], y: &[f64]) -> Result<LinearFit, StatsError> {
    check_xy(x, y)?;
    let (s, i) = ols_coefficients(x, y);
    Ok(finish(x, y, s, i))
}

/// Least squares through the origin (intercept fixed at 0).
pub fn least_squares_through_origin(x: &[f64], y: &[f64]) -> Result<LinearFit, StatsError> {
    check_xy(x, y)?;
    let sxx: f64 = x.iter().map(|v| v * v).sum();
    let slope = if sxx > 0.0 {
        x.iter().zip(y).map(|(a, b)| a * b).sum::<f64>() / sxx
    } else {
        0.0
    };
    Ok(finish(x, y, slope, 0.0))
}

/// Mean of `y` with zero slope; R² reported as 0 as the old code did.
pub fn no_slope(x: &[f64], y: &[f64]) -> Result<LinearFit, StatsError> {
    check_xy(x, y)?;
    Ok(LinearFit {
        slope: 0.0,
        intercept: mean(y),
        sd: std_dev(y),
        r_squared: 0.0,
    })
}

/// Theil–Sen (Sen's slope): slope is the median of all pairwise slopes between
/// points with distinct `x`, intercept the median of `y - slope * x`.
///
/// The k-th smallest pairwise slope is found without materializing the
/// O(n²) slopes: for a trial slope `t`, the number of pairs with slope `<= t`
/// is an inversion count of `y - t x` in x-order (O(n log n)), and `t` is
/// bisected over the ordered bit patterns of f64, so at most 64 rounds.
/// With fewer than two distinct `x` values the fit degrades to [`no_slope`]'s line.
pub fn theil_sen(x: &[f64], y: &[f64]) -> Result<LinearFit, StatsError> {
    check_xy(x, y)?;
    let n = x.len();
    if n < 2 {
        return Ok(finish(x, y, 0.0, mean(y)));
    }
    // Centering x leaves slopes unchanged and keeps t*x small.
    let mx = mean(x);
    let mut pts: Vec<(f64, f64)> = x.iter().map(|v| v - mx).zip(y.iter().copied()).collect();
    // Within equal x, descending y makes every same-x pair count as an
    // "inversion" for any t, so they can be subtracted exactly.
    pts.sort_by(|a, b| a.0.total_cmp(&b.0).then(b.1.total_cmp(&a.1)));
    let mut same_x_pairs: u64 = 0;
    let mut min_dx = f64::INFINITY;
    let mut run = 1u64;
    for w in pts.windows(2) {
        if w[1].0 == w[0].0 {
            run += 1;
        } else {
            same_x_pairs += run * (run - 1) / 2;
            run = 1;
            min_dx = min_dx.min(w[1].0 - w[0].0);
        }
    }
    same_x_pairs += run * (run - 1) / 2;
    let total_pairs = (n as u64) * (n as u64 - 1) / 2 - same_x_pairs;
    if total_pairs == 0 {
        return Ok(finish(x, y, 0.0, mean(y)));
    }
    let (ymin, ymax) = y
        .iter()
        .fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), &v| {
            (lo.min(v), hi.max(v))
        });
    let bound = ((ymax - ymin) / min_dx).max(1.0) * 2.0;

    let mut scratch = vec![0.0; n];
    let mut buf = vec![0.0; n];
    let mut count_le = |t: f64| -> u64 {
        for (s, p) in scratch.iter_mut().zip(&pts) {
            *s = p.1 - t * p.0;
        }
        count_non_increasing_pairs(&mut scratch, &mut buf) - same_x_pairs
    };
    // k-th smallest (0-based) slope = least t with count_le(t) >= k + 1.
    let mut kth = |k: u64| -> f64 {
        let mut lo = f64_key(-bound);
        let mut hi = f64_key(bound);
        while lo < hi {
            let mid = lo + (hi - lo) / 2;
            if count_le(key_f64(mid)) > k {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        key_f64(lo)
    };
    let slope = if total_pairs % 2 == 1 {
        kth(total_pairs / 2)
    } else {
        (kth(total_pairs / 2 - 1) + kth(total_pairs / 2)) / 2.0
    };
    let resid: Vec<f64> = x.iter().zip(y).map(|(a, b)| b - slope * a).collect();
    let intercept = median(&resid).unwrap_or(0.0);
    Ok(finish(x, y, slope, intercept))
}

/// Maps f64 to u64 preserving order (finite values only).
fn f64_key(v: f64) -> u64 {
    let b = v.to_bits();
    if b >> 63 == 0 {
        b | (1 << 63)
    } else {
        !b
    }
}

fn key_f64(k: u64) -> f64 {
    if k >> 63 == 1 {
        f64::from_bits(k & !(1 << 63))
    } else {
        f64::from_bits(!k)
    }
}

/// Counts pairs i < j with `v[j] <= v[i]` by merge sort; sorts `v`.
fn count_non_increasing_pairs(v: &mut [f64], buf: &mut [f64]) -> u64 {
    let n = v.len();
    if n < 2 {
        return 0;
    }
    let mid = n / 2;
    let (left, right) = v.split_at_mut(mid);
    let mut count = count_non_increasing_pairs(left, &mut buf[..mid])
        + count_non_increasing_pairs(right, &mut buf[mid..]);
    // For each right element, count left elements >= it.
    let (mut i, mut j, mut k) = (0, 0, 0);
    while i < left.len() && j < right.len() {
        if left[i] < right[j] {
            buf[k] = left[i];
            i += 1;
        } else {
            count += (left.len() - i) as u64;
            buf[k] = right[j];
            j += 1;
        }
        k += 1;
    }
    while i < left.len() {
        buf[k] = left[i];
        i += 1;
        k += 1;
    }
    while j < right.len() {
        buf[k] = right[j];
        j += 1;
        k += 1;
    }
    v.copy_from_slice(&buf[..n]);
    count
}

/// RANSAC around least squares, after scikit-learn's `RANSACRegressor`
/// defaults: two-point candidate lines, inlier threshold = median absolute
/// deviation of `y`, up to 100 trials with the 0.99-confidence early stop,
/// ties in inlier count broken by inlier R², final least-squares refit on the
/// inliers. As in the old code, `sd` and `r_squared` describe the inliers only.
/// Falls back to [`least_squares`] when no consensus set forms.
pub fn ransac(x: &[f64], y: &[f64], seed: u64) -> Result<LinearFit, StatsError> {
    check_xy(x, y)?;
    let n = x.len();
    if n < 2 {
        return Ok(finish(x, y, 0.0, mean(y)));
    }
    let med = median(y).unwrap_or(0.0);
    let abs_dev: Vec<f64> = y.iter().map(|v| (v - med).abs()).collect();
    let threshold = median(&abs_dev).unwrap_or(0.0);

    const MAX_TRIALS: usize = 100;
    const MIN_SAMPLES: usize = 2;
    const STOP_PROBABILITY: f64 = 0.99;
    let mut rng = ChaCha8Rng::seed_from_u64(seed);
    let mut best: Option<(usize, f64, Vec<usize>)> = None;
    let mut trial = 0;
    while trial < MAX_TRIALS {
        trial += 1;
        let a = rng.random_range(0..n);
        let mut b = rng.random_range(0..n - 1);
        if b >= a {
            b += 1;
        }
        let (s, i) = ols_coefficients(&[x[a], x[b]], &[y[a], y[b]]);
        let inliers: Vec<usize> = (0..n)
            .filter(|&k| (y[k] - (s * x[k] + i)).abs() <= threshold)
            .collect();
        let n_in = inliers.len();
        if n_in == 0 {
            continue;
        }
        let best_n = best.as_ref().map_or(0, |b| b.0);
        if n_in < best_n {
            continue;
        }
        let xi: Vec<f64> = inliers.iter().map(|&k| x[k]).collect();
        let yi: Vec<f64> = inliers.iter().map(|&k| y[k]).collect();
        let score = goodness(&xi, &yi, s, i).1;
        if let Some(b) = &best {
            if n_in == b.0 && score < b.1 {
                continue;
            }
        }
        best = Some((n_in, score, inliers));
        if trial as f64 >= dynamic_max_trials(n_in, n, MIN_SAMPLES, STOP_PROBABILITY) {
            break;
        }
    }
    match best {
        Some((_, _, inliers)) => {
            let xi: Vec<f64> = inliers.iter().map(|&k| x[k]).collect();
            let yi: Vec<f64> = inliers.iter().map(|&k| y[k]).collect();
            let (s, i) = ols_coefficients(&xi, &yi);
            Ok(finish(&xi, &yi, s, i))
        }
        None => least_squares(x, y),
    }
}

fn dynamic_max_trials(n_inliers: usize, n: usize, min_samples: usize, probability: f64) -> f64 {
    let eps = f64::EPSILON;
    let ratio = n_inliers as f64 / n as f64;
    let nom = (1.0 - probability).max(eps);
    let denom = (1.0 - ratio.powi(min_samples as i32)).max(eps);
    if nom == 1.0 {
        0.0
    } else if denom == 1.0 {
        f64::INFINITY
    } else {
        (nom.ln() / denom.ln()).ceil().abs()
    }
}

/// Fits a line by the chosen method. `seed` is used only by RANSAC.
pub fn fit_line(
    method: RegressionMethod,
    x: &[f64],
    y: &[f64],
    seed: u64,
) -> Result<LinearFit, StatsError> {
    match method {
        RegressionMethod::LeastSquares => least_squares(x, y),
        RegressionMethod::TheilSen => theil_sen(x, y),
        RegressionMethod::Ransac => ransac(x, y, seed),
        RegressionMethod::NoSlope => no_slope(x, y),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn densest_half_finds_the_shortest_half() {
        // Seven values at 1.0 ± 0.1 and five far above.
        let v = [0.9, 1.0, 1.1, 0.95, 1.05, 1.0, 1.0, 3.0, 4.0, 5.0, 6.0, 7.0];
        let (center, half) = densest_half(&v).unwrap();
        assert_relative_eq!(center, 1.0, epsilon = 1e-12);
        assert_relative_eq!(half, 0.1, epsilon = 1e-12);
        assert_eq!(densest_half(&[]), None);
        assert_eq!(densest_half(&[2.0]), Some((2.0, 0.0)));
        // The line moves onto the half, with the half's normal-consistent spread.
        let x = [1.0, 2.0, 3.0, 4.0, 5.0];
        let y = [0.1, 0.2, 0.3, 1.4, 2.5];
        let (intercept, sd) = densest_half_line(&x, &y, 0.1, 0.5);
        assert_relative_eq!(intercept, 0.0, epsilon = 1e-12);
        assert_relative_eq!(sd, 0.0, epsilon = 1e-12);
    }

    #[test]
    fn robust_scale_ignores_a_few_outliers() {
        let x: Vec<f64> = (0..20).map(f64::from).collect();
        let mut y: Vec<f64> = x
            .iter()
            .map(|v| 0.1 + 0.01 * v + if (*v as i32) % 2 == 0 { 0.01 } else { -0.01 })
            .collect();
        let clean = robust_residual_scale(&x, &y, 0.01, 0.1);
        assert_relative_eq!(clean, MAD_SCALE * 0.01, epsilon = 1e-12);
        y[3] += 0.5;
        y[11] += 0.8;
        let fit = theil_sen(&x, &y).unwrap();
        let robust = robust_residual_scale(&x, &y, fit.slope, fit.intercept);
        assert!(robust < 0.02, "{robust}");
        assert!(fit.sd > 0.1, "{}", fit.sd);
        assert_eq!(robust_residual_scale(&[], &[], 0.0, 0.0), 0.0);
    }

    fn ms(bandwidth: f64) -> MeanShift {
        MeanShift {
            bandwidth,
            seeding: Seeding::AllPoints,
            cluster_all: false,
        }
    }

    #[test]
    fn normal_sf_matches_scipy() {
        // scipy.stats.norm.sf
        assert_relative_eq!(normal_sf(0.0), 0.5, max_relative = 1e-15);
        assert_relative_eq!(normal_sf(1.0), 0.15865525393145707, max_relative = 1e-13);
        assert_relative_eq!(normal_sf(-2.0), 0.9772498680518208, max_relative = 1e-13);
        assert_relative_eq!(normal_sf(6.0), 9.865876450376944e-10, max_relative = 1e-12);
        assert_relative_eq!(normal_sf(20.0), 2.753624118606155e-89, max_relative = 1e-10);
    }

    #[test]
    fn median_and_std() {
        assert_eq!(median(&[3.0, 1.0, 2.0]), Some(2.0));
        assert_eq!(median(&[4.0, 1.0, 2.0, 3.0]), Some(2.5));
        assert_eq!(median(&[]), None);
        assert_relative_eq!(std_dev(&[1.0, 2.0, 3.0, 4.0]), 1.118033988749895);
    }

    #[test]
    fn mean_shift_matches_sklearn() {
        // sklearn 1.9 MeanShift(bandwidth=1.5, cluster_all=False): labels
        // [1 1 1 1 0 0 0 0 0 2]; old reporting = median / std of members.
        let pts = [
            100.1, 100.3, 99.9, 100.0, 103.2, 103.0, 102.9, 103.1, 103.4, 110.0,
        ];
        let c = mean_shift(&pts, &ms(1.5)).unwrap();
        assert_eq!(c.len(), 3);
        assert_eq!(c[0].members, vec![4, 5, 6, 7, 8]);
        assert_relative_eq!(c[0].center, 103.1, epsilon = 1e-12);
        assert_relative_eq!(c[0].sd, 0.17204650534085333, epsilon = 1e-12);
        assert_eq!(c[1].members, vec![0, 1, 2, 3]);
        assert_relative_eq!(c[1].center, 100.05, epsilon = 1e-12);
        assert_relative_eq!(c[1].sd, 0.1479019945774874, epsilon = 1e-12);
        assert_eq!(c[2].members, vec![9]);

        // Labels [0 0 0 0 0 1 1] in sklearn.
        let c = mean_shift(&[0.0, 0.0, 0.0, 0.0, 0.6, 1.55, 1.6], &ms(1.0)).unwrap();
        assert_eq!(c[0].members, vec![0, 1, 2, 3, 4]);
        assert_eq!(c[1].members, vec![5, 6]);
    }

    #[test]
    fn binned_seeding_leaves_orphans_unassigned() {
        // Only the cell at 0 reaches min_bin_freq, so the point at 3.0 has no
        // center within the bandwidth and stays out (sklearn label -1).
        let pts = [0.0, 0.1, -0.1, 0.0, 0.05, 3.0];
        let params = MeanShift {
            bandwidth: 1.0,
            seeding: Seeding::Binned { min_bin_freq: 2 },
            cluster_all: false,
        };
        let c = mean_shift(&pts, &params).unwrap();
        assert_eq!(c.len(), 1);
        assert_eq!(c[0].members, vec![0, 1, 2, 3, 4]);
        let all = mean_shift(
            &pts,
            &MeanShift {
                cluster_all: true,
                ..params
            },
        )
        .unwrap();
        assert_eq!(all[0].members.len(), 6);
    }

    #[test]
    fn mean_shift_sklearn_reference_random() {
        // numpy RandomState(7): blobs at 120 (n=40, sd .2), 123 (25, .25),
        // 126 (12, .2) plus 15 uniform points on [115, 131], rounded to 4 dp.
        // sklearn 1.9, bandwidth 1.5, cluster_all=False.
        let c = mean_shift(&REF_POINTS, &ms(1.5)).unwrap();
        let sizes: Vec<usize> = c.iter().map(|c| c.members.len()).collect();
        assert_eq!(sizes, vec![42, 27, 15, 3, 3, 2]);
        let centers = [
            119.97829999999999,
            122.9751,
            125.9435,
            127.8077,
            116.108,
            129.51825000000002,
        ];
        let sds = [
            0.252084304681324,
            0.34165509734502336,
            0.42681379109239803,
            0.10989207837187234,
            0.7200381486807186,
            0.5075499999999948,
        ];
        for ((cl, center), sd) in c.iter().zip(centers).zip(sds) {
            assert_relative_eq!(cl.center, center, epsilon = 1e-9);
            assert_relative_eq!(cl.sd, sd, epsilon = 1e-9);
        }
    }

    const REF_POINTS: [f64; 92] = [
        120.3381, 119.9068, 120.0066, 120.0815, 119.8422, 120.0004, 119.9998, 119.6491, 120.2035,
        120.1201, 119.8749, 119.9657, 120.1011, 119.9477, 119.9515, 119.7094, 120.1109, 120.0248,
        120.0549, 119.6947, 120.3301, 120.0309, 119.9226, 120.4058, 119.9909, 119.7099, 119.919,
        119.5423, 120.2099, 119.9167, 119.8515, 120.2145, 119.6698, 120.1071, 119.5871, 119.8676,
        119.7592, 120.2924, 120.3532, 119.9341, 123.2102, 122.955, 123.142, 122.8118, 122.5729,
        122.5492, 123.0958, 123.5619, 123.0674, 122.8688, 123.478, 123.0593, 123.0254, 123.0631,
        122.9669, 122.9226, 122.6413, 123.1254, 122.9763, 123.2983, 122.9078, 122.5234, 122.9751,
        123.4249, 122.9041, 125.822, 125.7613, 125.79, 125.94, 125.764, 126.2995, 125.9435,
        126.0217, 126.2876, 126.3007, 125.9575, 126.0664, 127.8077, 130.0258, 115.6505, 129.0107,
        119.425, 122.6122, 127.7482, 126.4759, 117.3544, 125.54, 116.108, 120.7131, 128.0053,
        121.8433, 124.5977,
    ];

    #[test]
    fn regressions_on_exact_line() {
        let x = [1.0, 2.0, 3.0, 4.0, 5.0];
        let y: Vec<f64> = x.iter().map(|v| 2.0 * v - 1.0).collect();
        for m in [
            RegressionMethod::LeastSquares,
            RegressionMethod::TheilSen,
            RegressionMethod::Ransac,
        ] {
            let f = fit_line(m, &x, &y, 1).unwrap();
            assert_relative_eq!(f.slope, 2.0, epsilon = 1e-12);
            assert_relative_eq!(f.intercept, -1.0, epsilon = 1e-12);
            assert_relative_eq!(f.r_squared, 1.0, epsilon = 1e-12);
            assert!(f.sd < 1e-12);
        }
        let f = no_slope(&x, &y).unwrap();
        assert_eq!(f.slope, 0.0);
        assert_relative_eq!(f.intercept, 5.0);
        assert_relative_eq!(f.sd, std_dev(&y));
    }

    #[test]
    fn least_squares_matches_sklearn() {
        // sklearn LinearRegression + mean_squared_error**.5 + r2_score
        let x = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        let y = [1.1, 1.9, 3.2, 3.8, 5.3, 5.9];
        let f = least_squares(&x, &y).unwrap();
        assert_relative_eq!(f.slope, 0.9942857142857142, epsilon = 1e-12);
        assert_relative_eq!(f.intercept, 0.05333333333333412, epsilon = 1e-12);
        assert_relative_eq!(f.sd, 0.179240018207386, epsilon = 1e-12);
        assert_relative_eq!(f.r_squared, 0.9889808362369338, epsilon = 1e-12);
        let o = least_squares_through_origin(&x, &y).unwrap();
        assert_relative_eq!(o.slope, 1.0065934065934063, epsilon = 1e-12);
    }

    #[test]
    fn theil_sen_matches_scipy_joint() {
        // scipy.stats.theilslopes(y, x, method='joint')
        let x = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 2.0];
        let y = [1.1, 1.9, 3.2, 3.8, 5.3, 5.9, 30.0, 2.5];
        let f = theil_sen(&x, &y).unwrap();
        assert_relative_eq!(f.slope, 1.05, epsilon = 1e-12);
        assert_relative_eq!(f.intercept, 0.05, epsilon = 1e-12);
    }

    #[test]
    fn theil_sen_matches_brute_force() {
        let mut rng = ChaCha8Rng::seed_from_u64(3);
        for n in [2usize, 3, 7, 20, 61] {
            let x: Vec<f64> = (0..n)
                .map(|_| (rng.random_range(0..40) as f64) * 0.5 + 100.0)
                .collect();
            let y: Vec<f64> = x
                .iter()
                .map(|v| 0.002 * v + rng.random_range(0.0..0.05))
                .collect();
            let mut slopes = Vec::new();
            for i in 0..n {
                for j in i + 1..n {
                    if x[i] != x[j] {
                        slopes.push((y[j] - y[i]) / (x[j] - x[i]));
                    }
                }
            }
            let f = theil_sen(&x, &y).unwrap();
            match median(&slopes) {
                Some(m) => assert_relative_eq!(f.slope, m, epsilon = 1e-12, max_relative = 1e-9),
                None => assert_eq!(f.slope, 0.0),
            }
        }
    }

    #[test]
    fn ransac_ignores_outliers_and_is_deterministic() {
        let x: Vec<f64> = (0..40).map(|i| 100.0 + i as f64).collect();
        let mut y: Vec<f64> = x.iter().map(|v| 0.001 * v + 0.05).collect();
        for i in [3, 11, 25, 33] {
            y[i] += 0.5;
        }
        let a = ransac(&x, &y, 42).unwrap();
        let b = ransac(&x, &y, 42).unwrap();
        assert_eq!(a, b);
        assert_relative_eq!(a.slope, 0.001, epsilon = 1e-9);
        assert_relative_eq!(a.intercept, 0.05, epsilon = 1e-7);
        let ls = least_squares(&x, &y).unwrap();
        assert!(ls.sd > 0.1);
    }

    #[test]
    fn bad_inputs_are_errors_not_panics() {
        assert!(matches!(
            least_squares(&[1.0], &[1.0, 2.0]),
            Err(StatsError::LengthMismatch(1, 2))
        ));
        assert_eq!(theil_sen(&[f64::NAN], &[1.0]), Err(StatsError::NonFinite));
        assert!(mean_shift(&[1.0], &ms(0.0)).is_err());
        assert!(mean_shift(&[], &ms(1.0)).unwrap().is_empty());
        let f = theil_sen(&[1.0], &[2.0]).unwrap();
        assert_eq!((f.slope, f.intercept), (0.0, 2.0));
    }
}
