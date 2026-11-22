//! End to end through the public API: synthesize a 96-well plate, parse every
//! FSA, size every well, scan and annotate every locus, and score the result
//! against the synthetic ground truth.
#![cfg(feature = "signal")]

use microspat_core::abif::{parse_fsa, Fsa};
use microspat_core::ladder::{fit_ladder, LadderFit, LadderSpec, SizingStatus};
use microspat_core::peaks::{annotate, scan, FilterParams, RunSignals, ScanParams};
use microspat_core::plate::{neighbor_wells, PlateSize, Well};
use microspat_core::synth::{generate_plate, SynthSpec, WellKind};
use std::collections::HashMap;

#[test]
fn synthetic_plate_end_to_end() {
    let spec = SynthSpec::demo(2026);
    let plate = generate_plate(&spec).unwrap();
    assert_eq!(plate.len(), 96);
    let fsas: HashMap<String, Fsa> = plate
        .iter()
        .map(|w| (w.well.clone(), parse_fsa(&w.fsa).unwrap()))
        .collect();

    // Sizing.
    let ladder = LadderSpec::default();
    let mut fits: HashMap<String, LadderFit> = HashMap::new();
    let mut worst_error: f64 = 0.0;
    let mut qualities = Vec::new();
    for w in &plate {
        let fsa = &fsas[&w.well];
        let trace = &fsa.channel(ladder.color).unwrap().data;
        let others: Vec<&[i16]> = fsa
            .channels
            .iter()
            .filter(|c| c.color != ladder.color)
            .map(|c| c.data.as_slice())
            .collect();
        let result = fit_ladder(trace, &others, &ladder);
        if w.truth.kind == WellKind::Failed {
            let usable = result
                .as_ref()
                .is_ok_and(|f| f.status(&ladder) != SizingStatus::Unusable);
            assert!(!usable, "failed well {} was sized", w.well);
            continue;
        }
        let fit = result.unwrap_or_else(|e| panic!("well {}: {e}", w.well));
        assert_eq!(
            fit.status(&ladder),
            SizingStatus::Good,
            "well {} quality {}",
            w.well,
            fit.sizing_quality
        );
        assert_eq!(
            fit.peak_sizes.len(),
            ladder.base_sizes.len(),
            "well {}",
            w.well
        );
        qualities.push(fit.sizing_quality);
        let m = w.truth.mobility;
        let (lo, hi) = (
            m.index_of(50.0).ceil() as usize,
            m.index_of(400.0).floor() as usize,
        );
        for i in (lo..=hi).step_by(7) {
            worst_error = worst_error.max((fit.base_sizes[i] - m.size_at(i as f64)).abs());
        }
        fits.insert(w.well.clone(), fit);
    }
    qualities.sort_by(f64::total_cmp);
    eprintln!(
        "sizing: {} wells sized, worst error in ladder range {worst_error:.3} bp, quality median {:.3} max {:.3}",
        fits.len(),
        qualities[qualities.len() / 2],
        qualities[qualities.len() - 1]
    );
    assert!(worst_error < 0.5, "worst sizing error {worst_error}");

    // Peaks. Each locus is annotated twice: with the default filters (minimum
    // height lowered to 40 RFU), and with the crosstalk filter off. The old
    // crosstalk ratio (neighbor signal / own signal) also removes true alleles
    // when a neighboring capillary has a much taller peak at a nearby scan, so
    // recall is exact only without it.
    let scan_params = ScanParams::default();
    let filter = FilterParams {
        min_peak_height: 40.0,
        ..FilterParams::default()
    };
    let no_crosstalk = FilterParams {
        max_crosstalk: f64::INFINITY,
        ..filter.clone()
    };
    let mut planted = 0;
    let mut minor_planted = 0;
    let mut found = [0usize; 2];
    let mut minor_found = [0usize; 2];
    let mut worst_peak_error: f64 = 0.0;
    for w in plate.iter().filter(|w| w.truth.kind == WellKind::Sample) {
        let fsa = &fsas[&w.well];
        let fit = &fits[&w.well];
        let well = Well::parse(&w.well).unwrap();
        let neighbors: Vec<Well> = neighbor_wells(well, PlateSize::W96, 2).unwrap();
        for (locus, truth) in spec.loci.iter().zip(&w.truth.loci) {
            let channel = fsa.channel(locus.color).unwrap();
            let others: Vec<(microspat_core::Color, &[i16])> = fsa
                .channels
                .iter()
                .filter(|c| c.color != locus.color)
                .map(|c| (c.color, c.data.as_slice()))
                .collect();
            let neighbor_traces: Vec<&[i16]> = neighbors
                .iter()
                .filter_map(|n| fsas.get(&n.label()))
                .filter_map(|f| f.channel(locus.color))
                .map(|c| c.data.as_slice())
                .collect();
            let candidates = scan(&channel.data, &scan_params).unwrap();
            let run = RunSignals {
                trace: &channel.data,
                base_sizes: &fit.base_sizes,
                other_dyes: &others,
                neighbor_capillaries: &neighbor_traces,
                pull_up: None,
                drop_measured_pullup: false,
                offscale_indices: &[],
            };
            let range = locus.min_size..=locus.max_size;
            let annotated = [
                annotate(&candidates, &run, range.clone(), &filter),
                annotate(&candidates, &run, range, &no_crosstalk),
            ];
            let major = truth.alleles.iter().map(|a| a.height).fold(0.0, f64::max);
            for a in &truth.alleles {
                // Beyond the 400 bp ladder fragment sizes are extrapolated.
                let tolerance = if a.size > 400.0 { 1.0 } else { 0.5 };
                let minor = a.height <= 0.1 * major;
                planted += 1;
                minor_planted += usize::from(minor);
                for (k, peaks) in annotated.iter().enumerate() {
                    let hit = peaks
                        .iter()
                        .map(|p| (p.size - a.size).abs())
                        .fold(f64::INFINITY, f64::min);
                    if hit <= tolerance {
                        found[k] += 1;
                        minor_found[k] += usize::from(minor);
                        if a.size <= 400.0 {
                            worst_peak_error = worst_peak_error.max(hit);
                        }
                    } else if k == 1 {
                        eprintln!(
                            "missed {} {} {:.1} bp ({:.0} RFU of {:.0}, nearest {:.2} bp off)",
                            w.well, locus.label, a.size, a.height, major, hit
                        );
                    }
                }
            }
        }
    }
    eprintln!(
        "alleles planted {planted} (minor ≤10% of major: {minor_planted}); recovered with defaults {}/{planted} (minor {}/{minor_planted}), without crosstalk filter {}/{planted} (minor {}/{minor_planted}); worst size error {worst_peak_error:.3} bp",
        found[0], minor_found[0], found[1], minor_found[1]
    );
    assert!(
        minor_planted >= 20,
        "too few minor alleles planted to test: {minor_planted}"
    );
    // With raw-3730 noise (up to 12.5 RFU SD) and dips, a few alleles under
    // ~300 RFU (long alleles amplify less) merge into a taller neighbor
    // within 2.2 bp or sink into the noise.
    assert!(
        found[1] as f64 >= 0.99 * planted as f64,
        "alleles missed without the crosstalk filter: {} of {planted}",
        planted - found[1]
    );
    assert!(found[0] as f64 >= 0.97 * planted as f64);
    assert!(minor_found[0] as f64 >= 0.9 * minor_planted as f64);
    assert!(worst_peak_error < 0.5);
}

/// Sizing across several plates: every failed well errors (or is unusable),
/// every other well sizes within 0.5 bp of the truth inside the ladder range.
#[test]
fn sizing_holds_across_seeds() {
    let ladder = LadderSpec::default();
    for seed in [1, 7, 99] {
        let spec = SynthSpec {
            failed_fraction: 0.1,
            ..SynthSpec::demo(seed)
        };
        let mut failed = 0;
        for w in generate_plate(&spec).unwrap() {
            let fsa = parse_fsa(&w.fsa).unwrap();
            let trace = &fsa.channel(ladder.color).unwrap().data;
            let result = fit_ladder(trace, &[], &ladder);
            if w.truth.kind == WellKind::Failed {
                failed += 1;
                assert!(
                    result
                        .as_ref()
                        .map_or(true, |f| f.status(&ladder) == SizingStatus::Unusable),
                    "seed {seed} well {} failed but sized",
                    w.well
                );
                continue;
            }
            let fit = result.unwrap_or_else(|e| panic!("seed {seed} well {}: {e}", w.well));
            assert_eq!(fit.status(&ladder), SizingStatus::Good);
            let m = w.truth.mobility;
            for s in (50..=400).step_by(5) {
                let i = m.index_of(f64::from(s)).round() as usize;
                let err = (fit.base_sizes[i] - m.size_at(i as f64)).abs();
                assert!(
                    err < 0.5,
                    "seed {seed} well {} at {s} bp: error {err}",
                    w.well
                );
            }
        }
        assert!(failed > 0);
    }
}
