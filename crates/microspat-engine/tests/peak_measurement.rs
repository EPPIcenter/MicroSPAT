//! Peak heights and minor-allele proportions against planted truth, on
//! clean traces and on traces typical of raw 3730 data
//! (`SynthBaseline::raw_3730`: levels of −80 to +60 RFU, drift of −90 to
//! +40 RFU over the run, a slow wave of up to 40 RFU, noise SD up to
//! 12.5 RFU, and signed spectral pull-up and dips of a few percent).
//! Compares the height above baseline with the raw apex value.
//!
//! Sizes come from the planted mobility, so sizing plays no part. Alleles
//! within 2.5 repeats of another allele (its stutter) and saturated ones are
//! left out. Both columns share two errors that are not the baseline's: the
//! apex falls between data points (up to about 3% low on peaks 5 points
//! wide at half height, about 1% on average), and crosstalk and pull-up planted by the generator add up to a
//! few hundred RFU to some alleles.
//!
//! `cargo test --release -p microspat-engine --test peak_measurement -- --nocapture`
//! prints the table.

use microspat_core::abif::parse_fsa;
use microspat_core::peaks::{annotate, scan, FilterParams, RunSignals, ScanParams};
use microspat_core::synth::{generate_plate, SynthBaseline, SynthSpec, WellKind};

/// Errors of one plate set, raw apex and height above baseline.
#[derive(Default)]
struct Errors {
    /// (raw - planted, corrected - planted) per allele, RFU.
    heights: Vec<(f64, f64)>,
    /// Same for alleles planted below 1,000 RFU, relative to the planted height.
    minor_rel: Vec<(f64, f64)>,
    /// (raw, corrected) minus planted minor / (major + minor), two-allele loci.
    proportions: Vec<(f64, f64)>,
}

fn stats(v: &[f64]) -> (f64, f64, f64) {
    let n = v.len().max(1) as f64;
    let bias = v.iter().sum::<f64>() / n;
    let mae = v.iter().map(|x| x.abs()).sum::<f64>() / n;
    let max = v.iter().map(|x| x.abs()).fold(0.0, f64::max);
    (bias, mae, max)
}

fn measure(baseline: Option<SynthBaseline>) -> Errors {
    let mut out = Errors::default();
    for seed in 0..3u64 {
        let spec = SynthSpec {
            stutter_cv: 0.0,
            baseline: baseline.clone(),
            ..SynthSpec::demo(500 + seed)
        };
        for w in generate_plate(&spec).unwrap() {
            if w.truth.kind != WellKind::Sample {
                continue;
            }
            let fsa = parse_fsa(&w.fsa).unwrap();
            let mob = w.truth.mobility;
            for (l, truth) in spec.loci.iter().zip(&w.truth.loci) {
                let Some(ch) = fsa.channel(l.color) else {
                    continue;
                };
                let trace = &ch.data;
                // True sizes, so sizing plays no part.
                let sizes: Vec<f64> = (0..trace.len()).map(|i| mob.size_at(i as f64)).collect();
                let others: Vec<(microspat_core::Color, &[i16])> = fsa
                    .channels
                    .iter()
                    .filter(|c| c.color != l.color)
                    .map(|c| (c.color, c.data.as_slice()))
                    .collect();
                let run = RunSignals {
                    trace,
                    base_sizes: &sizes,
                    other_dyes: &others,
                    neighbor_capillaries: &[],
                    pull_up: None,
                    drop_measured_pullup: false,
                    offscale_indices: &[],
                };
                let open = FilterParams {
                    max_bleedthrough: f64::INFINITY,
                    max_crosstalk: f64::INFINITY,
                    min_peak_distance: 0.0,
                    ..FilterParams::default()
                };
                let peaks = annotate(
                    &scan(trace, &ScanParams::default()).unwrap(),
                    &run,
                    l.min_size - 10.0..=l.max_size + 10.0,
                    &open,
                );
                // Alleles clear of every other allele's stutter (-2..+1 repeats).
                let clear = |s: f64| {
                    truth
                        .alleles
                        .iter()
                        .all(|b| b.size == s || (b.size - s).abs() > 2.5 * l.repeat_length)
                };
                let mut found = Vec::new();
                for a in &truth.alleles {
                    let at = mob.index_of(a.size).round() as usize;
                    let Some(p) = peaks.iter().find(|p| p.index.abs_diff(at) <= 4) else {
                        continue;
                    };
                    found.push((a, p));
                    if a.saturated || a.height < 100.0 || !clear(a.size) {
                        continue;
                    }
                    out.heights
                        .push((p.raw_height - a.height, p.height - a.height));
                    if a.height < 1000.0 {
                        out.minor_rel.push((
                            (p.raw_height - a.height) / a.height,
                            (p.height - a.height) / a.height,
                        ));
                    }
                }
                if let [(a, pa), (b, pb)] = found[..] {
                    if a.saturated || b.saturated || !clear(a.size) || !clear(b.size) {
                        continue;
                    }
                    let (minor, major, pm, pj) = if a.height < b.height {
                        (a, b, pa, pb)
                    } else {
                        (b, a, pb, pa)
                    };
                    let planted = minor.height / (minor.height + major.height);
                    let raw = pm.raw_height / (pm.raw_height + pj.raw_height);
                    let corrected = pm.height / (pm.height + pj.height);
                    out.proportions.push((raw - planted, corrected - planted));
                }
            }
        }
    }
    out
}

fn report(name: &str, e: &Errors) -> [(f64, f64, f64); 6] {
    let split = |v: &[(f64, f64)]| -> (Vec<f64>, Vec<f64>) { v.iter().copied().unzip() };
    let (hr, hc) = split(&e.heights);
    let (mr, mc) = split(&e.minor_rel);
    let (pr, pc) = split(&e.proportions);
    let s = [
        stats(&hr),
        stats(&hc),
        stats(&mr),
        stats(&mc),
        stats(&pr),
        stats(&pc),
    ];
    println!("{name}");
    let rows = [
        ("height RFU, raw", s[0], e.heights.len()),
        ("height RFU, above baseline", s[1], e.heights.len()),
        ("minor (<1000 RFU) relative, raw", s[2], e.minor_rel.len()),
        (
            "minor (<1000 RFU) relative, above baseline",
            s[3],
            e.minor_rel.len(),
        ),
        ("minor proportion, raw", s[4], e.proportions.len()),
        (
            "minor proportion, above baseline",
            s[5],
            e.proportions.len(),
        ),
    ];
    for (label, (bias, mae, max), n) in rows {
        println!("  {label:<44} n {n:>5}  bias {bias:>9.4}  MAE {mae:>9.4}  max {max:>9.4}");
    }
    s
}

#[test]
fn heights_and_proportions_against_planted_truth() {
    let plain = report(
        "clean traces (5-40 RFU offset, +-5-25 RFU drift)",
        &measure(None),
    );
    let raw = report(
        "raw 3730 traces (-80..+60 RFU level, -90..+40 drift, 40 wave, spectral dips)",
        &measure(Some(SynthBaseline::raw_3730())),
    );
    for s in [plain, raw] {
        let [h_raw, h_cor, m_raw, m_cor, p_raw, p_cor] = s;
        // Above baseline: minor heights unbiased within 1% and proportions
        // within a fraction of a percentage point; raw values carry the
        // baseline. (Tall peaks read about 1% low from apex sampling.)
        assert!(m_cor.0.abs() < 0.01, "{m_cor:?}");
        assert!(m_cor.1 < m_raw.1 && h_cor.1 < h_raw.1);
        assert!(p_cor.1 < 0.005 && p_cor.1 < p_raw.1, "{p_cor:?} {p_raw:?}");
    }
    // Raw apex values carry the baseline, tens of RFU either way.
    assert!(raw[0].1 > 30.0, "{:?}", raw[0]);
    assert!(raw[1].1 < 0.6 * raw[0].1, "{:?}", raw[1]);
}
