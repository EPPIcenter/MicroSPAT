//! Automatic ladder fits that one well's trace cannot settle (a ladder with
//! evenly spaced sizes missing its first peak) are settled by the plate's
//! other wells at import, and reported as unusable when nothing settles them.

mod common;

use common::{id, Harness};
use microspat_core::synth::{generate_plate, SynthSpec, SynthWell, WellKind};
use microspat_engine::api::demo::write_zip;
use serde_json::{json, Value};

const UNIFORM: [f64; 10] = [
    50.0, 100.0, 150.0, 200.0, 250.0, 300.0, 350.0, 400.0, 450.0, 500.0,
];

fn plate(name: &str, seed: u64, ladder: &[f64]) -> Vec<SynthWell> {
    generate_plate(&SynthSpec {
        plate_name: name.into(),
        ladder_sizes: ladder.to_vec(),
        ..SynthSpec::demo(seed)
    })
    .unwrap()
}

fn sizes(v: &Value) -> Vec<f64> {
    v.as_array()
        .unwrap()
        .iter()
        .map(|p| p["size"].as_f64().unwrap())
        .collect()
}

#[test]
fn ambiguous_wells_are_settled_by_their_plate_or_reported() {
    let dir = tempfile::tempdir().unwrap();
    let h = Harness::new(&dir.path().join("state"));
    h.call("new_workspace", json!({ "path": null }));
    let ladder = id(&h.call(
        "create_ladder",
        json!({ "label": "Even 50–500", "spec": { "base_sizes": UNIFORM } }),
    ));

    // Row A of the plate has the whole ladder; every other well lost its
    // 50 bp peak, so alone it fits 50–450 bp as well as 100–500 bp.
    let complete = plate("EVEN", 7, &UNIFORM);
    let missing = plate("EVEN", 7, &UNIFORM[1..]);
    let wells: Vec<SynthWell> = complete
        .iter()
        .zip(&missing)
        .map(|(c, m)| if c.well.starts_with('A') { c } else { m }.clone())
        .collect();
    let zip = dir.path().join("even.zip");
    write_zip(&zip, &wells).unwrap();
    let r = h.call(
        "import_plates",
        json!({ "paths": [zip.to_str()], "ladder_id": ladder }),
    );
    assert_eq!(r["plates"][0]["status"], "imported", "{r}");
    let plate_id = r["plates"][0]["plate_id"].as_i64().unwrap();
    let detail = h.call("get_plate", json!({ "id": plate_id }));
    let mut checked = 0;
    let mut some_missing_well = None;
    for w in detail["wells"].as_array().unwrap() {
        let label = w["label"].as_str().unwrap();
        let truth = &wells.iter().find(|s| s.well == label).unwrap().truth;
        if truth.kind == WellKind::Failed {
            continue;
        }
        assert_eq!(w["sizing"], "good", "{label}: {}", w["sizing_reason"]);
        let wd = h.call("get_well", json!({ "id": w["id"], "traces": false }));
        let first = if label.starts_with('A') { 50.0 } else { 100.0 };
        let got = sizes(&wd["ladder_peaks"]);
        assert_eq!(got.first(), Some(&first), "{label}: {got:?}");
        assert_eq!(got.last(), Some(&500.0), "{label}: {got:?}");
        if !label.starts_with('A') {
            some_missing_well = Some(w["id"].as_i64().unwrap());
        }
        checked += 1;
    }
    assert!(checked > 80, "{checked}");

    // Refitting one such well automatically uses the plate's other wells too.
    let well = some_missing_well.unwrap();
    let auto = h.call("set_well_ladder_peaks", json!({ "id": well }));
    assert_eq!(auto["sizing"], "good", "{}", auto["sizing_reason"]);
    assert_eq!(sizes(&auto["ladder_peaks"]).first(), Some(&100.0));
    let preview = h.call("preview_well_ladder_peaks", json!({ "id": well }));
    assert_eq!(preview["sizing"], "good");
    // And so does resizing the whole plate.
    let summary = h.call("size_plate", json!({ "id": plate_id }));
    assert_eq!(
        summary["sizing"]["good"].as_u64(),
        Some(checked),
        "{summary}"
    );

    // One such well imported alone: nothing to settle it with. Never good.
    let lone: Vec<SynthWell> = plate("LONE", 8, &UNIFORM[1..])
        .into_iter()
        .filter(|w| w.truth.kind == WellKind::Sample)
        .take(1)
        .collect();
    let zip = dir.path().join("lone.zip");
    write_zip(&zip, &lone).unwrap();
    let r = h.call(
        "import_plates",
        json!({ "paths": [zip.to_str()], "ladder_id": ladder }),
    );
    let lone_id = r["plates"][0]["plate_id"].as_i64().unwrap();
    let w = &h.call("get_plate", json!({ "id": lone_id }))["wells"][0];
    assert_eq!(w["sizing"], "unusable", "{w}");
    let reason = w["sizing_reason"].as_str().unwrap();
    assert!(
        reason.contains("ambiguous") && reason.contains("no other well"),
        "{reason}"
    );
    assert!(w["sizing_quality"].as_f64().unwrap() >= 40.0, "{w}");
    // Stating the sizes by hand resolves it.
    let wd = h.call("get_well", json!({ "id": w["id"], "traces": false }));
    let stated: Vec<Value> = wd["ladder_peaks"]
        .as_array()
        .unwrap()
        .iter()
        .zip(&UNIFORM[1..])
        .map(|(p, s)| json!({ "index": p["index"], "size": s }))
        .collect();
    let set = h.call(
        "set_well_ladder_peaks",
        json!({ "id": w["id"], "peaks": stated }),
    );
    assert_eq!(set["sizing"], "good", "{}", set["sizing_reason"]);
    assert!(set["sizing_error"].is_null());
}
