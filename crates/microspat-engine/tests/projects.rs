//! Projects end to end through `dispatch`: the estimator chain, edits,
//! staleness for every kind of upstream change, in-use refusals, duplication,
//! curation, exports, and save-as/reopen. Events are asserted along the way.

mod common;

use common::*;
use microspat_engine::ErrorCode;
use serde_json::{json, Value};
use std::collections::HashMap;

fn state(h: &Harness, pid: i64, locus: i64) -> (String, Vec<String>) {
    let d = h.call("get_project", json!({ "id": pid }));
    let l = d["loci"]
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["locus_id"] == locus)
        .unwrap_or_else(|| panic!("locus {locus} not in project {pid}"))
        .clone();
    (
        l["status"]["state"].as_str().unwrap().to_string(),
        l["status"]["reasons"]
            .as_array()
            .unwrap()
            .iter()
            .map(|r| r.as_str().unwrap().to_string())
            .collect(),
    )
}

fn assert_stale(h: &Harness, pid: i64, locus: i64, reason: &str) {
    let (s, r) = state(h, pid, locus);
    assert_eq!(s, "stale", "project {pid} locus {locus}: {r:?}");
    assert!(
        r.iter().any(|x| x.contains(reason)),
        "project {pid} locus {locus}: expected reason containing {reason:?}, got {r:?}"
    );
}

fn assert_current(h: &Harness, pid: i64, locus: i64) {
    let (s, r) = state(h, pid, locus);
    assert_eq!(s, "current", "project {pid} locus {locus}: {r:?}");
}

fn analyze(h: &Harness, pid: i64, loci: Option<&[i64]>) -> Value {
    match loci {
        Some(l) => h.call("analyze_project", json!({ "id": pid, "locus_ids": l })),
        None => h.call("analyze_project", json!({ "id": pid })),
    }
}

struct Setup {
    h: Harness,
    _dir: tempfile::TempDir,
    dir: std::path::PathBuf,
    study: Study,
    set_id: i64,
    loci: HashMap<String, i64>,
    samples: HashMap<String, i64>,
    be: i64,
    ae: i64,
    qb: i64,
    gt: i64,
    strains: Vec<i64>,
}

fn setup() -> Setup {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path().to_path_buf();
    let h = Harness::new(&dir.join("state"));
    let study = study(&dir, 2, 7300);
    h.call("new_workspace", json!({ "path": dir.join("p").to_str() }));
    let (set_id, loci) = load_study(&h, &study);
    let samples = samples(&h);
    h.drain();

    // Bin estimator over every sample.
    let be = id(&h.call(
        "create_project",
        json!({ "kind": "bin_estimator", "title": "Bins", "locus_set_id": set_id }),
    ));
    assert_eq!(h.changed(), set(&["projects"]));
    let d = h.call("get_project", json!({ "id": be }));
    assert_eq!(d["project"]["all_samples"], true);
    assert_eq!(d["project"]["unanalyzed_loci"], 6);
    assert_eq!(d["project"]["sample_count"], 192);
    let r = analyze(&h, be, None);
    assert_eq!(r["loci"].as_array().unwrap().len(), 6);
    let events = h.drain();
    assert!(events.iter().any(|e| matches!(e, microspat_engine::AppEvent::Task { task } if task.kind == "analyze_project" && task.status == microspat_engine::TaskStatus::Done)));
    let d = h.call("get_project", json!({ "id": be }));
    assert_eq!(d["project"]["current_loci"], 6);

    let ae = id(&h.call(
        "create_project",
        json!({ "kind": "artifact_estimator", "title": "Artifacts", "locus_set_id": set_id, "bin_estimator_id": be }),
    ));
    analyze(&h, ae, None);

    let mut strains = Vec::new();
    for (s, name) in STRAINS.iter().enumerate() {
        let mut alleles = Vec::new();
        for l in &study.specs[0].loci {
            let size = l.alleles[STRAIN_ALLELE_INDEX[s]];
            let bins = h.call(
                "get_locus_bins",
                json!({ "project_id": be, "locus_id": loci[&l.label] }),
            )["bins"]
                .clone();
            let b = bins
                .as_array()
                .unwrap()
                .iter()
                .min_by(|x, y| {
                    (x["base_size"].as_f64().unwrap() - size)
                        .abs()
                        .total_cmp(&(y["base_size"].as_f64().unwrap() - size).abs())
                })
                .unwrap()
                .clone();
            alleles.push(json!({ "locus_id": loci[&l.label], "bin_id": id(&b) }));
        }
        let c = h.call(
            "create_control",
            json!({ "bin_estimator_id": be, "label": name, "alleles": alleles }),
        );
        assert_eq!(c["alleles"].as_array().unwrap().len(), 6);
        assert!(c["alleles"]
            .as_array()
            .unwrap()
            .iter()
            .all(|a| a["bin_id"].is_i64()));
        strains.push(id(&c));
    }
    assert!(h.changed().contains("controls"));

    let qb = id(&h.call(
        "create_project",
        json!({ "kind": "quant_bias_estimator", "title": "Bias", "locus_set_id": set_id,
                "bin_estimator_id": be, "artifact_estimator_id": ae }),
    ));
    let csv = mixtures_csv(&study);
    let r = h.call(
        "import_control_mixtures_csv",
        json!({ "id": qb, "content": csv }),
    );
    assert_eq!(r["applied"], true);
    assert_eq!(r["added"], 12);
    analyze(&h, qb, None);

    let gt = id(&h.call(
        "create_project",
        json!({ "kind": "genotyping", "title": "Study", "locus_set_id": set_id,
                "bin_estimator_id": be, "artifact_estimator_id": ae, "quant_bias_estimator_id": qb }),
    ));
    let mut bc = String::from("Barcode\n");
    for b in samples.keys().filter(|b| !study.mixtures.contains_key(*b)) {
        bc.push_str(b);
        bc.push('\n');
    }
    let r = h.call(
        "import_project_samples_csv",
        json!({ "id": gt, "content": bc }),
    );
    assert_eq!(r["added"], 180);
    analyze(&h, gt, None);
    h.call("calculate_peak_probabilities", json!({ "id": gt }));
    h.drain();
    Setup {
        h,
        _dir: tmp,
        dir,
        study,
        set_id,
        loci,
        samples,
        be,
        ae,
        qb,
        gt,
        strains,
    }
}

#[test]
fn full_chain_and_exports() {
    let s = setup();
    let h = &s.h;
    let l1 = s.loci["PfB1"];

    // Every project current; probabilities current.
    for p in [s.be, s.ae, s.qb, s.gt] {
        let d = h.call("get_project", json!({ "id": p }));
        assert_eq!(d["project"]["current_loci"], 6, "{}", d["project"]["title"]);
        assert!(d["upstream_warnings"].as_array().unwrap().is_empty());
    }
    let d = h.call("get_project", json!({ "id": s.gt }));
    assert_eq!(d["project"]["probabilities"]["state"], "current");
    let be_detail = h.call("get_project", json!({ "id": s.be }));
    let deps: Vec<&str> = be_detail["dependents"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| d["title"].as_str().unwrap())
        .collect();
    assert_eq!(deps.len(), 3, "{deps:?}");
    let list = h.call("list_projects", json!({ "kind": "genotyping" }));
    assert_eq!(list.as_array().unwrap().len(), 1);
    assert_eq!(
        h.call("list_projects", Value::Null)
            .as_array()
            .unwrap()
            .len(),
        4
    );

    // Bin plot data.
    let sc = h.call(
        "get_bin_estimator_peaks",
        json!({ "project_id": s.be, "locus_id": l1 }),
    );
    let n = sc["sizes"].as_array().unwrap().len();
    assert!(n > 300, "{n} points");
    assert_eq!(sc["relative_heights"].as_array().unwrap().len(), n);
    assert!(sc["relative_heights"]
        .as_array()
        .unwrap()
        .iter()
        .all(|v| (0.0..=1.0001).contains(&v.as_f64().unwrap())));

    // Artifact plot data: −1 repeat stutter class with points and a fit.
    let a = h.call(
        "get_locus_artifact_estimators",
        json!({ "project_id": s.ae, "locus_id": l1 }),
    );
    let ests = a["estimators"].as_array().unwrap();
    assert!(ests.iter().any(|e| e["artifact_distance"]
        .as_f64()
        .is_some_and(|d| (d + 3.0).abs() < 0.2)));
    assert!(ests
        .iter()
        .all(|e| !e["points"].as_array().unwrap().is_empty()));
    assert!(a["mono_allelic_runs"].as_u64().unwrap() > 50);

    // β with its points.
    let q = h.call(
        "get_locus_quant_bias",
        json!({ "project_id": s.qb, "locus_id": l1 }),
    );
    let beta = q["estimate"]["beta"].as_f64().unwrap();
    let planted = -2.0 * s.study.specs[0].loci[0].profile().bias;
    assert!(
        (beta - planted).abs() < 0.15 * planted.abs(),
        "β {beta}, planted {planted}"
    );
    let pts = q["points"].as_array().unwrap();
    assert_eq!(pts.len(), 24);
    // The view agrees with the fit (75/25 mixtures included at the default
    // minimum share; the old view showed only the 6 points of 50/50 mixtures).
    let used = pts.iter().filter(|p| p["used"] == true).count();
    assert_eq!(used as u64, q["estimate"]["n_peaks"].as_u64().unwrap());
    assert!(used > 6, "{used}");

    // Locus table, one call, per-sample view, summary.
    let lc = h.call(
        "get_locus_calls",
        json!({ "project_id": s.gt, "locus_id": l1 }),
    );
    assert_eq!(lc["rows"].as_array().unwrap().len(), 180);
    assert_eq!(lc["probabilities"]["state"], "current");
    let multi = lc["rows"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["alleles"].as_array().unwrap().len() >= 3)
        .expect("a sample with three or more alleles")
        .clone();
    assert!(multi["moi"].as_u64().unwrap() >= 2);
    let sid = id(&json!(multi["sample_id"]));
    let v = h.call(
        "get_sample_locus_call",
        json!({ "project_id": s.gt, "sample_id": sid, "locus_id": l1 }),
    );
    let reference = &v["reference"];
    assert_eq!(reference["trace"].as_array().unwrap().len(), 9000);
    assert_eq!(reference["base_sizes"].as_array().unwrap().len(), 9000);
    assert!(v["runs"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["is_reference"] == true));
    assert!(!v["bins"].as_array().unwrap().is_empty());
    let called: Vec<&Value> = v["peaks"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|p| p["probability"].as_f64().is_some_and(|x| x > 0.9))
        .collect();
    assert!(called.len() >= 3);
    let corrected: f64 = v["peaks"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|p| p["corrected_relative_quantification"].as_f64())
        .sum();
    assert!((corrected - 1.0).abs() < 1e-3, "{corrected}");
    let sc = h.call(
        "get_project_sample_calls",
        json!({ "project_id": s.gt, "sample_id": sid }),
    );
    assert_eq!(sc["loci"].as_array().unwrap().len(), 6);
    assert!(sc["moi"].as_u64().unwrap() >= 2);
    let sum = h.call("get_genotyping_summary", json!({ "id": s.gt }));
    assert_eq!(sum["moi_source"], "probabilistic");
    assert!(sum["mean_moi"].as_f64().unwrap() > 1.3);
    let pf = &sum["loci"][0];
    assert!(pf["typed"].as_u64().unwrap() > 150);
    let total_prev: f64 = pf["alleles"]
        .as_array()
        .unwrap()
        .iter()
        .map(|a| a["prevalence"].as_f64().unwrap())
        .sum();
    assert!(
        total_prev > 1.2,
        "prevalences of a mixed population sum past 1: {total_prev}"
    );
    assert!(pf["alleles"][0]["estimated_prevalence"].is_number());

    // Exports.
    let wide = h.call("export_alleles_wide", json!({ "id": s.gt }));
    assert_eq!(wide["filename"], "Study_alleles.csv");
    let text = wide["content"].as_str().unwrap();
    let head = text.lines().next().unwrap();
    assert!(head.starts_with("Sample,"));
    assert_eq!(head.split(',').count(), 7);
    assert_eq!(text.lines().count(), 181);
    assert!(
        text.lines().any(|l| l.contains(';')),
        "mixed calls are joined by ;"
    );
    let long = h.call("export_alleles_long", json!({ "id": s.gt }));
    let text = long["content"].as_str().unwrap();
    assert_eq!(
        text.lines().next().unwrap(),
        "Sample,Locus,Allele,Size,Height,Proportion,Corrected Proportion,Probability,MOI,Reviewed"
    );
    assert!(text.lines().count() > 500);
    let peaks = h.call("export_peak_data", json!({ "id": s.gt }));
    let text = peaks["content"].as_str().unwrap();
    assert!(text.starts_with("Sample,Locus,Peak Height,Relative Peak Height,Proportion,Corrected Proportion,Peak Size,Peak Area,Left Tail,Right Tail,Artifact Contribution,Artifact Error,In Bin,Called Allele,Allele Label,Bleedthrough Ratio,Crosstalk Ratio,Probability,Well,Artifact Flag,Below Relative Threshold Flag,Bleedthrough Flag,Crosstalk Flag"));
    let bins = h.call("export_bins", json!({ "id": s.be }));
    assert!(bins["content"]
        .as_str()
        .unwrap()
        .starts_with("Locus,Label,Base Size,Bin Buffer,Peak Count"));
    let eq = h.call("export_artifact_equations", json!({ "id": s.ae }));
    assert!(eq["content"].as_str().unwrap().lines().count() > 6);
    // Exports are refused for the wrong kind.
    assert_eq!(
        h.fail("export_bins", json!({ "id": s.gt })).code,
        ErrorCode::Invalid
    );

    // Settings.
    assert_eq!(
        h.call("get_settings", Value::Null)["contamination_limit"],
        500
    );
    h.drain();
    let r = h.call("update_settings", json!({ "contamination_limit": 1200 }));
    assert_eq!(r["contamination_limit"], 1200);
    assert_eq!(
        h.changed(),
        set(&["settings", "plates", "samples", "workspace", "projects"])
    );
    assert_eq!(
        h.fail("update_settings", json!({ "contamination_limit": -5 }))
            .code,
        ErrorCode::Invalid
    );

    // Save as, reopen: everything intact and still current.
    let copy = s.dir.join("copy.microspat");
    h.call("save_workspace_as", json!({ "path": copy.to_str() }));
    h.call("new_workspace", json!({ "path": null }));
    assert_eq!(
        h.call("list_projects", Value::Null)
            .as_array()
            .unwrap()
            .len(),
        0
    );
    h.call("open_workspace", json!({ "path": copy.to_str() }));
    let d = h.call("get_project", json!({ "id": s.gt }));
    assert_eq!(d["project"]["current_loci"], 6);
    assert_eq!(d["project"]["probabilities"]["state"], "current");
    let again = h.call("export_alleles_wide", json!({ "id": s.gt }));
    assert_eq!(again["content"], wide["content"]);
    assert_eq!(
        h.call("list_controls", json!({})).as_array().unwrap().len(),
        3
    );
}

#[test]
fn edits_staleness_curation_and_refusals() {
    let s = setup();
    let h = &s.h;
    let l1 = s.loci["PfB1"];
    let l2 = s.loci["PfB2"];

    // ---- Bin edits: add, move, resize, relabel, delete in one batch.
    let bins = h.call(
        "get_locus_bins",
        json!({ "project_id": s.be, "locus_id": l1 }),
    )["bins"]
        .clone();
    let b: Vec<Value> = bins.as_array().unwrap().clone();
    let (first, second, last) = (b[0].clone(), b[1].clone(), b[b.len() - 1].clone());
    let mut moved = first.clone();
    moved["base_size"] = json!(first["base_size"].as_f64().unwrap() + 0.1);
    moved["bin_buffer"] = json!(0.6);
    let mut relabeled = second.clone();
    relabeled["label"] = json!("allele-x");
    h.drain();
    let r = h.call(
        "update_locus_bins",
        json!({ "project_id": s.be, "locus_id": l1,
                "bins": [moved, relabeled, { "id": -1, "label": "131", "base_size": 131.0, "bin_buffer": 0.5, "peak_count": 0 }],
                "delete_ids": [id(&last)] }),
    );
    let after = r["bins"].as_array().unwrap();
    assert_eq!(after.len(), b.len());
    assert!(after
        .iter()
        .any(|x| x["label"] == "allele-x" && x["id"] == second["id"]));
    assert!(after.iter().any(|x| x["label"] == "131" && id(x) > 0));
    assert!(!after.iter().any(|x| x["id"] == last["id"]));
    assert_eq!(h.changed(), set(&["projects", "controls"]));
    // Edits are a result, not an input: the bin estimator stays current…
    assert_current(h, s.be, l1);
    // …but everything binning with them goes stale, at that locus only.
    for p in [s.ae, s.qb, s.gt] {
        assert_stale(h, p, l1, "Bins changed");
        assert_current(h, p, l2);
    }
    let d = h.call("get_project", json!({ "id": s.gt }));
    assert_eq!(
        d["project"]["probabilities"]["state"], "current",
        "until a locus is re-analyzed"
    );
    // Invalid batches change nothing.
    let e = h.fail(
        "update_locus_bins",
        json!({ "project_id": s.be, "locus_id": l1, "bins": [{ "id": -1, "label": "allele-x", "base_size": 90.0, "bin_buffer": 0.5, "peak_count": 0 }] }),
    );
    assert_eq!(e.code, ErrorCode::Conflict);
    let e = h.fail(
        "update_locus_bins",
        json!({ "project_id": s.be, "locus_id": l1, "bins": [{ "id": -1, "label": "z", "base_size": 90.0, "bin_buffer": 0.0, "peak_count": 0 }] }),
    );
    assert_eq!(e.code, ErrorCode::Invalid);
    assert_eq!(
        h.fail(
            "update_locus_bins",
            json!({ "project_id": s.be, "locus_id": l1, "bins": [], "delete_ids": [999999] })
        )
        .code,
        ErrorCode::NotFound
    );

    // ---- Manual curation: survives probabilities, cleared by re-analysis.
    analyze(h, s.gt, Some(&[l1]));
    let (st, _) = state(h, s.gt, l1);
    assert_eq!(st, "current");
    let d = h.call("get_project", json!({ "id": s.gt }));
    assert_eq!(d["project"]["probabilities"]["state"], "stale");
    let lc = h.call(
        "get_locus_calls",
        json!({ "project_id": s.gt, "locus_id": l2 }),
    );
    let row = lc["rows"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["alleles"].as_array().unwrap().len() == 1 && r["flags"]["failure"] == false)
        .unwrap()
        .clone();
    let sid = id(&json!(row["sample_id"]));
    let allele = row["alleles"][0]["bin_id"].as_i64().unwrap();
    let other = lc["bins"]
        .as_array()
        .unwrap()
        .iter()
        .map(id)
        .find(|b| *b != allele)
        .unwrap();
    h.drain();
    let r = h.call(
        "toggle_allele",
        json!({ "project_id": s.gt, "sample_id": sid, "locus_id": l2, "bin_id": other }),
    );
    assert_eq!(r["alleles"].as_array().unwrap().len(), 2);
    assert_eq!(r["flags"]["manual_curation"], true);
    assert_eq!(h.changed(), set(&["projects"]));
    h.call(
        "set_call_comment",
        json!({ "project_id": s.gt, "sample_id": sid, "locus_id": l2, "comment": "  checked by eye  " }),
    );
    let p = h.call("calculate_peak_probabilities", json!({ "id": s.gt }));
    assert_eq!(p["manual_calls_kept"], 1);
    let v = h.call(
        "get_sample_locus_call",
        json!({ "project_id": s.gt, "sample_id": sid, "locus_id": l2 }),
    );
    assert_eq!(v["row"]["flags"]["manual_curation"], true);
    assert!(v["row"]["alleles"]
        .as_array()
        .unwrap()
        .iter()
        .any(|a| a["bin_id"] == other));
    assert_eq!(v["row"]["comment"], "checked by eye");
    assert!(v["peaks"]
        .as_array()
        .unwrap()
        .iter()
        .any(|p| p["probability"].is_number()));
    // Re-analysis discards the manual call but keeps the comment.
    analyze(h, s.gt, Some(&[l2]));
    let v = h.call(
        "get_sample_locus_call",
        json!({ "project_id": s.gt, "sample_id": sid, "locus_id": l2 }),
    );
    assert_eq!(v["row"]["flags"]["manual_curation"], false);
    assert!(!v["row"]["alleles"]
        .as_array()
        .unwrap()
        .iter()
        .any(|a| a["bin_id"] == other));
    assert_eq!(v["row"]["comment"], "checked by eye");
    // Exports refuse stale probabilities unless asked.
    let e = h.fail("export_alleles_wide", json!({ "id": s.gt }));
    assert!(e.message.contains("probabilities"), "{}", e.message);
    h.call(
        "export_alleles_wide",
        json!({ "id": s.gt, "allow_stale": true }),
    );
    h.call("calculate_peak_probabilities", json!({ "id": s.gt }));
    h.call("export_alleles_wide", json!({ "id": s.gt }));
    assert_eq!(
        h.fail(
            "toggle_allele",
            json!({ "project_id": s.gt, "sample_id": sid, "locus_id": l2, "bin_id": 999999 })
        )
        .code,
        ErrorCode::Invalid
    );

    // ---- Artifact edits: breakpoint, method, refit, delete; GT goes stale.
    analyze(h, s.ae, None);
    analyze(h, s.qb, None);
    analyze(h, s.gt, None);
    let a = h.call(
        "get_locus_artifact_estimators",
        json!({ "project_id": s.ae, "locus_id": l2 }),
    );
    let stutter = a["estimators"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["artifact_distance"].as_f64().is_some_and(|d| d < -3.0))
        .unwrap()
        .clone();
    let eid = id(&stutter);
    h.drain();
    let v = h.call(
        "add_artifact_breakpoint",
        json!({ "id": eid, "size": 265.0 }),
    );
    assert_eq!(v["equations"].as_array().unwrap().len(), 2);
    assert_eq!(h.changed(), set(&["projects"]));
    assert_stale(h, s.gt, l2, "artifact model");
    assert_stale(h, s.qb, l2, "artifact model");
    assert_current(h, s.ae, l2);
    assert_eq!(
        h.fail(
            "add_artifact_breakpoint",
            json!({ "id": eid, "size": 9999.0 })
        )
        .code,
        ErrorCode::Invalid
    );
    let v = h.call(
        "set_artifact_equation_method",
        json!({ "id": eid, "equation_index": 1, "method": "least_squares" }),
    );
    assert_eq!(v["equations"][1]["segment"]["method"], "least_squares");
    assert_eq!(v["equations"][0]["segment"]["method"], "theil_sen");
    let v = h.call(
        "remove_artifact_breakpoint",
        json!({ "id": eid, "size": 265.3 }),
    );
    assert_eq!(v["equations"].as_array().unwrap().len(), 1);
    assert_eq!(
        h.fail(
            "remove_artifact_breakpoint",
            json!({ "id": eid, "size": 265.0 })
        )
        .code,
        ErrorCode::Invalid
    );
    h.call(
        "add_artifact_breakpoint",
        json!({ "id": eid, "size": 255.0 }),
    );
    let v = h.call("clear_artifact_breakpoints", json!({ "id": eid }));
    assert_eq!(v["equations"].as_array().unwrap().len(), 1);
    h.call("refit_artifact_estimator", json!({ "id": eid }));
    h.call("delete_artifact_estimator", json!({ "id": eid }));
    let a = h.call(
        "get_locus_artifact_estimators",
        json!({ "project_id": s.ae, "locus_id": l2 }),
    );
    assert!(!a["estimators"]
        .as_array()
        .unwrap()
        .iter()
        .any(|e| id(e) == eid));
    // Re-fitting the whole locus also counts as a change.
    analyze(h, s.gt, Some(&[l2]));
    assert_current(h, s.gt, l2);
    analyze(h, s.ae, Some(&[l2]));
    assert_stale(h, s.gt, l2, "artifact model");

    // ---- Parameters: change, staleness, back to default, apply to all.
    analyze(h, s.gt, None);
    let r = h.call(
        "update_project_locus_params",
        json!({ "project_id": s.gt, "locus_ids": [l1], "params": { "genotyping": { "probability_threshold": 0.7 } } }),
    );
    assert_eq!(r[0]["params"]["genotyping"]["probability_threshold"], 0.7);
    assert_eq!(r[0]["is_default"], false);
    assert_stale(h, s.gt, l1, "Parameters");
    assert_current(h, s.gt, l2);
    let d = h.call("get_project", json!({ "id": s.gt }));
    assert_eq!(
        d["loci"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|l| l["custom_params"] == true)
            .count(),
        1
    );
    // Setting it back makes the stored result current again.
    h.call(
        "update_project_locus_params",
        json!({ "project_id": s.gt, "locus_ids": [l1], "params": { "genotyping": { "probability_threshold": 0.8 } } }),
    );
    assert_current(h, s.gt, l1);
    let all = h.call(
        "update_project_locus_params",
        json!({ "project_id": s.gt, "params": { "filter": { "min_peak_height": 50.0 } } }),
    );
    assert_eq!(all.as_array().unwrap().len(), 6);
    for l in s.loci.values() {
        assert_stale(h, s.gt, *l, "Parameters");
    }
    let p = h.call(
        "get_project_locus_params",
        json!({ "project_id": s.gt, "locus_id": l2 }),
    );
    assert_eq!(p["params"]["filter"]["min_peak_height"], 50.0);
    assert!(p["params"]["bins"].is_null());
    h.call("reset_project_locus_params", json!({ "project_id": s.gt }));
    assert_current(h, s.gt, l2);
    assert_eq!(
        h.fail(
            "update_project_locus_params",
            json!({ "project_id": s.gt, "params": { "scan": { "smoothing_window": 10 } } })
        )
        .code,
        ErrorCode::Invalid
    );
    // Only stale loci get re-analyzed when asked.
    h.call(
        "update_project_locus_params",
        json!({ "project_id": s.gt, "locus_ids": [l1], "params": { "filter": { "min_peak_height": 60.0 } } }),
    );
    let r = h.call("analyze_project", json!({ "id": s.gt, "only_stale": true }));
    assert_eq!(r["loci"].as_array().unwrap().len(), 1);

    // ---- β change: re-estimating with other parameters changes β.
    h.call(
        "update_project_locus_params",
        // The 10% shares of 90/10 mixtures are 300–1,300 RFU: lower the
        // height minimum too, or none of them enters and β stays the same.
        json!({ "project_id": s.qb, "locus_ids": [l2], "params": { "quant_bias": { "min_true_proportion": 0.1, "min_peak_height": 250.0 } } }),
    );
    assert_stale(h, s.qb, l2, "Parameters");
    analyze(h, s.qb, Some(&[l2]));
    assert_stale(h, s.gt, l2, "β");

    // ---- Control mixtures and controls.
    analyze(h, s.gt, None);
    let mix_sample = s.samples[s.study.mixtures.keys().next().unwrap()];
    h.call(
        "set_control_mixtures",
        json!({ "id": s.qb, "mixtures": [{ "sample_id": mix_sample, "components": [
            { "control_id": s.strains[0], "proportion": 0.6 }, { "control_id": s.strains[1], "proportion": 0.4 } ] }] }),
    );
    assert_stale(h, s.qb, l1, "Control mixtures");
    analyze(h, s.qb, None);
    let c = h.call(
        "update_control",
        json!({ "id": s.strains[2], "alleles": [{ "locus_id": l1, "bin_id": null }] }),
    );
    assert!(c["alleles"]
        .as_array()
        .unwrap()
        .iter()
        .any(|a| a["locus_id"] == l1 && a["bin_id"].is_null()));
    assert_stale(h, s.qb, l1, "Control mixtures");
    assert_current(h, s.qb, l2);
    let r = h.call("analyze_project", json!({ "id": s.qb, "locus_ids": [l1] }));
    assert!(r["loci"][0]["warnings"]
        .as_array()
        .unwrap()
        .iter()
        .any(|w| w.as_str().unwrap().contains("no allele")));

    // ---- Samples added and removed.
    analyze(h, s.gt, None);
    let removed = *s
        .samples
        .iter()
        .find(|(b, _)| !s.study.mixtures.contains_key(*b))
        .unwrap()
        .1;
    assert_eq!(
        h.call(
            "remove_project_samples",
            json!({ "id": s.gt, "sample_ids": [removed] })
        ),
        1
    );
    assert_stale(h, s.gt, l1, "Samples");
    let r = h.call(
        "add_project_samples",
        json!({ "id": s.gt, "sample_ids": [removed, removed] }),
    );
    assert_eq!(r["added"], 1);
    assert_current(h, s.gt, l1);
    assert_eq!(
        h.fail(
            "add_project_samples",
            json!({ "id": s.qb, "sample_ids": [removed] })
        )
        .code,
        ErrorCode::Invalid
    );
    let e = h.fail(
        "import_project_samples_csv",
        json!({ "id": s.gt, "content": "Barcode\nNOPE-1\n" }),
    );
    assert!(e.message.contains("NOPE-1"));

    // ---- Runs: plate maps, re-sizing, ladder limits, locus range, plate deletion.
    let plates = h.call("list_plates", Value::Null);
    let p1 = plates
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["label"] == "STUDY-1")
        .unwrap()
        .clone();
    let p1_id = id(&p1);
    let map = h.call("export_plate_map", json!({ "id": p1_id }))["content"]
        .as_str()
        .unwrap()
        .to_string();
    h.call(
        "apply_plate_map",
        json!({ "plate_id": p1_id, "content": map }),
    );
    assert_current(h, s.gt, l1); // identical map, identical runs
    let changed_map = map.replacen("P1-S001", "P1-S002", 1);
    h.drain();
    h.call(
        "apply_plate_map",
        json!({ "plate_id": p1_id, "content": changed_map }),
    );
    assert!(h.changed().contains("projects"));
    for p in [s.be, s.ae, s.gt] {
        assert_stale(h, p, l1, "Runs changed");
    }
    // Restoring the old map recreates that run with a new id (its calls lost
    // their reference run), so results stay stale until re-analyzed.
    h.call(
        "apply_plate_map",
        json!({ "plate_id": p1_id, "content": map }),
    );
    assert_stale(h, s.gt, l1, "Runs changed");
    analyze(h, s.gt, None);
    assert_current(h, s.gt, l1);
    let wells = h.call("get_plate", json!({ "id": p1_id }))["wells"].clone();
    let w = wells
        .as_array()
        .unwrap()
        .iter()
        .find(|w| w["sizing"] == "good")
        .unwrap()
        .clone();
    let detail = h.call("get_well", json!({ "id": w["id"], "traces": false }));
    let mut idx: Vec<i64> = detail["ladder_peaks"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["index"].as_i64().unwrap())
        .collect();
    idx.pop();
    h.call(
        "set_well_ladder_peaks",
        json!({ "id": w["id"], "peak_indices": idx }),
    );
    assert_stale(h, s.gt, l1, "Runs changed");
    h.call(
        "set_well_ladder_peaks",
        json!({ "id": w["id"], "peak_indices": null }),
    );
    assert_current(h, s.gt, l1);
    let lad = id(&json!(p1["ladder_id"]));
    let ladder = h.call("get_ladder", json!({ "id": lad }));
    let mut spec = ladder["spec"].clone();
    spec["sq_unusable_limit"] = json!(0.0000001);
    spec["sq_flag_limit"] = json!(0.0000001);
    h.call("update_ladder", json!({ "id": lad, "spec": spec }));
    assert_stale(h, s.gt, l1, "Runs changed");
    h.call(
        "update_ladder",
        json!({ "id": lad, "spec": ladder["spec"] }),
    );
    assert_current(h, s.gt, l1);
    h.call(
        "update_locus",
        json!({ "id": l1, "max_base_length": 140.0 }),
    );
    assert_stale(h, s.gt, l1, "size range");
    assert_current(h, s.gt, l2);
    h.call(
        "update_locus",
        json!({ "id": l1, "max_base_length": 135.0 }),
    );
    assert_current(h, s.gt, l1);

    // ---- Locus set membership: a new locus shows as not analyzed.
    let extra = id(&h.call(
        "create_locus",
        json!({ "label": "Extra", "color": "blue", "min_base_length": 150.0, "max_base_length": 200.0, "nucleotide_repeat_length": 3.0 }),
    ));
    let mut members: Vec<i64> = s.loci.values().copied().collect();
    members.push(extra);
    h.call(
        "update_locus_set",
        json!({ "id": s.set_id, "locus_ids": members }),
    );
    let (st, _) = state(h, s.gt, extra);
    assert_eq!(st, "not_analyzed");
    let e = h.fail("calculate_peak_probabilities", json!({ "id": s.gt }));
    assert!(e.message.contains("Extra"), "{}", e.message);
    let d = h.call("get_project", json!({ "id": s.gt }));
    assert!(d["upstream_warnings"]
        .as_array()
        .unwrap()
        .iter()
        .any(|w| w.as_str().unwrap().contains("Extra")));
    members.pop();
    h.call(
        "update_locus_set",
        json!({ "id": s.set_id, "locus_ids": members }),
    );

    // ---- In-use refusals name the dependents.
    let e = h.fail("delete_project", json!({ "id": s.be }));
    assert_eq!(e.code, ErrorCode::InUse);
    assert!(
        e.message.contains("Artifacts") && e.message.contains("Study"),
        "{}",
        e.message
    );
    let e = h.fail("delete_locus_set", json!({ "id": s.set_id }));
    assert_eq!(e.code, ErrorCode::InUse);
    assert!(e.message.contains("Bins"), "{}", e.message);
    let e = h.fail("delete_plate", json!({ "id": p1_id }));
    assert_eq!(e.code, ErrorCode::InUse);
    assert!(e.message.contains("Study"), "{}", e.message);
    let e = h.fail("delete_control", json!({ "id": s.strains[0] }));
    assert_eq!(e.code, ErrorCode::InUse);
    assert!(e.message.contains("Bias"), "{}", e.message);
    let some_sample = s.samples["P1-S003"];
    h.call("clear_plate_map", json!({ "id": p1_id })); // runs gone; calls keep a null reference
    let e = h.fail("delete_sample", json!({ "id": some_sample }));
    assert_eq!(e.code, ErrorCode::InUse);
    assert!(e.message.contains("Study"), "{}", e.message);
    assert_stale(h, s.gt, l1, "Runs changed");
    let e = h.fail(
        "update_project",
        json!({ "id": s.qb, "bin_estimator_id": s.be + 1000 }),
    );
    assert_eq!(e.code, ErrorCode::NotFound);
    let e = h.fail(
        "create_project",
        json!({ "kind": "genotyping", "title": "No bins", "locus_set_id": s.set_id }),
    );
    assert_eq!(e.code, ErrorCode::Invalid);
    let e = h.fail(
        "create_project",
        json!({ "kind": "genotyping", "title": "Wrong link", "locus_set_id": s.set_id, "bin_estimator_id": s.ae }),
    );
    assert!(e.message.contains("not a bin estimator"), "{}", e.message);
    let e = h.fail(
        "create_project",
        json!({ "kind": "genotyping", "title": "Study", "locus_set_id": s.set_id, "bin_estimator_id": s.be }),
    );
    assert_eq!(e.code, ErrorCode::Conflict);

    // A plate whose runs no call references can go; estimators then show stale.
    analyze(h, s.be, None);
    analyze(h, s.gt, None);
    let p2 = plates
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["label"] == "STUDY-2")
        .unwrap()
        .clone();
    h.call("remove_project_samples", json!({ "id": s.qb, "sample_ids": s.study.mixtures.keys().map(|b| s.samples[b]).collect::<Vec<_>>() }));
    let p2_samples: Vec<i64> = s
        .samples
        .iter()
        .filter(|(b, _)| b.starts_with("P2-") && !s.study.mixtures.contains_key(*b))
        .map(|(_, i)| *i)
        .collect();
    h.call(
        "remove_project_samples",
        json!({ "id": s.gt, "sample_ids": p2_samples }),
    );
    h.call("delete_plate", json!({ "id": p2["id"] }));
    assert_stale(h, s.be, l2, "Runs changed");
}

#[test]
fn duplication_and_unlinking() {
    let s = setup();
    let h = &s.h;
    let l1 = s.loci["PfB1"];
    // Bin estimator copy: bins, scatter and controls (re-pointed) come along, current.
    let be2 = id(&h.call(
        "duplicate_project",
        json!({ "id": s.be, "title": "Bins copy" }),
    ));
    assert_current(h, be2, l1);
    let a = h.call(
        "get_locus_bins",
        json!({ "project_id": s.be, "locus_id": l1 }),
    )["bins"]
        .clone();
    let b = h.call(
        "get_locus_bins",
        json!({ "project_id": be2, "locus_id": l1 }),
    )["bins"]
        .clone();
    assert_eq!(a.as_array().unwrap().len(), b.as_array().unwrap().len());
    assert_ne!(a[0]["id"], b[0]["id"]);
    let ctl = h.call("list_controls", json!({ "bin_estimator_id": be2 }));
    assert_eq!(ctl.as_array().unwrap().len(), 3);
    let new_bins: Vec<i64> = b.as_array().unwrap().iter().map(id).collect();
    let allele = ctl[0]["alleles"]
        .as_array()
        .unwrap()
        .iter()
        .find(|x| x["locus_id"] == l1)
        .unwrap()["bin_id"]
        .as_i64()
        .unwrap();
    assert!(
        new_bins.contains(&allele),
        "control alleles point at the copy's bins"
    );
    let sc = h.call(
        "get_bin_estimator_peaks",
        json!({ "project_id": be2, "locus_id": l1 }),
    );
    assert!(!sc["sizes"].as_array().unwrap().is_empty());
    // Artifact estimator copy keeps its classes.
    let ae2 = id(&h.call(
        "duplicate_project",
        json!({ "id": s.ae, "title": "Artifacts copy" }),
    ));
    assert_current(h, ae2, l1);
    // Quantification-bias copy keeps mixtures, calls and β.
    let qb2 = id(&h.call(
        "duplicate_project",
        json!({ "id": s.qb, "title": "Bias copy" }),
    ));
    assert_current(h, qb2, l1);
    let q = h.call(
        "get_locus_quant_bias",
        json!({ "project_id": qb2, "locus_id": l1 }),
    );
    assert!(q["estimate"]["beta"].is_number());
    // Genotyping copy: parameters and samples, no results.
    h.call(
        "update_project_locus_params",
        json!({ "project_id": s.gt, "locus_ids": [l1], "params": { "genotyping": { "failure_threshold": 700.0 } } }),
    );
    let gt2 = id(&h.call(
        "duplicate_project",
        json!({ "id": s.gt, "title": "Study copy" }),
    ));
    let d = h.call("get_project", json!({ "id": gt2 }));
    assert_eq!(d["project"]["unanalyzed_loci"], 6);
    assert_eq!(d["project"]["sample_count"], 180);
    let p = h.call(
        "get_project_locus_params",
        json!({ "project_id": gt2, "locus_id": l1 }),
    );
    assert_eq!(p["params"]["genotyping"]["failure_threshold"], 700.0);
    assert_eq!(
        h.fail(
            "duplicate_project",
            json!({ "id": s.gt, "title": "Study copy" })
        )
        .code,
        ErrorCode::Conflict
    );
    // Switching the genotyping copy to the copied estimators: analyzed results equal the original's.
    h.call("update_project", json!({ "id": gt2, "bin_estimator_id": s.be, "artifact_estimator_id": null, "quant_bias_estimator_id": null }));
    let d = h.call("get_project", json!({ "id": gt2 }));
    assert!(d["project"]["artifact_estimator"].is_null());
    assert!(d["project"]["quant_bias_estimator"].is_null());
    assert_eq!(d["project"]["bin_estimator"]["id"], s.be);
    h.call(
        "update_project",
        json!({ "id": gt2, "title": "Renamed", "description": "x" }),
    );
    let d = h.call("get_project", json!({ "id": gt2 }));
    assert_eq!(d["project"]["title"], "Renamed");
    assert!(
        d["project"]["artifact_estimator"].is_null(),
        "absent fields stay unchanged"
    );
    // Changing a quant-bias estimator's bins with mixtures attached is refused.
    let e = h.fail(
        "update_project",
        json!({ "id": s.qb, "bin_estimator_id": be2 }),
    );
    assert_eq!(e.code, ErrorCode::InUse);
    // Delete the leaf copies; then the copied estimators.
    for p in [gt2, qb2, ae2] {
        h.call("delete_project", json!({ "id": p }));
    }
    h.drain();
    h.call("delete_project", json!({ "id": be2 }));
    assert_eq!(h.changed(), set(&["projects", "controls"]));
    assert_eq!(
        h.call("list_controls", json!({ "bin_estimator_id": be2 }))
            .as_array()
            .unwrap()
            .len(),
        0
    );
    // A bin estimator restricted to listed samples.
    let be3 = id(&h.call(
        "create_project",
        json!({ "kind": "bin_estimator", "title": "Subset", "locus_set_id": s.set_id, "all_samples": false }),
    ));
    let d = h.call("get_project", json!({ "id": be3 }));
    assert_eq!(d["project"]["sample_count"], 0);
    let some: Vec<i64> = s.samples.values().take(40).copied().collect();
    h.call(
        "add_project_samples",
        json!({ "id": be3, "sample_ids": some }),
    );
    let r = analyze(h, be3, Some(&[l1]));
    assert!(r["loci"][0]["run_count"].as_u64().unwrap() <= 40);
    h.call("update_project", json!({ "id": be3, "all_samples": true }));
    assert_stale(h, be3, l1, "Runs changed");
}

#[test]
fn control_mixture_csv_validation() {
    let tmp = tempfile::tempdir().unwrap();
    let h = Harness::new(&tmp.path().join("state"));
    let st = study(tmp.path(), 1, 9100);
    h.call("new_workspace", json!({ "path": null }));
    let (set_id, loci) = load_study(&h, &st);
    let be = id(&h.call(
        "create_project",
        json!({ "kind": "bin_estimator", "title": "B", "locus_set_id": set_id }),
    ));
    analyze(&h, be, None);
    for name in STRAINS {
        h.call(
            "create_control",
            json!({ "bin_estimator_id": be, "label": name }),
        );
    }
    assert_eq!(
        h.fail(
            "create_control",
            json!({ "bin_estimator_id": be, "label": "3d7" })
        )
        .code,
        ErrorCode::Conflict
    );
    let bad_bin = h.fail(
        "create_control",
        json!({ "bin_estimator_id": be, "label": "X", "alleles": [{ "locus_id": loci["PfB1"], "bin_id": 999999 }] }),
    );
    assert_eq!(bad_bin.code, ErrorCode::Invalid);
    let qb = id(&h.call(
        "create_project",
        json!({ "kind": "quant_bias_estimator", "title": "Q", "locus_set_id": set_id, "bin_estimator_id": be }),
    ));
    let (b1, b2) = {
        let mut m: Vec<&String> = st.mixtures.keys().collect();
        m.sort();
        (m[0].clone(), m[1].clone())
    };
    let check = |csv: &str, needle: &str| {
        let r = h.call(
            "import_control_mixtures_csv",
            json!({ "id": qb, "content": csv, "dry_run": true }),
        );
        assert_eq!(r["applied"], false);
        let probs: Vec<String> = r["problems"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| p.as_str().unwrap().to_string())
            .collect();
        assert!(
            probs.iter().any(|p| p.contains(needle)),
            "{needle:?} not in {probs:?}"
        );
        let e = h.fail(
            "import_control_mixtures_csv",
            json!({ "id": qb, "content": csv }),
        );
        assert_eq!(e.code, ErrorCode::Invalid);
    };
    check(
        &format!("Barcode,C1,C2\n{b1},3D7;0.5,HB3;0.4\n"),
        "sum to 0.900",
    );
    check(&format!("Barcode,C1,C2\n{b1},3D7;0.5,NOPE;0.5\n"), "NOPE");
    check("Barcode,C1,C2\nGHOST,3D7;0.5,HB3;0.5\n", "GHOST");
    check(
        &format!("Barcode,C1,C2\n{b1},3D7:0.5,HB3;0.5\n"),
        "CONTROL;PROPORTION",
    );
    check(
        &format!("Barcode,C1,C2\n{b1},3D7;half,HB3;0.5\n"),
        "not a number",
    );
    check(
        &format!("Barcode,C1,C2\n{b1},3D7;0.5,3D7;0.5\n"),
        "listed twice",
    );
    check(
        &format!("Barcode,C1\n{b1},3D7;1\n{b1},HB3;1\n"),
        "appears twice",
    );
    check(
        &format!("Barcode,C1,C2\n{b1},3D7;1.5,HB3;-0.5\n"),
        "must be in (0, 1]",
    );
    let e = h.fail(
        "import_control_mixtures_csv",
        json!({ "id": qb, "content": "Sample,C1\nx,3D7;1\n" }),
    );
    assert!(e.message.contains("Barcode"));
    // Valid: a dry run reports without applying; then apply; re-import replaces.
    let ok = format!("barcode,c1,c2\n{b1},3D7;0.333,HB3;0.667\n{b2},HB3;0.5,DD2;0.5\n");
    let r = h.call(
        "import_control_mixtures_csv",
        json!({ "id": qb, "content": ok, "dry_run": true }),
    );
    assert_eq!(
        (r["applied"].clone(), r["added"].clone()),
        (json!(false), json!(2))
    );
    assert_eq!(
        h.call("list_project_samples", json!({ "id": qb }))
            .as_array()
            .unwrap()
            .len(),
        0
    );
    let r = h.call(
        "import_control_mixtures_csv",
        json!({ "id": qb, "content": ok }),
    );
    assert_eq!(
        (r["applied"].clone(), r["added"].clone()),
        (json!(true), json!(2))
    );
    let r = h.call(
        "import_control_mixtures_csv",
        json!({ "id": qb, "content": ok }),
    );
    assert_eq!(
        (r["added"].clone(), r["replaced"].clone()),
        (json!(0), json!(2))
    );
    let rows = h.call("list_project_samples", json!({ "id": qb }));
    let row = rows
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["barcode"] == b1.as_str())
        .unwrap();
    let total: f64 = row["controls"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["proportion"].as_f64().unwrap())
        .sum();
    assert!((total - 1.0).abs() < 1e-12, "stored rescaled to exactly 1");
    // The same through the API.
    let ctl = h.call("list_controls", json!({ "bin_estimator_id": be }));
    let c0 = id(&ctl[0]);
    let e = h.fail(
        "set_control_mixtures",
        json!({ "id": qb, "mixtures": [{ "sample_id": 1, "components": [{ "control_id": c0, "proportion": 0.7 }] }] }),
    );
    assert!(e.message.contains("sum to"), "{}", e.message);
    // Removing the samples frees the controls.
    let ids: Vec<i64> = rows
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["sample_id"].as_i64().unwrap())
        .collect();
    h.call(
        "remove_project_samples",
        json!({ "id": qb, "sample_ids": ids }),
    );
    h.call("delete_control", json!({ "id": c0 }));
}

fn rows(h: &Harness, pid: i64, locus: i64) -> Vec<Value> {
    h.call(
        "get_locus_calls",
        json!({ "project_id": pid, "locus_id": locus }),
    )["rows"]
        .as_array()
        .unwrap()
        .clone()
}

fn row_of(rows: &[Value], sample: i64) -> Value {
    rows.iter()
        .find(|r| r["sample_id"] == sample)
        .unwrap_or_else(|| panic!("no row for sample {sample}"))
        .clone()
}

/// What the review key covers: alleles, flags, reference run.
fn call_shape(r: &Value) -> (Value, Value, Value) {
    let alleles: Vec<Value> = r["alleles"]
        .as_array()
        .unwrap()
        .iter()
        .map(|a| a["bin_id"].clone())
        .collect();
    (
        json!(alleles),
        r["flags"].clone(),
        r["reference_run_id"].clone(),
    )
}

#[test]
fn review_rows_reviewed_state_moi_and_export_consistency() {
    let s = setup();
    let h = &s.h;
    let l1 = s.loci["PfB1"];

    // ---- Item 1: rows carry what the review table shows.
    let lc = h.call(
        "get_locus_calls",
        json!({ "project_id": s.gt, "locus_id": l1 }),
    );
    let gt_params = h.call(
        "get_project_locus_params",
        json!({ "project_id": s.gt, "locus_id": l1 }),
    )["params"]["genotyping"]
        .clone();
    let threshold = gt_params["probability_threshold"].as_f64().unwrap();
    let abs_limit = gt_params["absolute_peak_height_limit"].as_f64().unwrap();
    let all = lc["rows"].as_array().unwrap();
    let mut misses = 0;
    for r in all {
        let has_ref = r["reference_run_id"].is_i64();
        assert_eq!(r["plate_label"].is_string(), has_ref, "{r}");
        assert_eq!(r["well_label"].is_string(), has_ref, "{r}");
        assert!(
            r["run_count"].as_u64().unwrap() >= u64::from(has_ref),
            "{r}"
        );
        assert_eq!(r["reviewed"], false);
        let alleles = r["alleles"].as_array().unwrap();
        let sizes: Vec<f64> = alleles
            .iter()
            .map(|a| a["size"].as_f64().unwrap())
            .collect();
        assert!(sizes.windows(2).all(|w| w[0] < w[1]), "by size: {sizes:?}");
        if !alleles.is_empty() {
            for k in ["proportion", "corrected_proportion"] {
                let sum: f64 = alleles.iter().map(|a| a[k].as_f64().unwrap()).sum();
                assert!((sum - 1.0).abs() < 1e-3, "{k} sums to {sum}: {r}");
            }
            let min = alleles
                .iter()
                .map(|a| a["probability"].as_f64().unwrap())
                .fold(f64::INFINITY, f64::min);
            assert_eq!(r["min_probability"].as_f64().unwrap(), min);
        } else {
            assert!(r.get("min_probability").is_none());
        }
        for m in r["narrow_misses"].as_array().into_iter().flatten() {
            misses += 1;
            assert!(!alleles.iter().any(|a| a["bin_id"] == m["bin_id"]));
            let (v, lim) = (m["value"].as_f64().unwrap(), m["limit"].as_f64().unwrap());
            assert!(v < lim, "{m}");
            match m["reason"].as_str().unwrap() {
                "probability" => {
                    assert_eq!(lim, threshold);
                    assert!(v >= 0.5);
                }
                "artifact" => assert_eq!(lim, abs_limit),
                x => panic!("reason {x}"),
            }
        }
    }
    // Narrow misses across all loci of the study.
    for (label, &l) in &s.loci {
        if label == "PfB1" {
            continue;
        }
        misses += rows(h, s.gt, l)
            .iter()
            .filter_map(|r| r["narrow_misses"].as_array().map(|a| a.len()))
            .sum::<usize>();
    }
    assert!(misses > 0, "the study has narrowly rejected peaks");

    // A row agrees with the sample view and its peaks.
    let multi = all
        .iter()
        .find(|r| r["alleles"].as_array().unwrap().len() >= 2)
        .unwrap()
        .clone();
    let sid = multi["sample_id"].as_i64().unwrap();
    let v = h.call(
        "get_sample_locus_call",
        json!({ "project_id": s.gt, "sample_id": sid, "locus_id": l1 }),
    );
    assert_eq!(v["row"], multi);
    assert_eq!(
        v["runs"].as_array().unwrap().len() as u64,
        multi["run_count"].as_u64().unwrap()
    );
    let reference = v["runs"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["is_reference"] == true)
        .unwrap();
    assert_eq!(reference["plate_label"], multi["plate_label"]);
    assert_eq!(reference["well_label"], multi["well_label"]);
    for a in multi["alleles"].as_array().unwrap() {
        let pk = v["peaks"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["bin_id"] == a["bin_id"])
            .unwrap();
        let q = pk["relative_quantification"].as_f64().unwrap();
        assert!((a["proportion"].as_f64().unwrap() - q).abs() < 1e-4);
    }

    // toggle_allele returns the full row, as get_locus_calls then shows it.
    let off = multi["alleles"][0]["bin_id"].as_i64().unwrap();
    let r = h.call(
        "toggle_allele",
        json!({ "project_id": s.gt, "sample_id": sid, "locus_id": l1, "bin_id": off }),
    );
    assert_eq!(
        r["alleles"].as_array().unwrap().len(),
        multi["alleles"].as_array().unwrap().len() - 1
    );
    assert_eq!(r, row_of(&rows(h, s.gt, l1), sid));
    assert!(r["well_label"].is_string() && r["run_count"].as_u64().unwrap() >= 1);
    let sum: f64 = r["alleles"]
        .as_array()
        .unwrap()
        .iter()
        .map(|a| a["proportion"].as_f64().unwrap())
        .sum();
    assert!((sum - 1.0).abs() < 1e-3, "re-quantified after the toggle");
    // Re-analysis restores the automatic call for the rest of the test.
    analyze(h, s.gt, Some(&[l1]));
    h.call("calculate_peak_probabilities", json!({ "id": s.gt }));
    h.drain();

    // ---- Item 3: reviewed state.
    let before = rows(h, s.gt, l1);
    let sid = before
        .iter()
        .find(|r| r["alleles"].as_array().unwrap().len() >= 2)
        .unwrap()["sample_id"]
        .as_i64()
        .unwrap();
    let r = h.call(
        "set_call_reviewed",
        json!({ "project_id": s.gt, "sample_id": sid, "locus_id": l1, "reviewed": true }),
    );
    assert_eq!(r["reviewed"], true);
    assert_eq!(h.changed(), set(&["projects"]));
    assert_eq!(row_of(&rows(h, s.gt, l1), sid)["reviewed"], true);
    let summary_reviewed = |h: &Harness| {
        let sum = h.call("get_genotyping_summary", json!({ "id": s.gt }));
        let l = sum["loci"]
            .as_array()
            .unwrap()
            .iter()
            .find(|x| x["locus_id"] == l1)
            .unwrap()
            .clone();
        (
            l["calls"].as_u64().unwrap(),
            l["reviewed"].as_u64().unwrap(),
        )
    };
    assert_eq!(summary_reviewed(h), (180, 1));
    let sc = h.call(
        "get_project_sample_calls",
        json!({ "project_id": s.gt, "sample_id": sid }),
    );
    let here = sc["loci"]
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["locus_id"] == l1)
        .unwrap();
    assert_eq!(here["row"]["reviewed"], true);
    let barcode = row_of(&before, sid)["barcode"]
        .as_str()
        .unwrap()
        .to_string();
    let long = h.call("export_alleles_long", json!({ "id": s.gt }))["content"]
        .as_str()
        .unwrap()
        .to_string();
    assert!(long.lines().next().unwrap().ends_with(",MOI,Reviewed"));
    let mine: Vec<&str> = long
        .lines()
        .filter(|l| l.starts_with(&format!("{barcode},PfB1,")))
        .collect();
    assert!(
        mine.len() >= 2 && mine.iter().all(|l| l.ends_with(",True")),
        "{mine:?}"
    );
    assert!(
        long.lines()
            .skip(1)
            .filter(|l| l.ends_with(",True"))
            .count()
            == mine.len()
    );

    // Survives a recomputation that leaves alleles and flags unchanged.
    analyze(h, s.gt, Some(&[l1]));
    h.call("calculate_peak_probabilities", json!({ "id": s.gt }));
    assert_eq!(row_of(&rows(h, s.gt, l1), sid)["reviewed"], true);

    // A toggle unreviews; toggling back does not restore it (the call is now
    // manually curated, which the reviewer did not confirm); confirming does.
    let b = row_of(&before, sid)["alleles"][0]["bin_id"]
        .as_i64()
        .unwrap();
    let toggle = |h: &Harness| {
        h.call(
            "toggle_allele",
            json!({ "project_id": s.gt, "sample_id": sid, "locus_id": l1, "bin_id": b }),
        )
    };
    assert_eq!(toggle(h)["reviewed"], false);
    assert_eq!(toggle(h)["reviewed"], false);
    let r = h.call(
        "set_call_reviewed",
        json!({ "project_id": s.gt, "sample_id": sid, "locus_id": l1, "reviewed": true }),
    );
    assert_eq!(r["reviewed"], true);
    assert_eq!(r["flags"]["manual_curation"], true);
    // Comments and the probabilistic pass (which keeps manual calls) keep it.
    h.call(
        "set_call_comment",
        json!({ "project_id": s.gt, "sample_id": sid, "locus_id": l1, "comment": "ok" }),
    );
    h.call("calculate_peak_probabilities", json!({ "id": s.gt }));
    assert_eq!(row_of(&rows(h, s.gt, l1), sid)["reviewed"], true);
    // Re-analysis discards the manual curation: a different call, unreviewed.
    analyze(h, s.gt, Some(&[l1]));
    let r = row_of(&rows(h, s.gt, l1), sid);
    assert_eq!(r["flags"]["manual_curation"], false);
    assert_eq!(r["reviewed"], false);

    // Bulk: every call at the locus, then a parameter change that alters some
    // calls: exactly those reset.
    let r = h.call(
        "set_calls_reviewed",
        json!({ "project_id": s.gt, "locus_id": l1, "reviewed": true }),
    );
    assert_eq!(r["updated"], 180);
    assert!(r["missing"].as_array().unwrap().is_empty());
    assert_eq!(summary_reviewed(h), (180, 180));
    let marked = rows(h, s.gt, l1);
    h.call(
        "update_project_locus_params",
        json!({ "project_id": s.gt, "locus_ids": [l1], "params": { "genotyping": { "absolute_peak_height_limit": 1500.0 } } }),
    );
    analyze(h, s.gt, Some(&[l1]));
    let after = rows(h, s.gt, l1);
    let (mut kept, mut reset) = (0, 0);
    for a in &after {
        let m = row_of(&marked, a["sample_id"].as_i64().unwrap());
        let same = call_shape(a) == call_shape(&m);
        assert_eq!(a["reviewed"], same, "{a}");
        if same {
            kept += 1;
        } else {
            reset += 1;
        }
    }
    assert!(kept > 0 && reset > 0, "kept {kept}, reset {reset}");
    assert_eq!(summary_reviewed(h), (180, kept));
    // Setting the parameter back restores the calls, and with them the marks.
    h.call(
        "reset_project_locus_params",
        json!({ "project_id": s.gt, "locus_ids": [l1] }),
    );
    analyze(h, s.gt, Some(&[l1]));
    assert_eq!(summary_reviewed(h), (180, 180));

    // Bulk by a filter's sample ids; unknown ids are reported, not an error.
    let some: Vec<i64> = before
        .iter()
        .take(5)
        .map(|r| r["sample_id"].as_i64().unwrap())
        .collect();
    let mut ids = some.clone();
    ids.push(987_654);
    let r = h.call(
        "set_calls_reviewed",
        json!({ "project_id": s.gt, "locus_id": l1, "sample_ids": ids, "reviewed": false }),
    );
    assert_eq!(r["updated"], 5);
    assert_eq!(r["missing"], json!([987_654]));
    assert_eq!(summary_reviewed(h), (180, 175));
    let now = rows(h, s.gt, l1);
    assert!(some.iter().all(|&x| row_of(&now, x)["reviewed"] == false));
    assert_eq!(
        h.fail(
            "set_call_reviewed",
            json!({ "project_id": s.gt, "sample_id": sid, "locus_id": 987_654, "reviewed": true })
        )
        .code,
        ErrorCode::NotFound
    );
    h.call("calculate_peak_probabilities", json!({ "id": s.gt }));

    // ---- Item 4: model MOI next to the most alleles called at a locus.
    let mut gaps = 0;
    for (_, &sample) in s.samples.iter().take(60) {
        let sc = match s.h.engine.dispatch(
            "get_project_sample_calls",
            json!({ "project_id": s.gt, "sample_id": sample }),
        ) {
            Ok(v) => v,
            Err(_) => continue, // a control mixture, not in this project
        };
        let counted: Vec<(usize, i64)> = sc["loci"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|l| l["row"]["reference_run_id"].is_i64())
            .map(|l| {
                (
                    l["row"]["alleles"].as_array().unwrap().len(),
                    l["locus_id"].as_i64().unwrap(),
                )
            })
            .collect();
        let max = counted.iter().map(|c| c.0).max();
        assert_eq!(sc["max_alleles"].as_u64(), max.map(|m| m as u64));
        let at: Vec<i64> = sc["max_alleles_loci"]
            .as_array()
            .unwrap()
            .iter()
            .map(|l| l["locus_id"].as_i64().unwrap())
            .collect();
        let want: Vec<i64> = counted
            .iter()
            .filter(|c| Some(c.0) == max && c.0 > 0)
            .map(|c| c.1)
            .collect();
        assert_eq!(at, want);
        if let (Some(moi), Some(m)) = (sc["moi"].as_u64(), max) {
            gaps += usize::from(m as u64 > moi);
        }
    }
    // Not asserted (depends on the synthetic draw): samples whose most alleles
    // at a locus exceed the model MOI, the case the two fields explain.
    eprintln!("samples with max alleles above model MOI: {gaps}");

    // ---- Item 2: peak data and long export agree on proportions.
    let long = h.call("export_alleles_long", json!({ "id": s.gt }))["content"]
        .as_str()
        .unwrap()
        .to_string();
    let peaks = h.call("export_peak_data", json!({ "id": s.gt }))["content"]
        .as_str()
        .unwrap()
        .to_string();
    let col = |head: &str, name: &str| head.split(',').position(|c| c == name).unwrap();
    let lh = long.lines().next().unwrap();
    let (ls, ll, la, lp, lc_) = (
        col(lh, "Sample"),
        col(lh, "Locus"),
        col(lh, "Allele"),
        col(lh, "Proportion"),
        col(lh, "Corrected Proportion"),
    );
    let mut long_by: HashMap<(String, String, String), (String, String)> = HashMap::new();
    for l in long.lines().skip(1) {
        let c: Vec<&str> = l.split(',').collect();
        long_by.insert(
            (c[ls].into(), c[ll].into(), c[la].into()),
            (c[lp].into(), c[lc_].into()),
        );
    }
    let ph = peaks.lines().next().unwrap();
    assert!(
        ph.ends_with(",Crosstalk Flag,Height Share of All Peaks,Spectral Dip Ratio,Spectral Flag,Expected Pull-Up,Pull-Up Error")
    );
    let (ps, pl, pp, pc, pca, pal, psh) = (
        col(ph, "Sample"),
        col(ph, "Locus"),
        col(ph, "Proportion"),
        col(ph, "Corrected Proportion"),
        col(ph, "Called Allele"),
        col(ph, "Allele Label"),
        col(ph, "Height Share of All Peaks"),
    );
    let mut sums: HashMap<(String, String), (f64, f64, f64)> = HashMap::new();
    let mut matched = 0;
    for l in peaks.lines().skip(1) {
        let c: Vec<&str> = l.split(',').collect();
        let e = sums.entry((c[ps].into(), c[pl].into())).or_default();
        e.2 += c[psh].parse::<f64>().unwrap();
        if c[pca] == "True" {
            let (p, cp) = (c[pp].parse::<f64>().unwrap(), c[pc].parse::<f64>().unwrap());
            e.0 += p;
            e.1 += cp;
            let (lp, lcp) = &long_by[&(c[ps].to_string(), c[pl].to_string(), c[pal].to_string())];
            assert_eq!((c[pp], c[pc]), (lp.as_str(), lcp.as_str()), "{l}");
            matched += 1;
        } else {
            assert_eq!((c[pp], c[pc]), ("NA", "NA"), "uncalled peak: {l}");
        }
    }
    assert!(matched > 500);
    for ((sample, locus), (p, cp, share)) in sums {
        assert!((share - 1.0).abs() < 2e-3, "{sample} {locus}: {share}");
        if p > 0.0 {
            assert!((p - 1.0).abs() < 2e-3, "{sample} {locus}: {p}");
            assert!((cp - 1.0).abs() < 2e-3, "{sample} {locus}: {cp}");
        }
    }
}

/// Gaps reported by the calibration and quantification-bias pages, each
/// driven through `dispatch`.
#[test]
fn calibration_page_gaps() {
    let Setup {
        h,
        study,
        loci,
        samples,
        be,
        ae,
        qb,
        gt,
        strains,
        ..
    } = setup();
    let mut locus_ids: Vec<i64> = loci.values().copied().collect();
    locus_ids.sort_unstable();
    let l0 = locus_ids[0];

    // 1, 2: the per-peak view agrees with the fit, 75/25 at the default
    // minimum share included, and says why every other point was left out.
    let mut used_total = 0;
    let mut used_75_25 = 0;
    for &l in &locus_ids {
        let v = h.call(
            "get_locus_quant_bias",
            json!({ "project_id": qb, "locus_id": l }),
        );
        assert_eq!(v["status"]["state"], "current");
        assert_eq!(v["params"]["min_true_proportion"], 0.25);
        assert_eq!(v["params_recomputed"], false);
        let points = v["points"].as_array().unwrap();
        let used: Vec<&Value> = points.iter().filter(|p| p["used"] == true).collect();
        let est = &v["estimate"];
        assert_eq!(est["n_peaks"].as_u64().unwrap() as usize, used.len(), "{l}");
        let sets: std::collections::BTreeSet<i64> = used
            .iter()
            .map(|p| p["sample_id"].as_i64().unwrap())
            .collect();
        assert_eq!(est["n_sets"].as_u64().unwrap() as usize, sets.len());
        for p in points {
            assert!(p["height"].as_f64().unwrap() > 0.0);
            assert!(p["bin_label"].is_string() && p["bin_id"].is_i64(), "{p}");
            assert_eq!(p["used"] == true, p.get("exclusion").is_none(), "{p}");
            let t = p["true_proportion"].as_f64().unwrap();
            if (t - 0.25).abs() < 1e-9 || (t - 0.75).abs() < 1e-9 {
                used_75_25 += usize::from(p["used"] == true);
            }
            if (t - 0.1).abs() < 1e-9 {
                assert_eq!(p["exclusion"], "below_min_true_proportion");
            }
            if (t - 0.9).abs() < 1e-9 {
                assert_eq!(p["exclusion"], "single_peak_set");
            }
        }
        used_total += used.len();
        let mixtures = v["mixtures"].as_array().unwrap();
        assert_eq!(mixtures.len(), 12);
        for m in mixtures {
            assert!(m["well_label"].is_string() && m["reference_run_id"].is_i64());
            assert_eq!(m["components"].as_array().unwrap().len(), 2);
            let any_used = points
                .iter()
                .any(|p| p["sample_id"] == m["sample_id"] && p["used"] == true);
            assert_eq!(m["used"], any_used);
        }
    }
    assert!(used_75_25 > 0, "75/25 mixtures must enter the fit");

    // 9: control-mixture peak data exports, agreeing with the view.
    let f = h.call("export_peak_data", json!({ "id": qb }));
    assert!(f["filename"]
        .as_str()
        .unwrap()
        .ends_with("_control_peak_data.csv"));
    let content = f["content"].as_str().unwrap();
    let mut rdr = csv::Reader::from_reader(content.as_bytes());
    let header: Vec<String> = rdr.headers().unwrap().iter().map(str::to_string).collect();
    let col = |n: &str| header.iter().position(|h| h == n).unwrap();
    let (used_col, why_col, true_col) = (
        col("Used In Fit"),
        col("Exclusion Reason"),
        col("True Proportion"),
    );
    let mut used_rows = 0;
    for r in rdr.records() {
        let r = r.unwrap();
        if &r[used_col] == "True" {
            used_rows += 1;
            assert_eq!(&r[why_col], "");
        } else if &r[used_col] == "False" {
            assert!(!r[why_col].is_empty());
        } else {
            assert!(r[true_col] == *"0.0000" || &r[true_col] == "NA");
        }
    }
    assert_eq!(used_rows, used_total);

    // 4: an unknown control is reported once, with no knock-on sum problem.
    let (mix_barcode, _) = study.mixtures.iter().next().unwrap();
    let r = h.call(
        "import_control_mixtures_csv",
        json!({ "id": qb, "dry_run": true,
                "content": format!("Barcode,C1,C2\n{mix_barcode},3D7;0.5,K1;0.5\n") }),
    );
    let problems = r["problems"].as_array().unwrap();
    assert_eq!(problems.len(), 1, "{problems:?}");
    assert!(problems[0].as_str().unwrap().contains("K1"));

    // 5: mixtures announce controls (mixture counts).
    h.drain();
    let m = &study.mixtures[mix_barcode];
    let (a, b, p) = (m[0].0, m[1].0, m[0].1);
    h.call(
        "set_control_mixtures",
        json!({ "id": qb, "mixtures": [{ "sample_id": samples[mix_barcode], "components": [
            { "control_id": strains[a], "proportion": p },
            { "control_id": strains[b], "proportion": 1.0 - p }] }] }),
    );
    assert!(h.changed().contains("controls"));
    h.call(
        "import_control_mixtures_csv",
        json!({ "id": qb, "content": format!("Barcode,C1,C2\n{mix_barcode},{};{p},{};{}\n",
                STRAINS[a], STRAINS[b], 1.0 - p) }),
    );
    assert!(h.changed().contains("controls"));
    assert_current(&h, qb, l0);

    // 7: parameters equal to the defaults, stored explicitly, are defaults.
    for (pid, section) in [(ae, "artifact"), (qb, "quant_bias"), (gt, "genotyping")] {
        let d = h.call(
            "get_project_locus_params",
            json!({ "project_id": pid, "locus_id": l0 }),
        );
        assert_eq!(d["is_default"], true);
        let params = &d["params"];
        for patch in [
            json!({ "scan": params["scan"] }),
            json!({ "filter": { "min_peak_height": params["filter"]["min_peak_height"] } }),
            json!({ section: params[section] }),
            params.clone(),
        ] {
            let v = h.call(
                "update_project_locus_params",
                json!({ "project_id": pid, "locus_ids": [l0], "params": patch }),
            );
            assert_eq!(v[0]["is_default"], true, "{pid} {patch}");
            assert_current(&h, pid, l0);
        }
    }
    let v = h.call(
        "update_project_locus_params",
        json!({ "project_id": ae, "locus_ids": [l0], "params": { "artifact": { "error_estimator": "densest_half" } } }),
    );
    assert_eq!(v[0]["is_default"], true);
    assert_eq!(
        v[0]["params"]["artifact"]["error_estimator"],
        "densest_half"
    );
    assert_current(&h, ae, l0);

    // 2: a stale locus still explains the stored fit, with its parameters.
    let before = h.call(
        "get_locus_quant_bias",
        json!({ "project_id": qb, "locus_id": l0 }),
    );
    h.call(
        "update_project_locus_params",
        json!({ "project_id": qb, "locus_ids": [l0], "params": { "quant_bias": { "min_true_proportion": 0.3 } } }),
    );
    assert_stale(&h, qb, l0, "Parameters changed");
    let after = h.call(
        "get_locus_quant_bias",
        json!({ "project_id": qb, "locus_id": l0 }),
    );
    assert_eq!(after["params"]["min_true_proportion"], 0.25);
    assert_eq!(after["params_recomputed"], false);
    assert_eq!(after["points"], before["points"]);
    h.call(
        "reset_project_locus_params",
        json!({ "project_id": qb, "locus_ids": [l0] }),
    );
    assert_current(&h, qb, l0);

    // 6: the artifact error estimator changes in place, keeping edits.
    let arts = |l: i64| {
        h.call(
            "get_locus_artifact_estimators",
            json!({ "project_id": ae, "locus_id": l }),
        )
    };
    let l1 = locus_ids
        .iter()
        .copied()
        .find(|&l| arts(l)["estimators"].as_array().unwrap().len() >= 2)
        .expect("a locus with two artifact classes");
    let ests = arts(l1)["estimators"].as_array().unwrap().clone();
    let eq0 = &ests[0]["equations"][0]["segment"];
    let mid = (eq0["start_size"].as_f64().unwrap() + eq0["end_size"].as_f64().unwrap()) / 2.0;
    h.call(
        "add_artifact_breakpoint",
        json!({ "id": ests[0]["id"], "size": mid }),
    );
    h.call(
        "delete_artifact_estimator",
        json!({ "id": ests[ests.len() - 1]["id"] }),
    );
    assert_current(&h, ae, l1);
    let n_eq = arts(l1)["estimators"][0]["equations"]
        .as_array()
        .unwrap()
        .len();
    // One class only: the locus parameter stays.
    let second_before = arts(l1)["estimators"][1]["equations"][0]["segment"]["error"].clone();
    let v = h.call(
        "set_artifact_error_estimator",
        json!({ "project_id": ae, "locus_id": l1, "error_estimator": "rms", "ids": [ests[0]["id"]] }),
    );
    assert!(v["estimators"][0]["equations"]
        .as_array()
        .unwrap()
        .iter()
        .all(|e| e["segment"]["error"] == "rms"));
    assert_eq!(
        v["estimators"][1]["equations"][0]["segment"]["error"],
        second_before
    );
    let pv = h.call(
        "get_project_locus_params",
        json!({ "project_id": ae, "locus_id": l1 }),
    );
    assert_eq!(pv["is_default"], true);
    // Every class: in step with the parameter, still current.
    h.drain();
    let v = h.call(
        "set_artifact_error_estimator",
        json!({ "project_id": ae, "locus_id": l1, "error_estimator": "rms" }),
    );
    assert!(h.changed().contains("projects"));
    let classes = v["estimators"].as_array().unwrap();
    assert_eq!(classes.len(), ests.len() - 1, "deleted class stays deleted");
    assert_eq!(
        classes[0]["equations"].as_array().unwrap().len(),
        n_eq,
        "breakpoints kept"
    );
    // Every distance class; the global class keeps MAD, as analysis fits it.
    assert!(classes
        .iter()
        .filter(|c| !c["artifact_distance"].is_null())
        .flat_map(|c| c["equations"].as_array().unwrap())
        .all(|e| e["segment"]["error"] == "rms"));
    assert!(classes
        .iter()
        .filter(|c| c["artifact_distance"].is_null())
        .flat_map(|c| c["equations"].as_array().unwrap())
        .all(|e| e["segment"]["error"] == "mad"));
    assert_eq!(v["status"]["state"], "current");
    let pv = h.call(
        "get_project_locus_params",
        json!({ "project_id": ae, "locus_id": l1 }),
    );
    assert_eq!(pv["params"]["artifact"]["error_estimator"], "rms");
    assert_eq!(pv["is_default"], false);
    assert_current(&h, ae, l1);
    assert_stale(&h, gt, l1, "artifact model changed");
    let v = h.call(
        "set_artifact_error_estimator",
        json!({ "project_id": ae, "locus_id": l1, "error_estimator": "densest_half" }),
    );
    assert_eq!(
        v["estimators"][0]["equations"][0]["segment"]["error"],
        "densest_half"
    );
    assert_current(&h, ae, l1);
    let pv = h.call(
        "get_project_locus_params",
        json!({ "project_id": ae, "locus_id": l1 }),
    );
    assert_eq!(pv["is_default"], true);
    let e = h.fail(
        "set_artifact_error_estimator",
        json!({ "project_id": ae, "locus_id": l1, "error_estimator": "mad", "ids": [-1] }),
    );
    assert_eq!(e.code, ErrorCode::NotFound);

    // 3: a control allele whose bin was deleted is told apart from "not set".
    let ctl = |id: i64| {
        h.call("list_controls", json!({ "bin_estimator_id": be }))
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["id"] == id)
            .unwrap()
            .clone()
    };
    let allele = |c: &Value, l: i64| {
        c["alleles"]
            .as_array()
            .unwrap()
            .iter()
            .find(|a| a["locus_id"] == l)
            .unwrap()
            .clone()
    };
    let a0 = allele(&ctl(strains[0]), l0);
    let bin = a0["bin_id"].as_i64().unwrap();
    let bins = h.call(
        "get_locus_bins",
        json!({ "project_id": be, "locus_id": l0 }),
    );
    let size = bins["bins"]
        .as_array()
        .unwrap()
        .iter()
        .find(|b| b["id"] == bin)
        .unwrap()["base_size"]
        .clone();
    h.drain();
    h.call(
        "update_locus_bins",
        json!({ "project_id": be, "locus_id": l0, "bins": [], "delete_ids": [bin] }),
    );
    assert!(h.changed().contains("controls"));
    let gone = allele(&ctl(strains[0]), l0);
    assert!(gone["bin_id"].is_null());
    assert_eq!(gone["deleted_bin"]["label"], a0["bin_label"]);
    assert_eq!(gone["deleted_bin"]["base_size"], size);
    // Unset on purpose: no deleted bin.
    h.call(
        "update_control",
        json!({ "id": strains[1], "alleles": [{ "locus_id": l0, "bin_id": null }] }),
    );
    let a1 = allele(&ctl(strains[1]), l0);
    assert!(a1["bin_id"].is_null() && a1.get("deleted_bin").is_none());
    let v = h.call(
        "get_locus_quant_bias",
        json!({ "project_id": qb, "locus_id": l0 }),
    );
    let missing: std::collections::BTreeSet<(i64, String)> = v["mixtures"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|m| m["components"].as_array().unwrap().clone())
        .filter_map(|c| {
            Some((
                c["control_id"].as_i64()?,
                c["missing"].as_str()?.to_string(),
            ))
        })
        .collect();
    assert!(
        missing.contains(&(strains[0], "bin_deleted".into())),
        "{missing:?}"
    );
    assert!(
        missing.contains(&(strains[1], "not_set".into())),
        "{missing:?}"
    );
    // Re-analysis reports the missing alleles as the reason runs were left out.
    analyze(&h, qb, Some(&[l0]));
    let v = h.call(
        "get_locus_quant_bias",
        json!({ "project_id": qb, "locus_id": l0 }),
    );
    assert!(v["points"]
        .as_array()
        .unwrap()
        .iter()
        .any(|p| p["exclusion"] == "control_allele_not_found"));
    // Setting the allele again forgets the deleted bin.
    let other = h.call(
        "get_locus_bins",
        json!({ "project_id": be, "locus_id": l0 }),
    )["bins"][0]["id"]
        .clone();
    h.call(
        "update_control",
        json!({ "id": strains[0], "alleles": [{ "locus_id": l0, "bin_id": other }] }),
    );
    assert!(allele(&ctl(strains[0]), l0).get("deleted_bin").is_none());

    // 5: removing a mixture announces controls.
    let before = ctl(strains[a])["mixture_count"].as_u64().unwrap();
    h.drain();
    h.call(
        "remove_project_samples",
        json!({ "id": qb, "sample_ids": [samples[mix_barcode]] }),
    );
    assert!(h.changed().contains("controls"));
    assert_eq!(
        ctl(strains[a])["mixture_count"].as_u64().unwrap(),
        before - 1
    );

    // 8: every run that is not good says why, as wells do.
    let mut not_good = 0;
    for &sid in samples.values() {
        let d = h.call("get_sample", json!({ "id": sid }));
        for r in d["runs"].as_array().unwrap() {
            let good = r["sizing"] == "good";
            assert_eq!(good, r.get("sizing_reason").is_none(), "{r}");
            not_good += usize::from(!good);
        }
    }
    assert!(not_good > 0, "the study has wells that are not good");

    // 10: empty or doubled ladder-peak input is refused alike by both methods.
    let plate = h.call("list_plates", Value::Null)[0]["id"].clone();
    let well = h.call("get_plate", json!({ "id": plate }))["wells"][0]["id"].clone();
    for (params, msg) in [
        (json!({ "id": well, "peaks": [] }), "No ladder peaks"),
        (json!({ "id": well, "peak_indices": [] }), "No ladder peaks"),
        (
            json!({ "id": well, "peaks": [{ "index": 100, "size": 50.0 }], "peak_indices": [100] }),
            "not both",
        ),
    ] {
        for m in ["preview_well_ladder_peaks", "set_well_ladder_peaks"] {
            let e = h.fail(m, params.clone());
            assert_eq!(e.code, ErrorCode::Invalid, "{m}");
            assert!(e.message.contains(msg), "{m}: {}", e.message);
        }
    }
}

/// Review follow-ups: dropped review marks, the most alleles per sample in
/// the sample list, the stored MOI offset, and empty artifact models.
#[test]
fn dropped_reviews_max_alleles_moi_offset_and_empty_artifact_models() {
    let s = setup();
    let h = &s.h;
    let l1 = s.loci["PfB1"];

    // ---- A review mark that no longer matches the call is reported.
    assert!(rows(h, s.gt, l1)
        .iter()
        .all(|r| r.get("review_dropped").is_none()));
    h.call(
        "set_calls_reviewed",
        json!({ "project_id": s.gt, "locus_id": l1, "reviewed": true }),
    );
    h.call(
        "update_project_locus_params",
        json!({ "project_id": s.gt, "locus_ids": [l1], "params": { "genotyping": { "absolute_peak_height_limit": 1500.0 } } }),
    );
    analyze(h, s.gt, Some(&[l1]));
    let after = rows(h, s.gt, l1);
    let dropped: Vec<i64> = after
        .iter()
        .filter(|r| r["review_dropped"] == true)
        .map(|r| r["sample_id"].as_i64().unwrap())
        .collect();
    assert!(!dropped.is_empty() && dropped.len() < after.len());
    for r in &after {
        assert_eq!(r["reviewed"] == true, r["review_dropped"] != true, "{r}");
    }
    // Clearing the mark clears the report; confirming the new call too.
    let r = h.call(
        "set_call_reviewed",
        json!({ "project_id": s.gt, "sample_id": dropped[0], "locus_id": l1, "reviewed": false }),
    );
    assert!(r.get("review_dropped").is_none() && r["reviewed"] == false);
    if let Some(&other) = dropped.get(1) {
        let r = h.call(
            "set_call_reviewed",
            json!({ "project_id": s.gt, "sample_id": other, "locus_id": l1, "reviewed": true }),
        );
        assert!(r.get("review_dropped").is_none() && r["reviewed"] == true);
    }
    h.call(
        "reset_project_locus_params",
        json!({ "project_id": s.gt, "locus_ids": [l1] }),
    );
    analyze(h, s.gt, Some(&[l1]));

    // ---- list_project_samples: most alleles at one locus (genotyping only).
    let list = h.call("list_project_samples", json!({ "id": s.gt }));
    let mut multi = 0;
    for r in list.as_array().unwrap().iter().take(40) {
        let sid = r["sample_id"].as_i64().unwrap();
        let sc = h.call(
            "get_project_sample_calls",
            json!({ "project_id": s.gt, "sample_id": sid }),
        );
        assert_eq!(r["max_alleles"], sc["max_alleles"], "{r}");
        multi += usize::from(r["max_alleles"].as_u64().unwrap_or(0) >= 2);
    }
    assert!(multi > 0);
    let be_rows = h.call("list_project_samples", json!({ "id": s.be }));
    assert!(be_rows
        .as_array()
        .unwrap()
        .iter()
        .all(|r| r.get("max_alleles").is_none()));

    // ---- Probabilistic options: the MOI offset is stored on the project
    // and reused when omitted.
    let prob_state = |h: &Harness| {
        let p = h.call("get_project", json!({ "id": s.gt }))["project"].clone();
        assert!(p.get("probability_model").is_none());
        p["probabilities"]["state"].as_str().unwrap().to_string()
    };
    let probs = |h: &Harness| -> Vec<(i64, i64, f64)> {
        let mut v = Vec::new();
        for &l in s.loci.values() {
            for r in rows(h, s.gt, l) {
                for a in r["alleles"].as_array().unwrap() {
                    v.push((
                        r["sample_id"].as_i64().unwrap(),
                        a["bin_id"].as_i64().unwrap(),
                        a["probability"].as_f64().unwrap_or(-1.0),
                    ));
                }
            }
        }
        v.sort_by(|a, b| (a.0, a.1).cmp(&(b.0, b.1)));
        v
    };
    h.call("calculate_peak_probabilities", json!({ "id": s.gt }));
    assert_eq!(prob_state(h), "current");
    let full = probs(h);
    h.call(
        "calculate_peak_probabilities",
        json!({ "id": s.gt, "moi_offset": 0 }),
    );
    let offset0 = probs(h);
    h.call("calculate_peak_probabilities", json!({ "id": s.gt }));
    assert_eq!(probs(h), offset0, "the stored offset is reused");
    h.call(
        "calculate_peak_probabilities",
        json!({ "id": s.gt, "moi_offset": 1 }),
    );
    assert_eq!(probs(h), full);
    assert_eq!(prob_state(h), "current");

    // ---- An empty artifact model is reported by the estimator and by the
    // projects that use it.
    let be2 = id(&h.call(
        "duplicate_project",
        json!({ "id": s.be, "title": "Bins without PfB1" }),
    ));
    let bins: Vec<i64> = h.call(
        "get_locus_bins",
        json!({ "project_id": be2, "locus_id": l1 }),
    )["bins"]
        .as_array()
        .unwrap()
        .iter()
        .map(id)
        .collect();
    h.call(
        "update_locus_bins",
        json!({ "project_id": be2, "locus_id": l1, "bins": [], "delete_ids": bins }),
    );
    let ae2 = id(&h.call(
        "create_project",
        json!({ "kind": "artifact_estimator", "title": "Artifacts without PfB1", "locus_set_id": s.set_id, "bin_estimator_id": be2 }),
    ));
    let r = analyze(h, ae2, None);
    let at_l1 = r["loci"]
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["locus_id"] == l1)
        .unwrap()
        .clone();
    assert!(
        at_l1["warnings"]
            .as_array()
            .unwrap()
            .iter()
            .any(|w| w.as_str().unwrap().starts_with("No artifact model at PfB1")),
        "{at_l1}"
    );
    let loci_warnings = |h: &Harness, pid: i64| -> HashMap<i64, Vec<String>> {
        h.call("get_project", json!({ "id": pid }))["loci"]
            .as_array()
            .unwrap()
            .iter()
            .map(|l| {
                (
                    l["locus_id"].as_i64().unwrap(),
                    l["warnings"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .map(|w| w.as_str().unwrap().to_string())
                        .collect(),
                )
            })
            .collect()
    };
    let w = loci_warnings(h, ae2);
    assert_eq!(w[&l1].len(), 1);
    assert!(w[&l1][0].contains("will not account for stutter at PfB1"));
    assert!(w.iter().all(|(l, v)| *l == l1 || v.is_empty()), "{w:?}");
    assert_eq!(state(h, ae2, l1).0, "current");
    let view = h.call(
        "get_locus_artifact_estimators",
        json!({ "project_id": ae2, "locus_id": l1 }),
    );
    assert!(view["estimators"].as_array().unwrap().is_empty());
    assert_eq!(view["warnings"], json!(w[&l1]));
    let other = s.loci["PfB2"];
    assert!(h
        .call(
            "get_locus_artifact_estimators",
            json!({ "project_id": ae2, "locus_id": other }),
        )
        .get("warnings")
        .is_none());

    let gt2 = id(&h.call(
        "duplicate_project",
        json!({ "id": s.gt, "title": "Study, artifacts without PfB1" }),
    ));
    h.call(
        "update_project",
        json!({ "id": gt2, "artifact_estimator_id": ae2 }),
    );
    let up = h.call("get_project", json!({ "id": gt2 }))["upstream_warnings"].clone();
    assert!(
        up.as_array().unwrap().iter().any(|w| {
            let w = w.as_str().unwrap();
            w.starts_with("No artifact model for this locus")
                && w.contains("stutter is not being accounted for at PfB1.")
        }),
        "{up}"
    );
    let r = analyze(h, gt2, Some(&[l1]));
    assert!(r["loci"][0]["warnings"]
        .as_array()
        .unwrap()
        .iter()
        .any(|w| w
            .as_str()
            .unwrap()
            .contains("stutter is not being accounted for")));
    // The original chain has no such warning.
    let up = h.call("get_project", json!({ "id": s.gt }))["upstream_warnings"].clone();
    assert!(!up.to_string().contains("No artifact model"), "{up}");

    // Classes deleted by hand leave the estimator just as empty.
    let classes: Vec<i64> = h.call(
        "get_locus_artifact_estimators",
        json!({ "project_id": s.ae, "locus_id": other }),
    )["estimators"]
        .as_array()
        .unwrap()
        .iter()
        .map(id)
        .collect();
    assert!(!classes.is_empty());
    for c in classes {
        h.call("delete_artifact_estimator", json!({ "id": c }));
    }
    let w = loci_warnings(h, s.ae);
    assert!(
        w[&other][0].contains("every artifact class was deleted"),
        "{w:?}"
    );
    let up = h.call("get_project", json!({ "id": s.gt }))["upstream_warnings"].clone();
    assert!(up.to_string().contains("accounted for at PfB2"), "{up}");
}
