//! Plate quality on simulated plates: the study plate's two capillaries
//! with unseparated dyes and its 14% blue-into-green pull-up are found, the
//! planted crosstalk is measured, and a clean plate raises no issue.
#![cfg(all(feature = "signal", feature = "calling"))]

use microspat_core::abif::{parse_fsa, Fsa};
use microspat_core::ladder::{fit_ladder, LadderSpec};
use microspat_core::plate::{PlateSize, Well};
use microspat_core::quality::{
    assess_plate, IssueKind, PlateQuality, WellFlag, WellInput, WellLadder,
};
use microspat_core::synth::{generate_plate, SynthSpec, WellKind, CROSSTALK};
use microspat_core::Color;

/// Parses, sizes and measures a simulated plate.
fn report(spec: &SynthSpec) -> PlateQuality {
    let ladder = LadderSpec::default();
    let wells: Vec<(Well, Fsa)> = generate_plate(spec)
        .unwrap()
        .into_iter()
        .map(|w| (Well::parse(&w.well).unwrap(), parse_fsa(&w.fsa).unwrap()))
        .collect();
    let fits: Vec<_> = wells
        .iter()
        .map(|(_, fsa)| {
            let trace = &fsa.channel(ladder.color).unwrap().data;
            let others: Vec<&[i16]> = fsa
                .channels
                .iter()
                .filter(|c| c.color != ladder.color)
                .map(|c| c.data.as_slice())
                .collect();
            fit_ladder(trace, &others, &ladder).ok()
        })
        .collect();
    let inputs: Vec<WellInput<'_>> = wells
        .iter()
        .zip(&fits)
        .map(|((well, fsa), fit)| WellInput {
            well: *well,
            dyes: fsa
                .channels
                .iter()
                .map(|c| (c.color, c.data.as_slice()))
                .collect(),
            ladder: fit.as_ref().map(|f| WellLadder {
                peak_indices: &f.peak_indices,
                peak_sizes: &f.peak_sizes,
                sizing_quality: f.sizing_quality,
                reference: f.is_reference(&ladder),
            }),
            offscale_indices: &fsa.offscale_indices,
        })
        .collect();
    assess_plate(&inputs, &ladder, PlateSize::W96, None)
}

fn leak(q: &PlateQuality, source: Color, target: Color) -> f64 {
    q.pull_up
        .iter()
        .find(|l| l.source == source && l.target == target)
        .and_then(|l| l.fraction)
        .unwrap_or(f64::NAN)
}

#[test]
fn study_plate_reports_its_faulty_capillaries_and_pull_up() {
    // A failed well has nothing to judge; take the first seed where both
    // faulty capillaries ran a sample.
    let spec = (2026..)
        .map(SynthSpec::study)
        .find(|s| {
            generate_plate(s).unwrap().iter().all(|w| {
                !s.spectral_fault_wells.contains(&w.well) || w.truth.kind == WellKind::Sample
            })
        })
        .unwrap();
    let q = report(&spec);
    let faulty = q
        .issues
        .iter()
        .find(|i| i.kind == IssueKind::UnseparatedDyes)
        .expect("unseparated dyes reported");
    let mut expected = spec.spectral_fault_wells.clone();
    expected.sort();
    let mut found = faulty.wells.clone();
    found.sort();
    assert_eq!(found, expected, "{}", faulty.message);

    let bg = leak(&q, Color::Blue, Color::Green);
    assert!((bg - 0.14).abs() < 0.01, "blue into green {bg}");
    let pull = q
        .issues
        .iter()
        .find(|i| i.kind == IssueKind::PullUp)
        .expect("pull-up reported");
    assert!(pull.title.contains("Blue"), "{}", pull.title);
    // Typical pull-up stays unreported.
    assert_eq!(
        q.issues
            .iter()
            .filter(|i| i.kind == IssueKind::PullUp)
            .count(),
        1
    );
}

#[test]
fn clean_plate_raises_no_issue_and_measures_its_leaks() {
    let spec = SynthSpec {
        failed_fraction: 0.0,
        ..SynthSpec::demo(2027)
    };
    let q = report(&spec);
    assert!(q.issues.is_empty(), "{:#?}", q.issues);
    // The simulator's typical pull-up (4% blue into green, dips of 1.2% in
    // yellow) and capillary crosstalk (1.1, 0.7, 0.4%).
    let bg = leak(&q, Color::Blue, Color::Green);
    assert!((bg - 0.04).abs() < 0.005, "blue into green {bg}");
    let by = leak(&q, Color::Blue, Color::Yellow);
    assert!(by < 0.0, "blue into yellow is a dip: {by}");
    for (d, planted) in CROSSTALK.iter().enumerate() {
        let x = q
            .crosstalk
            .iter()
            .find(|x| x.distance == d as u32 + 1 && !x.saturated)
            .and_then(|x| x.fraction)
            .unwrap_or(f64::NAN);
        assert!((x - planted).abs() < 0.002, "distance {}: {x}", d + 1);
    }
    // Off-scale wells are flagged for the grid, but too few to report.
    assert!(q
        .wells
        .iter()
        .all(|w| w.flags.iter().all(|f| *f == WellFlag::Offscale)));
    assert_eq!(q.wells.len(), 96);
    assert_eq!(q.wells[0].capillary, Some(1));
    assert_eq!(q.wells[0].well, "H01");
}
