//! Fits the ladder of every well of one or more plates the way an import
//! does (each well alone, then the plate's consensus) and writes one JSON
//! line per well: the ladder channel's scanned peaks, the fit's candidates,
//! the chosen assignment, its quality and status. For evaluating ladder
//! fitting on real runs; nothing about the runs is kept.
//!
//! cargo run --release -p microspat-core --example ladder_eval -- SPEC.json OUT.jsonl PLATE_DIR...
//!
//! `SPEC.json` is a (partial) `LadderSpec`, or `-` for the defaults. Each
//! `PLATE_DIR` holds one plate's `.fsa` files.

use microspat_core::abif::{parse_fsa, Fsa};
use microspat_core::ladder::{
    fit_ladder, fit_ladder_with_prior, ladder_candidates, resolve_with_plate, LadderFit, LadderSpec,
};
use microspat_core::{peaks, signal};
use serde_json::json;
use std::io::Write;
use std::path::Path;
use std::time::Instant;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [spec_path, out_path, dirs @ ..] = args.as_slice() else {
        return Err("usage: ladder_eval SPEC.json|- OUT.jsonl PLATE_DIR...".into());
    };
    let spec: LadderSpec = if spec_path == "-" {
        LadderSpec::default()
    } else {
        serde_json::from_slice(&std::fs::read(spec_path)?)?
    };
    let mut out = std::io::BufWriter::new(std::fs::File::create(out_path)?);
    let mut total_ms = 0.0;
    for dir in dirs {
        let mut files: Vec<_> = std::fs::read_dir(dir)?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("fsa")))
            .collect();
        files.sort();
        let fsas: Vec<(String, Fsa)> = files
            .iter()
            .map(|p| -> Result<_, Box<dyn std::error::Error>> {
                let name = p
                    .file_name()
                    .map_or(String::new(), |n| n.to_string_lossy().into_owned());
                Ok((name, parse_fsa(&std::fs::read(p)?)?))
            })
            .collect::<Result<_, _>>()?;
        let traces: Vec<(&[i16], Vec<&[i16]>)> = fsas
            .iter()
            .map(|(_, f)| {
                let trace = f.channel(spec.color).map_or(&[][..], |c| c.data.as_slice());
                let others = f
                    .channels
                    .iter()
                    .filter(|c| c.color != spec.color)
                    .map(|c| c.data.as_slice())
                    .collect();
                (trace, others)
            })
            .collect();
        let t = Instant::now();
        let mut fits: Vec<_> = traces
            .iter()
            .map(|(trace, others)| fit_ladder(trace, others, &spec))
            .collect();
        let refitted = resolve_with_plate(&spec, &mut fits, |k, prior| {
            fit_ladder_with_prior(traces[k].0, &traces[k].1, &spec, Some(prior))
        });
        let ms = t.elapsed().as_secs_f64() * 1e3;
        total_ms += ms;
        let plate = Path::new(dir)
            .file_name()
            .map_or(String::new(), |n| n.to_string_lossy().into_owned());
        for (k, ((name, fsa), fit)) in fsas.iter().zip(&fits).enumerate() {
            let (trace, others) = &traces[k];
            let line = well_json(
                &plate,
                name,
                fsa,
                trace,
                others,
                &spec,
                fit,
                refitted.contains(&k),
            )?;
            writeln!(out, "{line}")?;
        }
        eprintln!("{plate}: {} wells, ladder fitting {ms:.1} ms", fsas.len());
    }
    eprintln!("total ladder fitting {total_ms:.1} ms");
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn well_json(
    plate: &str,
    name: &str,
    fsa: &Fsa,
    trace: &[i16],
    others: &[&[i16]],
    spec: &LadderSpec,
    fit: &Result<LadderFit, microspat_core::ladder::LadderError>,
    refitted: bool,
) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let base = signal::baseline(trace, 0, trace.len().saturating_sub(1));
    let other_base: Vec<Vec<f64>> = others
        .iter()
        .map(|o| signal::baseline(o, 0, o.len().saturating_sub(1)))
        .collect();
    let above = |t: &[i16], b: &[f64], i: usize| {
        t.get(i).map_or(0.0, |&v| f64::from(v)) - b.get(i).copied().unwrap_or(0.0)
    };
    // Every scanned maximum, before any height or time limit: [index, height
    // above baseline, raw value, tallest other dye above its baseline].
    let scanned: Vec<[f64; 4]> = peaks::scan(trace, &spec.scanning)?
        .iter()
        .map(|p| {
            let other = others
                .iter()
                .zip(&other_base)
                .map(|(o, b)| above(o, b, p.index))
                .fold(f64::MIN, f64::max);
            [
                p.index as f64,
                above(trace, &base, p.index).round(),
                f64::from(trace.get(p.index).copied().unwrap_or(0)),
                other.round(),
            ]
        })
        .collect();
    let cands: Vec<usize> = ladder_candidates(trace, others, spec)
        .map(|c| c.into_iter().map(|(i, _)| i).collect())
        .unwrap_or_default();
    let base_q: Vec<f64> = {
        let mut b = base.clone();
        b.sort_by(f64::total_cmp);
        [0.01, 0.5, 0.99]
            .iter()
            .map(|q| {
                b.get((q * (b.len().max(1) - 1) as f64) as usize)
                    .copied()
                    .unwrap_or(0.0)
            })
            .collect()
    };
    let fit_json = match fit {
        Ok(f) => {
            let a = f.assess(spec);
            json!({
                "indices": f.peak_indices, "sizes": f.peak_sizes, "quality": f.sizing_quality,
                "status": format!("{:?}", a.status).to_lowercase(), "reason": a.reason,
                "ambiguous": f.ambiguity.is_some(),
            })
        }
        Err(e) => json!({ "status": "failed", "reason": e.to_string() }),
    };
    // The other dyes' tallest maxima, for checking sizes against replicate
    // samples: per dye, [index, height above baseline] of the ten tallest.
    let dyes: Vec<Vec<[f64; 2]>> = others
        .iter()
        .zip(&other_base)
        .map(|(o, b)| -> Result<_, Box<dyn std::error::Error>> {
            let mut v: Vec<[f64; 2]> = peaks::scan(o, &spec.scanning)?
                .iter()
                .map(|p| [p.index as f64, above(o, b, p.index).round()])
                .collect();
            v.sort_by(|a, b| b[1].total_cmp(&a[1]));
            v.truncate(10);
            Ok(v)
        })
        .collect::<Result<_, _>>()?;
    let dye_names: Vec<String> = fsa
        .channels
        .iter()
        .filter(|c| c.color != spec.color)
        .map(|c| format!("{:?}", c.color).to_lowercase())
        .collect();
    Ok(json!({
        "plate": plate, "dyes": dyes, "dye_names": dye_names, "file": name, "well": fsa.well, "instrument": fsa.instrument_name,
        "n": trace.len(), "scanned": scanned, "cands": cands, "baseline_q": base_q,
        "refitted": refitted, "fit": fit_json,
    }))
}
