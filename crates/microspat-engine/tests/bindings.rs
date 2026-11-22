//! The checked-in TypeScript bindings must match the engine. If this fails,
//! run `cargo run -p microspat-engine --bin gen-bindings` and commit the result.

use microspat_engine::bindings::{default_out_dir, generate};
use std::collections::BTreeMap;
use std::path::Path;

fn files(dir: &Path) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for e in std::fs::read_dir(dir).unwrap() {
        let p = e.unwrap().path();
        out.insert(
            p.file_name().unwrap().to_string_lossy().into_owned(),
            std::fs::read_to_string(&p).unwrap(),
        );
    }
    out
}

#[test]
fn checked_in_bindings_are_current() {
    let tmp = tempfile::tempdir().unwrap();
    generate(tmp.path()).unwrap();
    let fresh = files(&tmp.path().join("bindings"));
    assert!(
        fresh.values().all(|s| !s.contains("bigint")),
        "ids must be numbers"
    );
    let ui = default_out_dir();
    let stale =
        "TypeScript bindings are stale: run `cargo run -p microspat-engine --bin gen-bindings`";
    assert_eq!(files(&ui.join("bindings")), fresh, "{stale}");
    assert_eq!(
        std::fs::read_to_string(ui.join("client.ts")).unwrap(),
        std::fs::read_to_string(tmp.path().join("client.ts")).unwrap(),
        "{stale}"
    );
}
