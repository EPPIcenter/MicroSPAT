//! Signal primitives for peak scanning and measurement: Savitzky–Golay
//! smoothing, white top-hat baseline correction, relative-maxima detection,
//! and the baseline that peak heights are measured from.
//!
//! The first three keep the meaning of the scipy calls the old implementation
//! used, so the old default parameters still mean the same thing:
//!
//! - [`savgol_filter`] = `scipy.signal.savgol_filter(x, window, order)` with the
//!   default `mode="interp"`: interior points are a least-squares polynomial
//!   convolution; the first and last `window / 2` points are evaluated on the
//!   polynomial fitted to the first (last) `window` samples.
//! - [`white_tophat`] = `scipy.ndimage.white_tophat(x, footprint=ones(size))`
//!   with the default `mode="reflect"`: `x - opening(x)`, where the opening is
//!   the maximum over every length-`size` window covering a point of that
//!   window's minimum. Both passes use a monotone deque, so the cost is O(n)
//!   regardless of `size`.
//! - [`argrelmax`] = `scipy.signal.argrelmax(x, order=order)` (mode `"clip"`)
//!   on signals without ties: greater than every neighbor within `order`
//!   points; the endpoints never qualify. Unlike scipy, a run of equal values
//!   counts as one point and yields its center, and a tie with an equal
//!   maximum within `order` points to the left does not disqualify. A clipped
//!   (saturated) peak smooths to an exactly flat top, which scipy's strict
//!   comparison never reports.
//!
//! [`baseline`] estimates the baseline under every point from the
//! [`BASELINE_SMOOTH`]-point moving averages centered on every
//! [`BASELINE_STRIDE`]th point within [`BASELINE_REACH`] points: the
//! averages are detrended by the slope between the two sides when that
//! gathers them closer, and the baseline is the midpoint of the shortest
//! interval that holds a third of them, the level the trace spends most of
//! its time at. It is computed at every [`BASELINE_KNOT`]th point and
//! interpolated linearly.
//!
//! Raw 3730 traces need both kinds of robustness. Peaks of the same dye
//! (stutter clusters, saturated peaks) push values up, and spectral
//! over-subtraction pushes them down: a tall peak in one dye leaves a dip
//! of up to about 5% of its height, as wide as the peak, at the same data
//! point in other dyes, so on some instruments every ladder peak leaves a dip
//! in the yellow and blue traces. A minimum or a low quantile anchors in those
//! dips and inflates every nearby height; the densest third is unmoved by
//! peaks or dips that together cover up to about two thirds of the window.
//! On real traces the corrected signal in quiet stretches centers within
//! 2 RFU of zero, also within 300 points of dips and of peaks over
//! 5,000 RFU. The estimate is exact on a constant or linear baseline,
//! unbiased on symmetric noise, and follows a 50 RFU wave with a period of
//! 6,000 points within 1.5 RFU.

use std::collections::VecDeque;

/// Errors from signal primitives.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum SignalError {
    #[error("smoothing window must be odd and at least 1 (got {0})")]
    EvenWindow(usize),
    #[error("polynomial order {order} must be less than the window length {window}")]
    OrderTooHigh { order: usize, window: usize },
    #[error("signal of length {len} is shorter than the smoothing window {window}")]
    TooShort { len: usize, window: usize },
}

/// Savitzky–Golay smoothing (scipy `savgol_filter`, `mode="interp"`).
pub fn savgol_filter(x: &[f64], window: usize, order: usize) -> Result<Vec<f64>, SignalError> {
    if window == 0 || window.is_multiple_of(2) {
        return Err(SignalError::EvenWindow(window));
    }
    if order >= window {
        return Err(SignalError::OrderTooHigh { order, window });
    }
    if x.len() < window {
        return Err(SignalError::TooShort {
            len: x.len(),
            window,
        });
    }
    let half = window / 2;
    // weights[t][k]: weight of sample k (0..window) when evaluating the fitted
    // polynomial at offset t (0..window) inside the window.
    let weights = savgol_weights(window, order);
    let n = x.len();
    let mut out = vec![0.0; n];
    let center = &weights[half];
    for i in half..n - half {
        let seg = &x[i - half..=i + half];
        out[i] = seg.iter().zip(center).map(|(a, w)| a * w).sum();
    }
    let head = &x[..window];
    let tail = &x[n - window..];
    for t in 0..half {
        out[t] = head.iter().zip(&weights[t]).map(|(a, w)| a * w).sum();
        let tt = window - half + t;
        out[n - half + t] = tail.iter().zip(&weights[tt]).map(|(a, w)| a * w).sum();
    }
    Ok(out)
}

/// Least-squares polynomial evaluation weights for every position in the window.
///
/// The abscissa is scaled to [-1, 1] so the normal equations stay well
/// conditioned at high orders (order 7 on window 11 is the old default).
fn savgol_weights(window: usize, order: usize) -> Vec<Vec<f64>> {
    let half = (window / 2) as f64;
    let scale = if half > 0.0 { half } else { 1.0 };
    let xs: Vec<f64> = (0..window).map(|k| (k as f64 - half) / scale).collect();
    let m = order + 1;
    // Vandermonde A (window × m) and normal matrix AᵀA (m × m).
    let a: Vec<Vec<f64>> = xs
        .iter()
        .map(|&x| (0..m).map(|j| x.powi(j as i32)).collect())
        .collect();
    let mut ata = vec![vec![0.0; m]; m];
    for row in &a {
        for i in 0..m {
            for j in 0..m {
                ata[i][j] += row[i] * row[j];
            }
        }
    }
    // Solve AᵀA · C = Aᵀ for C (m × window); weights at t are e(t)ᵀ C.
    let rhs: Vec<Vec<f64>> = (0..m).map(|i| a.iter().map(|r| r[i]).collect()).collect();
    let c = solve_dense(ata, rhs);
    xs.iter()
        .map(|&t| {
            (0..window)
                .map(|k| (0..m).map(|j| t.powi(j as i32) * c[j][k]).sum())
                .collect()
        })
        .collect()
}

/// Gaussian elimination with partial pivoting for a small dense system with
/// several right-hand sides (stored row-major as `b[row][rhs]`).
fn solve_dense(mut a: Vec<Vec<f64>>, mut b: Vec<Vec<f64>>) -> Vec<Vec<f64>> {
    let m = a.len();
    for col in 0..m {
        let pivot = (col..m)
            .max_by(|&i, &j| a[i][col].abs().total_cmp(&a[j][col].abs()))
            .unwrap_or(col);
        a.swap(col, pivot);
        b.swap(col, pivot);
        let p = a[col][col];
        if p == 0.0 {
            continue;
        }
        let (top, rest) = a.split_at_mut(col + 1);
        let (btop, brest) = b.split_at_mut(col + 1);
        let (pivot_row, pivot_rhs) = (&top[col], &btop[col]);
        for (row, rhs) in rest.iter_mut().zip(brest.iter_mut()) {
            let f = row[col] / p;
            if f == 0.0 {
                continue;
            }
            for (v, pv) in row[col..].iter_mut().zip(&pivot_row[col..]) {
                *v -= f * pv;
            }
            for (v, pv) in rhs.iter_mut().zip(pivot_rhs) {
                *v -= f * pv;
            }
        }
    }
    for col in (0..m).rev() {
        let p = a[col][col];
        for k in 0..b[col].len() {
            let mut v = b[col][k];
            for j in col + 1..m {
                v -= a[col][j] * b[j][k];
            }
            b[col][k] = if p == 0.0 { 0.0 } else { v / p };
        }
    }
    b
}

/// Footprint size the old code derived from `tophat_factor`: `round(n * factor)`, at least 1.
pub fn tophat_size(len: usize, factor: f64) -> usize {
    let s = (len as f64 * factor).round();
    if s.is_finite() && s >= 1.0 {
        s as usize
    } else {
        1
    }
}

/// White top-hat (signal minus its morphological opening) with a flat footprint of `size` points.
pub fn white_tophat(x: &[f64], size: usize) -> Vec<f64> {
    let n = x.len();
    if n == 0 || size <= 1 {
        return vec![0.0; n];
    }
    // scipy places a flat footprint of size w at offsets [-w/2, w - 1 - w/2]
    // for erosion and the mirrored offsets for dilation, which makes
    // dilation∘erosion an exact opening.
    let lo = size / 2;
    let hi = size - 1 - lo;
    let erosion = sliding(x, lo, hi, |a, b| a <= b);
    let dilation = sliding(&erosion, hi, lo, |a, b| a >= b);
    x.iter().zip(&dilation).map(|(a, o)| a - o).collect()
}

/// Sliding extremum over `[i - before, i + after]` with scipy "reflect" boundaries.
/// `keep(a, b)` is true when `a` dominates `b` (≤ for min, ≥ for max).
fn sliding(x: &[f64], before: usize, after: usize, keep: impl Fn(f64, f64) -> bool) -> Vec<f64> {
    let n = x.len() as isize;
    let at = |i: isize| x[reflect(i, n)];
    let mut out = Vec::with_capacity(x.len());
    let mut dq: VecDeque<(isize, f64)> = VecDeque::new();
    let first = -(before as isize);
    let mut next = first;
    for i in 0..n {
        let right = i + after as isize;
        while next <= right {
            let v = at(next);
            while let Some(&(_, b)) = dq.back() {
                if keep(v, b) {
                    dq.pop_back();
                } else {
                    break;
                }
            }
            dq.push_back((next, v));
            next += 1;
        }
        let left = i - before as isize;
        while let Some(&(j, _)) = dq.front() {
            if j < left {
                dq.pop_front();
            } else {
                break;
            }
        }
        out.push(dq.front().map_or(0.0, |&(_, v)| v));
    }
    out
}

/// scipy "reflect" (half-sample symmetric) index mapping: `d c b a | a b c d | d c b a`.
fn reflect(i: isize, n: isize) -> usize {
    let period = 2 * n;
    let mut k = i.rem_euclid(period);
    if k >= n {
        k = period - 1 - k;
    }
    k as usize
}

/// Relative maxima (scipy `argrelmax`, with plateaus; see the module docs).
///
/// A run of equal values `[a, b]` that touches neither end qualifies when
/// every value within `order` points left of `a` is at most its value and
/// every value within `order` points right of `b` is below it; it yields
/// `(a + b) / 2`. Indices beyond the ends are clipped, as in scipy.
pub fn argrelmax(x: &[f64], order: usize) -> Vec<usize> {
    let n = x.len();
    let order = order.max(1);
    let mut out = Vec::new();
    if n < 3 {
        return out;
    }
    let mut a = 0;
    while a < n {
        let v = x[a];
        let mut b = a;
        while b + 1 < n && x[b + 1] == v {
            b += 1;
        }
        let interior = a > 0 && b < n - 1;
        if interior && (1..=order).all(|k| x[a.saturating_sub(k)] <= v && x[(b + k).min(n - 1)] < v)
        {
            out.push((a + b) / 2);
        }
        a = b + 1;
    }
    out
}

/// Half-width of the moving averages the baseline is estimated from (15
/// points, about three peak widths at half height).
pub const BASELINE_SMOOTH_HALF: usize = 7;
/// Points of each moving average, `2 · BASELINE_SMOOTH_HALF + 1`.
pub const BASELINE_SMOOTH: usize = 2 * BASELINE_SMOOTH_HALF + 1;
/// Points on each side of a knot whose moving averages it is estimated
/// from: about 28 bp at the 10–11 points per bp of a 3730 run, wider than a
/// saturated peak or a cluster of stutter peaks.
pub const BASELINE_REACH: usize = 300;
/// Moving averages are centered on every this-many-th data point.
pub const BASELINE_STRIDE: usize = 10;
/// The baseline is estimated at every this-many-th data point (and the last
/// one) and interpolated linearly between; it changes by a few RFU per 100
/// points at most, so the interpolation costs nothing measurable.
pub const BASELINE_KNOT: usize = 50;
/// The level is the center of the densest `1 / BASELINE_DENSE_DIVISOR` of
/// the window's moving averages.
pub const BASELINE_DENSE_DIVISOR: usize = 3;

/// Baseline under points `lo..=hi` of a raw trace (see the module docs).
///
/// Each knot's value depends only on the trace within
/// `BASELINE_REACH + BASELINE_SMOOTH_HALF` points of it, and a point's value
/// only on the knots on either side, so a sub-range gives exactly the values
/// the whole trace would. Points beyond the last full moving average take
/// the nearest knot's value. A trace too short for one moving average gets a
/// zero baseline. `hi` is clipped to the trace; an empty range gives an
/// empty vector.
pub fn baseline(trace: &[i16], lo: usize, hi: usize) -> Vec<f64> {
    let n = trace.len();
    let hi = hi.min(n.saturating_sub(1));
    if n == 0 || lo > hi {
        return Vec::new();
    }
    let h = BASELINE_SMOOTH_HALF;
    let first = h.div_ceil(BASELINE_STRIDE) * BASELINE_STRIDE;
    if n < first + h + 1 {
        return vec![0.0; hi - lo + 1];
    }
    let last = (n - 1 - h) / BASELINE_STRIDE * BASELINE_STRIDE;
    // Knots bracketing the range: multiples of BASELINE_KNOT, and the last point.
    let k_lo = lo / BASELINE_KNOT * BASELINE_KNOT;
    let k_hi = hi.div_ceil(BASELINE_KNOT) * BASELINE_KNOT;
    let mut knots: Vec<usize> = (k_lo..=k_hi.min(n - 1)).step_by(BASELINE_KNOT).collect();
    if k_hi >= n - 1 && knots.last() != Some(&(n - 1)) {
        knots.push(n - 1);
    }
    // Moving-average sums on the stride grid that the knots can reach.
    // Integer sums keep every value independent of the range asked for.
    let g_lo = first.max(
        knots[0]
            .saturating_sub(BASELINE_REACH)
            .div_ceil(BASELINE_STRIDE)
            * BASELINE_STRIDE,
    );
    let g_hi = last.min(knots[knots.len() - 1] + BASELINE_REACH);
    let mut centers: Vec<usize> = Vec::new();
    let mut sums: Vec<i64> = Vec::new();
    if g_lo <= g_hi {
        let mut acc: i64 = trace[g_lo - h..g_lo + h]
            .iter()
            .map(|&v| i64::from(v))
            .sum();
        let mut c = g_lo;
        acc += i64::from(trace[c + h]);
        loop {
            centers.push(c);
            sums.push(acc);
            if c + BASELINE_STRIDE > g_hi {
                break;
            }
            for j in c..c + BASELINE_STRIDE {
                acc += i64::from(trace[j + h + 1]) - i64::from(trace[j - h]);
            }
            c += BASELINE_STRIDE;
        }
    }
    let mut scratch = Scratch::default();
    let values: Vec<f64> = knots
        .iter()
        .map(|&k| knot_level(&centers, &sums, k, &mut scratch) / BASELINE_SMOOTH as f64)
        .collect();
    let mut out = Vec::with_capacity(hi - lo + 1);
    let mut seg = 0;
    for i in lo..=hi {
        while seg + 1 < knots.len() && knots[seg + 1] < i {
            seg += 1;
        }
        let (a, va) = (knots[seg], values[seg]);
        out.push(match knots.get(seg + 1) {
            Some(&b) if i > a => va + (values[seg + 1] - va) * ((i - a) as f64 / (b - a) as f64),
            _ => va,
        });
    }
    out
}

/// Buffers reused across knots.
#[derive(Default)]
struct Scratch {
    side: Vec<i64>,
    residuals: Vec<i64>,
}

/// Residuals are kept as integers in units of 1/16 of a moving-average sum
/// (1/240 RFU): sorting integers is several times faster than floats, and
/// the rounding is far below the noise.
const RESIDUAL_SCALE: f64 = 16.0;

/// Level (as a moving-average sum) at knot `k` from the sums centered within
/// `BASELINE_REACH` of it: the sums are detrended by a slope, and the level
/// is the midpoint of the shortest interval holding a third of the
/// detrended sums.
///
/// The slope is the one between the medians of the two sides, which is
/// exact on a linear drift, corrected by the difference between the densest
/// thirds of the two sides' residuals under it, which a side half covered by
/// a stutter cluster does not tilt. It is kept only if its densest third is
/// narrower than without detrending: the right detrending gathers the
/// baseline's values closest together, and a slope thrown off by a cluster
/// covering most of one side spreads them. The densest third is where the trace
/// spends most of its time: real 3730 traces dip below their baseline beside
/// tall peaks of other dyes (spectral over-subtraction, at every ladder peak
/// on some instruments), so the low tail is as contaminated as the high one
/// and a low quantile lands in the dips.
fn knot_level(centers: &[usize], sums: &[i64], k: usize, s: &mut Scratch) -> f64 {
    let a = centers.partition_point(|&c| c + BASELINE_REACH < k);
    let b = centers.partition_point(|&c| c <= k + BASELINE_REACH);
    if a >= b {
        return 0.0;
    }
    let (cs, vs) = (&centers[a..b], &sums[a..b]);
    let split = cs.partition_point(|&c| c < k);
    let right = cs.partition_point(|&c| c <= k);
    let residual = |j: usize, slope: f64| residual_key(vs[j], slope, cs[j], k);
    let mut level = |slope: f64| {
        s.residuals.clear();
        s.residuals
            .extend((0..cs.len()).map(|j| residual(j, slope)));
        densest_third(&mut s.residuals)
    };
    let mut best = level(0.0);
    if split > 0 && right < cs.len() {
        let pos = |r: std::ops::Range<usize>| {
            let len = r.len() as f64;
            cs[r].iter().sum::<usize>() as f64 / len
        };
        let span = RESIDUAL_SCALE * (pos(right..cs.len()) - pos(0..split));
        let mut side = |r: std::ops::Range<usize>, slope: f64, dense: bool| {
            s.side.clear();
            s.side.extend(r.map(|j| residual(j, slope)));
            if dense {
                densest_third(&mut s.side).0
            } else {
                median_of(&mut s.side)
            }
        };
        let first = (side(right..cs.len(), 0.0, false) - side(0..split, 0.0, false)) / span;
        let second =
            first + (side(right..cs.len(), first, true) - side(0..split, first, true)) / span;
        let candidate = level(second);
        if candidate.1 < best.1 {
            best = candidate;
        }
    }
    best.0 / RESIDUAL_SCALE
}

/// A sum detrended by `slope` (sum units per point) about knot `k`, in
/// units of 1/[`RESIDUAL_SCALE`].
fn residual_key(sum: i64, slope: f64, center: usize, k: usize) -> i64 {
    let trend = (RESIDUAL_SCALE * slope * (center as f64 - k as f64)).round() as i64;
    sum * RESIDUAL_SCALE as i64 - trend
}

/// Midpoint of the shortest interval holding a third of the values (the
/// first such interval on ties), with the interval's width; sorts `v`, which
/// must not be empty.
fn densest_third(v: &mut [i64]) -> (f64, i64) {
    v.sort_unstable();
    let m = v.len();
    let take = m.div_ceil(BASELINE_DENSE_DIVISOR);
    let mut best = 0;
    for i in 1..=m - take {
        if v[i + take - 1] - v[i] < v[best + take - 1] - v[best] {
            best = i;
        }
    }
    (
        0.5 * (v[best] + v[best + take - 1]) as f64,
        v[best + take - 1] - v[best],
    )
}

/// Median (the mean of the two middle values for an even count); reorders `v`.
fn median_of(v: &mut [i64]) -> f64 {
    let m = v.len();
    let (lower, mid, _) = v.select_nth_unstable(m / 2);
    let mid = *mid as f64;
    if m % 2 == 1 {
        mid
    } else {
        0.5 * (lower.iter().copied().max().unwrap_or(0) as f64 + mid)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_abs_diff_eq;

    /// Reference input shared by the scipy-derived expectations below.
    fn reference_signal() -> Vec<f64> {
        (0..40)
            .map(|i| {
                let i = i as f64;
                (i * 0.7).sin() * 50.0 + i * 3.0 + if i as usize % 7 == 3 { 40.0 } else { 0.0 }
            })
            .collect()
    }

    #[test]
    fn savgol_matches_scipy() {
        let x = reference_signal();
        let y = savgol_filter(&x, 11, 7).unwrap();
        // uv run --with scipy python: savgol_filter(x, 11, 7)
        let expected = [
            (0, 0.693_397_073_188_487_3),
            (3, 73.065_911_906_017_96),
            (10, 81.816_792_949_287_66),
            (20, 107.006_108_776_677_73),
            (36, 109.468_947_959_885_51),
            (39, 158.200_827_918_766_46),
        ];
        for (i, e) in expected {
            assert_abs_diff_eq!(y[i], e, epsilon = 1e-6);
        }
    }

    #[test]
    fn savgol_preserves_polynomials() {
        let x: Vec<f64> = (0..30)
            .map(|i| (i as f64).powi(3) * 0.01 - i as f64)
            .collect();
        let y = savgol_filter(&x, 7, 3).unwrap();
        for (a, b) in x.iter().zip(&y) {
            assert_abs_diff_eq!(a, b, epsilon = 1e-8);
        }
    }

    #[test]
    fn savgol_rejects_bad_parameters() {
        let x = vec![0.0; 20];
        assert!(savgol_filter(&x, 10, 3).is_err());
        assert!(savgol_filter(&x, 5, 5).is_err());
        assert!(savgol_filter(&x[..4], 5, 2).is_err());
    }

    #[test]
    fn tophat_matches_scipy() {
        let x = reference_signal();
        // uv run --with scipy python: ndimage.white_tophat(x, None, np.ones(w))
        let odd = white_tophat(&x, 5);
        let even = white_tophat(&x, 6);
        let exp_odd = [
            (0, 0.0),
            (3, 92.160_468_332_443_7),
            (12, 50.889_250_380_196_6),
            (25, 0.0),
            (39, 12.658_161_617_156_907),
        ];
        let exp_even = [
            (1, 35.210_884_361_884_55),
            (3, 92.160_468_332_443_7),
            (17, 4.411_992_027_091_429),
            (30, 55.710_566_082_874_436),
            (38, 92.371_835_067_618_12),
        ];
        for (i, e) in exp_odd {
            assert_abs_diff_eq!(odd[i], e, epsilon = 1e-9);
        }
        for (i, e) in exp_even {
            assert_abs_diff_eq!(even[i], e, epsilon = 1e-9);
        }
    }

    #[test]
    fn tophat_is_nonnegative_and_removes_wide_baseline() {
        let x: Vec<f64> = (0..500)
            .map(|i| {
                let i = i as f64;
                200.0 + 0.5 * i + 1000.0 * (-(i - 250.0).powi(2) / 18.0).exp()
            })
            .collect();
        let y = white_tophat(&x, 40);
        assert!(y.iter().all(|&v| v >= -1e-9));
        assert!(y[250] > 950.0);
        assert!(y[100] < 1e-9);
    }

    #[test]
    fn tophat_huge_footprint_does_not_panic() {
        let x = [1.0, 5.0, 2.0];
        let y = white_tophat(&x, 50);
        assert_eq!(y.len(), 3);
    }

    #[test]
    fn argrelmax_matches_scipy() {
        let x = reference_signal();
        // uv run --with scipy python: argrelmax(x, order=k)[0]
        assert_eq!(argrelmax(&x, 1), vec![3, 10, 17, 20, 24, 29, 31, 38]);
        assert_eq!(argrelmax(&x, 3), vec![3, 10, 20, 31, 38]);
        // Endpoints never qualify, also as part of a plateau.
        assert_eq!(argrelmax(&[5.0, 1.0, 2.0, 1.0, 5.0], 1), vec![2]);
        assert!(argrelmax(&[3.0, 3.0, 1.0, 0.0, 1.0, 4.0, 4.0], 1).is_empty());
    }

    /// A flat top (a clipped peak after smoothing) yields one maximum at its
    /// center; scipy's strict comparison yields none.
    #[test]
    fn argrelmax_plateaus_yield_their_center() {
        assert_eq!(argrelmax(&[5.0, 1.0, 3.0, 3.0, 1.0, 5.0], 1), vec![2]);
        let mut x = vec![0.0; 40];
        for (i, v) in x.iter_mut().enumerate().take(30).skip(10) {
            *v = if (14..=24).contains(&i) { 9.0 } else { 5.0 };
        }
        assert_eq!(argrelmax(&x, 6), vec![19]);
        // Two equal maxima closer than `order`: one, the right-hand one.
        let y = [0.0, 1.0, 4.0, 2.0, 4.0, 1.0, 0.0, 0.0];
        assert_eq!(argrelmax(&y, 3), vec![4]);
        // A plateau beside a taller point within `order` is not a maximum.
        let z = [0.0, 3.0, 3.0, 1.0, 5.0, 0.0, 0.0];
        assert_eq!(argrelmax(&z, 3), vec![4]);
    }

    /// Reference: the definition, one knot at a time with full sorts.
    fn baseline_reference(t: &[i16]) -> Vec<f64> {
        let n = t.len();
        let h = BASELINE_SMOOTH_HALF;
        let centers: Vec<usize> = (0..n)
            .filter(|&c| c >= h && c + h < n && c % BASELINE_STRIDE == 0)
            .collect();
        let sum = |c: usize| -> i64 { t[c - h..=c + h].iter().map(|&v| i64::from(v)).sum() };
        let median = |mut v: Vec<i64>| -> f64 {
            v.sort();
            let m = v.len();
            if m % 2 == 1 {
                v[m / 2] as f64
            } else {
                0.5 * (v[m / 2 - 1] + v[m / 2]) as f64
            }
        };
        // (midpoint, width) of the shortest interval holding a third.
        let densest = |mut r: Vec<i64>| -> (f64, i64) {
            r.sort();
            let take = r.len().div_ceil(3);
            let best = (0..=r.len() - take)
                .min_by(|&a, &b| {
                    (r[a + take - 1] - r[a])
                        .cmp(&(r[b + take - 1] - r[b]))
                        .then(a.cmp(&b))
                })
                .unwrap();
            (
                0.5 * (r[best] + r[best + take - 1]) as f64,
                r[best + take - 1] - r[best],
            )
        };
        let level = |k: usize| -> f64 {
            let w: Vec<usize> = centers
                .iter()
                .copied()
                .filter(|&c| c.abs_diff(k) <= BASELINE_REACH)
                .collect();
            let left: Vec<usize> = w.iter().copied().filter(|&c| c < k).collect();
            let right: Vec<usize> = w.iter().copied().filter(|&c| c > k).collect();
            let pos = |v: &[usize]| v.iter().sum::<usize>() as f64 / v.len() as f64;
            let res = |v: &[usize], slope: f64| -> Vec<i64> {
                v.iter()
                    .map(|&c| 16 * sum(c) - (16.0 * slope * (c as f64 - k as f64)).round() as i64)
                    .collect()
            };
            let mut slopes = vec![0.0];
            if !left.is_empty() && !right.is_empty() {
                let span = 16.0 * (pos(&right) - pos(&left));
                let first = (median(res(&right, 0.0)) - median(res(&left, 0.0))) / span;
                let second =
                    first + (densest(res(&right, first)).0 - densest(res(&left, first)).0) / span;
                slopes.push(second);
            }
            let mut best = densest(res(&w, 0.0));
            for slope in slopes {
                let c = densest(res(&w, slope));
                if c.1 < best.1 {
                    best = c;
                }
            }
            best.0 / 16.0 / BASELINE_SMOOTH as f64
        };
        let mut knots: Vec<usize> = (0..n).step_by(BASELINE_KNOT).collect();
        if knots.last() != Some(&(n - 1)) {
            knots.push(n - 1);
        }
        let values: Vec<f64> = knots.iter().map(|&k| level(k)).collect();
        (0..n)
            .map(|i| {
                let s = knots.iter().rposition(|&k| k <= i).unwrap();
                match knots.get(s + 1) {
                    Some(&b) if i > knots[s] => {
                        let a = knots[s];
                        values[s] + (values[s + 1] - values[s]) * ((i - a) as f64 / (b - a) as f64)
                    }
                    _ => values[s],
                }
            })
            .collect()
    }

    /// Deterministic noise in -6..=6 RFU.
    fn lcg_noise(n: usize, seed: u64) -> Vec<f64> {
        let mut state = seed;
        (0..n)
            .map(|_| {
                state = state
                    .wrapping_mul(6364136223846793005)
                    .wrapping_add(1442695040888963407);
                ((state >> 33) % 13) as f64 - 6.0
            })
            .collect()
    }

    #[test]
    fn baseline_matches_definition_on_any_range() {
        // Noise, a slope, a few peaks and plateaus with ties.
        let e = lcg_noise(1500, 12345);
        let t: Vec<i16> = (0..1500)
            .map(|i| {
                let x = i as f64;
                let peak = 3000.0 * (-(x - 700.0).powi(2) / 50.0).exp()
                    + 800.0 * (-(x - 1210.0).powi(2) / 18.0).exp();
                (100.0 + 0.05 * x + e[i] + peak).round().min(2000.0) as i16
            })
            .collect();
        let whole = baseline(&t, 0, t.len() - 1);
        let reference = baseline_reference(&t);
        for (i, (&b, &r)) in whole.iter().zip(&reference).enumerate() {
            assert!((b - r).abs() < 1e-9, "{i}: {b} vs {r}");
        }
        for (lo, hi) in [(0, 10), (300, 900), (690, 710), (1400, 5000), (1499, 1499)] {
            let part = baseline(&t, lo, hi);
            assert_eq!(part[..], whole[lo..=hi.min(t.len() - 1)], "{lo}..{hi}");
        }
        assert!(baseline(&t, 20, 10).is_empty());
        assert!(baseline(&[], 0, 10).is_empty());
        assert_eq!(baseline(&[7; 5], 0, 4), vec![0.0; 5]);
        assert_eq!(baseline(&[7; 40], 0, 39), vec![7.0; 40]);
    }

    #[test]
    fn baseline_is_exact_on_a_linear_baseline() {
        // Integer-valued slope (1 RFU every 4 points) so the trace is exact.
        let t: Vec<i16> = (0..2000).map(|i| (150 + i / 4) as i16).collect();
        let b = baseline(&t, 0, t.len() - 1);
        for (i, &v) in b.iter().enumerate().take(1700).skip(300) {
            let exact = 150.0 + (i as f64 - 1.5) / 4.0;
            assert!((v - exact).abs() < 0.5, "{i}: {v} vs {exact}");
        }
    }

    /// A trace like a raw 3730 sample dye: a sloping baseline, a dip at
    /// every ladder peak (100–300 RFU), peaks of random heights, and two
    /// alleles three repeats apart with their stutter.
    fn crowded_trace(n: usize, seed: u64) -> (Vec<i16>, impl Fn(f64) -> f64) {
        let e = lcg_noise(n, seed);
        let u = lcg_noise(400, seed + 1);
        let g = |x: f64, c: f64, s: f64| (-(x - c).powi(2) / (2.0 * s * s)).exp();
        let truth = |x: f64| -40.0 + 0.004 * x;
        let mut v: Vec<f64> = (0..n).map(|i| truth(i as f64) + 2.0 * e[i]).collect();
        let mut c = 150.0;
        let mut k = 0;
        while c < n as f64 {
            let depth = 200.0 + 16.0 * u[k];
            let height = 2000.0 + 300.0 * u[k + 1];
            for (i, x) in v.iter_mut().enumerate() {
                let x0 = i as f64;
                *x += -depth * g(x0, c, 2.3) + height * g(x0, c + 45.0 + 3.0 * u[k + 2], 2.3);
            }
            c += 120.0 + 8.0 * u[k + 3];
            k += 4;
        }
        for (allele, h) in [(3200.0, 20_000.0), (3200.0 - 93.0, 9_000.0)] {
            for (shift, r) in [(0.0, 1.0), (-31.0, 0.15), (-62.0, 0.03), (31.0, 0.05)] {
                for (i, x) in v.iter_mut().enumerate() {
                    *x += h * r * g(i as f64, allele + shift, 2.4);
                }
            }
        }
        (v.iter().map(|x| x.round() as i16).collect(), truth)
    }

    /// Dips and peaks together covering about half of every window, and a
    /// stutter cluster, leave the baseline within a few RFU of the truth; a
    /// minimum or a low quantile would sit in the dips.
    #[test]
    fn baseline_ignores_dips_and_crowded_peaks() {
        let n = 6000;
        let (t, truth) = crowded_trace(n, 99);
        let b = baseline(&t, 0, n - 1);
        for i in (400..n - 400).step_by(7) {
            let err = b[i] - truth(i as f64);
            assert!(err.abs() < 3.0, "{i}: {} vs {}", b[i], truth(i as f64));
        }
        // Ten 8,000 RFU peaks back to back on top of that, an unrealistic
        // worst case: off by under 20 RFU inside the cluster, not by its height.
        let g = |x: f64, c: f64| (-(x - c).powi(2) / 12.5).exp();
        let dense: Vec<i16> = t
            .iter()
            .enumerate()
            .map(|(i, &v)| {
                let x = i as f64;
                let add: f64 = (0..10)
                    .map(|k| 8000.0 * g(x, 4000.0 + 31.0 * k as f64))
                    .sum();
                (f64::from(v) + add).round() as i16
            })
            .collect();
        let b = baseline(&dense, 0, n - 1);
        for i in (400..n - 400).step_by(7) {
            let err = b[i] - truth(i as f64);
            assert!(err.abs() < 20.0, "{i}: {} vs {}", b[i], truth(i as f64));
        }
    }

    /// A slow wave is followed within about a RFU.
    #[test]
    fn baseline_follows_a_slow_wave() {
        let n = 9000;
        let level = |x: f64| 50.0 * (x / 6000.0 * std::f64::consts::TAU).sin();
        let t: Vec<i16> = (0..n).map(|i| level(i as f64).round() as i16).collect();
        let b = baseline(&t, 0, n - 1);
        let worst = (300..n - 300)
            .map(|i| (b[i] - level(i as f64)).abs())
            .fold(0.0, f64::max);
        assert!(worst < 1.5, "{worst}");
    }
}
