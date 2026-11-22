//! Amplification-bias estimation and correction of within-sample allele
//! proportions.
//!
//! PCR favours shorter fragments, so a peak's share of the signal overstates
//! short alleles. The model is that each allele's signal is its true share
//! times an exponential in fragment size,
//!
//! ```text
//! h_i ∝ p_i · exp(γ · s_i)
//! ```
//!
//! for every called peak `i` of one sample at one locus, where `h =
//! max(1, height − artifact_contribution)` and `observed_i = h_i / Σ h`. Taking
//! centered log-ratios (`clr(x)_i = ln x_i − mean_j ln x_j`, over the peaks of
//! the set) removes the unknown normalizing constant:
//!
//! ```text
//! clr(observed)_i − clr(true)_i = γ · (s_i − s̄)
//! ```
//!
//! with `s̄` the unweighted mean size of the same peaks. β is reported as
//! `2γ`, the scale the previous MicroSPAT used: for two alleles
//! `logit(observed_1) − logit(true_1) = 2γ · (s_1 − s̄) = β · (s_1 − s̄)`.
//!
//! **Estimation** ([`estimate_beta`]): least squares through the origin of
//! `y_i = 2 · (clr(observed)_i − clr(true)_i)` on `x_i = s_i − s̄`, pooled
//! over the qualifying control runs; the slope is β, and SD (root mean
//! squared residual) is on the same doubled scale. Each run's set is its
//! counted control peaks ([`control_points`]); `s̄` is the mean over them,
//! one term per peak, so an allele that several controls of a mixture share
//! (their proportions add up on its one peak) counts once.
//!
//! **Correction** ([`quantify`]): the exact inverse for any number of peaks,
//! `corrected_i ∝ observed_i · exp(−(β/2) · s_i)`, normalized to sum to 1.
//!
//! **Change from the previous MicroSPAT.** It regressed the per-peak
//! log-odds error `logit(observed_i) − logit(true_i)` and corrected each peak
//! by `logit(observed_i) − β · (s_i − s̄)` before renormalizing. For two
//! alleles that is algebraically the same as the above, and results (β, SD,
//! R², the per-point values and corrected proportions) are unchanged. For
//! three or more alleles the per-peak log-odds form is not the model's: the
//! estimate came out K-dependent (three equal controls at 100/140/200 bp
//! with γ = −0.01 gave β = −0.0146 instead of −0.02) and correction
//! overcorrected by about `2(K−1)/K` (a 70/10/10/10 mixture came back as
//! 0.703/0.072/0.085/0.141). Results for three or more alleles therefore
//! differ from the previous version.

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::stats::{self, StatsError};
use crate::types::Peak;

/// Errors from bias estimation.
#[derive(Debug, Error, Clone, PartialEq)]
pub enum QuantBiasError {
    /// A numerical routine rejected its input.
    #[error(transparent)]
    Stats(#[from] StatsError),
}

/// Bias estimation settings (old `QuantificationBiasEstimatorLocusParams`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(default)]
pub struct QuantBiasParams {
    /// Peaks at or below this height (RFU) are left out of estimation.
    pub min_peak_height: f64,
    /// Minimum proportion an allele must contribute to be used: peaks with
    /// true proportion outside `[min, 1 − min]` (inclusive, so a 75/25
    /// mixture counts at 0.25) are left out.
    pub min_true_proportion: f64,
    /// A control run with a true peak above this height (RFU) is left out:
    /// saturated peaks do not reflect template proportions.
    pub offscale_threshold: f64,
}

impl Default for QuantBiasParams {
    fn default() -> Self {
        QuantBiasParams {
            min_peak_height: 1000.0,
            min_true_proportion: 0.25,
            offscale_threshold: 32000.0,
        }
    }
}

/// Estimated bias factor for a locus.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct BiasEstimate {
    /// Twice the model's γ: for two alleles, the change in log-odds of the
    /// observed proportion per bp above the center (module docs).
    pub beta: f64,
    /// Root mean squared residual, on the log-odds scale of `beta`.
    pub sd: f64,
    /// Coefficient of determination of the fit.
    pub r_squared: f64,
    /// Number of peaks used.
    pub n_peaks: u32,
    /// Number of control runs used.
    pub n_sets: u32,
}

/// Marks the known composition of a control mixture on one run's peaks:
/// every peak gets `true_proportion = Some(0)`, then each `(bin_id, proportion)`
/// adds its proportion to the peak inside that bin (`in_bin`; a peak merely
/// near the bin is not the allele, as in calling). Controls that share an
/// allele add up on the same peak. Components whose bin has no peak are skipped.
pub fn assign_true_proportions(peaks: &mut [Peak], components: &[(i64, f64)]) {
    for p in peaks.iter_mut() {
        p.true_proportion = Some(0.0);
    }
    for &(bin_id, proportion) in components {
        if let Some(p) = peaks
            .iter_mut()
            .filter(|p| p.in_bin && p.bin_id == Some(bin_id))
            .max_by(|a, b| a.height.total_cmp(&b.height))
        {
            p.true_proportion = Some(p.true_proportion.unwrap_or(0.0) + proportion);
        }
    }
}

fn signal(p: &Peak) -> f64 {
    (p.height - p.artifact_contribution).max(1.0)
}

#[cfg(test)]
fn logit(p: f64) -> f64 {
    (p / (1.0 - p)).ln()
}

/// Why a control peak (true proportion > 0) was left out of the β fit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "snake_case")]
pub enum ControlPeakExclusion {
    /// Its true proportion is below `min_true_proportion`.
    BelowMinTrueProportion,
    /// Its height is at or below `min_peak_height`.
    BelowMinHeight,
    /// Part of the mixture is on no peak of the run: a control has no allele
    /// at the locus, or no peak in its allele's bin. The run is left out.
    ControlAlleleNotFound,
    /// A counted control peak of the run is above `offscale_threshold`. The
    /// run is left out.
    OffScale,
    /// Fewer than two control peaks of the run pass the height and proportion
    /// limits. The run is left out.
    SinglePeakSet,
    /// Another control peak of the run was left out (too low, or its share
    /// below the minimum), so the counted peaks do not add up to the whole
    /// mixture. The run is left out.
    PartnerExcluded,
    /// Its true proportion is above `1 − min_true_proportion` (or is 1).
    AboveMaxTrueProportion,
}

/// One control peak of a run as the β fit sees it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ControlPoint {
    /// Index of the peak in the run's slice.
    pub peak: usize,
    /// Size minus the mean size of the run's counted peaks (the fit's x).
    /// For a run that is left out, the mean is over its control peaks.
    pub centered_size: f64,
    /// Share of the counted signal (height minus expected artifact); for a
    /// run that is left out, of its control peaks' signal.
    pub observed_proportion: f64,
    /// The fit's y: `2 · (clr(observed) − clr(true))` over the same peaks as
    /// `centered_size` (module docs). For two peaks this is `logit(observed)
    /// − logit(true)`. `None` when fewer than two peaks form the set.
    pub log_odds_error: Option<f64>,
    /// `None` when the point entered the fit.
    pub exclusion: Option<ControlPeakExclusion>,
}

/// Every control peak (`true_proportion > 0`) of one run with whether, and
/// why not, it enters the β fit. This is the rule [`estimate_beta`] applies;
/// views that explain a fit call it rather than restate it.
///
/// A peak counts when its true proportion is above 0 and at least
/// `min_true_proportion` (inclusive) and its height is above
/// `min_peak_height`. The run qualifies when at least two peaks count, their true proportions sum to 1 (±1e-4) and
/// none is above `offscale_threshold`. A counted peak of a qualifying run is
/// used when its true proportion is at most `1 − min_true_proportion` and
/// strictly between 0 and 1.
pub fn control_points(run: &[Peak], params: &QuantBiasParams) -> Vec<ControlPoint> {
    // Inclusive bound with a little slack: control proportions are entered as
    // decimals (0.25) or derived from sums (0.1 + 0.15), and a share exactly
    // at the documented minimum must count.
    let min = params.min_true_proportion - PROPORTION_EPS;
    // A control peak needs a share of the mixture whatever the minimum is: at
    // `min_true_proportion = 0` stutter and noise peaks (true proportion 0)
    // would otherwise enter the signal total and the size center.
    let counts = |p: &Peak| {
        p.true_proportion.is_some_and(|t| t > 0.0 && t >= min) && p.height > params.min_peak_height
    };
    let set: Vec<&Peak> = run.iter().filter(|p| counts(p)).collect();
    let total_true: f64 = set.iter().filter_map(|p| p.true_proportion).sum();
    let all_true: f64 = run.iter().filter_map(|p| p.true_proportion).sum();
    let offscale = set
        .iter()
        .any(|p| p.saturation_height() > params.offscale_threshold);
    // Root cause first: a missing allele makes every other check moot.
    let run_exclusion = if all_true < 1.0 - 1e-4 {
        Some(ControlPeakExclusion::ControlAlleleNotFound)
    } else if offscale {
        Some(ControlPeakExclusion::OffScale)
    } else if set.len() < 2 {
        Some(ControlPeakExclusion::SinglePeakSet)
    } else if (total_true - 1.0).abs() >= 1e-4 {
        Some(ControlPeakExclusion::PartnerExcluded)
    } else {
        None
    };
    let is_control = |p: &Peak| p.true_proportion.is_some_and(|t| t > 0.0);
    let basis: Vec<&Peak> = if run_exclusion.is_none() {
        set
    } else {
        run.iter().filter(|p| is_control(p)).collect()
    };
    if basis.is_empty() {
        return Vec::new();
    }
    let center = stats::mean(&basis.iter().map(|p| p.size).collect::<Vec<_>>());
    let total: f64 = basis.iter().map(|p| signal(p)).sum();
    // Geometric means (in logs) of the set's observed and true shares, the
    // reference of the centered log-ratios. Every basis peak has a true
    // share above 0 and a signal of at least 1, so the logs are finite.
    let mean_ln_obs = stats::mean(
        &basis
            .iter()
            .map(|p| (signal(p) / total).ln())
            .collect::<Vec<_>>(),
    );
    let mean_ln_true = stats::mean(
        &basis
            .iter()
            .map(|p| p.true_proportion.unwrap_or(0.0).ln())
            .collect::<Vec<_>>(),
    );
    let several = basis.len() >= 2;
    run.iter()
        .enumerate()
        .filter(|(_, p)| is_control(p))
        .map(|(i, p)| {
            let t = p.true_proportion.unwrap_or(0.0);
            let obs = signal(p) / total;
            let exclusion = if t < min {
                Some(ControlPeakExclusion::BelowMinTrueProportion)
            } else if p.height <= params.min_peak_height {
                Some(ControlPeakExclusion::BelowMinHeight)
            } else if run_exclusion.is_some() {
                run_exclusion
            // Proportions of exactly 0 or 1 carry no information about β;
            // the old code hid them behind `+1e-6`.
            } else if !(t <= 1.0 - min && t < 1.0) {
                Some(ControlPeakExclusion::AboveMaxTrueProportion)
            } else {
                None
            };
            let clr_error = (obs.ln() - mean_ln_obs) - (t.ln() - mean_ln_true);
            ControlPoint {
                peak: i,
                centered_size: p.size - center,
                observed_proportion: obs,
                log_odds_error: (several && clr_error.is_finite()).then_some(2.0 * clr_error),
                exclusion,
            }
        })
        .collect()
}

/// Estimates β from control runs (each slice = the peaks of one run at this
/// locus, with `true_proportion` set), by least squares through the origin of
/// the points' `log_odds_error` on `centered_size` (module docs). Returns
/// `None` when no run qualifies. Which peaks enter the fit is decided by
/// [`control_points`].
pub fn estimate_beta(
    control_runs: &[&[Peak]],
    params: &QuantBiasParams,
) -> Result<Option<BiasEstimate>, QuantBiasError> {
    let mut x = Vec::new();
    let mut y = Vec::new();
    let mut n_sets = 0u32;
    for run in control_runs {
        let mut used = false;
        for p in control_points(run, params) {
            if let (None, Some(err)) = (p.exclusion, p.log_odds_error) {
                x.push(p.centered_size);
                y.push(err);
                used = true;
            }
        }
        n_sets += u32::from(used);
    }
    if x.is_empty() {
        return Ok(None);
    }
    let fit = stats::least_squares_through_origin(&x, &y)?;
    Ok(Some(BiasEstimate {
        beta: fit.slope,
        sd: fit.sd,
        r_squared: fit.r_squared,
        n_peaks: x.len() as u32,
        n_sets,
    }))
}

/// Sets `relative_quantification` and `corrected_relative_quantification` on
/// the peaks of one sample at one locus for which `is_called` is true, and
/// clears both on the others. The correction is `corrected_i ∝ observed_i ·
/// exp(−(β/2) · s_i)` (module docs). Without β (or β = 0) the corrected value
/// equals the uncorrected one.
pub fn quantify(peaks: &mut [Peak], is_called: impl Fn(&Peak) -> bool, beta: Option<f64>) {
    let called: Vec<usize> = (0..peaks.len()).filter(|&i| is_called(&peaks[i])).collect();
    for p in peaks.iter_mut() {
        p.relative_quantification = None;
        p.corrected_relative_quantification = None;
    }
    if called.is_empty() {
        return;
    }
    let total: f64 = called.iter().map(|&i| signal(&peaks[i])).sum();
    let center = stats::mean(&called.iter().map(|&i| peaks[i].size).collect::<Vec<_>>());
    let rq: Vec<f64> = called.iter().map(|&i| signal(&peaks[i]) / total).collect();
    let corrected: Vec<f64> = match beta.filter(|b| *b != 0.0 && b.is_finite()) {
        None => rq.clone(),
        Some(b) => {
            // In logs, shifted by the largest, so extreme β cannot overflow.
            let log_w: Vec<f64> = called
                .iter()
                .zip(&rq)
                .map(|(&i, &q)| q.ln() - 0.5 * b * (peaks[i].size - center))
                .collect();
            let top = log_w.iter().copied().fold(f64::NEG_INFINITY, f64::max);
            let w: Vec<f64> = log_w.iter().map(|l| (l - top).exp()).collect();
            let sum: f64 = w.iter().sum();
            if sum > 0.0 && sum.is_finite() {
                w.iter().map(|v| v / sum).collect()
            } else {
                rq.clone()
            }
        }
    };
    for ((&i, q), c) in called.iter().zip(rq).zip(corrected) {
        peaks[i].relative_quantification = Some(q);
        peaks[i].corrected_relative_quantification = Some(c);
    }
}

/// Tolerance for comparing true proportions with `min_true_proportion`.
/// Wide enough for proportions that went through `f32` (relative error
/// ~6e-8), as peaks stored by the engine's first peak format did: 0.8 came
/// back as 0.8000000119 and an 80/20 control at a minimum of 0.2 would
/// otherwise read as excluded although the fit used it.
const PROPORTION_EPS: f64 = 1e-6;

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    fn sigmoid(l: f64) -> f64 {
        1.0 / (1.0 + (-l).exp())
    }

    /// Two-allele control whose observed shares follow the model with `beta`.
    fn control(s1: f64, s2: f64, p1: f64, beta: f64, total: f64) -> Vec<Peak> {
        let center = (s1 + s2) / 2.0;
        let o1 = sigmoid(logit(p1) + beta * (s1 - center));
        vec![
            Peak {
                index: 1,
                size: s1,
                height: o1 * total,
                true_proportion: Some(p1),
                ..Peak::default()
            },
            Peak {
                index: 2,
                size: s2,
                height: (1.0 - o1) * total,
                true_proportion: Some(1.0 - p1),
                ..Peak::default()
            },
        ]
    }

    #[test]
    fn recovers_planted_beta_and_proportions() {
        let beta = -0.015; // shorter alleles over-amplified
        let runs: Vec<Vec<Peak>> = vec![
            control(150.0, 180.0, 0.5, beta, 20000.0),
            control(141.0, 201.0, 0.3, beta, 15000.0),
            control(160.0, 172.0, 0.6, beta, 18000.0),
            control(130.0, 190.0, 0.7, beta, 22000.0),
        ];
        let refs: Vec<&[Peak]> = runs.iter().map(|r| r.as_slice()).collect();
        let est = estimate_beta(&refs, &QuantBiasParams::default())
            .unwrap()
            .unwrap();
        assert_relative_eq!(est.beta, beta, epsilon = 1e-9);
        assert!(est.sd < 1e-9);
        assert_eq!((est.n_peaks, est.n_sets), (8, 4));

        // Correct an unknown two-allele sample made with the same bias.
        let mut sample = control(145.0, 199.0, 0.2, beta, 12000.0);
        quantify(&mut sample, |_| true, Some(est.beta));
        assert_relative_eq!(
            sample[0].corrected_relative_quantification.unwrap(),
            0.2,
            epsilon = 1e-6
        );
        assert_relative_eq!(
            sample[1].corrected_relative_quantification.unwrap(),
            0.8,
            epsilon = 1e-6
        );
        // Uncorrected share is biased towards the shorter allele.
        assert!(sample[0].relative_quantification.unwrap() > 0.2);
    }

    #[test]
    fn min_true_proportion_is_inclusive() {
        let beta = -0.01;
        // 75/25 mixtures, the second with 0.25 arriving as a sum of decimals.
        let mut a = control(150.0, 180.0, 0.75, beta, 20000.0);
        a[1].true_proportion = Some(0.25);
        let mut b = control(140.0, 190.0, 0.25, beta, 20000.0);
        b[0].true_proportion = Some(0.1 + 0.15);
        b[1].true_proportion = Some(0.75);
        let runs = [a, b];
        let refs: Vec<&[Peak]> = runs.iter().map(|r| r.as_slice()).collect();
        let est = estimate_beta(&refs, &QuantBiasParams::default())
            .unwrap()
            .expect("75/25 mixtures are used at the default 0.25");
        assert_eq!((est.n_peaks, est.n_sets), (4, 2));
        assert_relative_eq!(est.beta, beta, epsilon = 1e-6);
        // Just below the bound is still excluded.
        let strict = QuantBiasParams {
            min_true_proportion: 0.26,
            ..QuantBiasParams::default()
        };
        assert_eq!(estimate_beta(&refs, &strict).unwrap(), None);
    }

    /// Reviewer's case: at `min_true_proportion = 0` a 1200–1500 RFU stutter
    /// peak (true proportion 0) must not enter the fit's total or center. The
    /// old code's set filter (`true_proportion > min`) gave β = −0.009316; the
    /// stutter-admitting version gave −0.009870.
    #[test]
    fn zero_true_proportion_peaks_never_count() {
        let p = |size: f64, height: f64, t: f64| Peak {
            size,
            height,
            true_proportion: Some(t),
            ..Peak::default()
        };
        let runs = [
            vec![
                p(150.0, 6000.0, 0.5),
                p(180.0, 5000.0, 0.5),
                p(147.0, 1200.0, 0.0),
            ],
            vec![
                p(160.0, 9000.0, 0.7),
                p(190.0, 3500.0, 0.3),
                p(157.0, 1500.0, 0.0),
            ],
        ];
        let refs: Vec<&[Peak]> = runs.iter().map(|r| r.as_slice()).collect();
        let params = QuantBiasParams {
            min_true_proportion: 0.0,
            ..QuantBiasParams::default()
        };
        let est = estimate_beta(&refs, &params).unwrap().unwrap();
        assert_relative_eq!(est.beta, -0.009316166100862217, epsilon = 1e-6);
        assert_eq!((est.n_peaks, est.n_sets), (4, 2));
        // The stutter peaks are not control points at all.
        for run in &runs {
            let pts = control_points(run, &params);
            assert_eq!(pts.len(), 2);
            assert!(pts.iter().all(|c| c.exclusion.is_none() && c.peak < 2));
        }
    }

    /// Proportions rounded through `f32` (older stored peaks) are judged as
    /// the fit judged the exact values.
    #[test]
    fn single_precision_proportions_keep_their_decision() {
        for (major, min) in [(0.8, 0.2), (0.6, 0.4), (0.65, 0.35)] {
            let mut run = control(150.0, 180.0, major, -0.01, 20000.0);
            for p in run.iter_mut() {
                p.true_proportion = p.true_proportion.map(|t| f64::from(t as f32));
            }
            let params = QuantBiasParams {
                min_true_proportion: min,
                ..QuantBiasParams::default()
            };
            assert!(
                control_points(&run, &params)
                    .iter()
                    .all(|p| p.exclusion.is_none()),
                "{major}/{min}"
            );
        }
    }

    #[test]
    fn controls_are_filtered_like_before() {
        let params = QuantBiasParams::default();
        // Proportions that do not sum to 1 after filtering (0.2 is below 0.25).
        let mut three = control(150.0, 180.0, 0.5, 0.0, 20000.0);
        three[0].true_proportion = Some(0.4);
        three[1].true_proportion = Some(0.4);
        three.push(Peak {
            size: 160.0,
            height: 5000.0,
            true_proportion: Some(0.2),
            ..Peak::default()
        });
        // Off-scale control.
        let hot = control(150.0, 180.0, 0.5, 0.0, 70000.0);
        // Too short.
        let weak = control(150.0, 180.0, 0.5, 0.0, 1500.0);
        // Pure strains: proportions 0 and 1 carry no information.
        let mut pure = control(150.0, 180.0, 0.5, 0.0, 20000.0);
        pure[0].true_proportion = Some(1.0);
        pure[1].true_proportion = Some(0.0);
        let runs = [three, hot, weak, pure];
        let refs: Vec<&[Peak]> = runs.iter().map(|r| r.as_slice()).collect();
        assert_eq!(estimate_beta(&refs, &params).unwrap(), None);

        let loose = QuantBiasParams {
            min_true_proportion: 0.0,
            ..params
        };
        let refs = [runs[3].as_slice()];
        assert_eq!(estimate_beta(&refs, &loose).unwrap(), None);
    }

    #[test]
    fn control_points_say_why_each_peak_is_left_out() {
        use ControlPeakExclusion::*;
        let params = QuantBiasParams::default();
        let reasons = |run: &[Peak]| -> Vec<Option<ControlPeakExclusion>> {
            control_points(run, &params)
                .iter()
                .map(|p| p.exclusion)
                .collect()
        };
        // 75/25 at the default minimum: both used, and agreeing with the fit.
        let ok = control(150.0, 180.0, 0.75, -0.01, 20000.0);
        assert_eq!(reasons(&ok), vec![None, None]);
        let pts = control_points(&ok, &params);
        let est = estimate_beta(&[ok.as_slice()], &params).unwrap().unwrap();
        assert_eq!(est.n_peaks as usize, pts.len());
        // 90/10: the minor share is below the range, so the major is alone.
        let minor = control(150.0, 180.0, 0.9, 0.0, 20000.0);
        assert_eq!(
            reasons(&minor),
            vec![Some(SinglePeakSet), Some(BelowMinTrueProportion)]
        );
        // A low partner.
        let mut low = control(150.0, 180.0, 0.5, 0.0, 20000.0);
        low[1].height = 900.0;
        assert_eq!(
            reasons(&low),
            vec![Some(SinglePeakSet), Some(BelowMinHeight)]
        );
        // Three strains, one low: the other two do not add up to 1.
        let mut three = control(150.0, 180.0, 0.4, 0.0, 20000.0);
        three[1].true_proportion = Some(0.3);
        three.push(Peak {
            size: 160.0,
            height: 500.0,
            true_proportion: Some(0.3),
            ..Peak::default()
        });
        assert_eq!(
            reasons(&three),
            vec![
                Some(PartnerExcluded),
                Some(PartnerExcluded),
                Some(BelowMinHeight)
            ]
        );
        // Off-scale.
        let hot = control(150.0, 180.0, 0.5, 0.0, 70000.0);
        assert_eq!(reasons(&hot), vec![Some(OffScale), Some(OffScale)]);
        // Half of the mixture found no peak.
        let mut missing = control(150.0, 180.0, 0.5, 0.0, 20000.0);
        missing[1].true_proportion = Some(0.0);
        assert_eq!(reasons(&missing), vec![Some(ControlAlleleNotFound)]);
        // Nothing qualifies, nothing is fitted.
        let runs = [minor, low, three, hot, missing];
        let refs: Vec<&[Peak]> = runs.iter().map(|r| r.as_slice()).collect();
        assert_eq!(estimate_beta(&refs, &params).unwrap(), None);
    }

    #[test]
    fn single_called_peak_and_floors() {
        let mut peaks = vec![
            Peak {
                size: 150.0,
                height: 800.0,
                artifact_contribution: 900.0,
                ..Peak::default()
            },
            Peak {
                size: 200.0,
                height: 50.0,
                ..Peak::default()
            },
        ];
        quantify(&mut peaks, |p| p.size < 160.0, Some(-0.02));
        assert_eq!(peaks[0].relative_quantification, Some(1.0));
        assert_eq!(peaks[0].corrected_relative_quantification, Some(1.0));
        assert_eq!(peaks[1].relative_quantification, None);

        // Height below its artifact contribution floors at 1 RFU, never 0 or negative.
        quantify(&mut peaks, |_| true, None);
        assert_relative_eq!(peaks[0].relative_quantification.unwrap(), 1.0 / 51.0);
        assert_eq!(
            peaks[0].relative_quantification,
            peaks[0].corrected_relative_quantification
        );

        // Extreme β does not produce NaN.
        quantify(&mut peaks, |_| true, Some(50.0));
        let s: f64 = peaks
            .iter()
            .map(|p| p.corrected_relative_quantification.unwrap())
            .sum();
        assert_relative_eq!(s, 1.0, epsilon = 1e-12);
    }

    /// Peaks of one control run drawn exactly from `h_i ∝ p_i · exp(γ·s_i)`.
    fn multi(alleles: &[(f64, f64)], gamma: f64, total: f64) -> Vec<Peak> {
        let w: Vec<f64> = alleles
            .iter()
            .map(|&(s, p)| p * (gamma * s).exp())
            .collect();
        let sum: f64 = w.iter().sum();
        alleles
            .iter()
            .zip(&w)
            .enumerate()
            .map(|(i, (&(size, p), &wi))| Peak {
                index: i,
                size,
                height: total * wi / sum,
                true_proportion: Some(p),
                ..Peak::default()
            })
            .collect()
    }

    fn corrected(peaks: &[Peak]) -> Vec<f64> {
        peaks
            .iter()
            .map(|p| p.corrected_relative_quantification.unwrap())
            .collect()
    }

    /// Reviewer's case: three equal controls at 100/140/200 bp with γ = −0.01
    /// per bp. The model gives β = 2γ = −0.02; the per-peak log-odds fit gave
    /// −0.014643.
    #[test]
    fn three_component_controls_estimate_two_gamma() {
        let third = 1.0 / 3.0;
        let run = multi(
            &[(100.0, third), (140.0, third), (200.0, third)],
            -0.01,
            30000.0,
        );
        let est = estimate_beta(&[run.as_slice()], &QuantBiasParams::default())
            .unwrap()
            .unwrap();
        assert_relative_eq!(est.beta, -0.02, epsilon = 1e-12);
        assert!(est.sd < 1e-12);
        // Each plotted point lies on the fitted line.
        for p in control_points(&run, &QuantBiasParams::default()) {
            assert_relative_eq!(
                p.log_odds_error.unwrap(),
                est.beta * p.centered_size,
                epsilon = 1e-12
            );
        }
    }

    /// Reviewer's cases: β = −0.02 (γ = −0.01) on four and five alleles.
    #[test]
    fn correction_is_exact_for_any_number_of_alleles() {
        let truth = [(100.0, 0.7), (120.0, 0.1), (140.0, 0.1), (200.0, 0.1)];
        let mut four = multi(&truth, -0.01, 20000.0);
        quantify(&mut four, |_| true, Some(-0.02));
        for (c, (_, p)) in corrected(&four).iter().zip(truth) {
            assert_relative_eq!(*c, p, epsilon = 1e-12);
        }
        let truth = [
            (100.0, 0.2),
            (120.0, 0.2),
            (140.0, 0.2),
            (160.0, 0.2),
            (200.0, 0.2),
        ];
        let mut five = multi(&truth, -0.01, 20000.0);
        quantify(&mut five, |_| true, Some(-0.02));
        for c in corrected(&five) {
            assert_relative_eq!(c, 0.2, epsilon = 1e-12);
        }
    }

    /// A planted γ on a mix of two-, three- and four-component controls is
    /// recovered as β = 2γ, and correcting each control with it gives back
    /// its true proportions.
    #[test]
    fn planted_gamma_on_mixed_control_sets() {
        let gamma = -0.0075;
        let sets: Vec<Vec<(f64, f64)>> = vec![
            vec![(150.0, 0.5), (180.0, 0.5)],
            vec![(141.0, 0.3), (201.0, 0.7)],
            vec![(120.0, 0.25), (150.0, 0.5), (210.0, 0.25)],
            vec![(130.0, 0.4), (133.0, 0.35), (190.0, 0.25)],
            vec![(110.0, 0.25), (140.0, 0.25), (170.0, 0.25), (230.0, 0.25)],
            vec![(100.0, 0.3), (160.0, 0.25), (175.0, 0.2), (205.0, 0.25)],
        ];
        let params = QuantBiasParams {
            min_true_proportion: 0.2,
            ..QuantBiasParams::default()
        };
        let runs: Vec<Vec<Peak>> = sets.iter().map(|s| multi(s, gamma, 24000.0)).collect();
        let refs: Vec<&[Peak]> = runs.iter().map(|r| r.as_slice()).collect();
        let est = estimate_beta(&refs, &params).unwrap().unwrap();
        assert_relative_eq!(est.beta, 2.0 * gamma, epsilon = 1e-12);
        assert!(est.sd < 1e-12);
        assert_eq!((est.n_peaks, est.n_sets), (18, 6));
        for (mut run, set) in runs.into_iter().zip(&sets) {
            quantify(&mut run, |_| true, Some(est.beta));
            for (c, (_, p)) in corrected(&run).iter().zip(set) {
                assert_relative_eq!(*c, *p, epsilon = 1e-12);
            }
        }
    }

    /// The previous implementation, kept to show that two-allele results do
    /// not change: per-peak log-odds error regressed on the offset from the
    /// mean size, and per-peak log-odds correction renormalized.
    mod previous {
        use super::*;

        pub fn beta(runs: &[Vec<Peak>]) -> (f64, f64, f64) {
            let (mut x, mut y) = (Vec::new(), Vec::new());
            for run in runs {
                let center = (run[0].size + run[1].size) / 2.0;
                let total = signal(&run[0]) + signal(&run[1]);
                for p in run {
                    let o = signal(p) / total;
                    x.push(p.size - center);
                    y.push(logit(o) - logit(p.true_proportion.unwrap()));
                }
            }
            let f = stats::least_squares_through_origin(&x, &y).unwrap();
            (f.slope, f.sd, f.r_squared)
        }

        pub fn correct(run: &[Peak], beta: f64) -> Vec<f64> {
            let center = (run[0].size + run[1].size) / 2.0;
            let total = signal(&run[0]) + signal(&run[1]);
            let raw: Vec<f64> = run
                .iter()
                .map(|p| sigmoid(logit(signal(p) / total) - beta * (p.size - center)))
                .collect();
            let s: f64 = raw.iter().sum();
            raw.iter().map(|v| v / s).collect()
        }
    }

    /// Two-allele controls that do not follow the model exactly (noisy
    /// heights, artifact contributions) give the same β, SD, R², per-point
    /// values and corrected proportions as the previous implementation.
    #[test]
    fn two_allele_results_are_unchanged() {
        let mut runs: Vec<Vec<Peak>> = Vec::new();
        for i in 0..12 {
            let f = i as f64;
            let p1 = [0.25, 0.4, 0.5, 0.6, 0.75][i % 5];
            let mut r = control(120.0 + 3.0 * f, 170.0 + 7.0 * f, p1, -0.012, 15000.0);
            // Deterministic "noise" in heights and some artifact signal.
            r[0].height *= 1.0 + 0.07 * (f * 1.3).sin();
            r[1].height *= 1.0 - 0.05 * (f * 0.7).cos();
            r[1].artifact_contribution = 40.0 * f;
            runs.push(r);
        }
        let refs: Vec<&[Peak]> = runs.iter().map(|r| r.as_slice()).collect();
        let est = estimate_beta(&refs, &QuantBiasParams::default())
            .unwrap()
            .unwrap();
        let (b, sd, r2) = previous::beta(&runs);
        assert!(sd > 0.01, "the data must not fit exactly ({sd})");
        assert_relative_eq!(est.beta, b, epsilon = 1e-12);
        assert_relative_eq!(est.sd, sd, epsilon = 1e-12);
        assert_relative_eq!(est.r_squared, r2, epsilon = 1e-12);
        for run in &runs {
            let center = (run[0].size + run[1].size) / 2.0;
            let total = signal(&run[0]) + signal(&run[1]);
            for p in control_points(run, &QuantBiasParams::default()) {
                let pk = &run[p.peak];
                let old = logit(signal(pk) / total) - logit(pk.true_proportion.unwrap());
                assert_relative_eq!(p.log_odds_error.unwrap(), old, epsilon = 1e-12);
                assert_relative_eq!(p.centered_size, pk.size - center, epsilon = 1e-12);
            }
            let mut q = run.clone();
            quantify(&mut q, |_| true, Some(est.beta));
            for (c, o) in corrected(&q).iter().zip(previous::correct(run, est.beta)) {
                assert_relative_eq!(*c, o, epsilon = 1e-12);
            }
        }
    }

    #[test]
    fn shared_control_alleles_add_up() {
        let mut peaks = vec![
            Peak {
                bin_id: Some(1),
                in_bin: true,
                height: 100.0,
                ..Peak::default()
            },
            Peak {
                bin_id: Some(2),
                in_bin: true,
                height: 100.0,
                ..Peak::default()
            },
            Peak {
                bin_id: None,
                height: 100.0,
                ..Peak::default()
            },
        ];
        assign_true_proportions(&mut peaks, &[(1, 0.25), (2, 0.5), (1, 0.25), (9, 0.1)]);
        assert_eq!(peaks[0].true_proportion, Some(0.5));
        assert_eq!(peaks[1].true_proportion, Some(0.5));
        assert_eq!(peaks[2].true_proportion, Some(0.0));
    }

    /// Binning labels a peak up to twice the bin buffer away without marking
    /// it `in_bin`; such a peak is not the control's allele (calling would
    /// not call it either), even when it is the tallest peak carrying the bin.
    #[test]
    fn control_alleles_need_a_peak_inside_the_bin() {
        let bins = [crate::types::Bin {
            id: 7,
            label: "150".into(),
            base_size: 150.0,
            bin_buffer: 0.5,
            peak_count: 0,
        }];
        let mut near = vec![
            Peak {
                size: 150.9,
                height: 5000.0,
                ..Peak::default()
            },
            Peak {
                size: 180.0,
                height: 5000.0,
                ..Peak::default()
            },
        ];
        crate::bins::annotate_bins(&mut near, &bins);
        assert_eq!((near[0].bin_id, near[0].in_bin), (Some(7), false));
        assign_true_proportions(&mut near, &[(7, 0.5)]);
        assert_eq!(near[0].true_proportion, Some(0.0));
        // The run is then reported as missing a control allele.
        near[1].true_proportion = Some(0.5);
        assert!(control_points(&near, &QuantBiasParams::default())
            .iter()
            .all(|p| p.exclusion == Some(ControlPeakExclusion::ControlAlleleNotFound)));
        // Inside the buffer it is the allele.
        near[0].size = 150.3;
        crate::bins::annotate_bins(&mut near, &bins);
        assign_true_proportions(&mut near, &[(7, 0.5)]);
        assert_eq!(near[0].true_proportion, Some(0.5));
    }
}
