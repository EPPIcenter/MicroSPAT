//! Size-standard (ladder) fitting for one well: which ladder-channel peaks are
//! which ladder fragments, and the base size of every data point.
//!
//! # Method
//!
//! **Candidates.** The ladder trace is scanned like any run ([`peaks::scan`]).
//! Candidates must come after `min_time`, stand more than `min_peak_height`
//! above the baseline ([`signal::baseline`]) with a raw value below
//! `max_peak_height`, optionally beat every other dye at that point
//! (`allow_bleedthrough = false`, both above their baselines), and be at least
//! `index_overlap` points from a taller candidate (two maxima of one peak).
//! Then a floor relative to the well's own ladder applies: the ladder height
//! is the median height of the tallest candidates, as many as the ladder has
//! sizes, and candidates below `min_relative_height` of it are dropped.
//! Injection strength varies several-fold between wells, so a fixed RFU floor
//! either admits a weak parallel series next to a strong ladder (crosstalk
//! from a neighbouring capillary, about 3% of the ladder and 17 points
//! early) or loses a weak ladder; ladder fragments of one well are of
//! similar height, so a relative floor does neither. Nothing else is
//! removed by height: dropping the peaks farthest from the median height
//! removes the ladder itself when junk outnumbers it, and a tall pull-up
//! peak a few points from a ladder peak is left for the alignment to reject
//! by its spacing.
//!
//! **Assignment.** Candidates (ordered by time) are aligned to ladder sizes
//! (ordered by length) by dynamic programming, which tolerates both missing
//! ladder peaks and spurious candidates. Migration is smooth, so the local
//! slope (bp per data point) between consecutive matched peaks changes only
//! slowly. An alignment costs
//!
//! - `(ln(slope_k / slope_{k-1}) / σ)²` for every pair of consecutive steps
//!   (σ = 0.1, i.e. ~10% slope change is one standard deviation),
//! - [`MISSING_COST`] for every ladder size left unmatched,
//! - [`SPURIOUS_COST`] for every candidate left unmatched.
//!
//! Because ladders have irregular spacing (HD400: 50, 60, 90, 100, 120, …),
//! an assignment shifted by one fragment produces slope ratios like 3 or 1/2
//! and costs far more than skipping a peak. The DP state is the last two
//! matches; gaps between consecutive matches are bounded by the allowed number
//! of missing peaks and the surplus of candidates, so the cost is
//! O(P · L · G²) with P candidates, L sizes, and G ≤ ~60 gap combinations,
//! instead of the old code's exhaustive search over peak/size combinations.
//!
//! **End peaks.** Nothing in the alignment checks the first and last match
//! against the rest of the ladder (a junk peak 2 bp from a missing 400 bp
//! peak costs one slope ratio of 0.9 to match, far less than leaving it). So
//! each end peak is predicted from the three matched peaks next to it, by
//! the quadratic through them, which follows
//! the curvature of migration where a straight line would be off by tenths
//! of a bp. An automatic fit drops an end peak predicted worse than
//! `sq_flag_limit` (worst end first, while more than
//! [`LadderSpec::required_peaks`] remain); the sized range then ends at its
//! neighbor, so loci beyond it are not sized from a wrong peak.
//!
//! **Ambiguity.** On a ladder whose spacing repeats (evenly spaced sizes;
//! GeneScan 600's 100 bp pattern of 14/20 bp steps) with peaks missing at
//! one end, an assignment shifted by whole fragments costs the same: the
//! cost is scale-free and the trace has nothing to tell them apart. After
//! the best alignment, up to four (`MAX_RIVALS`) rivals are searched, each
//! sharing no (peak, size) pair with the best or an earlier rival, costing
//! less than `AMBIGUITY_MARGIN` (one missing peak) more, and matching
//! enough peaks; the search is pruned at that bound, so on an unambiguous
//! ladder it ends almost at once. Where the ladder's spacing is irregular
//! the rivals cost far more and none is found; that is the only cue inside
//! one trace (which end of the run tends to lose peaks is not a safe
//! assumption). A rival is recorded in [`LadderFit::ambiguity`] and raises
//! the quality to the largest size difference between the two assignments
//! (a ladder step, so the fit is unusable), with a reason that says what to
//! do.
//!
//! **Plate consensus.** Capillaries of one run migrate alike, so a plate's
//! wells settle what one trace cannot ([`resolve_with_plate`]): every well
//! is fitted alone, then a [`LadderPrior`] is built from the fits that stand
//! on their own (usable and unambiguous, [`LadderPrior::from_plate`]; any
//! number of them, complete or not, from one up): the median data point of
//! each size. The plate questions a fit that is ambiguous, or whose *plate
//! error* exceeds `sq_flag_limit`: each matched peak is predicted from its
//! two neighbours by linear interpolation in the plate's coordinate (the
//! well's local stretch against the plate held constant across two ladder
//! steps), and the plate error is the largest miss in bp. The ladder's own
//! uneven mobility is in the plate's positions, so correct fits score near
//! zero; a pull-up taken for a ladder peak, a fragment that ran anomalously
//! in this capillary, or an assignment that starts or ends a step off scores
//! its displacement. A series parallel to the ladder (every peak early by
//! the same amount) scores nothing: capillaries of a plate differ in offset
//! by more than that, which is why the relative floor keeps such series
//! out. A questioned well is fitted again ([`fit_ladder_with_prior`]) with
//! the plate's positions in place of the sizes in the alignment, so that it
//! asks for a smooth stretch against the plate (σ = 0.05) rather than a
//! smooth slope. The refit's quality also counts its plate error. An
//! ambiguous well takes the refit. Any other takes it when it is no worse
//! and either changes at most one of the alone fit's peaks or the fit alone
//! is off the plate by more than half the ladder's smallest step (5 bp for
//! HD400): in a crowded trace some subset of peaks always agrees with the
//! plate, and a refit that rearranges several peaks to find it would report
//! a guess as good. A fit alone that is kept carries its plate error in its
//! quality.
//!
//! Among an ambiguous well's best assignment and its rivals the refit takes
//! the one the plate settles: each candidate implies how its capillary
//! deviates from the plate, `x ≈ offset + stretch · (expected − origin)` by
//! least squares; the reference wells give the plate's median and robust
//! spread of offset and stretch (floored at 1.5% of the position and 1.5%),
//! and a candidate's distance is the two z-scores combined in quadrature.
//! The closest candidate is taken when every other is at least
//! `SETTLE_SEPARATION_Z` (3) farther and twice as far. A shift by one ladder
//! step implies an offset of tens of spreads; a capillary that runs late or
//! fast stays within a few. Without a consensus (a well imported alone, or a
//! plate where every well is ambiguous) or without a clear winner, the fit
//! stays ambiguous and unusable.
//!
//! **Interpolation.** Base size as a function of data point is a monotone
//! piecewise-cubic Hermite interpolant (PCHIP, Fritsch–Carlson derivatives as
//! in scipy's `PchipInterpolator`) through the matched peaks. It passes through
//! every ladder peak, never overshoots between them, and is local, so one bad
//! peak cannot bend the whole curve as a global smoothing spline does.
//! Outside the outermost matched peaks, sizes are extrapolated linearly with
//! the slope of the outermost ladder interval and floored at 0 bp; they are
//! reliable only a few bp past the ladder, and [`LadderFit::sized_range`] says
//! where that boundary is.
//!
//! **Manual peaks.** Hand-picked peaks are assigned by the same alignment
//! with every peak kept, the first and last included ([`refit_ladder`]): a
//! manual fit uses exactly the peaks the user chose, and a bad one shows in
//! the quality. A handful of peaks is ambiguous: five peaks spaced 10, 30,
//! 10, 20 bp fit HD400's 50–120 and 260–400 equally well, since slope ratios
//! are scale-free. The caller can therefore state the sizes
//! ([`fit_assigned`]), or pass a [`LadderPrior`] built from the other wells
//! of the plate, which here adds `((x − expected) / sd)²` per matched peak
//! (with every peak kept, that cannot favor matching fewer), where
//! `expected` and `sd` are the median and robust spread of where that size
//! landed in the other wells.
//!
//! **Sizing quality.** An interpolant has no residual, so quality is the
//! *largest leave-one-out error in bp*: each interior ladder peak is removed in
//! turn, the curve is rebuilt from the others, and the error at the removed
//! peak is measured; each end peak is predicted by extrapolation as above. A
//! mis-assigned or displaced peak produces an error of roughly its
//! displacement; a clean ladder scores well under 0.5 bp. A fit made or
//! kept against a plate scores at least its plate error, and an ambiguous
//! fit at least the size difference to its rival. Lower is better.
//! Defaults: flagged above 1 bp, unusable above 2 bp. On real 3730 runs
//! with HD ROX 400, correct fits stay under 1 bp but for about one well in
//! a thousand, and the wrong fits that survive the checks above score
//! between 1 and 2.5 bp, so 2 bp refuses the worst of them.
//!
//! **Completeness.** Leave-one-out cannot see a mis-assigned *set* of peaks
//! (a self-consistent fit to the wrong part of the ladder scores well; the
//! ambiguity search above catches the shifts the trace cannot rule out), and
//! a fit over a few peaks extrapolates most of the run. A fit with fewer
//! matched peaks than [`LadderSpec::required_peaks`] (the ladder's sizes less
//! `maximum_missing_peak_count`, the old application's rule for automatic
//! fits) is therefore unusable whatever its quality, for automatic and manual
//! fits alike ([`LadderSpec::assess`]). Separately, a size range counts as
//! sized only within [`SIZED_RANGE_MARGIN_BP`] of the outermost matched
//! peaks ([`LadderSpec::covers`]); callers treat runs of loci outside it as
//! unusable. On a side where the well matched the ladder's own outermost
//! size the range is open: extrapolating past the end of the ladder is the
//! same for every well and a choice of locus and ladder, not a fault of the
//! well's fit.

use crate::peaks::{self, PeakError, ScanParams};
use crate::signal;
use crate::types::Color;
use serde::{Deserialize, Serialize};

/// HD ROX 400 fragment sizes (bp).
pub const HD400_SIZES: [f64; 21] = [
    50.0, 60.0, 90.0, 100.0, 120.0, 150.0, 160.0, 180.0, 190.0, 200.0, 220.0, 240.0, 260.0, 280.0,
    290.0, 300.0, 320.0, 340.0, 360.0, 380.0, 400.0,
];

/// Standard deviation of the log ratio of consecutive local slopes.
const SLOPE_LOG_SD: f64 = 0.1;
/// The same against the plate's consensus: the log ratio of consecutive
/// local stretches of a well relative to where the plate's wells put each
/// size. The ladder's own uneven mobility cancels, so correct fits vary far
/// less than in raw slopes.
const PLATE_SLOPE_LOG_SD: f64 = 0.05;
/// Cost of leaving a ladder size unmatched (≈ a 3σ slope change).
pub const MISSING_COST: f64 = 9.0;
/// Cost of leaving a candidate peak unmatched.
pub const SPURIOUS_COST: f64 = 1.0;
/// Longest run of skipped candidates between two matched peaks.
const MAX_SPURIOUS_GAP: usize = 10;
/// Fewest peaks for which a fit and its quality score are defined.
const MIN_FIT_PEAKS: usize = 4;
/// How far (bp) a size range may reach past the outermost matched ladder
/// peaks and still count as sized: linear extrapolation is reliable only a
/// few bp beyond the ladder.
pub const SIZED_RANGE_MARGIN_BP: f64 = 5.0;
/// Largest difference (bp) between a stated size and a ladder size it names.
const SIZE_MATCH_TOLERANCE: f64 = 0.005;
/// Floor of a prior's spread, as a fraction of the expected data point
/// (about 3 bp at 100 bp on a 3730), so one or two reference wells that
/// agree exactly do not make the prior absolute.
const PRIOR_MIN_SD_FRACTION: f64 = 0.015;
/// Absolute floor of a prior's spread, in data points.
const PRIOR_MIN_SD: f64 = 15.0;
/// An assignment is ambiguous when another one that shares no (peak, size)
/// pair with it costs less than this much more: less than one more missing
/// ladder peak. A clean irregular ladder's nearest such rival costs hundreds.
const AMBIGUITY_MARGIN: f64 = MISSING_COST;
/// Most rival assignments looked for (shifts by one, two, ... fragments).
const MAX_RIVALS: usize = 4;
/// The plate's consensus settles an ambiguous assignment when every other
/// candidate's implied capillary offset and stretch lie at least this many
/// spreads farther from the plate's wells than the closest candidate's, and
/// at least twice as far. There is no absolute limit: a capillary that runs
/// unusually early is still far closer to its true assignment than to one
/// shifted by a whole ladder step.
const SETTLE_SEPARATION_Z: f64 = 3.0;

/// Default of [`LadderSpec::min_relative_height`]. On real 3730 HD ROX 400
/// runs the weakest fragment of a well is above 0.6 of the ladder height in
/// 99% of wells (the 50–100 bp and 380–400 bp fragments are the weak ones),
/// while crosstalk series sit near 0.03 and other extra peaks rarely reach
/// 0.2; fits were equally good from 0.2 to 0.3.
pub const MIN_RELATIVE_HEIGHT: f64 = 0.25;

/// Ladder definition and fitting parameters.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(default)]
pub struct LadderSpec {
    /// Expected fragment sizes in bp, strictly increasing.
    pub base_sizes: Vec<f64>,
    /// Dye channel carrying the ladder.
    pub color: Color,
    /// Wells with sizing quality above this (bp) are flagged for review.
    pub sq_flag_limit: f64,
    /// Wells with sizing quality above this (bp) are unusable.
    pub sq_unusable_limit: f64,
    /// Decimal places kept in base sizes.
    pub base_size_precision: u32,
    /// Two maxima closer than this many data points are one peak; the shorter is dropped.
    pub index_overlap: usize,
    /// Data points before this are ignored (primer peaks, dye blobs).
    pub min_time: usize,
    /// Peaks whose raw value is at or above this (RFU) are ignored.
    pub max_peak_height: f64,
    /// Peaks at or below this height above the baseline (RFU) are ignored.
    pub min_peak_height: f64,
    /// Peaks below this fraction of the well's ladder height (the median of
    /// its tallest candidates, as many as the ladder has sizes) are ignored.
    pub min_relative_height: f64,
    /// Most ladder peaks that may be missing before the fit fails.
    pub maximum_missing_peak_count: usize,
    /// When false, drop candidates where another dye is at least as high (pull-up).
    pub allow_bleedthrough: bool,
    /// Scanning parameters for the ladder channel.
    pub scanning: ScanParams,
}

impl Default for LadderSpec {
    fn default() -> Self {
        LadderSpec {
            base_sizes: HD400_SIZES.to_vec(),
            color: Color::Red,
            sq_flag_limit: 1.0,
            sq_unusable_limit: 2.0,
            base_size_precision: 2,
            // Two scanned maxima are rarely closer than the relative-maximum
            // window; pull-up beside a ladder peak sits 8 to 15 points away
            // and must stay a separate candidate.
            index_overlap: 5,
            min_time: 1200,
            max_peak_height: 24_000.0,
            min_peak_height: 200.0,
            min_relative_height: MIN_RELATIVE_HEIGHT,
            maximum_missing_peak_count: 5,
            allow_bleedthrough: true,
            scanning: ScanParams::default(),
        }
    }
}

impl LadderSpec {
    /// GeneScan HD ROX 400 on the red dye with default parameters.
    pub fn hd_rox_400() -> Self {
        Self::default()
    }

    fn validate(&self) -> Result<(), LadderError> {
        if self.base_sizes.len() < MIN_FIT_PEAKS {
            return Err(LadderError::InvalidSpec(format!(
                "a ladder needs at least {MIN_FIT_PEAKS} sizes"
            )));
        }
        if self.base_sizes.iter().any(|s| !s.is_finite() || *s < 0.0)
            || self.base_sizes.windows(2).any(|w| w[1] <= w[0])
        {
            return Err(LadderError::InvalidSpec(
                "ladder sizes must be finite, non-negative, and strictly increasing".into(),
            ));
        }
        Ok(())
    }

    /// Fewest matched peaks a usable fit has (automatic or manual).
    pub fn required_peaks(&self) -> usize {
        self.base_sizes
            .len()
            .saturating_sub(self.maximum_missing_peak_count)
            .max(MIN_FIT_PEAKS)
    }

    /// True when `min..=max` (bp) lies within the reliably sized range of a
    /// fit with these matched sizes: within [`SIZED_RANGE_MARGIN_BP`] of the
    /// outermost matched peaks, except that a side is open when the fit
    /// matched the ladder's own outermost size there.
    pub fn covers(&self, peak_sizes: &[f64], min: f64, max: f64) -> bool {
        let (Some(&lo), Some(&hi)) = (peak_sizes.first(), peak_sizes.last()) else {
            return false;
        };
        let at_end =
            |a: f64, b: Option<&f64>| b.is_some_and(|&b| (a - b).abs() <= SIZE_MATCH_TOLERANCE);
        let lo_ok = at_end(lo, self.base_sizes.first()) || min >= lo - SIZED_RANGE_MARGIN_BP;
        let hi_ok = at_end(hi, self.base_sizes.last()) || max <= hi + SIZED_RANGE_MARGIN_BP;
        lo_ok && hi_ok
    }

    /// Status of a fit with this quality and these matched sizes under the
    /// spec's limits, with a sentence saying why when it is not good.
    pub fn assess(&self, quality: f64, peak_sizes: &[f64]) -> Assessment {
        let needed = self.required_peaks();
        let (status, reason) = if quality.is_nan() {
            (
                SizingStatus::Unusable,
                Some("Sizing quality is undefined.".to_string()),
            )
        } else if peak_sizes.len() < needed {
            (
                SizingStatus::Unusable,
                Some(format!(
                    "Only {} of the ladder's {} peaks are assigned; at least {needed} are needed \
                     (at most {} may be missing).",
                    peak_sizes.len(),
                    self.base_sizes.len(),
                    self.maximum_missing_peak_count
                )),
            )
        } else if quality > self.sq_unusable_limit {
            (
                SizingStatus::Unusable,
                Some(format!(
                    "Largest leave-one-out sizing error is {quality:.2} bp, above the unusable limit of {} bp.",
                    self.sq_unusable_limit
                )),
            )
        } else if quality > self.sq_flag_limit {
            (
                SizingStatus::Flagged,
                Some(format!(
                    "Largest leave-one-out sizing error is {quality:.2} bp, above the flag limit of {} bp.",
                    self.sq_flag_limit
                )),
            )
        } else {
            (SizingStatus::Good, None)
        };
        Assessment { status, reason }
    }
}

/// A sizing status and, unless good, why.
#[derive(Debug, Clone, PartialEq)]
pub struct Assessment {
    pub status: SizingStatus,
    pub reason: Option<String>,
}

/// Another assignment of the same peaks to different ladder sizes that fits
/// almost as well as the chosen one, so the trace alone cannot tell which is
/// right (a periodic ladder with peaks missing at one end).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Ambiguity {
    /// First and last ladder size (bp) the rival assignment matches.
    pub alternative_range: (f64, f64),
    /// Largest difference (bp) between the sizes the two assignments give
    /// the matched peaks: how wrong the sizes may be.
    pub size_difference: f64,
    /// True when the assignment was already scored against where the plate's
    /// other wells put each size (a [`LadderPrior`]) and still is ambiguous.
    pub with_prior: bool,
}

impl Ambiguity {
    /// A sentence for the user saying what is ambiguous and what to do.
    pub fn reason(&self, peak_sizes: &[f64]) -> String {
        let (lo, hi) = (
            peak_sizes.first().copied().unwrap_or(0.0),
            peak_sizes.last().copied().unwrap_or(0.0),
        );
        let (alo, ahi) = self.alternative_range;
        let why = if self.with_prior {
            "the other wells of the plate do not settle it"
        } else {
            "no other well on the plate has an unambiguous ladder fit to settle it"
        };
        format!(
            "Ladder assignment is ambiguous: the peaks fit {lo}–{hi} bp and {alo}–{ahi} bp almost \
             equally well, so sizes may be off by up to {:.1} bp. Ladder peaks are missing and \
             the ladder's spacing repeats, and {why}. Pick the ladder peaks and state their sizes.",
            self.size_difference
        )
    }
}

/// Where each ladder size is expected to peak, learned from other wells of
/// the same run.
#[derive(Debug, Clone, PartialEq)]
pub struct LadderPrior {
    /// Per ladder size: (expected data point, spread in data points).
    expected: Vec<Option<(f64, f64)>>,
    /// How the wells the prior was built from deviate from it as a whole.
    deviation: Option<Deviation>,
}

/// A well's capillary runs a little early or late, and a little fast or
/// slow, so its peaks sit at `offset + stretch · (expected − origin)` (data
/// points; `origin` is where the prior expects its first size). The
/// reference wells' (median, spread) of both say what is plausible.
#[derive(Debug, Clone, PartialEq)]
struct Deviation {
    origin: f64,
    offset: (f64, f64),
    stretch: (f64, f64),
}

impl LadderPrior {
    /// Builds the prior from other wells' fits, given as (peak indices,
    /// peak sizes). Sizes not in the spec are ignored. A size no well matched
    /// is interpolated (or extrapolated, with twice the spread) from the
    /// nearest sizes that were. None when no fit matches any size.
    pub fn from_fits<'a>(
        spec: &LadderSpec,
        fits: impl IntoIterator<Item = (&'a [usize], &'a [f64])>,
    ) -> Option<LadderPrior> {
        let sizes = &spec.base_sizes;
        let fits: Vec<(&[usize], &[f64])> = fits.into_iter().collect();
        let mut seen: Vec<Vec<f64>> = vec![Vec::new(); sizes.len()];
        for &(idx, sz) in &fits {
            for (&i, &s) in idx.iter().zip(sz) {
                if let Some(j) = ladder_size_index(sizes, s) {
                    seen[j].push(i as f64);
                }
            }
        }
        let known: Vec<(usize, f64, f64)> = seen
            .iter()
            .enumerate()
            .filter_map(|(j, v)| {
                let c = median(v)?;
                let mad = median(&v.iter().map(|x| (x - c).abs()).collect::<Vec<_>>())?;
                let sd = (1.4826 * mad)
                    .max(PRIOR_MIN_SD_FRACTION * c)
                    .max(PRIOR_MIN_SD);
                Some((j, c, sd))
            })
            .collect();
        if known.is_empty() {
            return None;
        }
        let at = |a: &(usize, f64, f64), b: &(usize, f64, f64), j: usize| {
            let t = (sizes[j] - sizes[a.0]) / (sizes[b.0] - sizes[a.0]);
            a.1 + t * (b.1 - a.1)
        };
        let expected = (0..sizes.len())
            .map(|j| {
                if let Some(k) = known.iter().find(|k| k.0 == j) {
                    return Some((k.1, k.2));
                }
                let below = known.iter().rposition(|k| k.0 < j);
                let above = known.iter().position(|k| k.0 > j);
                match (below, above) {
                    (Some(a), Some(b)) => {
                        Some((at(&known[a], &known[b], j), known[a].2.max(known[b].2)))
                    }
                    (Some(a), None) if a >= 1 => {
                        Some((at(&known[a - 1], &known[a], j), 2.0 * known[a].2))
                    }
                    (None, Some(b)) if b + 1 < known.len() => {
                        Some((at(&known[b], &known[b + 1], j), 2.0 * known[b].2))
                    }
                    _ => None,
                }
            })
            .collect();
        let mut prior = LadderPrior {
            expected,
            deviation: None,
        };
        let origin = prior.expected.iter().flatten().next().map(|e| e.0)?;
        let (mut offsets, mut stretches) = (Vec::new(), Vec::new());
        for &(idx, sz) in &fits {
            let pts = idx
                .iter()
                .zip(sz)
                .filter_map(|(&i, &s)| Some((i as f64, ladder_size_index(sizes, s)?)));
            if let Some((a, b)) = prior.affine(origin, pts) {
                offsets.push(a);
                stretches.push(b);
            }
        }
        let spread = |v: &[f64], floor: f64| -> Option<(f64, f64)> {
            let c = median(v)?;
            let mad = median(&v.iter().map(|x| (x - c).abs()).collect::<Vec<_>>())?;
            Some((c, (1.4826 * mad).max(floor)))
        };
        prior.deviation = Some(Deviation {
            origin,
            offset: spread(&offsets, (PRIOR_MIN_SD_FRACTION * origin).max(PRIOR_MIN_SD))?,
            stretch: spread(&stretches, PRIOR_MIN_SD_FRACTION)?,
        });
        Some(prior)
    }

    /// Least-squares `(offset, stretch)` of peaks `(x, size index)` against
    /// their expected positions (see [`Deviation`]); None without two
    /// distinct expected positions.
    fn affine(&self, origin: f64, pts: impl Iterator<Item = (f64, usize)>) -> Option<(f64, f64)> {
        let v: Vec<(f64, f64)> = pts
            .filter_map(|(x, j)| self.expected(j).map(|(c, _)| (x, c - origin)))
            .collect();
        let n = v.len() as f64;
        if v.len() < 2 {
            return None;
        }
        let (mx, mc) = (
            v.iter().map(|p| p.0).sum::<f64>() / n,
            v.iter().map(|p| p.1).sum::<f64>() / n,
        );
        let var: f64 = v.iter().map(|p| (p.1 - mc).powi(2)).sum();
        if var <= 0.0 {
            return None;
        }
        let beta = v.iter().map(|p| (p.0 - mx) * (p.1 - mc)).sum::<f64>() / var;
        Some((mx - beta * mc, beta))
    }

    /// The plate consensus for automatic fits: built from the plate's fits
    /// that stand on their own (usable and unambiguous under `spec`). None
    /// when there is none.
    pub fn from_plate<'a>(
        spec: &LadderSpec,
        fits: impl IntoIterator<Item = &'a LadderFit>,
    ) -> Option<LadderPrior> {
        Self::from_fits(
            spec,
            fits.into_iter()
                .filter(|f| f.is_reference(spec))
                .map(|f| (f.peak_indices.as_slice(), f.peak_sizes.as_slice())),
        )
    }

    /// Expected data point and spread of ladder size `j`, when known.
    pub fn expected(&self, j: usize) -> Option<(f64, f64)> {
        self.expected.get(j).copied().flatten()
    }

    /// Which of the candidate assignments (pairs into positions `x`) the
    /// prior settles on. Each candidate implies a capillary offset and
    /// stretch ([`Deviation`]); its distance is how many spreads those lie
    /// from the reference wells' (combined in quadrature). A shifted
    /// assignment implies an offset of a whole ladder step, which no
    /// capillary of the run shows. The closest candidate is taken when every
    /// other is clearly farther ([`SETTLE_SEPARATION_Z`]).
    fn settle(&self, x: &[f64], candidates: &[Vec<(usize, usize)>]) -> Option<usize> {
        let d = self.deviation.as_ref()?;
        let z: Vec<f64> = candidates
            .iter()
            .map(|pairs| {
                self.affine(d.origin, pairs.iter().map(|&(i, j)| (x[i], j)))
                    .map_or(f64::INFINITY, |(a, b)| {
                        ((a - d.offset.0) / d.offset.1).hypot((b - d.stretch.0) / d.stretch.1)
                    })
            })
            .collect();
        let k = (0..z.len()).min_by(|&a, &b| z[a].total_cmp(&z[b]))?;
        let settled = z[k].is_finite()
            && z.iter()
                .enumerate()
                .all(|(m, &v)| m == k || (v >= z[k] + SETTLE_SEPARATION_Z && v >= 2.0 * z[k]));
        settled.then_some(k)
    }

    /// Where the plate puts every ladder size (data points), when it knows
    /// all of them.
    fn positions(&self) -> Option<Vec<f64>> {
        self.expected.iter().map(|e| e.map(|(c, _)| c)).collect()
    }

    /// Largest error (bp) of a fit's matched peaks when each is predicted
    /// from its two neighbours (the next two at an end) by linear
    /// interpolation in the plate's coordinate: the well's local stretch
    /// against the plate is assumed constant across two ladder steps. The
    /// ladder's own uneven mobility is in the plate's positions, so a
    /// correct fit scores near zero, while a peak taken from a parallel
    /// series, a pull-up next to the ladder peak, or a fragment that ran
    /// anomalously in this capillary scores its displacement. Zero when the
    /// prior lacks a size or with fewer than three peaks.
    fn plate_error(&self, peak_indices: &[usize], peak_sizes: &[f64], sizes: &[f64]) -> f64 {
        let n = peak_indices.len();
        let e: Option<Vec<f64>> = peak_sizes
            .iter()
            .map(|&s| {
                ladder_size_index(sizes, s)
                    .and_then(|j| self.expected(j))
                    .map(|v| v.0)
            })
            .collect();
        let Some(e) = e else { return 0.0 };
        if n < 3 {
            return 0.0;
        }
        let x: Vec<f64> = peak_indices.iter().map(|&i| i as f64).collect();
        let mut worst: f64 = 0.0;
        for m in 0..n {
            let (a, b) = match m {
                0 => (1, 2),
                _ if m == n - 1 => (n - 2, n - 3),
                _ => (m - 1, m + 1),
            };
            let (de, dx, ds) = (e[b] - e[a], x[b] - x[a], peak_sizes[b] - peak_sizes[a]);
            if de == 0.0 || dx == 0.0 || ds == 0.0 {
                continue;
            }
            let predicted = x[a] + dx * (e[m] - e[a]) / de;
            worst = worst.max((x[m] - predicted).abs() * (ds / dx).abs());
        }
        worst
    }

    /// The plate error of a fit (see `plate_error`).
    fn fit_error(&self, fit: &LadderFit, spec: &LadderSpec) -> f64 {
        self.plate_error(&fit.peak_indices, &fit.peak_sizes, &spec.base_sizes)
    }

    /// The plate error (bp) of a stored fit given as matched peak indices
    /// and sizes: the largest miss of a matched peak against where the
    /// plate puts it, predicted from its two neighbours. Zero when the
    /// prior lacks a size or with fewer than three peaks.
    pub fn plate_error_of(
        &self,
        peak_indices: &[usize],
        peak_sizes: &[f64],
        spec: &LadderSpec,
    ) -> f64 {
        self.plate_error(peak_indices, peak_sizes, &spec.base_sizes)
    }

    /// True when the plate should refit this well: its assignment is
    /// ambiguous, or a matched peak is further from where the plate puts it
    /// than the flag limit.
    fn questions(&self, fit: &LadderFit, spec: &LadderSpec) -> bool {
        fit.ambiguity.is_some() || self.fit_error(fit, spec) > spec.sq_flag_limit
    }

    fn cost(&self, x: f64, j: usize) -> f64 {
        self.expected(j)
            .map_or(0.0, |(c, sd)| ((x - c) / sd).powi(2))
    }
}

fn median(v: &[f64]) -> Option<f64> {
    crate::stats::median(v)
}

/// Index of the ladder size `size` names, within [`SIZE_MATCH_TOLERANCE`].
fn ladder_size_index(sizes: &[f64], size: f64) -> Option<usize> {
    sizes
        .iter()
        .position(|&l| (l - size).abs() <= SIZE_MATCH_TOLERANCE)
}

/// Why a ladder could not be fitted.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum LadderError {
    #[error("invalid ladder: {0}")]
    InvalidSpec(String),
    #[error("ladder signal too low: tallest peak after min_time is {max_height} RFU, need more than {min_height}")]
    SignalTooLow { max_height: f64, min_height: f64 },
    #[error("only {found} usable ladder peaks, need {needed}")]
    TooFewPeaks { found: usize, needed: usize },
    #[error("{found} peaks given, but the ladder has only {ladder} sizes")]
    TooManyPeaks { found: usize, ladder: usize },
    #[error("peak index {index} is outside the trace (length {len})")]
    IndexOutOfRange { index: usize, len: usize },
    #[error("{size} bp is not a size of this ladder")]
    UnknownSize { size: f64 },
    #[error("peak {index}: {size} bp is not a valid size (sizes are finite and not negative)")]
    InvalidSize { index: usize, size: f64 },
    #[error("sizes must increase with the peak index and each ladder size be used once (peak {index}: {size} bp)")]
    NotIncreasing { index: usize, size: f64 },
    #[error(transparent)]
    Scan(#[from] PeakError),
}

/// Review status of a fit under a spec's limits.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "lowercase")]
pub enum SizingStatus {
    Good,
    Flagged,
    Unusable,
}

/// A fitted ladder for one well.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LadderFit {
    /// Data-point indices of the matched ladder peaks, increasing.
    pub peak_indices: Vec<usize>,
    /// Ladder size (bp) each matched peak was assigned.
    pub peak_sizes: Vec<f64>,
    /// Base size (bp) of every data point in the trace.
    pub base_sizes: Vec<f64>,
    /// Sizing quality in bp, lower is better: the largest leave-one-out
    /// error over the matched peaks (end peaks by extrapolation), or, when
    /// the assignment is ambiguous, the largest size difference to the rival
    /// assignment if that is larger.
    pub sizing_quality: f64,
    /// Set when another assignment fits almost as well (see [`Ambiguity`]).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ambiguity: Option<Ambiguity>,
}

impl LadderFit {
    /// Good, flagged, or unusable under the spec's limits, including the
    /// completeness rule ([`LadderSpec::assess`]).
    pub fn status(&self, spec: &LadderSpec) -> SizingStatus {
        self.assess(spec).status
    }

    /// Status with the reason it is not good. An ambiguous assignment is
    /// explained as such (its quality already carries the size difference).
    pub fn assess(&self, spec: &LadderSpec) -> Assessment {
        let a = spec.assess(self.sizing_quality, &self.peak_sizes);
        match &self.ambiguity {
            Some(amb)
                if a.status != SizingStatus::Good
                    && self.peak_sizes.len() >= spec.required_peaks() =>
            {
                Assessment {
                    status: a.status,
                    reason: Some(amb.reason(&self.peak_sizes)),
                }
            }
            _ => a,
        }
    }

    /// True when the fit can stand on its own as a reference for other
    /// wells of its plate: usable and unambiguous.
    pub fn is_reference(&self, spec: &LadderSpec) -> bool {
        self.ambiguity.is_none() && self.status(spec) != SizingStatus::Unusable
    }

    /// Sizes (bp) between the outermost matched ladder peaks; outside it sizes are extrapolated.
    pub fn sized_range(&self) -> (f64, f64) {
        (
            self.peak_sizes.first().copied().unwrap_or(0.0),
            self.peak_sizes.last().copied().unwrap_or(0.0),
        )
    }
}

/// Fits the ladder of one well automatically, from its trace alone.
/// `other_traces` are the well's other dyes, used only when
/// `allow_bleedthrough` is false. An assignment the trace cannot settle is
/// reported in [`LadderFit::ambiguity`]; [`fit_ladder_in_plate`] and
/// [`resolve_with_plate`] settle it with the plate's other wells.
pub fn fit_ladder(
    ladder_trace: &[i16],
    other_traces: &[&[i16]],
    spec: &LadderSpec,
) -> Result<LadderFit, LadderError> {
    fit_ladder_with_prior(ladder_trace, other_traces, spec, None)
}

/// Automatic fit of one well of a plate: alone, and, when the plate's
/// consensus is known and questions that fit (as in [`resolve_with_plate`]),
/// again against it; the better of the two is kept.
pub fn fit_ladder_in_plate(
    ladder_trace: &[i16],
    other_traces: &[&[i16]],
    spec: &LadderSpec,
    prior: Option<&LadderPrior>,
) -> Result<LadderFit, LadderError> {
    let fit = fit_ladder(ladder_trace, other_traces, spec)?;
    match prior {
        Some(p) if p.questions(&fit, spec) => Ok(choose(
            fit,
            fit_ladder_with_prior(ladder_trace, other_traces, spec, Some(p)),
            p,
            spec,
        )),
        _ => Ok(fit),
    }
}

/// Between a well's fit alone and its refit against the plate. An ambiguous
/// fit takes the refit. Otherwise the refit is taken when its quality is no
/// worse than the fit alone measured against the plate, and it either
/// changes at most one of the alone fit's peaks (an anomalous fragment, a
/// pull-up taken for a ladder peak) or the fit alone is off the plate by
/// more than half the ladder's smallest step (a peak taken for its
/// neighbour: a shifted assignment, or junk fitted as ladder). A refit
/// that rearranges a usable fit more than that has only found a subset of
/// peaks that agrees with the plate, which a crowded trace always offers;
/// the fit alone is kept then. A fit alone that is kept carries its plate
/// error in its quality, so a peak that disagrees with the plate is never
/// reported as good.
fn choose<E>(
    alone: LadderFit,
    refit: Result<LadderFit, E>,
    prior: &LadderPrior,
    spec: &LadderSpec,
) -> LadderFit {
    if alone.ambiguity.is_some() {
        if let Ok(r) = refit {
            return r;
        }
        return alone;
    }
    let plate = prior.fit_error(&alone, spec);
    let alone_quality = alone.sizing_quality.max(plate);
    match refit {
        Ok(r)
            if r.sizing_quality <= alone_quality
                && (plate > half_step(spec) || changed_peaks(&alone, &r) <= 1) =>
        {
            r
        }
        _ => LadderFit {
            sizing_quality: alone_quality,
            ..alone
        },
    }
}

/// Half the ladder's smallest step (bp): a fit alone off the plate by more
/// than this has taken some peak for its neighbour, or junk for the ladder,
/// rather than a displaced peak.
fn half_step(spec: &LadderSpec) -> f64 {
    let step = spec
        .base_sizes
        .windows(2)
        .map(|w| w[1] - w[0])
        .fold(f64::INFINITY, f64::min);
    step / 2.0
}

/// How many of `a`'s matched sizes `b` leaves out or puts on another peak.
fn changed_peaks(a: &LadderFit, b: &LadderFit) -> usize {
    a.peak_sizes
        .iter()
        .zip(&a.peak_indices)
        .filter(|&(s, i)| {
            !b.peak_sizes
                .iter()
                .zip(&b.peak_indices)
                .any(|(t, j)| (s - t).abs() <= SIZE_MATCH_TOLERANCE && i == j)
        })
        .count()
}

/// Second pass of fitting a whole plate. `fits` are the wells' fits from
/// [`fit_ladder`]; the consensus is [`LadderPrior::from_plate`] over them.
/// Every fit the consensus questions (ambiguous, or a peak further from
/// where the plate puts it than the flag limit; see the module docs) is
/// refitted with `refit(k, consensus)` (normally [`fit_ladder_with_prior`]
/// on well `k`'s traces). An ambiguous fit is replaced by its refit; any
/// other keeps the better of the two (see [`fit_ladder_in_plate`]).
/// Without a consensus nothing changes and ambiguous fits stay ambiguous.
/// Returns the indices of the wells refitted.
pub fn resolve_with_plate<E>(
    spec: &LadderSpec,
    fits: &mut [Result<LadderFit, E>],
    mut refit: impl FnMut(usize, &LadderPrior) -> Result<LadderFit, E>,
) -> Vec<usize> {
    let Some(prior) = LadderPrior::from_plate(spec, fits.iter().filter_map(|r| r.as_ref().ok()))
    else {
        return Vec::new();
    };
    let questioned: Vec<usize> = (0..fits.len())
        .filter(|&k| fits[k].as_ref().is_ok_and(|f| prior.questions(f, spec)))
        .collect();
    for &k in &questioned {
        let again = refit(k, &prior);
        let slot = &mut fits[k];
        if let Ok(alone) = slot {
            if alone.ambiguity.is_some() {
                *slot = again;
            } else {
                let alone = std::mem::replace(alone, empty_fit());
                *slot = Ok(choose(alone, again, &prior, spec));
            }
        }
    }
    questioned
}

fn empty_fit() -> LadderFit {
    LadderFit {
        peak_indices: Vec::new(),
        peak_sizes: Vec::new(),
        base_sizes: Vec::new(),
        sizing_quality: f64::NAN,
        ambiguity: None,
    }
}

/// [`fit_ladder`], with the plate's consensus to settle an ambiguous
/// assignment: among the assignments the trace alone cannot tell apart, the
/// one whose peaks sit where the plate's other wells put those sizes is
/// taken, when it is clearly closer than every other (see the module docs).
pub fn fit_ladder_with_prior(
    ladder_trace: &[i16],
    other_traces: &[&[i16]],
    spec: &LadderSpec,
    prior: Option<&LadderPrior>,
) -> Result<LadderFit, LadderError> {
    spec.validate()?;
    let needed = spec.required_peaks();
    let (late, cands) = candidates(ladder_trace, other_traces, spec)?;
    if cands.len() < needed {
        let max_height = late.iter().map(|&(_, h)| h).fold(0.0, f64::max);
        if max_height <= spec.min_peak_height {
            return Err(LadderError::SignalTooLow {
                max_height,
                min_height: spec.min_peak_height,
            });
        }
        return Err(LadderError::TooFewPeaks {
            found: cands.len(),
            needed,
        });
    }
    let x: Vec<f64> = cands.iter().map(|&(i, _)| i as f64).collect();
    let max_gap = (cands.len() + 1)
        .saturating_sub(needed)
        .clamp(1, MAX_SPURIOUS_GAP);
    // Against a plate, sizes are replaced by where the plate's wells put
    // them: the alignment then asks for a smooth local stretch against the
    // plate rather than a smooth slope, which the ladder's uneven mobility
    // breaks by several percent from step to step.
    let plate = prior.and_then(LadderPrior::positions);
    let (y, sd) = match &plate {
        Some(p) => (p.as_slice(), PLATE_SLOPE_LOG_SD),
        None => (spec.base_sizes.as_slice(), SLOPE_LOG_SD),
    };
    let opts = AlignOpts {
        max_dx: max_gap,
        max_dy: spec.maximum_missing_peak_count + 1,
        keep_all_x: false,
        slope_sd: sd,
    };
    let best = align(&x, y, opts, &|_, _| 0.0, f64::INFINITY);
    if best.pairs.len() < needed {
        return Err(LadderError::TooFewPeaks {
            found: best.pairs.len(),
            needed,
        });
    }
    let rivals = rivals(&x, y, opts, &|_, _| 0.0, &best, needed);
    let (mut pairs, rivals) = match prior {
        Some(p) if !rivals.is_empty() => {
            let mut all = vec![best.pairs];
            all.extend(rivals);
            match p.settle(&x, &all) {
                Some(k) => (all.swap_remove(k), Vec::new()),
                None => {
                    let rest = all.split_off(1);
                    (all.swap_remove(0), rest)
                }
            }
        }
        _ => (best.pairs, rivals),
    };
    drop_unsupported_ends(&x, &spec.base_sizes, &mut pairs, needed, spec.sq_flag_limit);
    let indices = pairs.iter().map(|&(i, _)| cands[i].0).collect();
    let sizes = pairs.iter().map(|&(_, j)| spec.base_sizes[j]).collect();
    let mut fit = build_fit(indices, sizes, ladder_trace.len(), spec.base_size_precision);
    if let Some(p) = prior {
        fit.sizing_quality = fit.sizing_quality.max(p.fit_error(&fit, spec));
    }
    fit.set_rivals(&x, &rivals, &spec.base_sizes, prior.is_some());
    Ok(fit)
}

/// Up to [`MAX_RIVALS`] assignments, each sharing no (peak, size) pair with
/// `best` or an earlier rival, that match enough peaks and cost less than
/// [`AMBIGUITY_MARGIN`] more than `best`.
fn rivals(
    x: &[f64],
    y: &[f64],
    opts: AlignOpts,
    node: &dyn Fn(usize, usize) -> f64,
    best: &Alignment,
    needed: usize,
) -> Vec<Vec<(usize, usize)>> {
    let l = y.len();
    let mut taken = vec![false; x.len() * l];
    let mut out: Vec<Vec<(usize, usize)>> = Vec::new();
    let bound = best.cost + AMBIGUITY_MARGIN;
    let mut last = best.pairs.clone();
    while out.len() < MAX_RIVALS {
        for &(i, j) in &last {
            taken[i * l + j] = true;
        }
        let node = |i: usize, j: usize| {
            if taken[i * l + j] {
                f64::INFINITY
            } else {
                node(i, j)
            }
        };
        let other = align(x, y, opts, &node, bound);
        if other.pairs.len() < needed || other.cost >= bound {
            break;
        }
        last = other.pairs.clone();
        out.push(other.pairs);
    }
    out
}

/// Drops matched end peaks that the rest of the ladder does not support
/// (extrapolation error above `tol` bp, see [`end_errors`]), worst first,
/// while more than `keep` peaks remain.
fn drop_unsupported_ends(
    x: &[f64],
    y: &[f64],
    pairs: &mut Vec<(usize, usize)>,
    keep: usize,
    tol: f64,
) {
    while pairs.len() > keep.max(MIN_FIT_PEAKS) {
        let px: Vec<f64> = pairs.iter().map(|&(i, _)| x[i]).collect();
        let py: Vec<f64> = pairs.iter().map(|&(_, j)| y[j]).collect();
        let [first, last] = end_errors(&px, &py);
        if first.max(last) <= tol {
            break;
        }
        if first >= last {
            pairs.remove(0);
        } else {
            pairs.pop();
        }
    }
}

/// Every point's signal above the trace's baseline, clamped at zero.
fn above_baseline(trace: &[i16]) -> Vec<f64> {
    let base = signal::baseline(trace, 0, trace.len().saturating_sub(1));
    trace
        .iter()
        .zip(base)
        .map(|(&v, b)| (f64::from(v) - b).max(0.0))
        .collect()
}

/// Scanned peaks after `min_time` as (index, height), and the candidates the
/// automatic fit considers among them (height limits, bleedthrough and
/// overlap and the relative floor applied).
#[allow(clippy::type_complexity)]
fn candidates(
    ladder_trace: &[i16],
    other_traces: &[&[i16]],
    spec: &LadderSpec,
) -> Result<(Vec<(usize, f64)>, Vec<(usize, f64)>), LadderError> {
    let scanned = peaks::scan(ladder_trace, &spec.scanning)?;
    // Heights above the baseline: on a raw trace with a baseline offset every
    // noise maximum would otherwise clear `min_peak_height`.
    let above = above_baseline(ladder_trace);
    let height = |i: usize| above.get(i).copied().unwrap_or(0.0);
    let late: Vec<(usize, f64)> = scanned
        .iter()
        .filter(|p| p.index >= spec.min_time)
        .map(|p| (p.index, height(p.index)))
        .collect();
    let raw = |i: usize| ladder_trace.get(i).map_or(0.0, |&v| f64::from(v));
    let mut cands: Vec<(usize, f64)> = late
        .iter()
        .copied()
        .filter(|&(i, h)| h > spec.min_peak_height && raw(i) < spec.max_peak_height)
        .collect();
    if !spec.allow_bleedthrough {
        let others: Vec<Vec<f64>> = other_traces.iter().map(|t| above_baseline(t)).collect();
        cands.retain(|&(i, h)| others.iter().all(|o| o.get(i).is_none_or(|&v| h > v)));
    }
    let mut cands = remove_overlap(cands, spec.index_overlap);
    if let Some(level) = ladder_level(&cands, spec.base_sizes.len()) {
        cands.retain(|&(_, h)| h >= spec.min_relative_height * level);
    }
    Ok((late, cands))
}

/// The well's ladder height: the median height of its `n` tallest
/// candidates (all of them when fewer). A few tall non-ladder peaks (primer
/// tail, pull-up) do not move a median of `n`.
pub fn ladder_level(cands: &[(usize, f64)], n: usize) -> Option<f64> {
    let mut h: Vec<f64> = cands.iter().map(|&(_, h)| h).collect();
    h.sort_by(|a, b| b.total_cmp(a));
    h.truncate(n.max(1));
    median(&h)
}

/// The ladder peaks the automatic fit would consider, as (index, height above the baseline)
/// in index order: something to pick from when the fit fails.
pub fn ladder_candidates(
    ladder_trace: &[i16],
    other_traces: &[&[i16]],
    spec: &LadderSpec,
) -> Result<Vec<(usize, f64)>, LadderError> {
    Ok(candidates(ladder_trace, other_traces, spec)?.1)
}

/// Refits using exactly the given peaks (manual ladder calling). Each peak is
/// assigned a ladder size by the same alignment, but none may be skipped.
/// Few peaks are ambiguous; see [`refit_ladder_with_prior`].
pub fn refit_ladder(
    ladder_trace: &[i16],
    peak_indices: &[usize],
    spec: &LadderSpec,
) -> Result<LadderFit, LadderError> {
    refit_ladder_with_prior(ladder_trace, peak_indices, spec, None)
}

/// [`refit_ladder`], with the assignment also scored against where each size
/// is expected from other wells of the run.
pub fn refit_ladder_with_prior(
    ladder_trace: &[i16],
    peak_indices: &[usize],
    spec: &LadderSpec,
    prior: Option<&LadderPrior>,
) -> Result<LadderFit, LadderError> {
    spec.validate()?;
    let mut idx = peak_indices.to_vec();
    idx.sort_unstable();
    idx.dedup();
    if let Some(&bad) = idx.iter().find(|&&i| i >= ladder_trace.len()) {
        return Err(LadderError::IndexOutOfRange {
            index: bad,
            len: ladder_trace.len(),
        });
    }
    if idx.len() < MIN_FIT_PEAKS {
        return Err(LadderError::TooFewPeaks {
            found: idx.len(),
            needed: MIN_FIT_PEAKS,
        });
    }
    if idx.len() > spec.base_sizes.len() {
        return Err(LadderError::TooManyPeaks {
            found: idx.len(),
            ladder: spec.base_sizes.len(),
        });
    }
    let x: Vec<f64> = idx.iter().map(|&i| i as f64).collect();
    let node = |i: usize, j: usize| prior.map_or(0.0, |p| p.cost(x[i], j));
    let opts = AlignOpts {
        max_dx: 1,
        max_dy: spec.base_sizes.len(),
        keep_all_x: true,
        slope_sd: SLOPE_LOG_SD,
    };
    let best = align(&x, &spec.base_sizes, opts, &node, f64::INFINITY);
    if best.pairs.len() != idx.len() {
        // Cannot happen with at most as many peaks as sizes; kept as a guard.
        return Err(LadderError::TooFewPeaks {
            found: best.pairs.len(),
            needed: idx.len(),
        });
    }
    let rivals = rivals(&x, &spec.base_sizes, opts, &node, &best, idx.len());
    let sizes = best
        .pairs
        .iter()
        .map(|&(_, j)| spec.base_sizes[j])
        .collect();
    let mut fit = build_fit(idx, sizes, ladder_trace.len(), spec.base_size_precision);
    fit.set_rivals(&x, &rivals, &spec.base_sizes, prior.is_some());
    Ok(fit)
}

/// Fits from peaks whose ladder sizes the caller states. Every size must be
/// one of the spec's (within 0.005 bp) and sizes must increase with the index.
pub fn fit_assigned(
    trace_len: usize,
    peaks: &[(usize, f64)],
    spec: &LadderSpec,
) -> Result<LadderFit, LadderError> {
    spec.validate()?;
    let mut v = peaks.to_vec();
    v.sort_by_key(|&(i, _)| i);
    v.dedup_by_key(|p| p.0);
    let mut sizes = Vec::with_capacity(v.len());
    for &(index, size) in &v {
        let j =
            ladder_size_index(&spec.base_sizes, size).ok_or(LadderError::UnknownSize { size })?;
        sizes.push(spec.base_sizes[j]);
        if sizes.len() >= 2 && sizes[sizes.len() - 2] >= sizes[sizes.len() - 1] {
            return Err(LadderError::NotIncreasing { index, size });
        }
    }
    fit_from_pairs(
        trace_len,
        &v.iter().map(|&(i, _)| i).collect::<Vec<_>>(),
        &sizes,
        spec.base_size_precision,
    )
}

/// Rebuilds a fit from stored (index, size) pairs: both strictly increasing,
/// at least four, indices inside the trace.
pub fn fit_from_pairs(
    trace_len: usize,
    peak_indices: &[usize],
    peak_sizes: &[f64],
    precision: u32,
) -> Result<LadderFit, LadderError> {
    if peak_indices.len() != peak_sizes.len() || peak_indices.len() < MIN_FIT_PEAKS {
        return Err(LadderError::TooFewPeaks {
            found: peak_indices.len().min(peak_sizes.len()),
            needed: MIN_FIT_PEAKS,
        });
    }
    if let Some(&bad) = peak_indices.iter().find(|&&i| i >= trace_len) {
        return Err(LadderError::IndexOutOfRange {
            index: bad,
            len: trace_len,
        });
    }
    if let Some(k) = peak_sizes
        .iter()
        .position(|s| !(s.is_finite() && *s >= 0.0))
    {
        return Err(LadderError::InvalidSize {
            index: peak_indices[k],
            size: peak_sizes[k],
        });
    }
    for k in 1..peak_indices.len() {
        if peak_indices[k] <= peak_indices[k - 1] || peak_sizes[k] <= peak_sizes[k - 1] {
            return Err(LadderError::NotIncreasing {
                index: peak_indices[k],
                size: peak_sizes[k],
            });
        }
    }
    Ok(build_fit(
        peak_indices.to_vec(),
        peak_sizes.to_vec(),
        trace_len,
        precision,
    ))
}

/// Old `remove_peak_overlap`: walk adjacent pairs closer than `overlap` and drop the shorter.
fn remove_overlap(mut c: Vec<(usize, f64)>, overlap: usize) -> Vec<(usize, f64)> {
    c.sort_by_key(|&(i, _)| i);
    let mut k = 0;
    while k + 1 < c.len() {
        if c[k + 1].0 - c[k].0 < overlap {
            if c[k].1 > c[k + 1].1 {
                c.remove(k + 1);
            } else {
                c.remove(k);
            }
        } else {
            k += 1;
        }
    }
    c
}

/// Bounds of an alignment.
#[derive(Debug, Clone, Copy)]
struct AlignOpts {
    /// Largest step in `x` between consecutive matches (1 = no skipping).
    max_dx: usize,
    /// Largest step in `y` between consecutive matches.
    max_dy: usize,
    /// Every `x` must be matched, the first and last included.
    keep_all_x: bool,
    /// Standard deviation of the log ratio of consecutive slopes.
    slope_sd: f64,
}

/// An alignment and its total cost.
#[derive(Debug, Clone)]
struct Alignment {
    pairs: Vec<(usize, usize)>,
    cost: f64,
}

/// Aligns positions `x` (increasing) to sizes `y` (increasing). Returns matched
/// `(x index, y index)` pairs. `node(i, j)` is an extra cost for matching
/// `x[i]` to `y[j]` (a prior; zero for the automatic fit; infinite forbids).
/// Only alignments costing less than `bound` are considered (pruning).
fn align(
    x: &[f64],
    y: &[f64],
    opts: AlignOpts,
    node: &dyn Fn(usize, usize) -> f64,
    bound: f64,
) -> Alignment {
    let (p, l) = (x.len(), y.len());
    let none = Alignment {
        pairs: Vec::new(),
        cost: f64::INFINITY,
    };
    if p == 0 || l == 0 {
        return none;
    }
    let (gx, gy) = (opts.max_dx.max(1), opts.max_dy.max(1));
    let keep_all = opts.keep_all_x;
    let g = gx * gy;
    // cost[(i * l + j) * g + (dx-1) * gy + (dy-1)]: best cost of an alignment
    // whose last match is (i, j) and previous match is (i - dx, j - dy).
    let idx = |i: usize, j: usize, s: usize| (i * l + j) * g + s;
    let mut cost = vec![f64::INFINITY; p * l * g];
    // Back-pointer: previous step code, or usize::MAX when the previous match is the first.
    let mut back = vec![usize::MAX; p * l * g];
    // ln(slope) of the step that enters each state, cached for its successors.
    let mut entry_slope = vec![0.0; p * l * g];
    let first = |i: usize, j: usize| {
        if keep_all && i > 0 {
            f64::INFINITY
        } else {
            SPURIOUS_COST * i as f64 + MISSING_COST * j as f64
        }
    };
    let ln_slope =
        |i0: usize, j0: usize, i1: usize, j1: usize| ((y[j1] - y[j0]) / (x[i1] - x[i0])).ln();
    // Node costs once per pair; `live` marks pairs with any stored state.
    let nv: Vec<f64> = (0..p * l).map(|k| node(k / l, k % l)).collect();
    let mut live = vec![false; p * l];
    let mut best = (f64::INFINITY, None::<(usize, usize, usize)>);
    for i in 0..p {
        for j in 0..l {
            if nv[i * l + j] == f64::INFINITY {
                continue;
            }
            for dx in 1..=gx.min(i) {
                for dy in 1..=gy.min(j) {
                    let (pi, pj) = (i - dx, j - dy);
                    let step = SPURIOUS_COST * (dx - 1) as f64 + MISSING_COST * (dy - 1) as f64;
                    let mut c = first(pi, pj) + nv[pi * l + pj] + step;
                    if c >= bound && !live[pi * l + pj] {
                        continue;
                    }
                    let slope = ln_slope(pi, pj, i, j);
                    let mut from = usize::MAX;
                    for pdx in 1..=gx.min(pi) {
                        for pdy in 1..=gy.min(pj) {
                            let s = (pdx - 1) * gy + (pdy - 1);
                            let prev = cost[idx(pi, pj, s)];
                            if !prev.is_finite() {
                                continue;
                            }
                            let r = (slope - entry_slope[idx(pi, pj, s)]) / opts.slope_sd;
                            let cand = prev + step + r * r;
                            if cand < c {
                                c = cand;
                                from = s;
                            }
                        }
                    }
                    c += nv[i * l + j];
                    // Costs only grow along a path, so a state past the
                    // bound cannot lead to an alignment within it.
                    if c >= bound {
                        continue;
                    }
                    let s = (dx - 1) * gy + (dy - 1);
                    cost[idx(i, j, s)] = c;
                    entry_slope[idx(i, j, s)] = slope;
                    back[idx(i, j, s)] = from;
                    live[i * l + j] = true;
                    if keep_all && i + 1 < p {
                        continue;
                    }
                    let total =
                        c + SPURIOUS_COST * (p - 1 - i) as f64 + MISSING_COST * (l - 1 - j) as f64;
                    if total < best.0 {
                        best = (total, Some((i, j, s)));
                    }
                }
            }
        }
    }
    let Some((mut i, mut j, mut s)) = best.1 else {
        return none;
    };
    let mut out = vec![(i, j)];
    loop {
        let (dx, dy) = (s / gy + 1, s % gy + 1);
        let from = back[idx(i, j, s)];
        i -= dx;
        j -= dy;
        out.push((i, j));
        if from == usize::MAX {
            break;
        }
        s = from;
    }
    out.reverse();
    Alignment {
        pairs: out,
        cost: best.0,
    }
}

fn build_fit(
    peak_indices: Vec<usize>,
    peak_sizes: Vec<f64>,
    len: usize,
    precision: u32,
) -> LadderFit {
    let x: Vec<f64> = peak_indices.iter().map(|&i| i as f64).collect();
    let curve = Pchip::new(&x, &peak_sizes);
    let scale = 10f64.powi(precision.min(12) as i32);
    let base_sizes = curve
        .eval_grid(len)
        .into_iter()
        .map(|v| (v * scale).round() / scale)
        .collect();
    let [first, last] = end_errors(&x, &peak_sizes);
    LadderFit {
        sizing_quality: leave_one_out_max_error(&x, &peak_sizes)
            .max(first)
            .max(last),
        peak_indices,
        peak_sizes,
        base_sizes,
        ambiguity: None,
    }
}

impl LadderFit {
    /// Records the rival assignments (`pairs` into `x` positions and
    /// `sizes`), if any: the one giving the matched peaks the most different
    /// sizes is kept, and the quality raised to that difference.
    fn set_rivals(
        &mut self,
        x: &[f64],
        rivals: &[Vec<(usize, usize)>],
        sizes: &[f64],
        with_prior: bool,
    ) {
        for pairs in rivals {
            let rx: Vec<f64> = pairs.iter().map(|&(i, _)| x[i]).collect();
            let ry: Vec<f64> = pairs.iter().map(|&(_, j)| sizes[j]).collect();
            let curve = Pchip::new(&rx, &ry);
            let diff = self
                .peak_indices
                .iter()
                .zip(&self.peak_sizes)
                .map(|(&i, &s)| (curve.eval(i as f64) - s).abs())
                .fold(0.0, f64::max);
            if self
                .ambiguity
                .as_ref()
                .is_some_and(|a| a.size_difference >= diff)
            {
                continue;
            }
            self.sizing_quality = self.sizing_quality.max(diff);
            self.ambiguity = Some(Ambiguity {
                alternative_range: (ry[0], ry[ry.len() - 1]),
                size_difference: diff,
                with_prior,
            });
        }
    }
}

/// Error (bp) at the first and at the last point when each is predicted
/// from the three points next to it, by the quadratic through them. The
/// quadratic follows the curvature of migration near the ends of the run,
/// where a straight-line extrapolation would be off by tenths of a bp on a
/// clean ladder; a mis-assigned or displaced end peak is off by roughly its
/// displacement. Zero with fewer than four points.
fn end_errors(x: &[f64], y: &[f64]) -> [f64; 2] {
    let n = x.len();
    if n < 4 {
        return [0.0, 0.0];
    }
    let quad = |k: [usize; 3], t: f64| -> f64 {
        let mut v = 0.0;
        for a in 0..3 {
            let mut w = 1.0;
            for b in 0..3 {
                if a != b {
                    w *= (t - x[k[b]]) / (x[k[a]] - x[k[b]]);
                }
            }
            v += w * y[k[a]];
        }
        v
    };
    [
        (quad([1, 2, 3], x[0]) - y[0]).abs(),
        (quad([n - 2, n - 3, n - 4], x[n - 1]) - y[n - 1]).abs(),
    ]
}

/// Largest error at an interior point when it is left out of the interpolant.
fn leave_one_out_max_error(x: &[f64], y: &[f64]) -> f64 {
    let n = x.len();
    let mut worst: f64 = 0.0;
    let mut xs = Vec::with_capacity(n);
    let mut ys = Vec::with_capacity(n);
    for k in 1..n.saturating_sub(1) {
        xs.clear();
        ys.clear();
        for m in (0..n).filter(|&m| m != k) {
            xs.push(x[m]);
            ys.push(y[m]);
        }
        let err = (Pchip::new(&xs, &ys).eval(x[k]) - y[k]).abs();
        worst = worst.max(err);
    }
    worst
}

/// Monotone piecewise-cubic Hermite interpolant with linear extrapolation floored at 0.
struct Pchip {
    x: Vec<f64>,
    y: Vec<f64>,
    d: Vec<f64>,
}

impl Pchip {
    /// `x` strictly increasing, at least two points.
    fn new(x: &[f64], y: &[f64]) -> Self {
        let n = x.len();
        let h: Vec<f64> = x.windows(2).map(|w| w[1] - w[0]).collect();
        let delta: Vec<f64> = (0..n - 1).map(|k| (y[k + 1] - y[k]) / h[k]).collect();
        let mut d = vec![0.0; n];
        if n == 2 {
            d = vec![delta[0]; 2];
        } else {
            for k in 1..n - 1 {
                let (a, b) = (delta[k - 1], delta[k]);
                if a * b > 0.0 {
                    let w1 = 2.0 * h[k] + h[k - 1];
                    let w2 = h[k] + 2.0 * h[k - 1];
                    d[k] = (w1 + w2) / (w1 / a + w2 / b);
                }
            }
            d[0] = end_slope(h[0], h[1], delta[0], delta[1]);
            d[n - 1] = end_slope(h[n - 2], h[n - 3], delta[n - 2], delta[n - 3]);
        }
        Pchip {
            x: x.to_vec(),
            y: y.to_vec(),
            d,
        }
    }

    fn segment(&self, k: usize, t: f64) -> f64 {
        let h = self.x[k + 1] - self.x[k];
        let s = (t - self.x[k]) / h;
        let (s2, s3) = (s * s, s * s * s);
        let h00 = 2.0 * s3 - 3.0 * s2 + 1.0;
        let h10 = s3 - 2.0 * s2 + s;
        let h01 = -2.0 * s3 + 3.0 * s2;
        let h11 = s3 - s2;
        h00 * self.y[k] + h10 * h * self.d[k] + h01 * self.y[k + 1] + h11 * h * self.d[k + 1]
    }

    fn extrapolate(&self, t: f64) -> f64 {
        let n = self.x.len();
        let v = if t < self.x[0] {
            let slope = (self.y[1] - self.y[0]) / (self.x[1] - self.x[0]);
            self.y[0] + slope * (t - self.x[0])
        } else {
            let slope = (self.y[n - 1] - self.y[n - 2]) / (self.x[n - 1] - self.x[n - 2]);
            self.y[n - 1] + slope * (t - self.x[n - 1])
        };
        v.max(0.0)
    }

    fn eval(&self, t: f64) -> f64 {
        let n = self.x.len();
        if t < self.x[0] || t > self.x[n - 1] {
            return self.extrapolate(t);
        }
        let k = self.x.partition_point(|&v| v <= t).clamp(1, n - 1) - 1;
        self.segment(k, t)
    }

    /// Values at 0, 1, …, len-1 in one pass.
    fn eval_grid(&self, len: usize) -> Vec<f64> {
        let n = self.x.len();
        let mut k = 0;
        (0..len)
            .map(|i| {
                let t = i as f64;
                if t < self.x[0] || t > self.x[n - 1] {
                    return self.extrapolate(t);
                }
                while k + 2 < n && t > self.x[k + 1] {
                    k += 1;
                }
                self.segment(k, t)
            })
            .collect()
    }
}

/// scipy's one-sided three-point endpoint derivative with shape preservation.
fn end_slope(h0: f64, h1: f64, m0: f64, m1: f64) -> f64 {
    let d = ((2.0 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
    if d.signum() != m0.signum() {
        0.0
    } else if m0.signum() != m1.signum() && d.abs() > 3.0 * m0.abs() {
        3.0 * m0
    } else {
        d
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Data point of a fragment of `s` bp in a mildly non-linear run.
    fn pos(s: f64) -> f64 {
        1200.0 + 13.5 * s - 0.004 * s * s
    }

    fn trace_with(peaks: &[(f64, f64)], n: usize) -> Vec<i16> {
        let mut t = vec![30.0f64; n];
        for &(c, h) in peaks {
            let lo = (c - 30.0).max(0.0) as usize;
            let hi = ((c + 30.0) as usize).min(n - 1);
            for (i, v) in t.iter_mut().enumerate().take(hi + 1).skip(lo) {
                *v += h * (-(i as f64 - c).powi(2) / (2.0 * 16.0)).exp();
            }
        }
        t.into_iter().map(|v| v.round() as i16).collect()
    }

    fn ladder_peaks(skip: &[f64]) -> Vec<(f64, f64)> {
        HD400_SIZES
            .iter()
            .filter(|s| !skip.contains(s))
            .enumerate()
            .map(|(k, &s)| (pos(s), 800.0 + 100.0 * (k % 3) as f64))
            .collect()
    }

    fn assert_sizes_accurate(fit: &LadderFit) {
        for s in [55.0, 75.0, 133.0, 250.0, 333.3, 395.0] {
            let i = pos(s).round() as usize;
            let true_size = {
                // invert pos() at integer i
                let a = -0.004;
                let b = 13.5;
                let c = 1200.0 - i as f64;
                (-b + (b * b - 4.0 * a * c).sqrt()) / (2.0 * a)
            };
            assert!(
                (fit.base_sizes[i] - true_size).abs() < 0.25,
                "{s}: {} vs {}",
                fit.base_sizes[i],
                true_size
            );
        }
    }

    #[test]
    fn fits_clean_ladder() {
        let t = trace_with(&ladder_peaks(&[]), 8000);
        let spec = LadderSpec::default();
        let fit = fit_ladder(&t, &[], &spec).unwrap();
        assert_eq!(fit.peak_sizes, HD400_SIZES.to_vec());
        assert_eq!(fit.base_sizes.len(), 8000);
        assert!(fit.sizing_quality < 0.5, "{}", fit.sizing_quality);
        assert_eq!(fit.status(&spec), SizingStatus::Good);
        assert_sizes_accurate(&fit);
        assert!(fit.base_sizes.windows(2).all(|w| w[1] >= w[0]));
        assert!(fit.base_sizes[0] >= 0.0);
    }

    #[test]
    fn tolerates_missing_and_spurious_peaks() {
        let mut p = ladder_peaks(&[60.0, 240.0, 400.0]);
        // Junk: primer-region peak after min_time, pull-up between ladder peaks, late junk.
        p.extend([
            (1300.0, 3000.0),
            (pos(135.0), 1500.0),
            (pos(305.0), 400.0),
            (7600.0, 900.0),
        ]);
        let t = trace_with(&p, 8000);
        let fit = fit_ladder(&t, &[], &LadderSpec::default()).unwrap();
        let expect: Vec<f64> = HD400_SIZES
            .iter()
            .copied()
            .filter(|s| ![60.0, 240.0, 400.0].contains(s))
            .collect();
        assert_eq!(fit.peak_sizes, expect);
        assert_sizes_accurate(&fit);
        assert!(fit.sizing_quality < 1.0, "{}", fit.sizing_quality);
    }

    #[test]
    fn spurious_peaks_of_ladder_height_are_left_to_the_alignment() {
        let mut p = ladder_peaks(&[90.0]);
        for k in 0..8 {
            p.push((pos(52.0 + 43.0 * k as f64) + 3.0, 600.0));
        }
        let t = trace_with(&p, 8000);
        let fit = fit_ladder(&t, &[], &LadderSpec::default()).unwrap();
        let expect: Vec<f64> = HD400_SIZES.iter().copied().filter(|&s| s != 90.0).collect();
        assert_eq!(fit.peak_sizes, expect);
    }

    /// Index of `size` in a fit, if matched.
    fn index_of(fit: &LadderFit, size: f64) -> Option<usize> {
        let k = fit.peak_sizes.iter().position(|&s| s == size)?;
        Some(fit.peak_indices[k])
    }

    // A strong ladder with a weak parallel series 17 points early (crosstalk
    // from a neighbouring capillary, about 3.5% of the ladder) and more
    // candidates than the ladder has sizes: the series must not displace it.
    #[test]
    fn a_weak_parallel_series_does_not_displace_the_ladder() {
        let mut p: Vec<(f64, f64)> = HD400_SIZES
            .iter()
            .enumerate()
            .map(|(k, &s)| (pos(s), 6_500.0 + 100.0 * (k % 7) as f64))
            .collect();
        p.extend(HD400_SIZES.iter().map(|&s| (pos(s) - 17.0, 250.0)));
        let fit = fit_ladder(&trace_with(&p, 8000), &[], &LadderSpec::default()).unwrap();
        assert_eq!(fit.peak_sizes, HD400_SIZES.to_vec());
        for &s in &HD400_SIZES {
            let i = index_of(&fit, s).unwrap() as f64;
            assert!((i - pos(s)).abs() <= 1.0, "{s}: {i} vs {}", pos(s));
        }
        assert_sizes_accurate(&fit);
        assert_eq!(fit.status(&LadderSpec::default()), SizingStatus::Good);
    }

    // More junk than ladder: 25 weak peaks against a 21-peak ladder of
    // 2,000 RFU. Dropping the peaks farthest from the median height (the old
    // outlier removal) dropped the ladder and fitted the junk, starting late.
    #[test]
    fn junk_outnumbering_the_ladder_is_below_the_relative_floor() {
        let mut p: Vec<(f64, f64)> = HD400_SIZES.iter().map(|&s| (pos(s), 2_000.0)).collect();
        for k in 0..25 {
            p.push((pos(45.0 + 14.3 * k as f64) + 40.0, 300.0 + 7.0 * k as f64));
        }
        let fit = fit_ladder(&trace_with(&p, 8000), &[], &LadderSpec::default()).unwrap();
        assert_eq!(fit.peak_sizes, HD400_SIZES.to_vec());
        assert_eq!(index_of(&fit, 50.0), Some(pos(50.0).round() as usize));
        assert_sizes_accurate(&fit);
    }

    // A fragment at 30% of the ladder height is kept; one at 10% is below
    // the relative floor and the fit goes on without it.
    #[test]
    fn weak_fragments_are_kept_down_to_the_relative_floor() {
        let mut p: Vec<(f64, f64)> = HD400_SIZES.iter().map(|&s| (pos(s), 3_000.0)).collect();
        p[0].1 = 900.0; // 50 bp at 30%
        p[20].1 = 300.0; // 400 bp at 10%
        let spec = LadderSpec::default();
        let fit = fit_ladder(&trace_with(&p, 8000), &[], &spec).unwrap();
        assert_eq!(fit.peak_sizes.first(), Some(&50.0));
        assert_eq!(fit.peak_sizes.last(), Some(&380.0));
        assert_eq!(fit.status(&spec), SizingStatus::Good);
        assert_sizes_accurate(&fit);
        // With no relative floor the 10% fragment is matched too.
        let all = LadderSpec {
            min_relative_height: 0.0,
            ..LadderSpec::default()
        };
        let fit = fit_ladder(&trace_with(&p, 8000), &[], &all).unwrap();
        assert_eq!(fit.peak_sizes, HD400_SIZES.to_vec());
    }

    // Pull-up from an off-scale peak in another dye, three times the ladder
    // and 14 points (1.3 bp) after the 150 bp peak: kept as a candidate,
    // rejected by its spacing. Dropping the shorter of two peaks closer than
    // 15 points took the pull-up.
    #[test]
    fn pull_up_beside_a_ladder_peak_is_not_taken_for_it() {
        let mut p = ladder_peaks(&[]);
        p.push((pos(150.0) + 14.0, 2_700.0));
        let fit = fit_ladder(&trace_with(&p, 8000), &[], &LadderSpec::default()).unwrap();
        assert_eq!(fit.peak_sizes, HD400_SIZES.to_vec());
        assert_eq!(index_of(&fit, 150.0), Some(pos(150.0).round() as usize));
    }

    #[test]
    fn fails_clearly_without_a_ladder() {
        let spec = LadderSpec::default();
        let flat = vec![25i16; 8000];
        assert!(matches!(
            fit_ladder(&flat, &[], &spec),
            Err(LadderError::SignalTooLow { .. })
        ));
        let weak: Vec<(f64, f64)> = ladder_peaks(&[])
            .into_iter()
            .map(|(c, h)| (c, h / 10.0))
            .collect();
        assert!(matches!(
            fit_ladder(&trace_with(&weak, 8000), &[], &spec),
            Err(LadderError::SignalTooLow { .. })
        ));
        let few: Vec<(f64, f64)> = ladder_peaks(&[]).into_iter().take(8).collect();
        assert!(matches!(
            fit_ladder(&trace_with(&few, 8000), &[], &spec),
            Err(LadderError::TooFewPeaks { .. })
        ));
        assert!(fit_ladder(&[], &[], &spec).is_err());
        let bad = LadderSpec {
            base_sizes: vec![50.0, 40.0, 60.0, 70.0],
            ..LadderSpec::default()
        };
        assert!(matches!(
            fit_ladder(&flat, &[], &bad),
            Err(LadderError::InvalidSpec(_))
        ));
    }

    #[test]
    fn bleedthrough_removal_uses_other_dyes() {
        let mut p = ladder_peaks(&[]);
        p.push((pos(135.0), 1000.0));
        let t = trace_with(&p, 8000);
        let other = trace_with(&[(pos(135.0), 20_000.0)], 8000);
        let spec = LadderSpec {
            allow_bleedthrough: false,
            ..LadderSpec::default()
        };
        let fit = fit_ladder(&t, &[&other], &spec).unwrap();
        assert!(!fit.peak_indices.contains(&(pos(135.0).round() as usize)));
        assert_eq!(fit.peak_sizes.len(), 21);
    }

    #[test]
    fn manual_refit_uses_exact_peaks_and_detects_mistakes() {
        let t = trace_with(&ladder_peaks(&[]), 8000);
        let spec = LadderSpec::default();
        let auto = fit_ladder(&t, &[], &spec).unwrap();
        let same = refit_ladder(&t, &auto.peak_indices, &spec).unwrap();
        assert_eq!(same, auto);

        // Drop two peaks: still sized, sizes assigned correctly.
        let mut fewer = auto.peak_indices.clone();
        fewer.remove(5);
        fewer.remove(12);
        let fit = refit_ladder(&t, &fewer, &spec).unwrap();
        assert_eq!(fit.peak_indices, fewer);
        assert!(!fit.peak_sizes.contains(&150.0));
        assert_sizes_accurate(&fit);

        // Move one peak by 3 bp worth of data points: quality must flag it.
        let mut wrong = auto.peak_indices.clone();
        wrong[9] += 40;
        let fit = refit_ladder(&t, &wrong, &spec).unwrap();
        assert_eq!(fit.peak_indices, wrong);
        assert!(
            fit.sizing_quality > spec.sq_flag_limit,
            "{}",
            fit.sizing_quality
        );

        assert!(matches!(
            refit_ladder(&t, &[1, 2], &spec),
            Err(LadderError::TooFewPeaks { .. })
        ));
        assert!(matches!(
            refit_ladder(&t, &[1, 2, 3, 99_999], &spec),
            Err(LadderError::IndexOutOfRange { .. })
        ));
        let many: Vec<usize> = (0..30).map(|k| 1500 + 100 * k).collect();
        assert!(matches!(
            refit_ladder(&t, &many, &spec),
            Err(LadderError::TooManyPeaks { .. })
        ));
    }

    /// Indices of the given HD400 sizes in a clean trace's automatic fit.
    fn indices_of(fit: &LadderFit, sizes: &[f64]) -> Vec<usize> {
        sizes
            .iter()
            .map(|s| fit.peak_indices[fit.peak_sizes.iter().position(|v| v == s).unwrap()])
            .collect()
    }

    #[test]
    fn few_manual_peaks_use_the_plates_prior() {
        let spec = LadderSpec::default();
        let t = trace_with(&ladder_peaks(&[]), 8000);
        let auto = fit_ladder(&t, &[], &spec).unwrap();
        let low = [50.0, 60.0, 90.0, 100.0, 120.0];
        let picked = indices_of(&auto, &low);

        // Without a prior the spacing pattern also fits 260–400 bp; whichever
        // it picks, the fit is unusable because too few peaks are assigned.
        let free = refit_ladder(&t, &picked, &spec).unwrap();
        let a = free.assess(&spec);
        assert_eq!(a.status, SizingStatus::Unusable);
        assert!(a.reason.unwrap().contains("Only 5 of the ladder's 21"));

        // Other capillaries of the run migrate a little differently.
        let others: Vec<LadderFit> = [(25.0, 0.99), (-30.0, 1.015), (10.0, 1.005)]
            .iter()
            .map(|&(shift, stretch)| {
                let p: Vec<(f64, f64)> = HD400_SIZES
                    .iter()
                    .map(|&s| (shift + 1200.0 + (pos(s) - 1200.0) * stretch, 900.0))
                    .collect();
                fit_ladder(&trace_with(&p, 8000), &[], &spec).unwrap()
            })
            .collect();
        let prior = LadderPrior::from_fits(
            &spec,
            others
                .iter()
                .map(|f| (f.peak_indices.as_slice(), f.peak_sizes.as_slice())),
        )
        .unwrap();
        let fit = refit_ladder_with_prior(&t, &picked, &spec, Some(&prior)).unwrap();
        assert_eq!(fit.peak_sizes, low.to_vec());
        assert_eq!(fit.status(&spec), SizingStatus::Unusable);
        // With every peak the prior changes nothing.
        let all = refit_ladder_with_prior(&t, &auto.peak_indices, &spec, Some(&prior)).unwrap();
        assert_eq!(all, auto);
        // The high end with a prior is assigned high.
        let high = [260.0, 280.0, 340.0, 360.0, 400.0];
        let fit =
            refit_ladder_with_prior(&t, &indices_of(&auto, &high), &spec, Some(&prior)).unwrap();
        assert_eq!(fit.peak_sizes, high.to_vec());
    }

    #[test]
    fn prior_interpolates_sizes_no_well_matched() {
        let spec = LadderSpec::default();
        let idx: Vec<usize> = vec![1000, 1100, 1500, 1600];
        let sizes = vec![50.0, 60.0, 100.0, 120.0];
        let prior = LadderPrior::from_fits(&spec, [(idx.as_slice(), sizes.as_slice())]).unwrap();
        assert_eq!(prior.expected(0).unwrap().0, 1000.0);
        // 90 bp lies between 60 (1100) and 100 (1500).
        assert!((prior.expected(2).unwrap().0 - 1400.0).abs() < 1e-9);
        // 150 bp is extrapolated from 100 and 120 with a wider spread.
        let (c, sd) = prior.expected(5).unwrap();
        assert!((c - 1750.0).abs() < 1e-9);
        assert!(sd > prior.expected(4).unwrap().1);
        assert!(LadderPrior::from_fits(&spec, std::iter::empty()).is_none());
    }

    #[test]
    fn stated_sizes_are_validated_and_used() {
        let spec = LadderSpec::default();
        let t = trace_with(&ladder_peaks(&[]), 8000);
        let auto = fit_ladder(&t, &[], &spec).unwrap();
        let pairs: Vec<(usize, f64)> = auto
            .peak_indices
            .iter()
            .copied()
            .zip(auto.peak_sizes.iter().copied())
            .rev()
            .collect();
        assert_eq!(fit_assigned(t.len(), &pairs, &spec).unwrap(), auto);
        let low = [50.0, 60.0, 90.0, 100.0, 120.0];
        let few: Vec<(usize, f64)> = indices_of(&auto, &low)
            .into_iter()
            .zip(low.iter().map(|s| s + 0.004))
            .collect();
        let fit = fit_assigned(t.len(), &few, &spec).unwrap();
        assert_eq!(fit.peak_sizes, low.to_vec());
        assert!(matches!(
            fit_assigned(
                t.len(),
                &[(1, 50.0), (2, 61.0), (3, 90.0), (4, 100.0)],
                &spec
            ),
            Err(LadderError::UnknownSize { .. })
        ));
        assert!(matches!(
            fit_assigned(
                t.len(),
                &[(1, 60.0), (2, 50.0), (3, 90.0), (4, 100.0)],
                &spec
            ),
            Err(LadderError::NotIncreasing { .. })
        ));
        assert!(matches!(
            fit_assigned(t.len(), &[(1, 50.0), (2, 60.0), (3, 90.0)], &spec),
            Err(LadderError::TooFewPeaks { .. })
        ));
        assert!(matches!(
            fit_assigned(100, &[(1, 50.0), (2, 60.0), (3, 90.0), (400, 100.0)], &spec),
            Err(LadderError::IndexOutOfRange { .. })
        ));
    }

    #[test]
    fn assessment_and_coverage() {
        let spec = LadderSpec::default();
        let full = HD400_SIZES.to_vec();
        assert_eq!(spec.assess(0.2, &full).status, SizingStatus::Good);
        assert_eq!(spec.assess(0.2, &full).reason, None);
        let flagged = spec.assess(1.5, &full);
        assert_eq!(flagged.status, SizingStatus::Flagged);
        assert!(flagged.reason.unwrap().contains("1.50 bp"));
        assert_eq!(spec.assess(4.0, &full).status, SizingStatus::Unusable);
        assert_eq!(spec.assess(f64::NAN, &full).status, SizingStatus::Unusable);
        // 16 of 21 is enough at the default of 5 missing; 15 is not.
        assert_eq!(spec.assess(0.2, &full[..16]).status, SizingStatus::Good);
        assert_eq!(spec.assess(0.2, &full[..15]).status, SizingStatus::Unusable);

        // Past the ladder's own ends: open (same for every well).
        assert!(spec.covers(&full, 70.0, 135.0));
        assert!(spec.covers(&full, 30.0, 450.0));
        // A well missing the outer peaks covers only its matched range ± 5 bp.
        let inner = &full[2..19]; // 90–360 bp
        assert!(spec.covers(inner, 86.0, 364.0));
        assert!(!spec.covers(inner, 70.0, 135.0));
        assert!(!spec.covers(inner, 300.0, 380.0));
        assert!(!spec.covers(&full[..8], 150.0, 200.0));
        assert!(!spec.covers(&[], 150.0, 200.0));
    }

    /// Trace with a peak of 900 RFU at `place(s)` for every size `s`.
    fn trace_at(sizes: &[f64], place: impl Fn(f64) -> f64, n: usize) -> Vec<i16> {
        let p: Vec<(f64, f64)> = sizes.iter().map(|&s| (place(s), 900.0)).collect();
        trace_with(&p, n)
    }

    /// Largest sizing error (bp) between `lo` and `hi` bp of a fit to a run
    /// placed by `pos`.
    fn worst_error(fit: &LadderFit, lo: f64, hi: f64) -> f64 {
        let mut worst: f64 = 0.0;
        let mut s = lo;
        while s <= hi {
            worst = worst.max((fit.base_sizes[pos(s).round() as usize] - s).abs());
            s += 1.0;
        }
        worst
    }

    // Defect A: a hand-picked end peak 4 bp off was silently dropped by the
    // alignment and the refit failed.
    #[test]
    fn manual_refit_keeps_a_displaced_end_peak() {
        let spec = LadderSpec::default();
        for (k, shift) in [(0, -52.0), (20, 40.0)] {
            let mut p = ladder_peaks(&[]);
            p[k].0 += shift;
            let t = trace_with(&p, 8000);
            let picked: Vec<usize> = p.iter().map(|&(c, _)| c.round() as usize).collect();
            let fit = refit_ladder(&t, &picked, &spec).unwrap();
            assert_eq!(fit.peak_indices, picked);
            assert_eq!(fit.peak_sizes, HD400_SIZES.to_vec());
            // The bad end peak shows in the quality: ~4 bp at 50, ~3.8 at 400.
            assert!(fit.sizing_quality > 3.0, "{}", fit.sizing_quality);
            assert_eq!(fit.status(&spec), SizingStatus::Unusable);
        }
    }

    // Defect B: a spurious peak 2 bp from a missing end peak was matched to
    // it, and leave-one-out never looked at end peaks.
    #[test]
    fn unsupported_end_peaks_are_not_matched() {
        let spec = LadderSpec::default();
        // 400 bp missing, junk at 398 bp.
        let mut p = ladder_peaks(&[400.0]);
        p.push((pos(398.0), 900.0));
        let fit = fit_ladder(&trace_with(&p, 8000), &[], &spec).unwrap();
        assert_eq!(fit.peak_sizes.last(), Some(&380.0), "{:?}", fit.peak_sizes);
        assert_eq!(fit.status(&spec), SizingStatus::Good);
        assert!(worst_error(&fit, 50.0, 385.0) < 0.25);
        // A locus at 415–430 bp is no longer counted as sized.
        assert!(!spec.covers(&fit.peak_sizes, 415.0, 430.0));

        // 50 bp missing, the 60 bp peak displaced by -3.5 bp.
        let mut p = ladder_peaks(&[50.0]);
        p[0].0 = pos(56.5);
        let fit = fit_ladder(&trace_with(&p, 8000), &[], &spec).unwrap();
        assert_eq!(fit.peak_sizes.first(), Some(&90.0), "{:?}", fit.peak_sizes);
        assert_eq!(fit.status(&spec), SizingStatus::Good);
        assert!(worst_error(&fit, 90.0, 400.0) < 0.25);
        assert!(!spec.covers(&fit.peak_sizes, 55.0, 70.0));

        // Kept by hand, the same peak makes the fit unusable.
        let picked: Vec<usize> = p.iter().map(|&(c, _)| c.round() as usize).collect();
        let fit = refit_ladder(&t_of(&p), &picked, &spec).unwrap();
        assert_eq!(fit.peak_sizes.first(), Some(&60.0));
        assert!(fit.sizing_quality > 3.0, "{}", fit.sizing_quality);
    }

    fn t_of(p: &[(f64, f64)]) -> Vec<i16> {
        trace_with(p, 8000)
    }

    #[test]
    fn end_check_does_not_flag_clean_curved_ladders() {
        // Strong curvature at both ends of the run.
        let spec = LadderSpec::default();
        let place = |s: f64| 1300.0 + 15.0 * s - 0.012 * s * s;
        let fit = fit_ladder(&trace_at(&HD400_SIZES, place, 8000), &[], &spec).unwrap();
        assert_eq!(fit.peak_sizes, HD400_SIZES.to_vec());
        assert!(fit.sizing_quality < 0.5, "{}", fit.sizing_quality);
        assert!(fit.ambiguity.is_none());
    }

    const UNIFORM: [f64; 10] = [
        50.0, 100.0, 150.0, 200.0, 250.0, 300.0, 350.0, 400.0, 450.0, 500.0,
    ];

    const GS600: [f64; 36] = [
        20.0, 40.0, 60.0, 80.0, 100.0, 114.0, 120.0, 140.0, 160.0, 180.0, 200.0, 214.0, 220.0,
        240.0, 250.0, 260.0, 280.0, 300.0, 314.0, 320.0, 340.0, 360.0, 380.0, 400.0, 414.0, 420.0,
        440.0, 460.0, 480.0, 500.0, 514.0, 520.0, 540.0, 560.0, 580.0, 600.0,
    ];

    fn uniform_spec() -> LadderSpec {
        LadderSpec {
            base_sizes: UNIFORM.to_vec(),
            ..LadderSpec::default()
        }
    }

    fn gs600_spec() -> LadderSpec {
        LadderSpec {
            base_sizes: GS600.to_vec(),
            maximum_missing_peak_count: 8,
            min_time: 1000,
            ..LadderSpec::default()
        }
    }

    fn without(sizes: &[f64], drop: &[f64]) -> Vec<f64> {
        sizes
            .iter()
            .copied()
            .filter(|s| !drop.contains(s))
            .collect()
    }

    // Defect C, one well alone: the trace cannot tell 50–450 from 100–500.
    #[test]
    fn periodic_ladder_missing_its_first_peak_is_ambiguous_alone() {
        let spec = uniform_spec();
        let t = trace_at(&without(&UNIFORM, &[50.0]), |s| 1200.0 + 12.0 * s, 8000);
        let fit = fit_ladder(&t, &[], &spec).unwrap();
        let amb = fit.ambiguity.clone().expect("ambiguous");
        assert!(!amb.with_prior);
        assert!((amb.size_difference - 50.0).abs() < 1.0, "{amb:?}");
        let a = fit.assess(&spec);
        assert_eq!(a.status, SizingStatus::Unusable);
        let reason = a.reason.unwrap();
        assert!(
            reason.contains("ambiguous") && reason.contains("no other well"),
            "{reason}"
        );
        assert!(!fit.is_reference(&spec));
        // Alone on its plate there is nothing to settle it with.
        let mut plate = vec![Ok::<_, LadderError>(fit.clone())];
        assert!(resolve_with_plate(&spec, &mut plate, |_, _| unreachable!()).is_empty());
        assert_eq!(plate[0].as_ref().unwrap(), &fit);
        // A complete uniform ladder is not ambiguous.
        let full =
            fit_ladder(&trace_at(&UNIFORM, |s| 1200.0 + 12.0 * s, 8000), &[], &spec).unwrap();
        assert!(full.ambiguity.is_none());
        assert_eq!(full.status(&spec), SizingStatus::Good);
    }

    #[test]
    fn gs600_missing_its_early_peaks_is_not_good_alone() {
        let spec = gs600_spec();
        let missing = [20.0, 40.0, 60.0, 80.0, 100.0, 114.0, 250.0];
        let place = |s: f64| 1200.0 + 13.5 * s - 0.004 * s * s;
        let fit = fit_ladder(
            &trace_at(&without(&GS600, &missing), place, 9500),
            &[],
            &spec,
        )
        .unwrap();
        assert_ne!(
            fit.status(&spec),
            SizingStatus::Good,
            "{:?}",
            fit.peak_sizes
        );
        assert!(fit.ambiguity.is_some());
        // With 250 bp present the irregular spacing settles it.
        let fit = fit_ladder(
            &trace_at(&without(&GS600, &missing[..6]), place, 9500),
            &[],
            &spec,
        )
        .unwrap();
        assert!(fit.ambiguity.is_none(), "{:?}", fit.ambiguity);
        assert_eq!(fit.peak_sizes.first(), Some(&120.0));
        assert_eq!(fit.status(&spec), SizingStatus::Good);
    }

    /// Capillary `k` of a plate: slightly different offset and speed.
    fn capillary(k: usize, place: impl Fn(f64) -> f64) -> impl Fn(f64) -> f64 {
        let offset = [0.0, 30.0, -25.0, 12.0, -40.0, 22.0, -8.0, 35.0, -18.0][k % 9];
        let stretch = [1.0, 1.012, 0.99, 1.004, 0.985, 1.015, 0.996, 1.008, 0.992][k % 9];
        move |s| offset + 1200.0 + (place(s) - 1200.0) * stretch
    }

    /// Fits a plate the way the engine does: every well alone, then the
    /// ambiguous ones against the plate's consensus.
    fn fit_plate(traces: &[Vec<i16>], spec: &LadderSpec) -> Vec<Result<LadderFit, LadderError>> {
        let mut fits: Vec<_> = traces.iter().map(|t| fit_ladder(t, &[], spec)).collect();
        resolve_with_plate(spec, &mut fits, |k, prior| {
            fit_ladder_with_prior(&traces[k], &[], spec, Some(prior))
        });
        fits
    }

    #[test]
    fn plate_consensus_settles_an_ambiguous_well() {
        let spec = uniform_spec();
        let line = |s: f64| 1200.0 + 12.0 * s;
        let mut traces: Vec<Vec<i16>> = (0..4)
            .map(|k| trace_at(&UNIFORM, capillary(k, line), 8000))
            .collect();
        traces.push(trace_at(
            &without(&UNIFORM, &[50.0]),
            capillary(4, line),
            8000,
        ));
        let fits = fit_plate(&traces, &spec);
        let fit = fits[4].as_ref().unwrap();
        assert_eq!(fit.peak_sizes, UNIFORM[1..].to_vec());
        assert!(fit.ambiguity.is_none());
        assert_eq!(fit.status(&spec), SizingStatus::Good);
        // The same through the single-well entry point.
        let prior = LadderPrior::from_plate(&spec, fits[..4].iter().flatten()).unwrap();
        let alone = fit_ladder_in_plate(&traces[4], &[], &spec, Some(&prior)).unwrap();
        assert_eq!(&alone, fit);
    }

    #[test]
    fn plate_consensus_from_a_minority_of_complete_wells() {
        let spec = gs600_spec();
        let quad = |s: f64| 1200.0 + 13.5 * s - 0.004 * s * s;
        let missing = [20.0, 40.0, 60.0, 80.0, 100.0, 114.0, 250.0];
        // Two complete wells, seven missing their early peaks.
        let traces: Vec<Vec<i16>> = (0..9)
            .map(|k| {
                let sizes = if k < 2 {
                    GS600.to_vec()
                } else {
                    without(&GS600, &missing)
                };
                trace_at(&sizes, capillary(k, quad), 9500)
            })
            .collect();
        let alone: Vec<_> = traces.iter().map(|t| fit_ladder(t, &[], &spec)).collect();
        assert!(alone[2..]
            .iter()
            .all(|f| f.as_ref().unwrap().status(&spec) != SizingStatus::Good));
        let fits = fit_plate(&traces, &spec);
        for (k, f) in fits.iter().enumerate() {
            let f = f.as_ref().unwrap();
            assert_eq!(
                f.status(&spec),
                SizingStatus::Good,
                "well {k}: {:?}",
                f.assess(&spec)
            );
            let first = if k < 2 { 20.0 } else { 120.0 };
            assert_eq!(f.peak_sizes.first(), Some(&first), "well {k}");
            assert_eq!(f.peak_sizes.last(), Some(&600.0), "well {k}");
        }
    }

    /// Capillary `k` of an HD400 plate, 2,000 RFU peaks; `edit` may move,
    /// weaken or drop the peak of each size (given its place and height).
    fn hd400_well(k: usize, edit: impl Fn(f64, (f64, f64)) -> Option<(f64, f64)>) -> Vec<i16> {
        let place = capillary(k, pos);
        let p: Vec<(f64, f64)> = HD400_SIZES
            .iter()
            .filter_map(|&s| edit(s, (place(s), 2_000.0)))
            .collect();
        trace_with(&p, 8000)
    }

    /// Largest |base size − true size| of capillary `k` between `lo` and `hi` bp.
    fn capillary_error(fit: &LadderFit, k: usize, lo: f64, hi: f64) -> f64 {
        let place = capillary(k, pos);
        let mut worst: f64 = 0.0;
        let mut s = lo;
        while s <= hi {
            let x = place(s);
            let i = x.floor() as usize;
            let t = x - i as f64;
            let got = fit.base_sizes[i] * (1.0 - t) + fit.base_sizes[i + 1] * t;
            worst = worst.max((got - s).abs());
            s += 0.5;
        }
        worst
    }

    #[test]
    fn plate_error_measures_a_peak_against_the_plate() {
        let spec = LadderSpec::default();
        let fits: Vec<LadderFit> = (0..4)
            .map(|k| fit_ladder(&hd400_well(k, |_, p| Some(p)), &[], &spec).unwrap())
            .collect();
        let prior = LadderPrior::from_plate(&spec, &fits).unwrap();
        let clean = fit_ladder(&hd400_well(5, |_, p| Some(p)), &[], &spec).unwrap();
        assert!(
            prior.fit_error(&clean, &spec) < 0.1,
            "{}",
            prior.fit_error(&clean, &spec)
        );
        // 150 bp moved by 10 points, about 0.95 bp at 10.6 points per bp.
        let mut moved = clean.clone();
        let k = moved.peak_sizes.iter().position(|&s| s == 150.0).unwrap();
        moved.peak_indices[k] += 10;
        let e = prior.fit_error(&moved, &spec);
        assert!((0.8..1.1).contains(&e), "{e}");
    }

    // One fragment ran 2 bp slow in one capillary, at half height. Alone the
    // well is not good (its leave-one-out error is about 2 bp); the plate
    // shows the fragment, not the capillary, is off, and the refit leaves
    // it out.
    #[test]
    fn plate_drops_a_fragment_that_ran_anomalously() {
        let spec = LadderSpec::default();
        let place = capillary(7, pos);
        let mut traces: Vec<Vec<i16>> = (0..7).map(|k| hd400_well(k, |_, p| Some(p))).collect();
        traces.push(hd400_well(7, |s, p| {
            Some(if s == 260.0 {
                (place(262.0), 1_000.0)
            } else {
                p
            })
        }));
        let alone = fit_ladder(&traces[7], &[], &spec).unwrap();
        assert!(alone.peak_sizes.contains(&260.0));
        assert!(
            alone.sizing_quality > spec.sq_flag_limit,
            "{}",
            alone.sizing_quality
        );
        let fits = fit_plate(&traces, &spec);
        let fit = fits[7].as_ref().unwrap();
        assert!(!fit.peak_sizes.contains(&260.0), "{:?}", fit.peak_sizes);
        assert_eq!(fit.peak_sizes.len(), 20);
        assert_eq!(
            fit.status(&spec),
            SizingStatus::Good,
            "{}",
            fit.sizing_quality
        );
        assert!(capillary_error(fit, 7, 240.0, 280.0) < 0.3);
        // The other wells are untouched.
        for f in &fits[..7] {
            assert_eq!(f.as_ref().unwrap().peak_sizes, HD400_SIZES.to_vec());
        }
    }

    // Two fragments 1.5 bp off in one capillary. A refit that agrees with
    // the plate must leave out both, more than a refit may change, so the
    // fit alone is kept, with its disagreement in its quality: not good.
    #[test]
    fn a_well_that_disagrees_with_its_plate_is_not_good() {
        let spec = LadderSpec::default();
        let place = capillary(6, pos);
        let mut traces: Vec<Vec<i16>> = (0..6).map(|k| hd400_well(k, |_, p| Some(p))).collect();
        traces.push(hd400_well(6, |s, p| {
            Some(match s {
                200.0 => (place(201.5), p.1),
                320.0 => (place(318.5), p.1),
                _ => p,
            })
        }));
        let alone = fit_ladder(&traces[6], &[], &spec).unwrap();
        assert_eq!(alone.peak_sizes, HD400_SIZES.to_vec());
        let fits = fit_plate(&traces, &spec);
        let fit = fits[6].as_ref().unwrap();
        assert_eq!(fit.peak_sizes, HD400_SIZES.to_vec());
        assert!(fit.sizing_quality >= alone.sizing_quality);
        assert!(
            fit.sizing_quality > spec.sq_flag_limit,
            "{}",
            fit.sizing_quality
        );
        assert_ne!(fit.status(&spec), SizingStatus::Good);
    }

    #[test]
    fn plate_that_cannot_settle_it_says_so() {
        // Every well misses 50 bp: there is no unambiguous reference.
        let spec = uniform_spec();
        let line = |s: f64| 1200.0 + 12.0 * s;
        let traces: Vec<Vec<i16>> = (0..4)
            .map(|k| trace_at(&without(&UNIFORM, &[50.0]), capillary(k, line), 8000))
            .collect();
        for f in fit_plate(&traces, &spec) {
            let a = f.unwrap().assess(&spec);
            assert_eq!(a.status, SizingStatus::Unusable);
            assert!(a.reason.unwrap().contains("ambiguous"));
        }
    }

    // Defect D.
    #[test]
    fn stored_pairs_must_have_valid_sizes() {
        for sizes in [
            [f64::NEG_INFINITY, 60.0, 90.0, 100.0],
            [f64::NAN, 60.0, 90.0, 100.0],
            [-5.0, 60.0, 90.0, 100.0],
            [50.0, 60.0, f64::INFINITY, 100.0],
        ] {
            assert!(
                matches!(
                    fit_from_pairs(1000, &[10, 20, 30, 40], &sizes, 2),
                    Err(LadderError::InvalidSize { .. })
                ),
                "{sizes:?}"
            );
        }
        assert!(fit_from_pairs(1000, &[10, 20, 30, 40], &[0.0, 60.0, 90.0, 100.0], 2).is_ok());
    }

    #[test]
    fn candidates_are_offered_when_the_fit_fails() {
        let spec = LadderSpec::default();
        let few: Vec<(f64, f64)> = ladder_peaks(&[]).into_iter().take(8).collect();
        let t = trace_with(&few, 8000);
        assert!(fit_ladder(&t, &[], &spec).is_err());
        let c = ladder_candidates(&t, &[], &spec).unwrap();
        assert_eq!(c.len(), 8);
        assert!(c.windows(2).all(|w| w[0].0 < w[1].0));
        assert!((c[0].0 as f64 - pos(50.0)).abs() <= 1.0);
    }

    #[test]
    fn extrapolation_is_linear_and_floored() {
        let x = [100.0, 200.0, 300.0, 400.0];
        let y = [50.0, 60.0, 72.0, 80.0];
        let c = Pchip::new(&x, &y);
        assert!((c.eval(0.0) - 40.0).abs() < 1e-9);
        assert!((c.eval(500.0) - 88.0).abs() < 1e-9);
        assert_eq!(c.eval(-10_000.0), 0.0);
        for (a, b) in x.iter().zip(&y) {
            assert!((c.eval(*a) - b).abs() < 1e-9);
        }
        let grid = c.eval_grid(500);
        for (i, g) in grid.iter().enumerate() {
            assert!((g - c.eval(i as f64)).abs() < 1e-9);
        }
    }

    #[test]
    fn pchip_matches_scipy() {
        // uv run --with scipy python: PchipInterpolator(x, y)(t)
        let x = [0.0, 1.0, 3.0, 4.0, 7.0];
        let y = [0.0, 2.0, 3.0, 7.0, 8.0];
        let c = Pchip::new(&x, &y);
        let expect = [
            (0.5, 1.205_357_142_857_142_8),
            (2.0, 2.471_042_471_042_471),
            (3.5, 5.032_069_382_815_652),
            (6.0, 7.899_944_720_840_243),
        ];
        for (t, e) in expect {
            assert!((c.eval(t) - e).abs() < 1e-9, "{t}: {} vs {e}", c.eval(t));
        }
    }
}
