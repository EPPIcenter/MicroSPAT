//! Import, storage and locus-loading numbers on synthetic 96-well plates.
//!
//! cargo run --release -p microspat-engine --example perf [-- <plates>]

use microspat_core::synth::{generate_plate, SynthSpec};
use microspat_engine::api::demo::{demo_plate_map, write_zip};
use microspat_engine::locus_runs::{load_locus_runs, LoadOptions};
use microspat_engine::{Engine, EngineConfig};
use serde_json::json;
use std::time::Instant;

fn main() {
    let n: usize = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(10);
    let dir = tempfile::tempdir().unwrap();
    let specs: Vec<SynthSpec> = (0..n)
        .map(|k| SynthSpec {
            plate_name: format!("PERF-{k}"),
            ..SynthSpec::demo(1000 + k as u64)
        })
        .collect();
    let mut zips = Vec::new();
    let mut fsa_bytes = 0;
    let mut maps = Vec::new();
    for (k, s) in specs.iter().enumerate() {
        let wells = generate_plate(s).unwrap();
        fsa_bytes += wells.iter().map(|w| w.fsa.len()).sum::<usize>();
        let z = dir.path().join(format!("p{k}.zip"));
        write_zip(&z, &wells).unwrap();
        zips.push(z.to_str().unwrap().to_string());
        maps.push(demo_plate_map(k, s, &wells));
    }
    let ws_path = dir.path().join("perf.microspat");
    let engine = Engine::new(EngineConfig::default());
    engine
        .dispatch("new_workspace", json!({ "path": ws_path.to_str() }))
        .unwrap();
    let ladders = engine.dispatch("list_ladders", json!(null)).unwrap();
    let ladder = ladders
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["label"] == "HD ROX 400")
        .unwrap()["id"]
        .clone();
    for l in &specs[0].loci {
        engine
            .dispatch(
                "create_locus",
                json!({ "label": l.label, "color": l.color, "min_base_length": l.min_size,
                "max_base_length": l.max_size, "nucleotide_repeat_length": l.repeat_length }),
            )
            .unwrap();
    }

    // One plate end to end: zip -> parse -> size -> compress -> commit.
    let t = Instant::now();
    let r = engine
        .dispatch(
            "import_plates",
            json!({ "paths": [zips[0]], "ladder_id": ladder }),
        )
        .unwrap();
    let one = t.elapsed();
    assert_eq!(r["plates"][0]["status"], "imported");
    println!(
        "import 1 plate (96 wells, zip, end to end): {:.0} ms",
        one.as_secs_f64() * 1e3
    );

    let t = Instant::now();
    let r = engine
        .dispatch(
            "import_plates",
            json!({ "paths": zips[1..], "ladder_id": ladder }),
        )
        .unwrap();
    let rest = t.elapsed();
    assert!(r["plates"]
        .as_array()
        .unwrap()
        .iter()
        .all(|p| p["status"] == "imported"));
    println!(
        "import {} plates in one call: {:.0} ms ({:.0} ms/plate)",
        n - 1,
        rest.as_secs_f64() * 1e3,
        rest.as_secs_f64() * 1e3 / (n - 1).max(1) as f64
    );

    let plates = engine.dispatch("list_plates", json!(null)).unwrap();
    let t = Instant::now();
    for (k, p) in plates.as_array().unwrap().iter().enumerate() {
        let idx = specs
            .iter()
            .position(|s| s.plate_name == p["label"])
            .unwrap();
        engine
            .dispatch(
                "apply_plate_map",
                json!({ "plate_id": p["id"], "content": maps[idx], "create_samples": true }),
            )
            .unwrap();
        let _ = k;
    }
    println!(
        "apply {n} plate maps (576 runs each, with sample creation): {:.0} ms",
        t.elapsed().as_secs_f64() * 1e3
    );

    let t = Instant::now();
    let pid = plates[0]["id"].clone();
    let detail = engine.dispatch("get_plate", json!({ "id": pid })).unwrap();
    let plate_ms = t.elapsed().as_secs_f64() * 1e3;
    let well = detail["wells"][5]["id"].clone();
    let t = Instant::now();
    let wd = engine.dispatch("get_well", json!({ "id": well })).unwrap();
    let well_ms = t.elapsed().as_secs_f64() * 1e3;
    println!(
        "get_plate {plate_ms:.1} ms ({} KB JSON) | get_well with traces {well_ms:.1} ms ({} KB JSON)",
        serde_json::to_string(&detail).unwrap().len() / 1024,
        serde_json::to_string(&wd).unwrap().len() / 1024
    );

    let ws = engine.workspace().unwrap();
    for opts in [LoadOptions::default(), LoadOptions { other_dyes: true }] {
        let t = Instant::now();
        let runs = ws.read(|c| load_locus_runs(c, 1, opts)).unwrap();
        let ms = t.elapsed().as_secs_f64() * 1e3;
        let sized = runs.iter().filter(|r| r.base_sizes.is_some()).count();
        println!(
            "load all runs of one locus across {n} plates{}: {} runs ({sized} sized) in {ms:.0} ms ({:.0} µs/run)",
            if opts.other_dyes { " with other dyes" } else { "" },
            runs.len(),
            ms * 1e3 / runs.len() as f64
        );
    }
    let t = Instant::now();
    let runs = ws
        .read(|c| load_locus_runs(c, 1, LoadOptions::default()))
        .unwrap();
    let total = t.elapsed();
    let t = Instant::now();
    for r in runs.iter().take(200) {
        let _ = microspat_core::peaks::scan(&r.trace, &Default::default());
    }
    println!(
        "(for scale: scanning peaks costs {:.0} µs/run single-threaded; loading costs {:.0} µs/run)",
        t.elapsed().as_secs_f64() * 1e6 / 200.0,
        total.as_secs_f64() * 1e6 / runs.len() as f64
    );
    drop(ws);
    projects(&engine, n);
    drop(engine);
    let size = std::fs::metadata(&ws_path).unwrap().len();
    println!(
        "workspace file: {:.1} MB for {n} plates = {:.2} MB/plate (raw FSA {:.2} MB/plate; 5 traces would be {:.2} MB raw i16)",
        size as f64 / 1e6,
        size as f64 / 1e6 / n as f64,
        fsa_bytes as f64 / 1e6 / n as f64,
        96.0 * 4.0 * 9000.0 * 2.0 / 1e6
    );
    for side in ["-wal", "-shm"] {
        let mut p = ws_path.clone().into_os_string();
        p.push(side);
        assert!(
            !std::path::Path::new(&p).exists(),
            "sidecar {side} left after close"
        );
    }
}

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1e3
}

/// Project analysis numbers: scan cache, staleness reads, genotyping.
fn projects(engine: &Engine, n: usize) {
    let call = |m: &str, p: serde_json::Value| {
        engine
            .dispatch(m, p)
            .unwrap_or_else(|e| panic!("{m}: {}", e.message))
    };
    let set = call(
        "create_locus_set",
        json!({ "label": "perf", "locus_ids": [1, 2, 3, 4, 5, 6] }),
    );
    let set_id = set["id"].clone();
    let be = call(
        "create_project",
        json!({ "kind": "bin_estimator", "title": "BE", "locus_set_id": set_id }),
    )["project"]["id"]
        .clone();
    let runs = call("get_locus", json!({ "id": 1 }))["run_count"].clone();
    println!("\n--- projects: {n} plates, {runs} runs per locus ---");
    for (label, cap) in [
        ("cold (scan every run)", None),
        ("warm (scans cached; e.g. after a filter change)", None),
        ("scan cache disabled", Some(0usize)),
    ] {
        if let Some(c) = cap {
            engine.scan_cache().set_capacity(c);
        }
        let t = Instant::now();
        let r = call("analyze_project", json!({ "id": be, "locus_ids": [1] }));
        println!(
            "bin estimator, one locus, {label}: {:.0} ms ({})",
            ms(t),
            r["loci"][0]["summary"].as_str().unwrap()
        );
    }
    engine
        .scan_cache()
        .set_capacity(microspat_engine::scan_cache::DEFAULT_CAPACITY);
    let t = Instant::now();
    call("analyze_project", json!({ "id": be }));
    println!("bin estimator, all 6 loci (cold cache): {:.0} ms", ms(t));
    let t = Instant::now();
    call(
        "update_project_locus_params",
        json!({ "project_id": be, "params": { "filter": { "min_peak_height": 120.0 } } }),
    );
    let r = call("analyze_project", json!({ "id": be }));
    println!(
        "filter change + re-analyze all 6 loci (warm cache): {:.0} ms (per locus: {})",
        ms(t),
        r["loci"]
            .as_array()
            .unwrap()
            .iter()
            .map(|l| format!("{}", l["ms"]))
            .collect::<Vec<_>>()
            .join(", ")
    );
    let ae = call(
        "create_project",
        json!({ "kind": "artifact_estimator", "title": "AE", "locus_set_id": set_id, "bin_estimator_id": be }),
    )["project"]["id"]
        .clone();
    let t = Instant::now();
    call("analyze_project", json!({ "id": ae }));
    println!("artifact estimator, 6 loci: {:.0} ms", ms(t));
    let gt = call(
        "create_project",
        json!({ "kind": "genotyping", "title": "GT", "locus_set_id": set_id,
                "bin_estimator_id": be, "artifact_estimator_id": ae }),
    )["project"]["id"]
        .clone();
    let samples: Vec<i64> = call("list_samples", json!(null))
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["id"].as_i64().unwrap())
        .collect();
    call(
        "add_project_samples",
        json!({ "id": gt, "sample_ids": samples }),
    );
    let t = Instant::now();
    let r = call("analyze_project", json!({ "id": gt, "locus_ids": [1] }));
    println!(
        "genotyping, one locus, {} samples: {:.0} ms ({})",
        samples.len(),
        ms(t),
        r["loci"][0]["summary"].as_str().unwrap()
    );
    let t = Instant::now();
    call("analyze_project", json!({ "id": gt }));
    println!("genotyping, all 6 loci: {:.0} ms", ms(t));
    let t = Instant::now();
    call("calculate_peak_probabilities", json!({ "id": gt }));
    println!("probabilistic pass: {:.0} ms", ms(t));
    let t = Instant::now();
    let d = call("get_project", json!({ "id": gt }));
    println!(
        "get_project (staleness of 6 loci): {:.1} ms; list_projects: {:.1} ms",
        ms(t),
        {
            let t = Instant::now();
            call("list_projects", json!(null));
            ms(t)
        }
    );
    assert_eq!(d["project"]["current_loci"], 6);
    let t = Instant::now();
    let lc = call(
        "get_locus_calls",
        json!({ "project_id": gt, "locus_id": 1 }),
    );
    println!(
        "get_locus_calls: {:.1} ms ({} KB JSON)",
        ms(t),
        serde_json::to_string(&lc).unwrap().len() / 1024
    );
    let rows = lc["rows"].as_array().unwrap();
    let misses: usize = rows
        .iter()
        .filter_map(|r| r["narrow_misses"].as_array().map(|m| m.len()))
        .sum();
    println!(
        "  {} rows, {} B/row; {} narrow misses in {} rows",
        rows.len(),
        serde_json::to_string(&lc["rows"]).unwrap().len() / rows.len().max(1),
        misses,
        rows.iter()
            .filter(|r| r["narrow_misses"].is_array())
            .count()
    );
    let t = Instant::now();
    let r = call(
        "set_calls_reviewed",
        json!({ "project_id": gt, "locus_id": 1, "reviewed": true }),
    );
    println!(
        "set_calls_reviewed (every call at the locus, {}): {:.1} ms",
        r["updated"],
        ms(t)
    );
    let s = lc["rows"][3]["sample_id"].clone();
    let bin = lc["bins"][0]["id"].clone();
    let t = Instant::now();
    call(
        "toggle_allele",
        json!({ "project_id": gt, "sample_id": s, "locus_id": 1, "bin_id": bin }),
    );
    println!("toggle_allele (returns the row): {:.1} ms", ms(t));
    let t = Instant::now();
    call(
        "get_project_sample_calls",
        json!({ "project_id": gt, "sample_id": s }),
    );
    println!("get_project_sample_calls: {:.1} ms", ms(t));
    let t = Instant::now();
    call("get_genotyping_summary", json!({ "id": gt }));
    println!("get_genotyping_summary: {:.1} ms", ms(t));
    let t = Instant::now();
    let v = call(
        "get_sample_locus_call",
        json!({ "project_id": gt, "sample_id": s, "locus_id": 1 }),
    );
    println!(
        "get_sample_locus_call: {:.1} ms ({} KB JSON)",
        ms(t),
        serde_json::to_string(&v).unwrap().len() / 1024
    );
    let t = Instant::now();
    let sc = call(
        "get_bin_estimator_peaks",
        json!({ "project_id": be, "locus_id": 1 }),
    );
    println!(
        "get_bin_estimator_peaks: {:.1} ms ({} points, {} KB JSON)",
        ms(t),
        sc["sizes"].as_array().unwrap().len(),
        serde_json::to_string(&sc).unwrap().len() / 1024
    );
    let t = Instant::now();
    let x = call("export_peak_data", json!({ "id": gt }));
    println!(
        "export_peak_data: {:.0} ms ({} KB)",
        ms(t),
        x["content"].as_str().unwrap().len() / 1024
    );
    let (hits, misses, entries, bytes) = engine.scan_cache().stats();
    println!(
        "scan cache: {hits} hits, {misses} misses, {entries} entries, {:.1} MB",
        bytes as f64 / 1e6
    );
}
