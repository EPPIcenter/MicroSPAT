//! Shared helpers for the project tests: a dispatch harness and a synthetic
//! study (plates imported through `import_plates`, plate maps applied) whose
//! planted truth is kept for scoring.

#![allow(dead_code)]

use microspat_core::synth::{
    generate_plate, FixedWell, SynthClone, SynthSpec, SynthWell, WellTruth,
};
use microspat_engine::api::demo::write_zip;
use microspat_engine::{AppEvent, Engine, EngineConfig};
use serde_json::{json, Value};
use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::mpsc::Receiver;

pub struct Harness {
    pub engine: Engine,
    pub events: Receiver<AppEvent>,
}

impl Harness {
    pub fn new(state: &Path) -> Harness {
        let engine = Engine::new(EngineConfig {
            state_dir: Some(state.to_path_buf()),
        });
        let events = engine.subscribe();
        Harness { engine, events }
    }

    pub fn call(&self, method: &str, params: Value) -> Value {
        self.engine
            .dispatch(method, params)
            .unwrap_or_else(|e| panic!("{method} failed: {:?} {}", e.code, e.message))
    }

    /// Creates and opens `dir/scratch.microspat`: a throwaway workspace that
    /// goes away with the test's temp dir (an untitled one would stay in the
    /// system temp folder).
    pub fn new_scratch_workspace(&self, dir: &Path) -> Value {
        self.call(
            "new_workspace",
            json!({ "path": dir.join("scratch.microspat").to_str() }),
        )
    }

    pub fn fail(&self, method: &str, params: Value) -> microspat_engine::RpcError {
        match self.engine.dispatch(method, params) {
            Ok(v) => panic!("{method} should have failed, returned {v}"),
            Err(e) => e,
        }
    }

    pub fn drain(&self) -> Vec<AppEvent> {
        self.events.try_iter().collect()
    }

    /// `changed: plates` events since the last drain.
    pub fn changed_plates(&self) -> usize {
        self.drain()
            .into_iter()
            .filter(|e| matches!(e, AppEvent::Changed { entity, .. } if entity == "plates"))
            .count()
    }

    /// Entities of `changed` events since the last drain.
    pub fn changed(&self) -> BTreeSet<String> {
        self.drain()
            .into_iter()
            .filter_map(|e| match e {
                AppEvent::Changed { entity, .. } => Some(entity),
                _ => None,
            })
            .collect()
    }
}

pub fn set(items: &[&str]) -> BTreeSet<String> {
    items.iter().map(|s| s.to_string()).collect()
}

pub fn id(v: &Value) -> i64 {
    v.as_i64()
        .or_else(|| v["id"].as_i64())
        .or_else(|| v["project"]["id"].as_i64())
        .unwrap_or_else(|| panic!("no id in {v}"))
}

/// Three lab strains for control mixtures: allele index per locus pool.
pub const STRAIN_ALLELE_INDEX: [usize; 3] = [0, 2, 4];
pub const STRAINS: [&str; 3] = ["3D7", "HB3", "DD2"];

/// A control mixture: (strain, proportion) components summing to 1.
pub type Mixture = Vec<(usize, f64)>;

/// Two-strain control mixtures.
pub fn control_mixtures() -> Vec<Mixture> {
    let mut v = Vec::new();
    for (a, b) in [(0, 1), (0, 2), (1, 2)] {
        for p in [0.9, 0.75, 0.5, 0.25] {
            v.push(vec![(a, p), (b, 1.0 - p)]);
        }
    }
    v
}

/// Three-strain control mixtures: four usable at the default minimum share
/// of 0.25, and one whose 10% strain leaves it out of the β fit.
pub fn three_strain_mixtures() -> Vec<Mixture> {
    [
        [0.5, 0.25, 0.25],
        [0.25, 0.5, 0.25],
        [0.25, 0.25, 0.5],
        [0.4, 0.35, 0.25],
        [0.6, 0.3, 0.1],
    ]
    .iter()
    .map(|p| p.iter().copied().enumerate().collect())
    .collect()
}

fn mixture_name(m: &Mixture) -> String {
    let strains: Vec<&str> = m.iter().map(|(s, _)| STRAINS[*s]).collect();
    let shares: Vec<String> = m
        .iter()
        .map(|(_, p)| format!("{:02}", (p * 100.0).round() as u32))
        .collect();
    format!("MIX-{}-{}", strains.join("-"), shares.join("-"))
}

/// `import_control_mixtures_csv` content for a study's mixtures.
pub fn mixtures_csv(study: &Study) -> String {
    let mut csv = String::from("Barcode,C1,C2,C3\n");
    for (barcode, m) in &study.mixtures {
        let cells: Vec<String> = m
            .iter()
            .map(|(s, p)| format!("{};{p}", STRAINS[*s]))
            .collect();
        csv.push_str(&format!("{barcode},{}\n", cells.join(",")));
    }
    csv
}

/// The synthetic study.
pub struct Study {
    pub specs: Vec<SynthSpec>,
    pub plates: Vec<Vec<SynthWell>>,
    /// Barcode -> planted truth.
    pub truth: HashMap<String, WellTruth>,
    /// Barcode -> components of each control mixture.
    pub mixtures: HashMap<String, Mixture>,
    pub zips: Vec<PathBuf>,
}

pub fn barcode(plate: usize, w: &SynthWell) -> String {
    format!("P{}-{}", plate + 1, w.truth.sample_name)
}

/// Generates `n` plates from `SynthSpec::study` (alleles under ladder
/// fragments and other dyes); the last one also carries the two-strain control
/// mixtures (wells A01–C04).
pub fn study(dir: &Path, n: usize, seed: u64) -> Study {
    study_with(dir, n, seed, false)
}

/// As [`study`]; with `three_strain`, the last plate also carries
/// [`three_strain_mixtures`] in wells D01–D05.
pub fn study_with(dir: &Path, n: usize, seed: u64, three_strain: bool) -> Study {
    let mut specs = Vec::new();
    let mut plates = Vec::new();
    let mut truth = HashMap::new();
    let mut mixtures = HashMap::new();
    let mut zips = Vec::new();
    let mut all = control_mixtures();
    if three_strain {
        all.extend(three_strain_mixtures());
    }
    for k in 0..n {
        let mut spec = SynthSpec {
            plate_name: format!("STUDY-{}", k + 1),
            ..SynthSpec::study(seed + k as u64)
        };
        if k + 1 == n {
            for (i, m) in all.iter().enumerate() {
                let well = if i < 12 {
                    format!("{}{:02}", ['A', 'B', 'C'][i / 4], i % 4 + 1)
                } else {
                    format!("D{:02}", i - 11)
                };
                let clones = m
                    .iter()
                    .map(|&(s, p)| SynthClone {
                        proportion: p,
                        alleles: spec
                            .loci
                            .iter()
                            .map(|l| l.alleles[STRAIN_ALLELE_INDEX[s]])
                            .collect(),
                    })
                    .collect();
                spec.fixed_wells.push(FixedWell {
                    well,
                    sample_name: mixture_name(m),
                    clones,
                });
            }
        }
        let wells = generate_plate(&spec).unwrap();
        for w in &wells {
            let b = barcode(k, w);
            if let Some(m) = all.iter().find(|m| mixture_name(m) == w.truth.sample_name) {
                mixtures.insert(b.clone(), m.clone());
            }
            truth.insert(b, w.truth.clone());
        }
        let z = dir.join(format!("study-{k}.zip"));
        write_zip(&z, &wells).unwrap();
        zips.push(z);
        specs.push(spec);
        plates.push(wells);
    }
    Study {
        specs,
        plates,
        truth,
        mixtures,
        zips,
    }
}

/// Plate map for plate `k` of a study.
pub fn plate_map(study: &Study, k: usize) -> String {
    let loci: Vec<&str> = study.specs[k]
        .loci
        .iter()
        .map(|l| l.label.as_str())
        .collect();
    let mut s = format!("Well,{}\n", loci.join(","));
    for w in &study.plates[k] {
        s.push_str(&w.well);
        for _ in &loci {
            s.push(',');
            s.push_str(&barcode(k, w));
        }
        s.push('\n');
    }
    s
}

/// Imports a study into the open workspace; returns (locus set id, locus ids by label).
pub fn load_study(h: &Harness, study: &Study) -> (i64, HashMap<String, i64>) {
    let ladder = h
        .call("list_ladders", Value::Null)
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["label"] == "HD ROX 400")
        .unwrap()["id"]
        .as_i64()
        .unwrap();
    let mut loci = HashMap::new();
    for l in &study.specs[0].loci {
        let v = h.call(
            "create_locus",
            json!({ "label": l.label, "color": l.color, "min_base_length": l.min_size,
                    "max_base_length": l.max_size, "nucleotide_repeat_length": l.repeat_length }),
        );
        loci.insert(l.label.clone(), id(&v));
    }
    let set = h.call(
        "create_locus_set",
        json!({ "label": "Panel", "locus_ids": loci.values().collect::<Vec<_>>() }),
    );
    let paths: Vec<String> = study
        .zips
        .iter()
        .map(|p| p.to_str().unwrap().to_string())
        .collect();
    let r = h.call(
        "import_plates",
        json!({ "paths": paths, "ladder_id": ladder }),
    );
    for (k, o) in r["plates"].as_array().unwrap().iter().enumerate() {
        assert_eq!(o["status"], "imported", "{o}");
        let k = study
            .specs
            .iter()
            .position(|s| s.plate_name == o["label"])
            .unwrap_or(k);
        h.call(
            "apply_plate_map",
            json!({ "plate_id": o["plate_id"], "content": plate_map(study, k), "create_samples": true }),
        );
    }
    (id(&set), loci)
}

/// Sample ids by barcode.
pub fn samples(h: &Harness) -> HashMap<String, i64> {
    h.call("list_samples", Value::Null)
        .as_array()
        .unwrap()
        .iter()
        .map(|s| (s["barcode"].as_str().unwrap().to_string(), id(s)))
        .collect()
}
