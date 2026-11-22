//! Times parsing, sizing, and scanning a synthetic 96-well plate, single-threaded.
//!
//! cargo run --release -p microspat-core --example plate_timing

use microspat_core::abif::{parse_fsa, Fsa};
use microspat_core::ladder::{fit_ladder, fit_ladder_with_prior, resolve_with_plate, LadderSpec};
use microspat_core::peaks::{annotate, scan, FilterParams, RunSignals, ScanParams};
use microspat_core::synth::{generate_plate, SynthSpec};
use microspat_core::Color;
use std::time::Instant;

fn main() {
    let t = Instant::now();
    let plate = generate_plate(&SynthSpec::demo(1)).expect("demo spec is valid");
    let bytes: usize = plate.iter().map(|w| w.fsa.len()).sum();
    println!(
        "synthesized {} wells ({:.1} MB) in {:.0} ms (not part of the timing)",
        plate.len(),
        bytes as f64 / 1e6,
        t.elapsed().as_secs_f64() * 1e3
    );

    let total = Instant::now();
    let t = Instant::now();
    let fsas: Vec<Fsa> = plate
        .iter()
        .map(|w| parse_fsa(&w.fsa).expect("synthetic FSA parses"))
        .collect();
    let parse_ms = t.elapsed().as_secs_f64() * 1e3;

    let ladder = LadderSpec::default();
    let t = Instant::now();
    let traces: Vec<(&[i16], Vec<&[i16]>)> = fsas
        .iter()
        .map(|f| {
            let trace = f
                .channel(ladder.color)
                .expect("ladder dye present")
                .data
                .as_slice();
            let others: Vec<&[i16]> = f
                .channels
                .iter()
                .filter(|c| c.color != ladder.color)
                .map(|c| c.data.as_slice())
                .collect();
            (trace, others)
        })
        .collect();
    // Every well alone, then the ambiguous ones against the plate, as on import.
    let mut results: Vec<_> = traces
        .iter()
        .map(|(trace, others)| fit_ladder(trace, others, &ladder))
        .collect();
    resolve_with_plate(&ladder, &mut results, |k, prior| {
        fit_ladder_with_prior(traces[k].0, &traces[k].1, &ladder, Some(prior))
    });
    let fits: Vec<_> = results.into_iter().map(Result::ok).collect();
    let size_ms = t.elapsed().as_secs_f64() * 1e3;

    let params = ScanParams::default();
    let t = Instant::now();
    let scanned: Vec<Vec<_>> = fsas
        .iter()
        .map(|f| {
            f.channels
                .iter()
                .map(|c| scan(&c.data, &params).expect("valid params"))
                .collect()
        })
        .collect();
    let scan_ms = t.elapsed().as_secs_f64() * 1e3;
    let total_ms = total.elapsed().as_secs_f64() * 1e3;

    let t = Instant::now();
    let filter = FilterParams::default();
    let mut kept = 0;
    for ((f, fit), cands) in fsas.iter().zip(&fits).zip(&scanned) {
        let Some(fit) = fit else { continue };
        for (k, c) in f.channels.iter().enumerate() {
            let others: Vec<(Color, &[i16])> = f
                .channels
                .iter()
                .filter(|o| o.color != c.color)
                .map(|o| (o.color, o.data.as_slice()))
                .collect();
            let run = RunSignals {
                trace: &c.data,
                base_sizes: &fit.base_sizes,
                other_dyes: &others,
                neighbor_capillaries: &[],
                pull_up: None,
                drop_measured_pullup: false,
                offscale_indices: &[],
            };
            kept += annotate(&cands[k], &run, 50.0..=400.0, &filter).len();
        }
    }
    let annotate_ms = t.elapsed().as_secs_f64() * 1e3;

    let sized = fits.iter().filter(|f| f.is_some()).count();
    let candidates: usize = scanned.iter().flatten().map(Vec::len).sum();
    println!("parse {parse_ms:.1} ms | size {size_ms:.1} ms ({sized}/{} wells) | scan {scan_ms:.1} ms ({candidates} candidates, {} channels)", fsas.len(), fsas.len() * 4);
    println!("parse + size + scan: {total_ms:.1} ms");
    println!("annotate every channel over 50–400 bp: {annotate_ms:.1} ms ({kept} peaks kept)");
}
