//! Plate quality reports through `Engine::dispatch`: computed at import,
//! negative controls checked once a plate map names them, filled in for
//! plates imported before reports existed, and exported.

mod common;

use common::Harness;
use microspat_core::synth::{generate_plate, SynthSpec, SynthWell, WellKind};
use microspat_engine::api::demo::write_dir;

use serde_json::{json, Value};

/// The first study plate (seed 2026 on) whose two capillaries with
/// unseparated dyes both ran a sample.
fn study_plate() -> (SynthSpec, Vec<SynthWell>) {
    (2026..)
        .map(|seed| {
            let s = SynthSpec {
                plate_name: format!("STUDY-{seed}"),
                ..SynthSpec::study(seed)
            };
            let wells = generate_plate(&s).unwrap();
            (s, wells)
        })
        .find(|(s, wells)| {
            wells
                .iter()
                .filter(|w| s.spectral_fault_wells.contains(&w.well))
                .all(|w| w.truth.kind == WellKind::Sample)
        })
        .unwrap()
}

fn hd400(h: &Harness) -> Value {
    h.call("list_ladders", Value::Null)
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["label"] == "HD ROX 400")
        .unwrap()["id"]
        .clone()
}

fn issue<'a>(report: &'a Value, kind: &str) -> Option<&'a Value> {
    report["issues"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["kind"] == kind)
}

fn sorted(v: &Value) -> Vec<String> {
    let mut s: Vec<String> = v
        .as_array()
        .unwrap()
        .iter()
        .map(|x| x.as_str().unwrap().to_string())
        .collect();
    s.sort();
    s
}

#[test]
fn quality_report_from_import_to_export() {
    let dir = tempfile::tempdir().unwrap();
    let h = Harness::new(&dir.path().join("state"));
    let ws = dir.path().join("q.microspat");
    h.call("new_workspace", json!({ "path": ws.to_str() }));
    let ladder = hd400(&h);
    let (spec, wells) = study_plate();
    for l in &spec.loci {
        h.call(
            "create_locus",
            json!({ "label": l.label, "color": l.color, "min_base_length": l.min_size,
                    "max_base_length": l.max_size, "nucleotide_repeat_length": l.repeat_length }),
        );
    }
    let folder = dir.path().join("plate");
    write_dir(&folder, &wells).unwrap();

    // Import measures the plate and says what it found.
    let res = h.call(
        "import_plates",
        json!({ "paths": [folder.to_str()], "ladder_id": ladder }),
    );
    let outcome = &res["plates"][0];
    assert_eq!(outcome["status"], "imported", "{outcome}");
    assert!(
        outcome["quality"]["problems"].as_u64().unwrap() >= 1,
        "{outcome}"
    );
    assert_eq!(outcome["quality"]["worst"], "problem");
    let id = outcome["plate_id"].clone();
    let listed = h.call("list_plates", Value::Null);
    assert_eq!(listed[0]["quality"], outcome["quality"]);

    let view = h.call("get_plate_quality", json!({ "id": id }));
    assert_eq!(view["instrument"], "SYNTH-3730xl");
    assert!(view["run_date"].is_string());
    let report = &view["report"];
    let faulty = issue(report, "unseparated_dyes").expect("unseparated dyes");
    let mut planted = spec.spectral_fault_wells.clone();
    planted.sort();
    assert_eq!(sorted(&faulty["wells"]), planted);
    let bg = report["pull_up"]
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["source"] == "blue" && l["target"] == "green")
        .unwrap();
    let f = bg["fraction"].as_f64().unwrap();
    assert!((f - 0.14).abs() < 0.01, "blue into green {f}");
    assert_eq!(issue(report, "pull_up").unwrap()["severity"], "warning");
    assert_eq!(report["controls_checked"], false);

    // A plate map: the planted no-template well is a negative control.
    let ntc = &spec.ntc_wells[0];
    let mut csv = format!(
        "Well,{}\n",
        spec.loci
            .iter()
            .map(|l| l.label.as_str())
            .collect::<Vec<_>>()
            .join(",")
    );
    for w in &wells {
        let barcode = if &w.well == ntc {
            "NTC-1".to_string()
        } else {
            format!("S-{}", w.well)
        };
        csv.push_str(&w.well);
        for _ in &spec.loci {
            csv.push(',');
            csv.push_str(&barcode);
        }
        csv.push('\n');
    }
    h.changed_plates();
    h.call(
        "apply_plate_map",
        json!({ "plate_id": id, "content": csv, "create_samples": true }),
    );
    assert!(h.changed_plates() > 0);
    let report = h.call("get_plate_quality", json!({ "id": id }))["report"].clone();
    assert_eq!(report["controls_checked"], true);
    assert!(
        issue(&report, "negative_control_signal").is_none(),
        "{report}"
    );

    // Declaring a well with alleles a negative control raises it, naming
    // the well; declaring it a sample again clears it.
    let sample_well = wells
        .iter()
        .find(|w| w.truth.kind == WellKind::Sample && !spec.spectral_fault_wells.contains(&w.well))
        .unwrap();
    let samples = h.call("list_samples", Value::Null);
    let sid = samples
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["barcode"] == format!("S-{}", sample_well.well))
        .unwrap()["id"]
        .clone();
    h.call(
        "update_sample",
        json!({ "id": sid, "designation": "negative_control" }),
    );
    let report = h.call("get_plate_quality", json!({ "id": id }))["report"].clone();
    let signal = issue(&report, "negative_control_signal")
        .unwrap_or_else(|| panic!("{} {}", report["controls"], report["issues"]));
    assert_eq!(signal["severity"], "problem");
    assert_eq!(sorted(&signal["wells"]), vec![sample_well.well.clone()]);
    assert!(report["wells"].as_array().unwrap().iter().any(|w| w["well"]
        == sample_well.well.as_str()
        && w["flags"]
            .as_array()
            .unwrap()
            .iter()
            .any(|f| f == "negative_control_signal")));
    h.call(
        "set_samples_designation",
        json!({ "sample_ids": [sid], "designation": "sample" }),
    );
    let report = h.call("get_plate_quality", json!({ "id": id }))["report"].clone();
    assert!(issue(&report, "negative_control_signal").is_none());

    // Re-sizing measures it again.
    h.call("size_plate", json!({ "id": id }));
    let report = h.call("get_plate_quality", json!({ "id": id }))["report"].clone();
    assert_eq!(
        sorted(&issue(&report, "unseparated_dyes").unwrap()["wells"]),
        planted
    );

    // Export: one row per well, plate values on every row.
    let file = h.call("export_plate_quality", json!({ "id": id }));
    assert!(file["filename"].as_str().unwrap().ends_with("_quality.csv"));
    let text = file["content"].as_str().unwrap();
    let mut lines = text.lines();
    let header = lines.next().unwrap();
    assert!(header.contains("Pull-up Blue Into Green"), "{header}");
    assert!(header.contains("Crosstalk 1 Away"), "{header}");
    assert_eq!(lines.count(), 96);

    // A workspace from before quality checks: no report until computed.
    h.engine.close_workspace();
    {
        let c = rusqlite::Connection::open(&ws).unwrap();
        c.execute("DELETE FROM plate_quality", []).unwrap();
    }
    h.call("open_workspace", json!({ "path": ws.to_str() }));
    assert!(h.call("list_plates", Value::Null)[0]["quality"].is_null());
    let view = h.call("get_plate_quality", json!({ "id": id }));
    assert!(view["report"].is_null());
    h.changed_plates();
    let done = h.call("compute_plate_quality", json!({}));
    assert_eq!(done["plate_ids"], json!([id]));
    assert!(h.changed_plates() > 0);
    let report = h.call("get_plate_quality", json!({ "id": id }))["report"].clone();
    assert_eq!(report["controls_checked"], true);
    assert_eq!(
        sorted(&issue(&report, "unseparated_dyes").unwrap()["wells"]),
        planted
    );
    // Nothing left to compute.
    assert_eq!(
        h.call("compute_plate_quality", json!({}))["plate_ids"],
        json!([])
    );
}

#[test]
fn clean_plate_reports_no_issue() {
    let dir = tempfile::tempdir().unwrap();
    let h = Harness::new(&dir.path().join("state"));
    h.new_scratch_workspace(dir.path());
    let ladder = hd400(&h);
    let spec = SynthSpec {
        plate_name: "CLEAN".into(),
        failed_fraction: 0.0,
        ..SynthSpec::demo(31)
    };
    let folder = dir.path().join("clean");
    write_dir(&folder, &generate_plate(&spec).unwrap()).unwrap();
    let res = h.call(
        "import_plates",
        json!({ "paths": [folder.to_str()], "ladder_id": ladder }),
    );
    let q = &res["plates"][0]["quality"];
    assert_eq!(q["problems"], 0, "{q}");
    assert_eq!(q["warnings"], 0, "{q}");
    assert_eq!(q["infos"], 0, "{q}");
    assert!(q["worst"].is_null());
    assert_eq!(res["plates"][0]["sizing"]["good"], 96);
    let view = h.call(
        "get_plate_quality",
        json!({ "id": res["plates"][0]["plate_id"] }),
    );
    assert_eq!(view["report"]["issues"], json!([]));
    assert_eq!(view["report"]["wells"].as_array().unwrap().len(), 96);
}

#[test]
fn settings_persist_refresh_plate_quality_and_reset() {
    use microspat_core::quality::QualityLimits;
    use microspat_engine::ErrorCode;

    let dir = tempfile::tempdir().unwrap();
    let h = Harness::new(&dir.path().join("state"));
    let ws = dir.path().join("settings.microspat");
    h.call("new_workspace", json!({ "path": ws.to_str() }));

    let defaults = h.call("get_settings", Value::Null);
    assert_eq!(defaults["contamination_limit"], 500);
    assert_eq!(
        defaults["quality_limits"],
        serde_json::to_value(QualityLimits::default()).unwrap()
    );

    let ladder = hd400(&h);
    let (spec, wells) = study_plate();
    for l in &spec.loci {
        h.call(
            "create_locus",
            json!({ "label": l.label, "color": l.color, "min_base_length": l.min_size,
                    "max_base_length": l.max_size, "nucleotide_repeat_length": l.repeat_length }),
        );
    }
    let folder = dir.path().join("study");
    write_dir(&folder, &wells).unwrap();
    let res = h.call(
        "import_plates",
        json!({ "paths": [folder.to_str()], "ladder_id": ladder }),
    );
    let id = res["plates"][0]["plate_id"].clone();

    // Map wells and make one sample well a negative control so control rescanning is tested.
    let mut csv = format!(
        "Well,{}\n",
        spec.loci
            .iter()
            .map(|l| l.label.as_str())
            .collect::<Vec<_>>()
            .join(",")
    );
    for w in &wells {
        let barcode = if spec.ntc_wells.contains(&w.well) {
            "NTC-1".to_string()
        } else {
            format!("S-{}", w.well)
        };
        csv.push_str(&w.well);
        for _ in &spec.loci {
            csv.push(',');
            csv.push_str(&barcode);
        }
        csv.push('\n');
    }
    h.call(
        "apply_plate_map",
        json!({ "plate_id": id, "content": csv, "create_samples": true }),
    );
    let sample_well = wells
        .iter()
        .find(|w| w.truth.kind == WellKind::Sample && !spec.spectral_fault_wells.contains(&w.well))
        .unwrap();
    let samples = h.call("list_samples", Value::Null);
    let sid = samples
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["barcode"] == format!("S-{}", sample_well.well))
        .unwrap()["id"]
        .clone();
    h.call(
        "update_sample",
        json!({ "id": sid, "designation": "negative_control" }),
    );
    let report = h.call("get_plate_quality", json!({ "id": id }))["report"].clone();
    assert!(issue(&report, "unseparated_dyes").is_some());
    assert!(issue(&report, "pull_up").is_some());
    assert!(issue(&report, "negative_control_signal").is_some());

    // Updating plate-quality limits refreshes stored reports immediately without compute_plate_quality.
    h.changed_plates();
    let updated = h.call(
        "update_settings",
        json!({
            "quality_limits": {
                "unseparated_min_peaks": 50,
                "spectral_deviation_limit": 0.90,
                "pull_up_warning": 0.25,
                "pull_up_problem": 0.35
            }
        }),
    );
    assert_eq!(updated["quality_limits"]["unseparated_min_peaks"], 50);
    assert!(h.changed_plates() > 0);
    let report = h.call("get_plate_quality", json!({ "id": id }))["report"].clone();
    assert_eq!(report["limits"]["unseparated_min_peaks"], 50);
    assert!(issue(&report, "unseparated_dyes").is_none(), "{report}");
    assert!(issue(&report, "pull_up").is_none(), "{report}");
    let listed = h.call("list_plates", Value::Null);
    assert_eq!(
        listed[0]["quality"]["problems"],
        report["issues"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|i| i["severity"] == "problem")
            .count() as u64
    );

    // Raising control_height_limit above the negative control clears it; lowering catches it again.
    h.call(
        "update_settings",
        json!({ "quality_limits": { "control_height_limit": 100_000.0 } }),
    );
    let report = h.call("get_plate_quality", json!({ "id": id }))["report"].clone();
    assert!(issue(&report, "negative_control_signal").is_none());

    h.call(
        "update_settings",
        json!({ "quality_limits": { "control_height_limit": 100.0 } }),
    );
    let report = h.call("get_plate_quality", json!({ "id": id }))["report"].clone();
    let ctrl = issue(&report, "negative_control_signal").unwrap();
    assert!(
        ctrl["message"]
            .as_str()
            .unwrap()
            .contains("100 RFU calling limit"),
        "{ctrl}"
    );

    // Settings survive save_workspace_as and open_workspace.
    let copy = dir.path().join("copy.microspat");
    h.call("save_workspace_as", json!({ "path": copy.to_str() }));
    h.new_scratch_workspace(dir.path());
    h.call("open_workspace", json!({ "path": copy.to_str() }));
    let reopened = h.call("get_settings", Value::Null);
    assert_eq!(reopened["quality_limits"]["control_height_limit"], 100.0);
    assert_eq!(reopened["quality_limits"]["unseparated_min_peaks"], 50);

    // Newly imported plates inherit the workspace's quality_limits.
    let clean_spec = SynthSpec {
        plate_name: "CLEAN-INHERIT".into(),
        failed_fraction: 0.0,
        ..SynthSpec::demo(44)
    };
    let clean_dir = dir.path().join("clean2");
    write_dir(&clean_dir, &generate_plate(&clean_spec).unwrap()).unwrap();
    let res2 = h.call(
        "import_plates",
        json!({ "paths": [clean_dir.to_str()], "ladder_id": ladder }),
    );
    let id2 = res2["plates"][0]["plate_id"].clone();
    let report2 = h.call("get_plate_quality", json!({ "id": id2 }))["report"].clone();
    assert_eq!(report2["limits"]["control_height_limit"], 100.0);
    assert_eq!(report2["limits"]["unseparated_min_peaks"], 50);

    // Invalid limits are rejected without mutating saved settings.
    for bad in [
        json!({ "quality_limits": { "pull_up_warning": 0.25, "pull_up_problem": 0.15 } }),
        json!({ "quality_limits": { "noisy_factor": 1.0 } }),
        json!({ "quality_limits": { "unseparated_min_peaks": 0 } }),
        json!({ "quality_limits": { "control_height_limit": 5.0 } }),
    ] {
        let err = h.engine.dispatch("update_settings", bad).unwrap_err();
        assert_eq!(err.code, ErrorCode::Invalid);
    }
    assert_eq!(
        h.call("get_settings", Value::Null)["quality_limits"]["unseparated_min_peaks"],
        50
    );

    // reset_defaults restores exact defaults (including 1/30 crosstalk) and derived issues.
    let reset = h.call("update_settings", json!({ "reset_defaults": true }));
    assert_eq!(reset, defaults);
    let restored_report = h.call("get_plate_quality", json!({ "id": id }))["report"].clone();
    assert!(issue(&restored_report, "unseparated_dyes").is_some());
    assert!(issue(&restored_report, "pull_up").is_some());
}
