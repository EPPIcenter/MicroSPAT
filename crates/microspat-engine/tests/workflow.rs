//! The whole stage-one workflow, driven through `Engine::dispatch` exactly as
//! an adapter does, asserting results and the events emitted.

use microspat_core::ladder::{fit_ladder, LadderSpec, HD400_SIZES};
use microspat_core::synth::{generate_plate, SynthSpec, SynthWell, WellKind};
use microspat_engine::api::demo::{write_dir, write_zip};
use microspat_engine::{AppEvent, Engine, EngineConfig, ErrorCode, TaskStatus};
use serde_json::{json, Value};
use std::collections::{BTreeSet, HashMap};
use std::path::Path;
use std::sync::mpsc::Receiver;

struct Harness {
    engine: Engine,
    events: Receiver<AppEvent>,
}

impl Harness {
    fn new(state: &Path) -> Harness {
        let engine = Engine::new(EngineConfig {
            state_dir: Some(state.to_path_buf()),
        });
        let events = engine.subscribe();
        Harness { engine, events }
    }

    fn call(&self, method: &str, params: Value) -> Value {
        self.engine
            .dispatch(method, params)
            .unwrap_or_else(|e| panic!("{method} failed: {:?} {}", e.code, e.message))
    }

    fn fail(&self, method: &str, params: Value) -> microspat_engine::RpcError {
        match self.engine.dispatch(method, params) {
            Ok(v) => panic!("{method} should have failed, returned {v}"),
            Err(e) => e,
        }
    }

    fn drain(&self) -> Vec<AppEvent> {
        self.events.try_iter().collect()
    }

    /// Entities of `changed` events since the last drain.
    fn changed(&self) -> BTreeSet<String> {
        self.drain()
            .into_iter()
            .filter_map(|e| match e {
                AppEvent::Changed { entity, .. } => Some(entity),
                _ => None,
            })
            .collect()
    }
}

fn set(items: &[&str]) -> BTreeSet<String> {
    items.iter().map(|s| s.to_string()).collect()
}

fn ids(v: &Value) -> Vec<i64> {
    v.as_array()
        .unwrap()
        .iter()
        .map(|x| x["id"].as_i64().unwrap())
        .collect()
}

fn plate_map_csv(
    wells: &[SynthWell],
    loci: &[&str],
    barcode: impl Fn(&SynthWell) -> String,
) -> String {
    let mut s = format!("Well,{}\n", loci.join(","));
    for w in wells {
        s.push_str(&w.well);
        for _ in loci {
            s.push(',');
            s.push_str(&barcode(w));
        }
        s.push('\n');
    }
    s
}

#[test]
fn full_workflow_through_dispatch() {
    let dir = tempfile::tempdir().unwrap();
    let h = Harness::new(&dir.path().join("state"));

    // No workspace yet.
    assert_eq!(
        h.fail("list_plates", Value::Null).code,
        ErrorCode::NoWorkspace
    );
    assert_eq!(
        h.fail("no_such_method", Value::Null).code,
        ErrorCode::UnknownMethod
    );

    // New workspace, seeded ladders.
    let ws_path = dir.path().join("study");
    let info = h.call("new_workspace", json!({ "path": ws_path.to_str() }));
    assert_eq!(info["name"], "study");
    assert!(info["path"].as_str().unwrap().ends_with("study.microspat"));
    assert_eq!(info["schema_version"], 5);
    assert_eq!(
        h.changed(),
        set(&[
            "workspace",
            "ladders",
            "loci",
            "locus_sets",
            "samples",
            "plates",
            "projects",
            "controls",
            "settings"
        ])
    );
    let ladders = h.call("list_ladders", Value::Null);
    let labels: Vec<&str> = ladders
        .as_array()
        .unwrap()
        .iter()
        .map(|l| l["label"].as_str().unwrap())
        .collect();
    assert_eq!(
        labels,
        [
            "GeneScan 500 LIZ",
            "GeneScan 500 ROX",
            "GeneScan 600 LIZ",
            "HD ROX 400"
        ]
    );
    let hd400 = ladders
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["label"] == "HD ROX 400")
        .unwrap()
        .clone();
    let ladder_id = hd400["id"].as_i64().unwrap();
    assert_eq!(hd400["spec"]["base_sizes"].as_array().unwrap().len(), 21);
    assert_eq!(hd400["spec"]["color"], "red");
    assert_eq!(
        h.fail("get_ladder", json!({ "id": 999 })).code,
        ErrorCode::NotFound
    );
    let e = h.fail(
        "create_ladder",
        json!({ "label": "hd rox 400", "spec": hd400["spec"] }),
    );
    assert_eq!(e.code, ErrorCode::Conflict, "{}", e.message);
    let e = h.fail(
        "create_ladder",
        json!({ "label": "Bad", "spec": { "base_sizes": [100, 50, 200, 300] } }),
    );
    assert_eq!(e.code, ErrorCode::Invalid);
    assert_eq!(
        h.fail("get_plate", json!({ "nope": 1 })).code,
        ErrorCode::Invalid
    );

    // Loci: three by hand, three from CSV.
    let spec = SynthSpec::demo(7);
    for l in &spec.loci[..3] {
        h.call(
            "create_locus",
            json!({ "label": l.label, "color": l.color, "min_base_length": l.min_size,
                    "max_base_length": l.max_size, "nucleotide_repeat_length": l.repeat_length }),
        );
    }
    assert_eq!(h.changed(), set(&["loci", "workspace", "projects"]));
    let mut csv =
        String::from("Label,Min. Base Length,Max. Base Length,Nucleotide Repeat Length,Color\n");
    for l in &spec.loci[3..] {
        csv.push_str(&format!(
            "{},{},{},{},{:?}\n",
            l.label, l.min_size, l.max_size, l.repeat_length, l.color
        ));
    }
    let bad = h.fail(
        "import_loci_csv",
        json!({ "content": "Label,Color\nX,blue\n" }),
    );
    assert_eq!(bad.code, ErrorCode::Invalid);
    let bad = h.fail(
        "import_loci_csv",
        json!({ "content": "Label,Min. Base Length,Max. Base Length,Nucleotide Repeat Length,Color\nQ,10,5,3,purple\n" }),
    );
    assert!(
        bad.message.contains("purple") && bad.message.contains("Nothing was imported"),
        "{}",
        bad.message
    );
    let csv_path = dir.path().join("loci.csv");
    std::fs::write(&csv_path, &csv).unwrap();
    let imported = h.call("import_loci_csv", json!({ "path": csv_path.to_str() }));
    assert_eq!(imported["created"].as_array().unwrap().len(), 3);
    assert_eq!(
        h.fail("import_loci_csv", json!({ "content": csv })).code,
        ErrorCode::Conflict
    );
    let loci = h.call("list_loci", Value::Null);
    assert_eq!(loci.as_array().unwrap().len(), 6);
    let locus_ids: HashMap<String, i64> = loci
        .as_array()
        .unwrap()
        .iter()
        .map(|l| {
            (
                l["label"].as_str().unwrap().to_string(),
                l["id"].as_i64().unwrap(),
            )
        })
        .collect();
    let e = h.fail("create_locus", json!({ "label": "pfb1", "color": "blue", "min_base_length": 1, "max_base_length": 2, "nucleotide_repeat_length": 3 }));
    assert_eq!(e.code, ErrorCode::Conflict);
    let e = h.fail("create_locus", json!({ "label": "Z", "color": "blue", "min_base_length": 200, "max_base_length": 100, "nucleotide_repeat_length": 3 }));
    assert_eq!(e.code, ErrorCode::Invalid);
    h.drain();
    let set_detail = h.call(
        "create_locus_set",
        json!({ "label": "Panel", "locus_ids": ids(&loci) }),
    );
    assert_eq!(set_detail["loci"].as_array().unwrap().len(), 6);
    assert_eq!(
        h.changed(),
        set(&["locus_sets", "loci", "workspace", "projects"])
    );

    // Two synthetic plates: one zip, one directory.
    let mk = |seed, name: &str| {
        let s = SynthSpec {
            plate_name: name.into(),
            ..SynthSpec::demo(seed)
        };
        generate_plate(&s).unwrap()
    };
    let plate_a = mk(7, "PLATE-A");
    let plate_b = mk(8, "PLATE-B");
    let zip = dir.path().join("plate_a.zip");
    write_zip(&zip, &plate_a).unwrap();
    let plate_b_dir = dir.path().join("plate_b");
    write_dir(&plate_b_dir, &plate_b).unwrap();
    h.drain();
    let res = h.call(
        "import_plates",
        json!({ "paths": [zip.to_str(), plate_b_dir.to_str()], "ladder_id": ladder_id }),
    );
    let outcomes = res["plates"].as_array().unwrap();
    assert_eq!(outcomes.len(), 2, "{res}");
    for o in outcomes {
        assert_eq!(o["status"], "imported", "{o}");
        assert_eq!(o["well_count"], 96);
    }
    let events = h.drain();
    let tasks: Vec<_> = events
        .iter()
        .filter_map(|e| match e {
            AppEvent::Task { task } => Some(task.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(tasks.first().unwrap().status, TaskStatus::Running);
    assert_eq!(tasks.first().unwrap().kind, "import_plates");
    assert_eq!(tasks.last().unwrap().status, TaskStatus::Done);
    assert!(tasks.iter().all(|t| t.id == tasks[0].id));
    let plate_changes = events
        .iter()
        .filter(|e| matches!(e, AppEvent::Changed { entity, ids: Some(_) } if entity == "plates"))
        .count();
    assert_eq!(plate_changes, 2, "one changed event per imported plate");

    // Importing the same plate again is refused, from the zip or as loose files.
    let again = h.call(
        "import_plates",
        json!({ "paths": [zip.to_str()], "ladder_id": ladder_id }),
    );
    let o = &again["plates"][0];
    assert_eq!(o["status"], "duplicate");
    assert!(
        o["message"]
            .as_str()
            .unwrap()
            .contains("already imported as \"PLATE-A\""),
        "{o}"
    );
    let loose: Vec<String> = std::fs::read_dir(&plate_b_dir)
        .unwrap()
        .map(|e| e.unwrap().path().to_str().unwrap().to_string())
        .collect();
    let again = h.call(
        "import_plates",
        json!({ "paths": loose, "ladder_id": ladder_id }),
    );
    assert_eq!(again["plates"][0]["status"], "duplicate");
    assert_eq!(again["plates"][0]["label"], "PLATE-B");
    let junk = dir.path().join("junk.fsa");
    std::fs::write(&junk, b"not an fsa").unwrap();
    let r = h.call(
        "import_plates",
        json!({ "paths": [junk.to_str()], "ladder_id": ladder_id }),
    );
    assert_eq!(r["plates"][0]["status"], "failed");

    // Plate list and detail.
    let plates = h.call("list_plates", Value::Null);
    assert_eq!(plates.as_array().unwrap().len(), 2);
    let pa = plates
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["label"] == "PLATE-A")
        .unwrap()
        .clone();
    let pb = plates
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["label"] == "PLATE-B")
        .unwrap()
        .clone();
    let (pa_id, pb_id) = (pa["id"].as_i64().unwrap(), pb["id"].as_i64().unwrap());
    let failed_a = plate_a
        .iter()
        .filter(|w| w.truth.kind == WellKind::Failed)
        .count() as u64;
    assert_eq!(pa["well_count"], 96);
    assert_eq!(pa["plate_size"], 96);
    assert_eq!(pa["ladder_label"], "HD ROX 400");
    assert_eq!(pa["instrument"], "SYNTH-3730xl");
    assert_eq!(pa["has_plate_map"], false);
    let s = &pa["sizing"];
    assert_eq!(
        s["unusable"].as_u64().unwrap() + s["failed"].as_u64().unwrap(),
        failed_a,
        "failed synthetic wells are exactly the unsized ones: {s}"
    );
    assert_eq!(
        s["good"].as_u64().unwrap() + s["flagged"].as_u64().unwrap(),
        96 - failed_a
    );

    let detail = h.call("get_plate", json!({ "id": pa_id }));
    let wells = detail["wells"].as_array().unwrap();
    assert_eq!(wells.len(), 96);
    assert_eq!(wells[0]["label"], "A01");
    assert_eq!(wells[1]["label"], "A02");
    assert_eq!(wells[95]["label"], "H12");
    let truth: HashMap<&str, &SynthWell> = plate_a.iter().map(|w| (w.well.as_str(), w)).collect();
    for w in wells {
        let t = truth[w["label"].as_str().unwrap()];
        let state = w["sizing"].as_str().unwrap();
        if t.truth.kind == WellKind::Failed {
            assert!(state == "failed" || state == "unusable");
        } else {
            assert_eq!(state, "good", "{}", w["label"]);
            assert!(w["sizing_quality"].as_f64().unwrap() < 1.0);
        }
        let ch = w["channels"].as_array().unwrap();
        assert_eq!(ch.len(), 4);
        assert_eq!(ch[0]["color"], "blue");
        assert!(
            w.get("trace").is_none() && ch[0].get("trace").is_none(),
            "plate view carries no traces"
        );
    }

    // Well detail: traces, base sizes, ladder peaks with sizes.
    let good = wells.iter().find(|w| w["sizing"] == "good").unwrap();
    let good_id = good["id"].as_i64().unwrap();
    let wd = h.call("get_well", json!({ "id": good_id }));
    let t = truth[wd["label"].as_str().unwrap()];
    assert_eq!(wd["channels"].as_array().unwrap().len(), 4);
    let red = wd["channels"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["color"] == "red")
        .unwrap();
    let red_trace: Vec<i16> = serde_json::from_value(red["trace"].clone()).unwrap();
    assert_eq!(red_trace.len(), 9000);
    let peaks = wd["ladder_peaks"].as_array().unwrap();
    assert_eq!(peaks.len(), 21);
    let sizes: Vec<f64> = peaks.iter().map(|p| p["size"].as_f64().unwrap()).collect();
    assert_eq!(sizes, HD400_SIZES.to_vec());
    let bs: Vec<f64> = serde_json::from_value(wd["base_sizes"].clone()).unwrap();
    assert_eq!(bs.len(), 9000);
    // Recomputed base sizes equal a direct fit from the original file, and the truth.
    let fsa = microspat_core::abif::parse_fsa(&t.fsa).unwrap();
    let others: Vec<&[i16]> = fsa
        .channels
        .iter()
        .filter(|c| c.color != microspat_core::Color::Red)
        .map(|c| c.data.as_slice())
        .collect();
    let direct = fit_ladder(
        &fsa.channel(microspat_core::Color::Red).unwrap().data,
        &others,
        &LadderSpec::default(),
    )
    .unwrap();
    assert_eq!(bs, direct.base_sizes);
    assert_eq!(
        red_trace,
        fsa.channel(microspat_core::Color::Red).unwrap().data
    );
    let m = t.truth.mobility;
    let i = m.index_of(250.0).round() as usize;
    assert!((bs[i] - m.size_at(i as f64)).abs() < 0.5);
    let light = h.call("get_well", json!({ "id": good_id, "traces": false }));
    assert!(light["base_sizes"].is_null() && light["channels"][0]["trace"].is_null());
    let ct = h.call("get_channel_trace", json!({ "id": red["id"] }));
    assert_eq!(ct["trace"].as_array().unwrap().len(), 9000);
    assert_eq!(ct["base_sizes"].as_array().unwrap().len(), 9000);
    let rt = h.call("get_plate_run_traces", json!({ "id": pa_id }));
    assert!(rt["voltage"].is_array());

    // Manual ladder edit: drop one interior peak, refit; sizing changes. The
    // 60 bp peak, because the quality includes the end peaks' extrapolation
    // error, which on a clean well can outweigh every interior peak's.
    let idx: Vec<u64> = peaks.iter().map(|p| p["index"].as_u64().unwrap()).collect();
    let mut fewer = idx.clone();
    fewer.remove(1);
    h.drain();
    let edited = h.call(
        "set_well_ladder_peaks",
        json!({ "id": good_id, "peak_indices": fewer }),
    );
    assert_eq!(edited["manual_ladder"], true);
    assert_eq!(edited["ladder_peaks"].as_array().unwrap().len(), 20);
    assert_ne!(edited["sizing_quality"], wd["sizing_quality"]);
    assert!(h.changed().contains("plates"));
    let bs2: Vec<f64> =
        serde_json::from_value(h.call("get_well", json!({ "id": good_id }))["base_sizes"].clone())
            .unwrap();
    assert_ne!(bs, bs2, "manual ladder changes the sizing");
    let e = h.fail(
        "set_well_ladder_peaks",
        json!({ "id": good_id, "peak_indices": [100, 200, 300] }),
    );
    assert_eq!(e.code, ErrorCode::Invalid);
    let auto = h.call(
        "set_well_ladder_peaks",
        json!({ "id": good_id, "peak_indices": null }),
    );
    assert_eq!(auto["manual_ladder"], false);
    assert_eq!(auto["ladder_peaks"].as_array().unwrap().len(), 21);

    // Plate map A: unknown samples are reported and nothing changes...
    let loci_labels: Vec<&str> = spec.loci.iter().map(|l| l.label.as_str()).collect();
    let map_a = plate_map_csv(&plate_a, &loci_labels, |w| {
        format!("A-{}", w.truth.sample_name)
    });
    let e = h.fail(
        "apply_plate_map",
        json!({ "plate_id": pa_id, "content": map_a }),
    );
    assert_eq!(e.code, ErrorCode::Invalid);
    assert!(e.message.contains("Unknown samples (96)"), "{}", e.message);
    let dry = h.call(
        "apply_plate_map",
        json!({ "plate_id": pa_id, "content": map_a, "create_samples": true, "dry_run": true }),
    );
    assert_eq!(dry["applied"], false);
    assert_eq!(dry["created_samples"].as_array().unwrap().len(), 96);
    let rows = dry["assignments"].as_array().unwrap();
    assert_eq!(rows.len(), 576);
    assert!(rows
        .iter()
        .all(|r| r["change"] == "new" && r["creates_sample"] == true && r["sample_id"].is_null()));
    assert_eq!(
        (
            &rows[0]["well"],
            &rows[0]["locus_label"],
            &rows[0]["barcode"]
        ),
        (
            &json!("A01"),
            &json!("PfB1"),
            &json!(format!("A-{}", plate_a[0].truth.sample_name))
        )
    );
    assert!(dry["problems"].as_array().unwrap().is_empty());
    assert_eq!(
        h.call("list_samples", Value::Null)
            .as_array()
            .unwrap()
            .len(),
        0
    );
    let bad_map = "Well,PfB1,Nope\nA01,x,y\nZ99,x,y\n";
    let e = h.fail(
        "apply_plate_map",
        json!({ "plate_id": pa_id, "content": bad_map, "create_samples": true }),
    );
    assert!(
        e.message.contains("Unknown loci") && e.message.contains("Z99"),
        "{}",
        e.message
    );
    let clash = "Well,PfB1,PfB1\nA01,x,y\n";
    assert_eq!(
        h.fail(
            "apply_plate_map",
            json!({ "plate_id": pa_id, "content": clash, "create_samples": true })
        )
        .code,
        ErrorCode::Invalid
    );
    h.drain();

    // ...then applied with sample creation; the NTC becomes a negative control.
    let map_path = dir.path().join("map_a.csv");
    std::fs::write(&map_path, &map_a).unwrap();
    let rep = h.call(
        "apply_plate_map",
        json!({ "plate_id": pa_id, "path": map_path.to_str(), "create_samples": true }),
    );
    assert_eq!(rep["applied"], true);
    assert_eq!(rep["run_count"], 96 * 6);
    let created = rep["created_samples"].as_array().unwrap();
    assert_eq!(created.len(), 96);
    let ntc = created
        .iter()
        .find(|c| c["barcode"] == "A-NTC-H12")
        .unwrap();
    assert_eq!(ntc["designation"], "negative_control");
    assert_eq!(
        h.changed(),
        set(&["plates", "samples", "loci", "workspace", "projects"])
    );
    let samples = h.call("list_samples", Value::Null);
    let s001 = samples
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["barcode"] == "A-S001")
        .unwrap()
        .clone();
    assert_eq!(s001["run_count"], 6);
    assert_eq!(s001["plate_count"], 1);
    let sd = h.call("get_sample", json!({ "id": s001["id"] }));
    let runs = sd["runs"].as_array().unwrap();
    assert_eq!(runs.len(), 6);
    assert_eq!(runs[0]["plate_label"], "PLATE-A");
    assert!(runs
        .iter()
        .all(|r| r["max_signal"].as_i64().unwrap_or(0) > 0 || r["sizing"] != "good"));
    let pa = h.call("get_plate", json!({ "id": pa_id }));
    assert_eq!(pa["plate"]["has_plate_map"], true);
    assert_eq!(pa["loci"].as_array().unwrap().len(), 6);
    assert!(
        pa["plate"]["contaminated_loci"]
            .as_array()
            .unwrap()
            .is_empty(),
        "clean NTC: {}",
        pa["plate"]
    );
    let blue = &pa["wells"][0]["channels"][0];
    assert_eq!(
        blue["runs"].as_array().unwrap().len(),
        2,
        "two blue loci multiplexed in one channel"
    );

    // Re-applying the same map keeps every run (ids survive).
    let rep = h.call(
        "apply_plate_map",
        json!({ "plate_id": pa_id, "content": map_a }),
    );
    assert_eq!(
        (rep["runs_kept"].as_u64(), rep["runs_removed"].as_u64()),
        (Some(576), Some(0))
    );

    // A dry run of an edited map lists every run: A01 PfB1 changes sample
    // (old removed, new created), A02 is dropped, the rest is unchanged.
    let mut lines: Vec<String> = map_a.lines().map(String::from).collect();
    let a01: Vec<String> = lines[1].split(',').map(String::from).collect();
    lines[1] = format!("A01,a-new,{}", a01[2..].join(","));
    lines.remove(2);
    let edited = lines.join("\n");
    let dry = h.call(
        "apply_plate_map",
        json!({ "plate_id": pa_id, "content": edited, "create_samples": true, "dry_run": true }),
    );
    let rows = dry["assignments"].as_array().unwrap();
    let count = |c: &str| rows.iter().filter(|r| r["change"] == c).count();
    assert_eq!(
        (count("new"), count("unchanged"), count("removed")),
        (1, 569, 7)
    );
    let a01_rows: Vec<&Value> = rows
        .iter()
        .filter(|r| r["well"] == "A01" && r["locus_label"] == "PfB1")
        .collect();
    assert_eq!(a01_rows.len(), 2);
    assert_eq!(a01_rows[0]["change"], "removed");
    assert!(a01_rows[0]["sample_id"].is_i64());
    assert_eq!(a01_rows[1]["change"], "new");
    assert_eq!(a01_rows[1]["barcode"], "a-new");
    assert_eq!(a01_rows[1]["creates_sample"], true);
    assert!(rows
        .iter()
        .filter(|r| r["well"] == "A02")
        .all(|r| r["change"] == "removed"));
    assert_eq!(
        (dry["runs_kept"].as_u64(), dry["runs_removed"].as_u64()),
        (Some(569), Some(7))
    );

    // Export gives back the same assignments.
    let exported = h.call("export_plate_map", json!({ "id": pa_id }));
    assert_eq!(exported["filename"], "PLATE-A_plate_map.csv");
    let norm = |s: &str| -> BTreeSet<String> {
        s.lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect()
    };
    let mut sorted_labels = loci_labels.clone();
    sorted_labels.sort();
    assert_eq!(
        norm(exported["content"].as_str().unwrap()),
        norm(&plate_map_csv(&plate_a, &sorted_labels, |w| format!(
            "A-{}",
            w.truth.sample_name
        )))
    );

    // Plate B: a sample well relabelled as an NTC is a hot negative control.
    let hot_well = plate_b
        .iter()
        .find(|w| {
            w.truth.kind == WellKind::Sample
                && w.truth
                    .loci
                    .iter()
                    .all(|l| l.alleles.iter().any(|a| a.height > 2000.0))
        })
        .expect("a strong sample well");
    let map_b = plate_map_csv(&plate_b, &loci_labels, |w| {
        if w.well == hot_well.well {
            "B-NTC-hot".into()
        } else {
            format!("B-{}", w.truth.sample_name)
        }
    });
    h.call(
        "apply_plate_map",
        json!({ "plate_id": pb_id, "content": map_b, "create_samples": true }),
    );
    let pbd = h.call("get_plate", json!({ "id": pb_id }));
    let hot: Vec<&str> = pbd["plate"]["contaminated_loci"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    assert_eq!(hot.len(), 6, "{hot:?}");
    let hw = pbd["wells"]
        .as_array()
        .unwrap()
        .iter()
        .find(|w| w["label"] == hot_well.well.as_str())
        .unwrap();
    let hot_run = &hw["channels"][0]["runs"][0];
    assert_eq!(hot_run["designation"], "negative_control");
    assert_eq!(hot_run["contaminated"], true);
    let other = &pbd["wells"][0]["channels"][0]["runs"][0];
    assert_eq!(
        (
            other["contaminated"].as_bool(),
            other["locus_contaminated"].as_bool()
        ),
        (Some(false), Some(true))
    );
    let listed = h.call("list_plates", Value::Null);
    let lb = listed
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == pb_id)
        .unwrap();
    assert_eq!(lb["contaminated_loci"].as_array().unwrap().len(), 6);
    // Turning the sample back into a sample clears the flag.
    let hot_sample = h
        .call("list_samples", Value::Null)
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["barcode"] == "B-NTC-hot")
        .unwrap()
        .clone();
    h.drain();
    h.call(
        "update_sample",
        json!({ "id": hot_sample["id"], "designation": "sample" }),
    );
    assert_eq!(
        h.changed(),
        set(&["samples", "plates", "workspace", "projects"])
    );
    assert!(
        h.call("get_plate", json!({ "id": pb_id }))["plate"]["contaminated_loci"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    h.call(
        "update_sample",
        json!({ "id": hot_sample["id"], "designation": "negative_control" }),
    );

    // Locus range change recomputes run signals.
    let pfb1 = locus_ids["PfB1"];
    let before = h.call("get_sample", json!({ "id": s001["id"] }))["runs"][0]["max_signal"].clone();
    h.drain();
    h.call(
        "update_locus",
        json!({ "id": pfb1, "min_base_length": 70.0, "max_base_length": 72.0 }),
    );
    assert_eq!(
        h.changed(),
        set(&["loci", "plates", "workspace", "projects"])
    );
    let after = h.call("get_sample", json!({ "id": s001["id"] }))["runs"][0]["max_signal"].clone();
    assert_ne!(before, after);
    h.call(
        "update_locus",
        json!({ "id": pfb1, "min_base_length": 70.0, "max_base_length": 135.0 }),
    );
    assert_eq!(
        h.fail("update_locus", json!({ "id": pfb1, "color": "green" }))
            .code,
        ErrorCode::InUse
    );

    // Re-size a whole plate with the same ladder: a task, fits unchanged.
    h.drain();
    let resized = h.call("size_plate", json!({ "id": pa_id }));
    assert_eq!(
        resized["sizing"],
        h.call("list_plates", Value::Null)
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["id"] == pa_id)
            .unwrap()["sizing"]
    );
    let ev = h.drain();
    assert!(ev.iter().any(|e| matches!(e, AppEvent::Task { task } if task.kind == "size_plate" && task.status == TaskStatus::Done)));

    // Deleting things in use is refused with an explanation.
    let e = h.fail("delete_ladder", json!({ "id": ladder_id }));
    assert_eq!(e.code, ErrorCode::InUse);
    assert!(e.message.contains("PLATE-A"), "{}", e.message);
    let e = h.fail("delete_locus", json!({ "id": pfb1 }));
    assert_eq!(e.code, ErrorCode::InUse);
    assert!(e.message.contains("runs"), "{}", e.message);
    let e = h.fail("delete_sample", json!({ "id": s001["id"] }));
    assert_eq!(e.code, ErrorCode::InUse);
    let spare = h.call("create_locus", json!({ "label": "Spare", "color": "yellow", "min_base_length": 450, "max_base_length": 480, "nucleotide_repeat_length": 4 }));
    h.call(
        "update_locus_set",
        json!({ "id": set_detail["id"], "locus_ids": [spare["id"], pfb1] }),
    );
    let e = h.fail("delete_locus", json!({ "id": spare["id"] }));
    assert!(
        e.code == ErrorCode::InUse && e.message.contains("Panel"),
        "{}",
        e.message
    );
    let unused = h.call("create_sample", json!({ "barcode": "Unused" }));
    h.call("delete_sample", json!({ "id": unused["id"] }));
    h.call("delete_ladder", json!({ "id": ladders.as_array().unwrap().iter().find(|l| l["label"] == "GeneScan 600 LIZ").unwrap()["id"] }));

    // Snapshot, then save as, close, move the copy elsewhere and reopen it.
    let snapshot_plate = h.call("get_plate", json!({ "id": pb_id }));
    let snapshot_well = h.call("get_well", json!({ "id": good_id }));
    let snapshot_info = h.call("get_workspace_info", Value::Null);
    let copy = dir.path().join("copy.microspat");
    let saved = h.call("save_workspace_as", json!({ "path": copy.to_str() }));
    assert_eq!(saved["name"], "copy");
    assert_eq!(saved["counts"], snapshot_info["counts"]);
    h.call("new_workspace", json!({ "path": null }));
    assert_eq!(
        h.call("get_workspace_info", Value::Null)["path"],
        Value::Null
    );
    for side in [
        "copy.microspat-wal",
        "copy.microspat-shm",
        "study.microspat-wal",
        "study.microspat-shm",
    ] {
        assert!(!dir.path().join(side).exists(), "{side} left behind");
    }
    let elsewhere = tempfile::tempdir().unwrap();
    let moved = elsewhere.path().join("emailed.microspat");
    std::fs::copy(&copy, &moved).unwrap();
    let reopened = h.call("open_workspace", json!({ "path": moved.to_str() }));
    assert_eq!(reopened["counts"], snapshot_info["counts"]);
    assert_eq!(h.call("get_plate", json!({ "id": pb_id })), snapshot_plate);
    assert_eq!(h.call("get_well", json!({ "id": good_id })), snapshot_well);
    let recent = h.call("list_recent_workspaces", Value::Null);
    assert!(recent[0]["path"]
        .as_str()
        .unwrap()
        .ends_with("emailed.microspat"));

    // Deleting a plate removes its runs and frees its samples.
    h.drain();
    h.call("delete_plate", json!({ "id": pa_id }));
    assert_eq!(
        h.changed(),
        set(&[
            "plates",
            "samples",
            "loci",
            "ladders",
            "workspace",
            "projects"
        ])
    );
    h.call("delete_sample", json!({ "id": s001["id"] }));
    assert_eq!(
        h.call("list_plates", Value::Null).as_array().unwrap().len(),
        1
    );

    // Opening a file that is not a workspace is refused, and leaves it alone.
    let not_ws = dir.path().join("notes.microspat");
    std::fs::write(&not_ws, b"hello").unwrap();
    assert_eq!(
        h.fail("open_workspace", json!({ "path": not_ws.to_str() }))
            .code,
        ErrorCode::Invalid
    );
    assert_eq!(std::fs::read(&not_ws).unwrap(), b"hello");
}

#[test]
fn every_mutation_declares_its_changed_entities() {
    let e = Engine::new(EngineConfig::default());
    for m in e.registry().infos() {
        for c in &m.changes {
            assert!(
                microspat_engine::entity::ALL.contains(c),
                "{}: unknown entity {c}",
                m.name
            );
        }
        let mutating = !matches!(m.kind, microspat_engine::MethodKind::Query);
        assert!(
            !mutating || !m.changes.is_empty() || m.name == "write_text_file",
            "{} changes data but declares no entities",
            m.name
        );
        assert!(
            m.name.chars().all(|c| c.is_ascii_lowercase() || c == '_'),
            "{}",
            m.name
        );
    }
}

#[test]
fn reads_are_not_blocked_by_an_import() {
    let dir = tempfile::tempdir().unwrap();
    let h = Harness::new(&dir.path().join("state"));
    h.call(
        "new_workspace",
        json!({ "path": dir.path().join("w").to_str() }),
    );
    let ladder = h
        .call("list_ladders", Value::Null)
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["label"] == "HD ROX 400")
        .unwrap()["id"]
        .clone();
    let mut paths = Vec::new();
    for seed in 0..4 {
        let wells = generate_plate(&SynthSpec {
            plate_name: format!("P{seed}"),
            ..SynthSpec::demo(seed)
        })
        .unwrap();
        let z = dir.path().join(format!("p{seed}.zip"));
        write_zip(&z, &wells).unwrap();
        paths.push(z.to_str().unwrap().to_string());
    }
    let engine = h.engine.clone();
    let worker = std::thread::spawn(move || {
        engine
            .dispatch(
                "import_plates",
                json!({ "paths": paths, "ladder_id": ladder }),
            )
            .unwrap()
    });
    let mut worst = std::time::Duration::ZERO;
    let mut reads = 0;
    while !worker.is_finished() {
        let t = std::time::Instant::now();
        h.call("list_plates", Value::Null);
        h.call("get_workspace_info", Value::Null);
        worst = worst.max(t.elapsed());
        reads += 1;
    }
    let res = worker.join().unwrap();
    assert_eq!(res["plates"].as_array().unwrap().len(), 4);
    eprintln!("{reads} reads during import, slowest {worst:?}");
    assert!(
        reads > 3 && worst < std::time::Duration::from_millis(500),
        "{reads} reads, slowest {worst:?}"
    );
    let tasks = h.call("list_tasks", Value::Null);
    assert_eq!(tasks[0]["status"], "done");
}

#[test]
fn demo_data_fills_every_screen() {
    let dir = tempfile::tempdir().unwrap();
    let h = Harness::new(&dir.path().join("state"));
    h.call("new_workspace", json!({ "path": null }));
    h.drain();
    let r = h.call("load_demo_data", Value::Null);
    let plates = r["plates"].as_array().unwrap();
    assert_eq!(plates.len(), 3, "{r}");
    assert!(plates.iter().all(|p| p["status"] == "imported"), "{r}");
    assert_eq!(r["samples_created"], 288);
    let changed = h.changed();
    for e in [
        "plates",
        "samples",
        "loci",
        "locus_sets",
        "ladders",
        "workspace",
    ] {
        assert!(changed.contains(e), "{e} not announced");
    }
    let info = h.call("get_workspace_info", Value::Null);
    assert_eq!(info["counts"]["plates"], 3);
    assert_eq!(info["counts"]["loci"], 6);
    assert_eq!(info["counts"]["locus_sets"], 1);
    for p in h.call("list_plates", Value::Null).as_array().unwrap() {
        assert_eq!(p["has_plate_map"], true);
        assert_eq!(p["run_count"], 576);
        // Every plate's quality report is there, negative controls checked:
        // DEMO-1 is clean, DEMO-2 shows its capillary with unseparated dyes.
        let q = h.call("get_plate_quality", json!({ "id": p["id"] }))["report"].clone();
        assert_eq!(q["controls_checked"], true, "{}", p["label"]);
        let issues = q["issues"].as_array().unwrap();
        match p["label"].as_str().unwrap() {
            "DEMO-1" => assert!(issues.is_empty(), "{issues:?}"),
            "DEMO-2" => {
                let i = issues
                    .iter()
                    .find(|i| i["kind"] == "unseparated_dyes")
                    .unwrap();
                assert_eq!(
                    i["wells"],
                    json!([microspat_engine::api::demo::DEMO_FAULT_WELL])
                );
            }
            _ => assert!(issues.iter().all(|i| i["severity"] == "info"), "{issues:?}"),
        }
    }
    for e in ["projects", "controls"] {
        assert!(changed.contains(e), "{e} not announced");
    }
    // A complete, analyzed study.
    let projects = h.call("list_projects", Value::Null);
    let projects = projects.as_array().unwrap();
    assert_eq!(projects.len(), 4);
    for p in projects {
        assert_eq!(p["current_loci"], 6, "{}", p["title"]);
    }
    let gt = projects.iter().find(|p| p["kind"] == "genotyping").unwrap();
    assert_eq!(gt["probabilities"]["state"], "current");
    assert_eq!(gt["sample_count"], 276);
    assert_eq!(
        h.call("list_controls", json!({})).as_array().unwrap().len(),
        3
    );
    let qb = projects
        .iter()
        .find(|p| p["kind"] == "quant_bias_estimator")
        .unwrap();
    let loci = h.call("list_loci", Value::Null);
    let pfy1 = loci
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["label"] == "PfY1")
        .unwrap()["id"]
        .clone();
    let q = h.call(
        "get_locus_quant_bias",
        json!({ "project_id": qb["id"], "locus_id": pfy1 }),
    );
    let spec = &microspat_engine::api::demo::demo_specs()[0];
    let planted = -2.0
        * spec
            .loci
            .iter()
            .find(|l| l.label == "PfY1")
            .unwrap()
            .profile()
            .bias;
    let beta = q["estimate"]["beta"].as_f64().unwrap();
    assert!(
        (beta - planted).abs() < 0.1 * planted.abs(),
        "β {beta}, planted {planted}"
    );
    // Showcase: D01–D04 hold a minor clone (10–15%) whose allele sits one or
    // two repeats below the major allele at every locus. Every minor allele
    // is called because the artifact model expects less stutter there than
    // is seen.
    let mut called = 0;
    let mut planted_minor = 0;
    for (i, fixed) in spec.fixed_wells.iter().take(4).enumerate() {
        for (k, l) in spec.loci.iter().enumerate() {
            let calls = h.call(
                "get_locus_calls",
                json!({ "project_id": gt["id"], "locus_id": loci.as_array().unwrap().iter().find(|x| x["label"] == l.label.as_str()).unwrap()["id"] }),
            );
            let row = calls["rows"]
                .as_array()
                .unwrap()
                .iter()
                .find(|r| r["barcode"] == format!("D1-SHOW-{}", i + 1))
                .unwrap()
                .clone();
            let sizes: Vec<f64> = row["alleles"]
                .as_array()
                .unwrap()
                .iter()
                .map(|a| a["size"].as_f64().unwrap())
                .collect();
            let minor = fixed.clones[1].alleles[k];
            planted_minor += 1;
            called += usize::from(sizes.iter().any(|s| (s - minor).abs() < 0.5));
            assert!(
                sizes
                    .iter()
                    .any(|s| (s - fixed.clones[0].alleles[k]).abs() < 0.5),
                "{row}"
            );
        }
    }
    assert_eq!(
        called, planted_minor,
        "{called} of {planted_minor} showcase minor alleles called"
    );
    let summary = h.call("get_genotyping_summary", json!({ "id": gt["id"] }));
    assert!(
        summary["mean_moi"].as_f64().unwrap() > 1.5,
        "{}",
        summary["mean_moi"]
    );
    // Loading again changes nothing and says why.
    let again = h.call("load_demo_data", Value::Null);
    assert!(again["plates"]
        .as_array()
        .unwrap()
        .iter()
        .all(|p| p["status"] == "duplicate"));
    assert_eq!(
        h.call("get_workspace_info", Value::Null)["counts"]["plates"],
        3
    );
    assert_eq!(
        h.call("list_projects", Value::Null)
            .as_array()
            .unwrap()
            .len(),
        4
    );
}

/// The UI engineer's report: five hand-picked peaks at 50–120 bp on a demo
/// well were assigned 260–400 bp and scored "good" (quality 0.038).
#[test]
fn manual_ladder_peaks_are_assigned_with_the_plates_prior_and_judged_complete() {
    let dir = tempfile::tempdir().unwrap();
    let h = Harness::new(&dir.path().join("state"));
    h.call("new_workspace", json!({ "path": null }));
    h.call("load_demo_data", Value::Null);
    let plate = &h.call("list_plates", Value::Null)[0];
    let plate_id = plate["id"].as_i64().unwrap();
    let good_before = plate["sizing"]["good"].as_u64().unwrap();
    let detail = h.call("get_plate", json!({ "id": plate_id }));
    let well = detail["wells"]
        .as_array()
        .unwrap()
        .iter()
        .find(|w| w["sizing"] == "good" && !w["channels"][0]["runs"].as_array().unwrap().is_empty())
        .unwrap();
    let id = well["id"].as_i64().unwrap();
    assert!(well["sizing_reason"].is_null());
    let wd = h.call("get_well", json!({ "id": id }));
    let index_of = |size: f64| {
        wd["ladder_peaks"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["size"].as_f64() == Some(size))
            .unwrap()["index"]
            .as_u64()
            .unwrap()
    };
    let candidates = wd["ladder_candidates"].as_array().unwrap();
    assert!(candidates.len() >= 21, "{}", candidates.len());
    let low = [50.0, 60.0, 90.0, 100.0, 120.0];
    let picked: Vec<u64> = low.iter().map(|&s| index_of(s)).collect();
    let sizes = |v: &Value| -> Vec<f64> {
        v.as_array()
            .unwrap()
            .iter()
            .map(|p| p["size"].as_f64().unwrap())
            .collect()
    };

    // Dry run: right sizes (the other wells say where 50–120 bp land), and
    // not good: 5 of 21 peaks.
    let preview = h.call(
        "preview_well_ladder_peaks",
        json!({ "id": id, "peak_indices": picked }),
    );
    assert_eq!(sizes(&preview["peaks"]), low.to_vec(), "{preview}");
    assert_eq!(preview["sizing"], "unusable");
    assert!(
        preview["reason"]
            .as_str()
            .unwrap()
            .contains("Only 5 of the ladder's 21 peaks"),
        "{preview}"
    );
    // Nothing was stored.
    assert_eq!(
        h.call("get_well", json!({ "id": id, "traces": false }))["manual_ladder"],
        false
    );

    let set = h.call(
        "set_well_ladder_peaks",
        json!({ "id": id, "peak_indices": picked }),
    );
    assert_eq!(sizes(&set["ladder_peaks"]), low.to_vec());
    assert_eq!(set["sizing"], "unusable");
    assert!(set["sizing_reason"]
        .as_str()
        .unwrap()
        .contains("at least 16"));
    let after = &h.call("list_plates", Value::Null)[0];
    assert_eq!(after["sizing"]["good"].as_u64().unwrap(), good_before - 1);

    // Stated sizes are used as given and validated against the ladder.
    let stated: Vec<Value> = picked
        .iter()
        .zip(low)
        .map(|(i, s)| json!({ "index": i, "size": s }))
        .collect();
    let p = h.call(
        "preview_well_ladder_peaks",
        json!({ "id": id, "peaks": stated }),
    );
    assert_eq!(sizes(&p["peaks"]), low.to_vec());
    let e = h.fail(
        "set_well_ladder_peaks",
        json!({ "id": id, "peaks": [{ "index": picked[0], "size": 55.0 }, { "index": picked[1], "size": 60.0 },
                                    { "index": picked[2], "size": 90.0 }, { "index": picked[3], "size": 100.0 }] }),
    );
    assert_eq!(e.code, ErrorCode::Invalid);
    assert!(e.message.contains("55 bp is not a size"), "{}", e.message);
    let e = h.fail(
        "preview_well_ladder_peaks",
        json!({ "id": id, "peaks": stated, "peak_indices": picked }),
    );
    assert_eq!(e.code, ErrorCode::Invalid);
    // An impossible proposal previews as failed rather than erroring.
    let p = h.call(
        "preview_well_ladder_peaks",
        json!({ "id": id, "peak_indices": [2000, 2100] }),
    );
    assert_eq!(p["sizing"], "failed");
    assert!(p["reason"].as_str().unwrap().starts_with("Only 2"), "{p}");

    // Enough peaks but the top of the ladder missing: the well is flagged and
    // runs of loci above the sized range are unusable for analysis.
    let all: Vec<u64> = wd["ladder_peaks"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|p| p["size"].as_f64().unwrap() <= 340.0)
        .map(|p| p["index"].as_u64().unwrap())
        .collect();
    let set = h.call(
        "set_well_ladder_peaks",
        json!({ "id": id, "peak_indices": all }),
    );
    assert_eq!(set["ladder_peaks"].as_array().unwrap().len(), 18);
    assert_eq!(set["sizing"], "flagged", "{}", set["sizing_reason"]);
    let reason = set["sizing_reason"].as_str().unwrap();
    assert!(
        reason.contains("PfY2 (380–450 bp)") && reason.contains("50–340 bp"),
        "{reason}"
    );
    let sample_id = well["channels"][0]["runs"][0]["sample_id"].clone();
    let sample = h.call("get_sample", json!({ "id": sample_id }));
    for r in sample["runs"].as_array().unwrap() {
        if r["well_id"].as_i64() != Some(id) {
            continue;
        }
        let label = r["locus_label"].as_str().unwrap();
        let expect = if ["PfY2", "PfG2"].contains(&label) {
            "unusable"
        } else {
            "good"
        };
        assert_eq!(r["sizing"], expect, "{label}");
    }

    // Back to the automatic fit.
    let auto = h.call("set_well_ladder_peaks", json!({ "id": id }));
    assert_eq!(auto["sizing"], "good");
    assert!(auto["sizing_reason"].is_null());
}

#[test]
fn sample_rows_and_batches() {
    let dir = tempfile::tempdir().unwrap();
    let h = Harness::new(&dir.path().join("state"));
    h.call("new_workspace", json!({ "path": null }));
    h.call("load_demo_data", Value::Null);
    let samples = h.call("list_samples", Value::Null);
    let run = samples
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["run_count"].as_u64() > Some(0))
        .unwrap()
        .clone();
    assert_eq!(run["locus_count"], 6);
    assert_eq!(run["plate_labels"].as_array().unwrap().len(), 1);
    assert!(!run["plate_labels"][0].as_str().unwrap().is_empty());

    // Duplicate-label messages quote the stored spelling.
    let stored = run["barcode"].as_str().unwrap().to_string();
    let e = h.fail("create_sample", json!({ "barcode": stored.to_lowercase() }));
    assert_eq!(e.code, ErrorCode::Conflict);
    assert!(
        e.message.contains(&format!("\"{stored}\"")),
        "{}",
        e.message
    );
    let e = h.fail(
        "create_ladder",
        json!({ "label": "hd rox 400", "spec": { "base_sizes": [50, 60, 70, 80, 90, 100, 110, 120] } }),
    );
    assert!(e.message.contains("\"HD ROX 400\""), "{}", e.message);

    // Partial ladder specs take defaults.
    let l = h.call(
        "create_ladder",
        json!({ "label": "Short", "spec": { "base_sizes": [50, 60, 70, 80, 90, 100, 110, 120] } }),
    );
    assert_eq!(l["spec"]["maximum_missing_peak_count"], 5);
    assert_eq!(l["spec"]["color"], "red");

    let fresh: Vec<i64> = (0..3)
        .map(|k| {
            h.call("create_sample", json!({ "barcode": format!("FRESH-{k}") }))["id"]
                .as_i64()
                .unwrap()
        })
        .collect();
    let fresh_row = h
        .call("list_samples", Value::Null)
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["id"].as_i64() == Some(fresh[0]))
        .unwrap()
        .clone();
    assert_eq!(fresh_row["locus_count"], 0);
    assert_eq!(fresh_row["plate_labels"], json!([]));

    h.drain();
    let ids = vec![
        fresh[0],
        fresh[1],
        run["id"].as_i64().unwrap(),
        999_999,
        fresh[0],
    ];
    let r = h.call(
        "set_samples_designation",
        json!({ "sample_ids": ids, "designation": "positive_control" }),
    );
    assert_eq!(r["done"].as_array().unwrap().len(), 3);
    assert_eq!(r["refused"][0]["sample_id"], 999_999);
    assert!(r["refused"][0]["barcode"].is_null());
    let events: Vec<AppEvent> = h.drain();
    let sample_events = events
        .iter()
        .filter(|e| matches!(e, AppEvent::Changed { entity, .. } if entity == "samples"))
        .count();
    assert_eq!(sample_events, 1);
    assert!(events
        .iter()
        .any(|e| matches!(e, AppEvent::Changed { entity, .. } if entity == "plates")));
    let detail = h.call("get_sample", json!({ "id": fresh[1] }));
    assert_eq!(detail["designation"], "positive_control");

    let r = h.call(
        "delete_samples",
        json!({ "sample_ids": [fresh[0], fresh[1], run["id"], 999_999] }),
    );
    assert_eq!(r["done"], json!([fresh[0], fresh[1]]));
    let refused = r["refused"].as_array().unwrap();
    assert_eq!(refused.len(), 2);
    assert_eq!(refused[0]["barcode"], json!(stored));
    assert!(
        refused[0]["reason"]
            .as_str()
            .unwrap()
            .contains("runs on plate"),
        "{}",
        refused[0]
    );
    let changed = h.drain();
    assert_eq!(
        changed
            .iter()
            .filter(|e| matches!(e, AppEvent::Changed { entity, .. } if entity == "samples"))
            .count(),
        1
    );
    assert_eq!(
        h.fail("get_sample", json!({ "id": fresh[0] })).code,
        ErrorCode::NotFound
    );
    assert_eq!(
        h.call("get_sample", json!({ "id": fresh[2] }))["barcode"],
        "FRESH-2"
    );
}
