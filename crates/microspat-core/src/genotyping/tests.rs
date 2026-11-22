//! Genotyping tests, including mixture scenarios built from fabricated peaks.

use super::*;
use crate::artifact::{ArtifactEquation, ArtifactEstimator, Segment};
use crate::stats::{ErrorEstimator, LinearFit, RegressionMethod};
use approx::assert_relative_eq;

const REPEAT: f64 = 3.0;
const STUTTER: f64 = 0.08;
const STUTTER_SD: f64 = 0.01;

/// Bins every repeat from 100 to 160 bp; a bin's id is its size.
fn bins() -> Vec<Bin> {
    (0..=20)
        .map(|k| {
            let s = 100.0 + REPEAT * k as f64;
            Bin {
                id: s as i64,
                label: format!("{s}"),
                base_size: s,
                bin_buffer: 0.75,
                peak_count: 0,
            }
        })
        .collect()
}

/// −1 repeat stutter at a flat `STUTTER` ± `STUTTER_SD` of the parent.
fn stutter_model() -> ArtifactModel {
    ArtifactModel {
        estimators: vec![ArtifactEstimator {
            label: "-3.00".into(),
            artifact_distance: Some(-REPEAT),
            artifact_distance_buffer: Some(0.5),
            points: Vec::new(),
            equations: vec![ArtifactEquation {
                segment: Segment {
                    start_size: 50.0,
                    end_size: 400.0,
                    method: RegressionMethod::NoSlope,
                    error: ErrorEstimator::Mad,
                },
                fit: LinearFit {
                    slope: 0.0,
                    intercept: STUTTER,
                    sd: STUTTER_SD,
                    r_squared: 0.0,
                },
                n_points: 0,
            }],
        }],
    }
}

/// Peaks of one run of a sample: each `(size, proportion)` allele gets height
/// `proportion · total`, and drops `stutter · height` one repeat below. Signal
/// at the same position adds up. Relative heights are filled in.
fn fabricate(alleles: &[(f64, f64)], total: f64, stutter: f64) -> Vec<Peak> {
    let mut signal: Vec<(f64, f64)> = Vec::new();
    let mut add = |size: f64, h: f64| match signal.iter_mut().find(|(s, _)| (s - size).abs() < 0.3)
    {
        Some(e) => e.1 += h,
        None => signal.push((size, h)),
    };
    for &(s, p) in alleles {
        add(s, p * total);
    }
    if stutter > 0.0 {
        for &(s, p) in alleles {
            add(s - REPEAT, stutter * p * total);
        }
    }
    signal.sort_by(|a, b| a.0.total_cmp(&b.0));
    let max = signal.iter().map(|x| x.1).fold(0.0, f64::max);
    signal
        .into_iter()
        .enumerate()
        .map(|(i, (size, height))| Peak {
            index: 1000 + 10 * i,
            size,
            height,
            area: height * 5.0,
            relative_height: height / max,
            ..Peak::default()
        })
        .collect()
}

fn run(run_id: i64, sample_id: i64, peaks: Vec<Peak>) -> Run {
    Run {
        run_id,
        sample_id,
        sizing_ok: true,
        peaks,
    }
}

fn analyze_one(peaks: Vec<Peak>) -> SampleLocusCall {
    let mut runs = vec![run(1, 1, peaks)];
    let calls = analyze_locus(
        7,
        &mut runs,
        &bins(),
        Some(&stutter_model()),
        None,
        &GenotypingParams::default(),
    );
    assert_eq!(calls.len(), 1);
    calls.into_iter().next().unwrap()
}

fn peak_at(call: &SampleLocusCall, size: f64) -> &Peak {
    call.peaks
        .iter()
        .find(|p| (p.size - size).abs() < 0.3)
        .unwrap_or_else(|| panic!("no peak at {size}"))
}

fn set(ids: &[i64]) -> BTreeSet<i64> {
    ids.iter().copied().collect()
}

// --- Mixture scenarios at one locus -----------------------------------------

#[test]
fn minor_allele_at_stutter_position_called_when_well_above_expected_stutter() {
    // Three clones, 75/20/5 %. The 5 % allele (127) sits exactly one repeat
    // below the major allele (130), so its peak carries 1000 RFU of its own
    // plus 1200 RFU of stutter.
    let call = analyze_one(fabricate(
        &[(130.0, 0.75), (136.0, 0.20), (127.0, 0.05)],
        20000.0,
        STUTTER,
    ));
    let minor = peak_at(&call, 127.0);
    assert_relative_eq!(minor.height, 2200.0);
    assert_relative_eq!(minor.artifact_contribution, 1200.0);
    assert_relative_eq!(minor.artifact_error, 150.0);
    assert!(!minor.flags.any());
    assert_eq!(call.alleles, set(&[127, 130, 136]));
    // The stutter of 136 at 133 and of the minor allele at 124 are rejected.
    assert!(peak_at(&call, 133.0).flags.artifact);
    assert!(peak_at(&call, 124.0).flags.artifact);
    assert!(peak_at(&call, 124.0).flags.below_relative_threshold);
    // Proportions over called peaks, artifact removed. Stutter is predicted
    // from the parent's observed height, which includes stutter it received
    // itself, so recovery is close but not exact.
    let q = peak_at(&call, 127.0).relative_quantification.unwrap();
    assert_relative_eq!(q, 0.05, epsilon = 1e-3);
}

#[test]
fn peak_at_expected_stutter_height_is_rejected() {
    // Same mixture without the minor clone: the 127 peak is pure stutter.
    let call = analyze_one(fabricate(&[(130.0, 0.75), (136.0, 0.20)], 20000.0, STUTTER));
    let stutter = peak_at(&call, 127.0);
    assert_relative_eq!(stutter.height, 1200.0);
    assert!(stutter.flags.artifact);
    assert_eq!(call.alleles, set(&[130, 136]));

    // One artifact SD above expectation is still not an allele.
    let mut peaks = fabricate(&[(130.0, 0.75), (136.0, 0.20)], 20000.0, STUTTER);
    peaks.iter_mut().find(|p| p.size == 127.0).unwrap().height += 150.0;
    let call = analyze_one(peaks);
    assert!(!call.alleles.contains(&127));
}

#[test]
fn five_alleles_give_five_calls() {
    // Adjacent alleles: every allele but the top one is also the stutter
    // position of the next.
    let alleles = [
        (118.0, 0.30),
        (121.0, 0.25),
        (124.0, 0.20),
        (127.0, 0.15),
        (130.0, 0.10),
    ];
    let call = analyze_one(fabricate(&alleles, 20000.0, STUTTER));
    assert_eq!(call.alleles, set(&[118, 121, 124, 127, 130]));
    assert!(peak_at(&call, 115.0).flags.artifact);
    let total: f64 = call
        .peaks
        .iter()
        .filter_map(|p| p.relative_quantification)
        .sum();
    assert_relative_eq!(total, 1.0, epsilon = 1e-12);
    for (s, prop) in alleles {
        assert_relative_eq!(
            peak_at(&call, s).relative_quantification.unwrap(),
            prop,
            epsilon = 2e-3
        );
    }
}

// --- Run selection and flags -------------------------------------------------

#[test]
fn reference_run_prefers_strongest_in_bin_signal_below_offscale() {
    let in_bin = |h: f64| fabricate(&[(130.0, 1.0)], h, 0.0);
    let mut runs = [
        run(10, 1, in_bin(5000.0)),
        // Off-scale run: its tallest in-bin peak does not count.
        run(11, 1, in_bin(40000.0)),
        // Strongest, but sizing failed.
        run(12, 1, in_bin(30000.0)),
        run(13, 1, in_bin(9000.0)),
        // Tall but out of any bin.
        run(14, 1, fabricate(&[(131.6, 1.0)], 20000.0, 0.0)),
    ];
    runs[2].sizing_ok = false;
    for r in runs.iter_mut() {
        bins::annotate_bins(&mut r.peaks, &bins());
    }
    let refs: Vec<&Run> = runs.iter().collect();
    assert_eq!(select_reference_run(&refs, 32000.0).unwrap().run_id, 13);
    // Ties keep the earliest run id.
    let tie = [&runs[3], &runs[0], &runs[3]];
    assert_eq!(select_reference_run(&tie, 32000.0).unwrap().run_id, 13);
    assert!(select_reference_run(&[&runs[2]], 32000.0).is_none());
}

/// Reviewer's case: in a mixture the saturated run still has the tallest
/// peak below the threshold (its second allele), but a clean replicate exists
/// and is the one to use.
#[test]
fn reference_run_avoids_runs_with_an_offscale_allele() {
    let mixture = |a: f64, b: f64| {
        let mut peaks = fabricate(&[(130.0, a), (136.0, b)], 1.0, 0.0);
        bins::annotate_bins(&mut peaks, &bins());
        peaks
    };
    let runs = [
        run(1, 1, mixture(32767.0, 12000.0)),
        run(2, 1, mixture(10000.0, 2500.0)),
    ];
    let refs: Vec<&Run> = runs.iter().collect();
    assert_eq!(select_reference_run(&refs, 32000.0).unwrap().run_id, 2);
    let calls = analyze_locus(
        1,
        &mut runs.clone(),
        &bins(),
        None,
        None,
        &GenotypingParams::default(),
    );
    assert!(!calls[0].flags.offscale);
    // As a control mixture, the run picked can now enter the β fit; the
    // saturated one would have been left out as off-scale.
    let qb = quant_bias::QuantBiasParams {
        min_true_proportion: 0.2,
        ..quant_bias::QuantBiasParams::default()
    };
    let fit_exclusions = |r: &Run| {
        let mut peaks = r.peaks.clone();
        quant_bias::assign_true_proportions(&mut peaks, &[(130, 0.8), (136, 0.2)]);
        quant_bias::control_points(&peaks, &qb)
            .iter()
            .map(|p| p.exclusion)
            .collect::<Vec<_>>()
    };
    let picked = select_reference_run(&refs, qb.offscale_threshold).unwrap();
    assert_eq!(fit_exclusions(picked), vec![None, None]);
    assert_eq!(
        fit_exclusions(&runs[0])[0],
        Some(quant_bias::ControlPeakExclusion::OffScale)
    );
    // An off-scale peak outside every bin does not count against a run.
    let mut stray = mixture(10000.0, 12000.0);
    stray.push(Peak {
        index: 9999,
        size: 101.5,
        height: 40000.0,
        relative_height: 1.0,
        ..Peak::default()
    });
    bins::annotate_bins(&mut stray, &bins());
    let runs2 = [run(1, 1, stray), run(2, 1, mixture(10000.0, 2500.0))];
    let refs: Vec<&Run> = runs2.iter().collect();
    assert_eq!(select_reference_run(&refs, 32000.0).unwrap().run_id, 1);
    // When every run is off-scale the sample still gets its best one,
    // flagged off-scale.
    let runs3 = [
        run(1, 1, mixture(40000.0, 2000.0)),
        run(2, 1, mixture(33000.0, 9000.0)),
    ];
    let refs: Vec<&Run> = runs3.iter().collect();
    assert_eq!(select_reference_run(&refs, 32000.0).unwrap().run_id, 2);
    let calls = analyze_locus(
        1,
        &mut runs3.clone(),
        &bins(),
        None,
        None,
        &GenotypingParams::default(),
    );
    assert_eq!(calls[0].reference_run_id, Some(2));
    assert!(calls[0].flags.offscale);
}

#[test]
fn sample_without_usable_run_gets_empty_call() {
    let mut runs = vec![run(1, 5, fabricate(&[(130.0, 1.0)], 5000.0, 0.0))];
    runs[0].sizing_ok = false;
    let calls = analyze_locus(
        1,
        &mut runs,
        &bins(),
        None,
        None,
        &GenotypingParams::default(),
    );
    assert_eq!(calls[0].reference_run_id, None);
    assert!(calls[0].alleles.is_empty());
    assert!(calls[0].peaks.is_empty());
}

#[test]
fn failure_offscale_bleedthrough_crosstalk() {
    let params = GenotypingParams::default();
    // Weak run: nothing above the 500 RFU failure threshold.
    let call = analyze_one(fabricate(&[(130.0, 0.6), (136.0, 0.4)], 700.0, 0.0));
    assert!(call.flags.failure);
    assert!(call.alleles.is_empty());

    let mut peaks = fabricate(&[(130.0, 0.5), (136.0, 0.3), (142.0, 0.2)], 10000.0, 0.0);
    peaks[0].bleedthrough_ratio = 11.0; // pull-up: another dye 11× taller
    peaks[1].crosstalk_ratio = 12.0; // 3000 · 12 > 32000: neighbour off-scale
    let call = analyze_one(peaks);
    assert!(call.peaks[0].flags.bleedthrough);
    assert!(call.peaks[1].flags.crosstalk);
    assert!(call.flags.offscale);
    assert!(!call.flags.failure);
    assert_eq!(call.alleles, set(&[142]));

    let mut p = vec![Peak {
        height: 300.0,
        artifact_contribution: 50.0,
        artifact_error: 40.0,
        relative_height: 1.0,
        ..Peak::default()
    }];
    flag_peaks(&mut p, &params);
    assert!(!p[0].flags.artifact);
    flag_peaks(
        &mut p,
        &GenotypingParams {
            hard_artifact_sd_limit: 2.0,
            ..params
        },
    );
    assert!(p[0].flags.artifact); // 300 − 50 − 80 < 200
}

/// A peak as tall as its putative off-scale source is not its leak: the
/// off-scale clause needs the ratio a leak could have (2 for pull-up, 10 for
/// crosstalk).
#[test]
fn saturated_alleles_beside_saturated_sources_are_kept() {
    let mut peaks = fabricate(&[(130.0, 0.5), (136.0, 0.5)], 62_000.0, 0.0);
    // Both alleles about 31,000 RFU; the neighbor capillary and another dye
    // are as saturated.
    peaks[0].crosstalk_ratio = 1.1;
    peaks[1].bleedthrough_ratio = 1.5;
    let call = analyze_one(peaks.clone());
    assert!(!call.peaks[0].flags.crosstalk);
    assert!(!call.peaks[1].flags.bleedthrough);
    assert_eq!(call.alleles, set(&[130, 136]));
    // A third of the source under a clipped other dye is still pull-up, and
    // a twelfth of a saturated neighbor still leak.
    peaks[0].crosstalk_ratio = 12.0;
    peaks[1].bleedthrough_ratio = 3.0;
    let call = analyze_one(peaks);
    assert!(call.peaks[0].flags.crosstalk);
    assert!(call.peaks[1].flags.bleedthrough);
    assert!(call.flags.offscale);
}

/// Where another dye dips far below its baseline the dyes were not
/// separated: the call is flagged, and the peak rejected only on request.
#[test]
fn spectral_breakdown_flags_the_call_and_optionally_the_peak() {
    let mut peaks = fabricate(&[(130.0, 0.6), (136.0, 0.4)], 20_000.0, 0.0);
    // At 136 another dye reads −90% of the signal; at 130 a normal dip of 5%.
    peaks[0].spectral_dip_ratio = 0.05;
    peaks[1].spectral_dip_ratio = 0.9;
    peaks[1].bleedthrough_ratio = 1.1;
    assert!(!spectral_breakdown(&peaks[0]));
    assert!(spectral_breakdown(&peaks[1]));
    let call = analyze_one(peaks.clone());
    assert!(call.flags.spectral);
    assert!(!call.flags.offscale);
    assert!(!call.peaks[1].flags.any());
    assert_eq!(call.alleles, set(&[130, 136]));
    let mut runs = vec![run(1, 1, peaks.clone())];
    let rejected = analyze_locus(
        7,
        &mut runs,
        &bins(),
        Some(&stutter_model()),
        None,
        &GenotypingParams {
            reject_spectral_breakdown: true,
            ..GenotypingParams::default()
        },
    );
    assert!(rejected[0].peaks[1].flags.spectral);
    assert_eq!(rejected[0].alleles, set(&[130]));
    // The dip is judged against the largest signal at the point: a dip of
    // 90% of this peak beside another dye four times taller is 22.5%.
    peaks[1].bleedthrough_ratio = 4.0;
    assert!(!spectral_breakdown(&peaks[1]));
    // A replicate without the breakdown is preferred.
    let mut broken = fabricate(&[(130.0, 0.6), (136.0, 0.4)], 20_000.0, 0.0);
    broken[1].spectral_dip_ratio = 0.9;
    let clean = fabricate(&[(130.0, 0.6), (136.0, 0.4)], 8_000.0, 0.0);
    let mut runs = [run(1, 1, broken), run(2, 1, clean)];
    for r in runs.iter_mut() {
        bins::annotate_bins(&mut r.peaks, &bins());
    }
    let refs: Vec<&Run> = runs.iter().collect();
    assert_eq!(select_reference_run(&refs, 32_000.0).unwrap().run_id, 2);
}

#[test]
fn near_bin_peaks_are_not_called() {
    // 1.2 bp from the bin center: labelled with the bin, but outside its buffer.
    let call = analyze_one(fabricate(&[(131.2, 1.0)], 5000.0, 0.0));
    assert_eq!(call.peaks[0].bin_id, Some(130));
    assert!(!call.peaks[0].in_bin);
    assert!(call.alleles.is_empty());
}

#[test]
fn manual_toggle_requantifies_and_reanalysis_clears_it() {
    let peaks = fabricate(&[(130.0, 0.75), (136.0, 0.20)], 20000.0, STUTTER);
    let mut call = analyze_one(peaks.clone());
    toggle_allele(&mut call, 127, None);
    assert!(call.flags.manual_curation);
    assert_eq!(call.alleles, set(&[127, 130, 136]));
    // The stutter peak now counts, floored at 1 RFU after artifact removal.
    assert!(peak_at(&call, 127.0).relative_quantification.unwrap() > 0.0);
    toggle_allele(&mut call, 136, None);
    assert_eq!(call.alleles, set(&[127, 130]));
    assert_eq!(peak_at(&call, 136.0).relative_quantification, None);
    // Re-analyzing the locus starts over.
    let again = analyze_one(peaks);
    assert!(!again.flags.manual_curation);
    assert_eq!(again.alleles, set(&[130, 136]));
}

#[test]
fn quantification_bias_applied_after_calling() {
    let beta = -0.01;
    let mut runs = vec![run(
        1,
        1,
        fabricate(&[(118.0, 0.5), (145.0, 0.5)], 10000.0, 0.0),
    )];
    let calls = analyze_locus(
        1,
        &mut runs,
        &bins(),
        None,
        Some(beta),
        &GenotypingParams::default(),
    );
    let c = &calls[0];
    let lo = peak_at(c, 118.0).corrected_relative_quantification.unwrap();
    let hi = peak_at(c, 145.0).corrected_relative_quantification.unwrap();
    // Equal observed signal under β < 0 means the longer allele was under-amplified.
    assert!(hi > lo);
    assert_relative_eq!(lo + hi, 1.0, epsilon = 1e-12);
    let expected_lo = 1.0 / (1.0 + (-(-beta * -13.5f64)).exp());
    assert_relative_eq!(lo, expected_lo, epsilon = 1e-12);
}

// --- Probabilistic model pieces -------------------------------------------------

#[test]
fn moi_is_ranked_count_with_offset() {
    assert_eq!(moi_from_counts(vec![1, 3, 2], 1), 2);
    assert_eq!(moi_from_counts(vec![1, 3, 2], 0), 3);
    assert_eq!(moi_from_counts(vec![4], 1), 0);
    assert_eq!(moi_from_counts(vec![], 0), 0);
}

#[test]
fn posterior_matches_hand_calculation() {
    let p = Peak {
        height: 950.0,
        artifact_contribution: 800.0,
        artifact_error: 150.0,
        ..Peak::default()
    };
    let q = 0.15865525393145707; // P(Z > 1)
    let expected = 1.0 - q * 0.5 / (q * 0.5 + 0.5);
    assert_relative_eq!(posterior(&p, 0.5), expected, epsilon = 1e-12);
    assert_relative_eq!(posterior(&p, 0.0), 1.0);
    // No population support and only 1 SD above stutter: rejected.
    assert_eq!(posterior(&p, 1.0), 0.0);
    // No population support but far above any artifact: the 1e-6 floor lets it through.
    let tall = Peak {
        artifact_contribution: 0.0,
        ..p
    };
    assert!(posterior(&tall, 1.0) > 0.99);
}

#[test]
fn rare_alleles_in_high_moi_sample_are_not_underflow_rejected() {
    // Two candidates with prevalence 0.02 each and MOI 6: S^m = 4e-9, which
    // the old 1e-6 guard turned into "absent" for both.
    let mut peaks = vec![
        Peak {
            bin_id: Some(1),
            in_bin: true,
            height: 950.0,
            artifact_contribution: 800.0,
            artifact_error: 150.0,
            probability: Some(1.0),
            ..Peak::default()
        };
        2
    ];
    peaks[1].bin_id = Some(2);
    let prev: BTreeMap<i64, f64> = [(1, 0.02), (2, 0.02)].into_iter().collect();
    update_probabilities(&mut peaks, &[0, 1], 6, Some(&prev), OwnWeight::Current);
    let pn: f64 = 0.5f64.powi(6);
    let q = 0.15865525393145707;
    assert_relative_eq!(
        peaks[0].probability.unwrap(),
        1.0 - q * pn / (q * pn + 1.0 - pn),
        epsilon = 1e-12
    );
}

// --- Project-wide scenarios -----------------------------------------------------

struct Population {
    calls: Vec<SampleLocusCall>,
    settings: BTreeMap<i64, LocusSettings>,
}

impl Population {
    fn new() -> Self {
        let settings = [1, 2, 3]
            .into_iter()
            .map(|l| (l, LocusSettings::default()))
            .collect();
        Population {
            calls: Vec::new(),
            settings,
        }
    }

    /// Adds one sample × locus call from fabricated peaks.
    fn add(&mut self, sample: i64, locus: i64, alleles: &[(f64, f64)], total: f64, stutter: f64) {
        let mut runs = vec![run(
            sample * 10 + locus,
            sample,
            fabricate(alleles, total, stutter),
        )];
        let model = stutter_model();
        let call = analyze_locus(
            locus,
            &mut runs,
            &bins(),
            Some(&model),
            None,
            &self.settings[&locus].params,
        );
        self.calls.extend(call);
    }

    fn add_peaks(&mut self, sample: i64, locus: i64, peaks: Vec<Peak>) {
        let mut runs = vec![run(sample * 10 + locus, sample, peaks)];
        let call = analyze_locus(
            locus,
            &mut runs,
            &bins(),
            Some(&stutter_model()),
            None,
            &self.settings[&locus].params,
        );
        self.calls.extend(call);
    }

    fn call(&self, sample: i64, locus: i64) -> &SampleLocusCall {
        self.calls
            .iter()
            .find(|c| c.sample_id == sample && c.locus_id == locus)
            .unwrap()
    }
}

/// Equal-share clean alleles.
fn clean(sizes: &[f64]) -> Vec<(f64, f64)> {
    sizes
        .iter()
        .map(|&s| (s, 1.0 / sizes.len() as f64))
        .collect()
}

#[test]
fn moi_and_prevalence_on_a_small_population() {
    let (a, b, c, d) = (112.0, 118.0, 124.0, 133.0);
    let mut pop = Population::new();
    let s = |pop: &mut Population, id, l, al: &[f64]| pop.add(id, l, &clean(al), 6000.0, 0.0);
    s(&mut pop, 1, 1, &[a]);
    s(&mut pop, 1, 2, &[a]);
    s(&mut pop, 1, 3, &[a]);
    s(&mut pop, 2, 1, &[a, b]);
    s(&mut pop, 2, 2, &[a, b, c]);
    s(&mut pop, 2, 3, &[b]);
    s(&mut pop, 3, 1, &[b]);
    s(&mut pop, 3, 2, &[a]);
    pop.add(3, 3, &clean(&[a]), 300.0, 0.0); // failed run
    s(&mut pop, 4, 1, &[a, b, c]);
    s(&mut pop, 4, 2, &[a, b, c]);
    s(&mut pop, 4, 3, &[a, b, c, d]);
    s(&mut pop, 99, 1, &[d]); // control
    assert!(pop.call(3, 3).flags.failure);

    let summary = annotate_probabilities(
        &mut pop.calls,
        |s| s == 99,
        &pop.settings,
        &ProbabilisticOptions::default(),
    )
    .unwrap();
    let moi: Vec<(i64, u32)> = summary.moi.iter().map(|(k, v)| (*k, *v)).collect();
    assert_eq!(moi, vec![(1, 1), (2, 2), (3, 1), (4, 3)]);
    let l1 = &summary.prevalence[&1];
    assert_relative_eq!(l1[&112], 0.75);
    assert_relative_eq!(l1[&118], 0.75);
    assert_relative_eq!(l1[&124], 0.25);
    assert!(
        !l1.contains_key(&133),
        "controls must not inform prevalence"
    );
    let l3 = &summary.prevalence[&3];
    assert_relative_eq!(l3[&133], 1.0 / 3.0); // typed samples at locus 3: 1, 2, 4
                                              // Clean peaks keep their calls; the control is untouched.
    assert_eq!(pop.call(4, 3).alleles, set(&[112, 118, 124, 133]));
    assert_eq!(pop.call(99, 1).peaks[0].probability, None);
    assert!(pop
        .call(4, 3)
        .peaks
        .iter()
        .all(|p| p.probability == Some(1.0)));
}

#[test]
fn population_and_moi_decide_a_minor_peak_at_stutter_height() {
    // Locus 1: everybody carries 130; most also carry 127, a clear allele. A
    // sample whose 127 peak is only one artifact SD above the 130's stutter is
    // called when its MOI says it holds two clones, rejected when it holds one,
    // and a peak at an allele nobody else has is rejected.
    let mut pop = Population::new();
    for id in 1..=16 {
        pop.add(id, 1, &[(130.0, 0.6), (127.0, 0.4)], 15000.0, STUTTER);
        pop.add(id, 2, &clean(&[112.0]), 6000.0, 0.0);
        pop.add(id, 3, &clean(&[112.0]), 6000.0, 0.0);
    }
    let ambiguous = |major: f64| {
        let mut p = fabricate(&[(major, 1.0)], 10000.0, STUTTER);
        // 800 RFU expected stutter ± 100; observed one SD above.
        p.iter_mut()
            .find(|x| (x.size - (major - REPEAT)).abs() < 0.1)
            .unwrap()
            .height += 100.0;
        p
    };
    // Sample 17: two clones (two alleles at loci 2 and 3).
    pop.add_peaks(17, 1, ambiguous(130.0));
    pop.add(17, 2, &clean(&[112.0, 118.0]), 6000.0, 0.0);
    pop.add(17, 3, &clean(&[112.0, 118.0]), 6000.0, 0.0);
    // Sample 18: one clone.
    pop.add_peaks(18, 1, ambiguous(130.0));
    pop.add(18, 2, &clean(&[112.0]), 6000.0, 0.0);
    pop.add(18, 3, &clean(&[112.0]), 6000.0, 0.0);
    // Sample 19: two clones, but the ambiguous peak (136) is an allele no one else has.
    pop.add_peaks(19, 1, ambiguous(139.0));
    pop.add(19, 2, &clean(&[112.0, 118.0]), 6000.0, 0.0);
    pop.add(19, 3, &clean(&[112.0, 118.0]), 6000.0, 0.0);

    // Per-locus calling alone rejects all three ambiguous peaks (absolute limit).
    for s in [17, 18, 19] {
        assert_eq!(pop.call(s, 1).alleles.len(), 1);
    }
    // Lower the absolute limit so the population model has the final word.
    for st in pop.settings.values_mut() {
        st.params.absolute_peak_height_limit = 50.0;
    }
    for c in pop.calls.iter_mut() {
        flag_peaks(&mut c.peaks, &pop.settings[&c.locus_id].params);
    }

    let before = pop.calls.clone();
    let summary = annotate_probabilities(
        &mut pop.calls,
        |_| false,
        &pop.settings,
        &ProbabilisticOptions::default(),
    )
    .unwrap();
    assert_eq!(summary.moi[&17], 2);
    assert_eq!(summary.moi[&18], 1);
    assert_eq!(summary.moi[&19], 2);
    let l1 = &summary.prevalence[&1];
    // 19 samples typed at locus 1; the ambiguous peaks were culled.
    assert_relative_eq!(l1[&127], 16.0 / 19.0);
    assert_relative_eq!(l1[&130], 18.0 / 19.0);
    assert!(!l1.contains_key(&136));

    // Some clone carries 130 (the tallest peak), so the chance that none
    // carries 127 is P(none | one carries 130) = π130^m / (1 − π127^m).
    let expect = |moi: i32| {
        let total = l1[&130] + l1[&127];
        let (pt, pi) = (l1[&130] / total, l1[&127] / total);
        let pn = pt.powi(moi) / (1.0 - pi.powi(moi));
        let q = 0.15865525393145707;
        1.0 - q * pn / (q * pn + 1.0 - pn)
    };
    let p17 = peak_at(pop.call(17, 1), 127.0).probability.unwrap();
    let p18 = peak_at(pop.call(18, 1), 127.0).probability.unwrap();
    assert_relative_eq!(p17, expect(2), epsilon = 1e-9);
    assert_relative_eq!(p18, expect(1), epsilon = 1e-9);
    assert!(p17 >= 0.9 && p18 < 0.9);
    assert_eq!(pop.call(17, 1).alleles, set(&[127, 130]));
    assert_eq!(pop.call(18, 1).alleles, set(&[130]));
    assert_eq!(peak_at(pop.call(19, 1), 136.0).probability, Some(0.0));
    assert_eq!(pop.call(19, 1).alleles, set(&[139]));
    // Clear alleles stay called.
    assert_eq!(pop.call(5, 1).alleles, set(&[127, 130]));

    // Deterministic.
    let mut again = before;
    let summary2 = annotate_probabilities(
        &mut again,
        |_| false,
        &pop.settings,
        &ProbabilisticOptions::default(),
    )
    .unwrap();
    assert_eq!(summary, summary2);
    assert_eq!(again, pop.calls);
}

#[test]
fn manual_calls_survive_the_probabilistic_pass() {
    let mut pop = Population::new();
    pop.add(1, 1, &clean(&[112.0, 118.0]), 6000.0, 0.0);
    pop.add(1, 2, &clean(&[112.0, 118.0]), 6000.0, 0.0);
    let i = pop
        .calls
        .iter()
        .position(|c| c.sample_id == 1 && c.locus_id == 1)
        .unwrap();
    toggle_allele(&mut pop.calls[i], 118, None);
    annotate_probabilities(
        &mut pop.calls,
        |_| false,
        &pop.settings,
        &ProbabilisticOptions::default(),
    )
    .unwrap();
    assert_eq!(pop.call(1, 1).alleles, set(&[112]));
    assert!(pop.call(1, 1).flags.manual_curation);
    assert_eq!(pop.call(1, 2).alleles, set(&[112, 118]));
    assert!(pop.call(1, 1).peaks.iter().all(|p| p.probability.is_some()));
}

#[test]
fn missing_locus_settings_is_an_error() {
    let mut pop = Population::new();
    pop.add(1, 1, &clean(&[112.0]), 6000.0, 0.0);
    pop.calls[0].locus_id = 42;
    let err = annotate_probabilities(
        &mut pop.calls,
        |_| false,
        &pop.settings,
        &ProbabilisticOptions::default(),
    );
    assert_eq!(err, Err(GenotypingError::MissingLocusSettings(42)));
}

/// A reviewer's population (sample → locus → peaks as `[bin, height,
/// artifact_contribution, artifact_error]`; sample 9 is a control).
fn reviewer_population() -> (Vec<SampleLocusCall>, BTreeMap<i64, LocusSettings>) {
    type P = (i64, f64, f64, f64);
    type Loci<'a> = &'a [(i64, &'a [P])];
    let data: &[(i64, Loci)] = &[
        (
            1,
            &[
                (1, &[(200, 10000.0, 0.0, 0.0), (197, 1500.0, 1000.0, 300.0)]),
                (2, &[(150, 8000.0, 0.0, 0.0), (160, 3000.0, 0.0, 0.0)]),
                (3, &[(300, 9000.0, 0.0, 0.0), (309, 2000.0, 0.0, 0.0)]),
            ],
        ),
        (
            2,
            &[
                (1, &[(197, 6000.0, 0.0, 0.0)]),
                (2, &[(150, 7000.0, 0.0, 0.0)]),
                (3, &[(300, 8000.0, 0.0, 0.0)]),
            ],
        ),
        (
            3,
            &[
                (1, &[(200, 7000.0, 0.0, 0.0), (194, 900.0, 600.0, 100.0)]),
                (2, &[(160, 5000.0, 0.0, 0.0)]),
                (3, &[(309, 6000.0, 0.0, 0.0)]),
            ],
        ),
        (
            4,
            &[
                (1, &[(200, 9000.0, 0.0, 0.0)]),
                (2, &[(150, 6000.0, 0.0, 0.0), (160, 2500.0, 0.0, 0.0)]),
                (3, &[(300, 7000.0, 0.0, 0.0)]),
            ],
        ),
        (
            5,
            &[
                (1, &[(197, 5000.0, 0.0, 0.0), (200, 5200.0, 0.0, 0.0)]),
                (2, &[(170, 4000.0, 0.0, 0.0)]),
                (3, &[(312, 3000.0, 0.0, 0.0)]),
            ],
        ),
        (
            9,
            &[
                (1, &[(200, 9000.0, 0.0, 0.0)]),
                (2, &[(150, 9000.0, 0.0, 0.0)]),
                (3, &[(300, 9000.0, 0.0, 0.0)]),
            ],
        ),
    ];
    let mut calls = Vec::new();
    for &(sample, loci) in data {
        for &(locus, peaks) in loci {
            let peaks: Vec<Peak> = peaks
                .iter()
                .enumerate()
                .map(|(i, &(b, h, ac, e))| Peak {
                    index: i,
                    bin_id: Some(b),
                    in_bin: true,
                    height: h,
                    artifact_contribution: ac,
                    artifact_error: e,
                    relative_height: 1.0,
                    ..Peak::default()
                })
                .collect();
            calls.push(SampleLocusCall {
                sample_id: sample,
                locus_id: locus,
                reference_run_id: Some(sample * 10 + locus),
                alleles: peaks.iter().filter_map(|p| p.bin_id).collect(),
                peaks,
                flags: CallFlags::default(),
            });
        }
    }
    let settings = [1, 2, 3]
        .into_iter()
        .map(|l| (l, LocusSettings::default()))
        .collect();
    (calls, settings)
}

fn probability_of(calls: &[SampleLocusCall], sample: i64, locus: i64, bin: i64) -> f64 {
    calls
        .iter()
        .find(|c| c.sample_id == sample && c.locus_id == locus)
        .and_then(|c| c.peaks.iter().find(|p| p.bin_id == Some(bin)))
        .and_then(|p| p.probability)
        .unwrap()
}

#[test]
fn reviewer_population_calls_minor_alleles_on_stutter() {
    let (mut calls, settings) = reviewer_population();
    let summary = annotate_probabilities(
        &mut calls,
        |s| s == 9,
        &settings,
        &ProbabilisticOptions::default(),
    )
    .unwrap();
    let alleles = |s: i64, l: i64| {
        calls
            .iter()
            .find(|c| c.sample_id == s && c.locus_id == l)
            .unwrap()
            .alleles
            .clone()
    };
    // Sample 1 holds two clones and the population supports 197, so its
    // minor peak at a stutter position is called although it is only 1.67
    // artifact SDs above its expected stutter.
    assert_relative_eq!(probability_of(&calls, 1, 1, 197), 0.954389, epsilon = 1e-6);
    assert_eq!(alleles(1, 1), set(&[197, 200]));
    // Sample 3 shows one clone at every other locus (MOI 1), so its one
    // clone carries 200 and 194, 3 SDs above its expected stutter, has only
    // its artifact evidence. This is the price of conditioning on the
    // tallest peak when two clones differ at a single locus.
    assert!(probability_of(&calls, 3, 1, 194) < 1e-6);
    assert_eq!(alleles(3, 1), set(&[200]));
    assert_eq!(alleles(5, 1), set(&[197, 200]));
    assert_eq!(
        summary.moi.into_iter().collect::<Vec<_>>(),
        vec![(1, 2), (2, 1), (3, 1), (4, 1), (5, 1)]
    );
    assert_relative_eq!(summary.prevalence[&1][&197], 0.4);
    // The control is untouched.
    assert!(calls
        .iter()
        .filter(|c| c.sample_id == 9)
        .all(|c| c.peaks.iter().all(|p| p.probability.is_none())));
}

/// One call from raw `(bin, height, artifact_contribution, artifact_error)`
/// peaks, every peak in its bin and unflagged.
fn raw_call(sample: i64, locus: i64, peaks: &[(i64, f64, f64, f64)]) -> SampleLocusCall {
    let peaks: Vec<Peak> = peaks
        .iter()
        .enumerate()
        .map(|(i, &(b, h, ac, e))| Peak {
            index: i,
            bin_id: Some(b),
            in_bin: true,
            height: h,
            artifact_contribution: ac,
            artifact_error: e,
            relative_height: 1.0,
            ..Peak::default()
        })
        .collect();
    SampleLocusCall {
        sample_id: sample,
        locus_id: locus,
        reference_run_id: Some(sample * 10 + locus),
        alleles: peaks.iter().filter_map(|p| p.bin_id).collect(),
        peaks,
        flags: CallFlags::default(),
    }
}

/// Sample 100 holds two clones (40 and 30 at locus 1). Its peak at 20, a
/// common allele, is stutter three artifact SDs *below* its expected height,
/// which the loops reject; its 30 is a real minor allele 1.8 artifact SDs
/// above its expected stutter. At weight 1 in the final pass the rejected
/// peak took enough prior support from 30 to drop it below the threshold
/// (0.881 against 0.952 without the stutter peak; 0.916 at its converged
/// probability).
#[test]
fn peaks_rejected_in_the_loops_do_not_dilute_the_final_pass() {
    let population = |with_stutter: bool| {
        let mut calls = Vec::new();
        for s in 1..=20 {
            let l1: &[(i64, f64, f64, f64)] = match s {
                1..=10 => &[(20, 6000.0, 0.0, 0.0), (40, 8000.0, 0.0, 0.0)],
                11..=16 => &[(30, 6000.0, 0.0, 0.0), (40, 8000.0, 0.0, 0.0)],
                _ => &[(20, 8000.0, 0.0, 0.0)],
            };
            calls.push(raw_call(s, 1, l1));
            calls.push(raw_call(
                s,
                2,
                &[(1, 5000.0, 0.0, 0.0), (2, 4000.0, 0.0, 0.0)],
            ));
            calls.push(raw_call(s, 3, &[(1, 5000.0, 0.0, 0.0)]));
        }
        let mut l1 = vec![(40, 10000.0, 0.0, 0.0), (30, 980.0, 800.0, 100.0)];
        if with_stutter {
            l1.push((20, 500.0, 800.0, 100.0));
        }
        calls.push(raw_call(100, 1, &l1));
        calls.push(raw_call(
            100,
            2,
            &[(1, 5000.0, 0.0, 0.0), (2, 4000.0, 0.0, 0.0)],
        ));
        calls.push(raw_call(
            100,
            3,
            &[(1, 5000.0, 0.0, 0.0), (2, 4000.0, 0.0, 0.0)],
        ));
        let settings: BTreeMap<i64, LocusSettings> = [1, 2, 3]
            .into_iter()
            .map(|l| (l, LocusSettings::default()))
            .collect();
        let summary = annotate_probabilities(
            &mut calls,
            |_| false,
            &settings,
            &ProbabilisticOptions::default(),
        )
        .unwrap();
        assert_eq!(summary.moi[&100], 2);
        calls
            .into_iter()
            .find(|c| c.sample_id == 100 && c.locus_id == 1)
            .unwrap()
    };
    let p = |c: &SampleLocusCall, b: i64| {
        c.peaks
            .iter()
            .find(|p| p.bin_id == Some(b))
            .and_then(|p| p.probability)
            .unwrap()
    };
    let without = population(false);
    let with = population(true);
    assert_eq!(without.alleles, set(&[30, 40]), "{}", p(&without, 30));
    assert_eq!(with.alleles, set(&[30, 40]), "{}", p(&with, 30));
    assert!(p(&with, 20) < 0.9, "{}", p(&with, 20));
    // A peak's own evidence enters through its artifact term only, so
    // without rejected peaks nothing changes.
    let q = normal_sf(1.8);
    // 21 typed samples; 30 never stays a candidate in sample 100. Some
    // clone carries 40, the tallest peak.
    let (f40, f30): (f64, f64) = (17.0 / 21.0, 6.0 / 21.0);
    let (p40, p30) = (f40 / (f40 + f30), f30 / (f40 + f30));
    let pn = p40.powi(2) / (1.0 - p30.powi(2));
    assert_relative_eq!(
        p(&without, 30),
        (1.0 - pn) / (q * pn + 1.0 - pn),
        epsilon = 1e-9
    );
}

/// A single-clone sample carries a rare allele (30) whose −1 repeat stutter
/// falls on the population's most common allele (27). Normalized over the
/// sample's own candidates, the common allele took nearly all the prior and
/// the stutter peak, three artifact SDs above its expectation, was called.
/// The one clone carries 30, so 27 must stand on its artifact evidence alone.
#[test]
fn stutter_on_a_common_allele_is_not_called_in_a_single_clone_sample() {
    let mut calls = Vec::new();
    for s in 1..=20 {
        let allele = if s == 20 { 30 } else { 27 };
        calls.push(raw_call(s, 1, &[(allele, 8000.0, 0.0, 0.0)]));
        calls.push(raw_call(s, 2, &[(1, 5000.0, 0.0, 0.0)]));
        calls.push(raw_call(s, 3, &[(1, 5000.0, 0.0, 0.0)]));
    }
    calls.push(raw_call(
        100,
        1,
        &[(30, 10000.0, 0.0, 0.0), (27, 1100.0, 800.0, 100.0)],
    ));
    calls.push(raw_call(100, 2, &[(1, 5000.0, 0.0, 0.0)]));
    calls.push(raw_call(100, 3, &[(2, 5000.0, 0.0, 0.0)]));
    // Same, but two clones: the second one may carry 27.
    calls.push(raw_call(
        101,
        1,
        &[(30, 10000.0, 0.0, 0.0), (27, 1100.0, 800.0, 100.0)],
    ));
    calls.push(raw_call(
        101,
        2,
        &[(1, 5000.0, 0.0, 0.0), (2, 4000.0, 0.0, 0.0)],
    ));
    calls.push(raw_call(
        101,
        3,
        &[(1, 5000.0, 0.0, 0.0), (2, 4000.0, 0.0, 0.0)],
    ));
    let settings: BTreeMap<i64, LocusSettings> = [1, 2, 3]
        .into_iter()
        .map(|l| (l, LocusSettings::default()))
        .collect();
    let summary = annotate_probabilities(
        &mut calls,
        |_| false,
        &settings,
        &ProbabilisticOptions::default(),
    )
    .unwrap();
    assert_eq!((summary.moi[&100], summary.moi[&101]), (1, 2));
    let call = |s: i64| {
        calls
            .iter()
            .find(|c| c.sample_id == s && c.locus_id == 1)
            .unwrap()
    };
    assert_eq!(call(100).alleles, set(&[30]));
    assert!(probability_of(&calls, 100, 1, 27) < 1e-6);
    assert_eq!(call(101).alleles, set(&[27, 30]));
}

#[test]
fn measured_pullup_flags_and_fallbacks() {
    let params = GenotypingParams::default();
    let mk = |height: f64, epu: f64, spu: f64| Peak {
        height,
        relative_height: 0.5,
        pullup_contribution: Some(epu),
        pullup_error: Some(spu),
        bleedthrough_ratio: 7.0,
        fallback_bleedthrough_ratio: 0.0,
        ..Peak::default()
    };
    let mut peaks = vec![
        // 1. 14% plate pull-up (ratio 7 > 5 is irrelevant; EPU+4*SD = 1200 >= 1000): flagged.
        mk(1000.0, 1000.0, 50.0),
        // 2. Above EPU+4*SD, but residual above expected positive pull-up < 200 RFU: flagged.
        mk(1350.0, 1200.0, 20.0),
        // 3. Clean plate (0.4% -> EPU 60 ± 30): ratio 7 (> 5!) is NOT flagged because 1000 >> 180!
        mk(1000.0, 60.0, 30.0),
        // 4. Negative spectral dip (EPU = -250 ± 50 -> pu_bound = -50): NOT flagged.
        // Crucially, negative EPU does NOT credit toward the 200 RFU height floor!
        Peak {
            height: 250.0,
            relative_height: 0.5,
            pullup_contribution: Some(-250.0),
            pullup_error: Some(50.0),
            bleedthrough_ratio: 7.0,
            fallback_bleedthrough_ratio: 0.0,
            ..Peak::default()
        },
        // 5. Low peak already failing artifact (150 < 200): pu_bound 200 covers 150 -> flagged,
        //    whereas pu_bound 100 (< 150) does NOT give spurious bleedthrough flag.
        Peak {
            height: 150.0,
            relative_height: 0.5,
            pullup_contribution: Some(80.0),
            pullup_error: Some(30.0),
            bleedthrough_ratio: 7.0,
            fallback_bleedthrough_ratio: 0.0,
            ..Peak::default()
        },
        Peak {
            height: 150.0,
            relative_height: 0.5,
            pullup_contribution: Some(40.0),
            pullup_error: Some(15.0),
            bleedthrough_ratio: 7.0,
            fallback_bleedthrough_ratio: 0.0,
            ..Peak::default()
        },
        // 6. Unmeasured dye falls back via fallback_bleedthrough_ratio > 5.0.
        Peak {
            height: 1000.0,
            relative_height: 0.5,
            pullup_contribution: Some(50.0),
            pullup_error: Some(20.0),
            bleedthrough_ratio: 8.0,
            fallback_bleedthrough_ratio: 8.0,
            ..Peak::default()
        },
        // 7. Off-scale source still flags even with small EPU.
        Peak {
            height: 5000.0,
            relative_height: 0.5,
            pullup_contribution: Some(50.0),
            pullup_error: Some(20.0),
            bleedthrough_ratio: 7.0,
            fallback_bleedthrough_ratio: 0.0,
            ..Peak::default()
        },
    ];
    flag_peaks(&mut peaks, &params);
    assert!(peaks[0].flags.bleedthrough);
    assert!(peaks[1].flags.bleedthrough);
    assert!(!peaks[2].flags.bleedthrough);
    assert!(!peaks[3].flags.bleedthrough);
    assert!(peaks[4].flags.bleedthrough && peaks[4].flags.artifact);
    assert!(!peaks[5].flags.bleedthrough && peaks[5].flags.artifact);
    assert!(peaks[6].flags.bleedthrough);
    assert!(peaks[7].flags.bleedthrough);

    // Turning measured_pullup off reverts cleanly to fixed bleedthrough_filter_limit = 5.
    let fixed = GenotypingParams {
        measured_pullup: false,
        ..params
    };
    let mut off = vec![mk(1000.0, 60.0, 30.0), mk(1000.0, 1000.0, 50.0)];
    off[1].bleedthrough_ratio = 4.0; // e.g. 25% plate pull-up
    flag_peaks(&mut off, &fixed);
    assert!(off[0].flags.bleedthrough); // caught by fixed limit 5
    assert!(!off[1].flags.bleedthrough); // missed by fixed limit 5
}
