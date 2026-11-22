//! Runs a whole study headlessly from a JSON config, through the same RPC
//! methods the UI calls: imports plates, applies plate maps, builds the bin,
//! artifact, quantification-bias and genotyping projects, computes
//! probabilities, saves the workspace and writes the exports.
//!
//! ```sh
//! cargo run --release -p microspat-engine --example study -- <config.json>
//! ```
//!
//! Paths in the config are relative to the config file. Every key except
//! `workspace`, `plates` and `loci_csv` is optional:
//!
//! ```json
//! {
//!   "workspace": "out/study.microspat",
//!   "overwrite": true,
//!   "exports": "out/exports",
//!   "plates": ["plates/run1", "plates/run2.zip"],
//!   "plate_maps": "maps",
//!   "loci_csv": "loci.csv",
//!   "ladder": { "label": "HD ROX 400 (lab)", "spec": { "min_peak_height": 1000 } },
//!   "designations": [ { "pattern": "*NTC*", "designation": "negative_control" } ],
//!   "bin_estimator": { "samples": ["*"], "params": {} },
//!   "artifact_estimator": { "samples": ["*-SS*"], "params": {} },
//!   "quant_bias": {
//!     "controls": { "S1": { "LocusA": 152.1 } },
//!     "mixtures_csv": "mixtures.csv",
//!     "params": {}
//!   },
//!   "genotyping": { "exclude": ["*NTC*"], "params": {}, "probabilities": true },
//!   "variants": [
//!     { "title": "RMS error", "artifact_params": { "artifact": { "error_estimator": "rms" } } },
//!     { "title": "Height 150", "params": { "genotyping": { "absolute_peak_height_limit": 150 } } },
//!     { "title": "No probabilities", "probabilities": false }
//!   ]
//! }
//! ```
//!
//! - `plates`: zips, folders of `.fsa` files, or folders whose subfolders and
//!   zips are plates (each entry is passed to `import_plates`).
//! - `plate_maps`: a folder of plate maps named `<plate label>.csv`; plates
//!   without one are imported but carry no runs.
//! - `ladder`: a ladder to create (omitted spec fields take the HD ROX 400
//!   defaults); without it the built-in "HD ROX 400" is used.
//! - Sample patterns are case-insensitive globs on barcodes (`*`, `?`).
//!   Estimators without `samples` use every sample (`all_samples`).
//! - `params` are partial `LocusParams` applied to every locus of the project.
//! - `quant_bias.controls` gives each control strain's allele size per locus;
//!   the nearest bin within 1.5 bp is used.
//! - Each variant duplicates the genotyping project, optionally with its own
//!   artifact estimator (a duplicate of the main one with `artifact_params`,
//!   or one built from other samples with `artifact_samples`) and
//!   parameters, or without the artifact model
//!   (`no_artifact_model`), and is exported like the main project.
//!
//! Writes, under `exports`: `sizing.csv` (every well's sizing state), the
//! bins, the artifact equations (a variant's own artifact estimator's in its
//! folder), per genotyping project the wide, long and peak-data exports, with `quant_bias` also `quant_bias.csv` (β per locus)
//! and the control peak data, and `summary.json` (project ids and titles,
//! the warnings of every analysis, timings).

use microspat_engine::{Engine, EngineConfig};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::Instant;

#[derive(Deserialize, Default)]
#[serde(default)]
struct SampleSet {
    /// Globs of the samples to include; None means every sample.
    samples: Option<Vec<String>>,
    /// Globs of samples to leave out.
    exclude: Vec<String>,
    params: Value,
}

#[derive(Deserialize)]
struct Designation {
    pattern: String,
    designation: String,
}

#[derive(Deserialize)]
struct LadderConfig {
    label: String,
    #[serde(default)]
    spec: Value,
}

#[derive(Deserialize)]
struct QuantBias {
    /// Control label -> locus label -> allele size (bp).
    controls: BTreeMap<String, BTreeMap<String, f64>>,
    mixtures_csv: String,
    #[serde(default)]
    params: Value,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Genotyping {
    samples: Option<Vec<String>>,
    exclude: Vec<String>,
    params: Value,
    probabilities: Option<bool>,
}

#[derive(Deserialize)]
struct Variant {
    title: String,
    /// Partial artifact-estimator parameters for an artifact estimator of
    /// the variant's own (a duplicate of the main one).
    #[serde(default)]
    artifact_params: Option<Value>,
    /// Sample globs for an artifact estimator of the variant's own, built
    /// from these samples with the main estimator's parameters.
    #[serde(default)]
    artifact_samples: Option<Vec<String>>,
    #[serde(default)]
    params: Option<Value>,
    #[serde(default)]
    probabilities: Option<bool>,
    #[serde(default)]
    no_artifact_model: bool,
}

#[derive(Deserialize)]
struct Config {
    workspace: String,
    #[serde(default)]
    overwrite: bool,
    #[serde(default)]
    exports: Option<String>,
    plates: Vec<String>,
    #[serde(default)]
    plate_maps: Option<String>,
    loci_csv: String,
    #[serde(default)]
    ladder: Option<LadderConfig>,
    #[serde(default)]
    designations: Vec<Designation>,
    #[serde(default)]
    bin_estimator: SampleSet,
    #[serde(default)]
    artifact_estimator: SampleSet,
    #[serde(default)]
    quant_bias: Option<QuantBias>,
    #[serde(default)]
    genotyping: Genotyping,
    #[serde(default)]
    variants: Vec<Variant>,
}

/// Case-insensitive glob match with `*` and `?`.
fn glob(pattern: &str, text: &str) -> bool {
    let p: Vec<char> = pattern.to_lowercase().chars().collect();
    let t: Vec<char> = text.to_lowercase().chars().collect();
    let (mut pi, mut ti, mut star, mut mark) = (0, 0, None, 0);
    while ti < t.len() {
        if pi < p.len() && (p[pi] == '?' || p[pi] == t[ti]) {
            pi += 1;
            ti += 1;
        } else if pi < p.len() && p[pi] == '*' {
            star = Some(pi);
            mark = ti;
            pi += 1;
        } else if let Some(s) = star {
            pi = s + 1;
            mark += 1;
            ti = mark;
        } else {
            return false;
        }
    }
    p[pi..].iter().all(|&c| c == '*')
}

fn matches(patterns: &[String], barcode: &str) -> bool {
    patterns.iter().any(|p| glob(p, barcode))
}

struct Run {
    engine: Engine,
    base: PathBuf,
    warnings: Vec<String>,
    timings: Vec<(String, f64)>,
}

impl Run {
    fn call(&self, method: &str, params: Value) -> Value {
        self.engine
            .dispatch(method, params)
            .unwrap_or_else(|e| panic!("{method} failed: {:?} {}", e.code, e.message))
    }

    fn path(&self, p: &str) -> PathBuf {
        let p = Path::new(p);
        if p.is_absolute() {
            p.to_path_buf()
        } else {
            self.base.join(p)
        }
    }

    fn timed<T>(&mut self, what: &str, f: impl FnOnce(&mut Self) -> T) -> T {
        let t = Instant::now();
        let out = f(self);
        let s = t.elapsed().as_secs_f64();
        eprintln!("{what}: {s:.1} s");
        self.timings.push((what.to_string(), s));
        out
    }

    fn analyze(&mut self, id: i64, title: &str) {
        let r = self.call("analyze_project", json!({ "id": id }));
        for l in r["loci"].as_array().into_iter().flatten() {
            for w in l["warnings"].as_array().into_iter().flatten() {
                self.warnings
                    .push(format!("{title}: {}", w.as_str().unwrap_or_default()));
            }
        }
    }

    fn set_params(&self, id: i64, params: &Value) {
        if params.as_object().is_some_and(|o| !o.is_empty()) {
            self.call(
                "update_project_locus_params",
                json!({ "project_id": id, "params": params }),
            );
        }
    }

    fn write(&self, dir: &Path, v: &Value) {
        let name = v["filename"].as_str().expect("export filename");
        std::fs::write(dir.join(name), v["content"].as_str().unwrap_or_default())
            .expect("write export");
    }
}

fn id(v: &Value) -> i64 {
    v["id"]
        .as_i64()
        .or_else(|| v["project"]["id"].as_i64())
        .unwrap_or_else(|| panic!("no id in {v}"))
}

/// Sample ids selected by `samples` (None: every sample) minus `exclude`.
fn select(all: &[(i64, String)], samples: &Option<Vec<String>>, exclude: &[String]) -> Vec<i64> {
    all.iter()
        .filter(|(_, b)| samples.as_ref().is_none_or(|s| matches(s, b)) && !matches(exclude, b))
        .map(|(i, _)| *i)
        .collect()
}

fn main() {
    let cfg_path = PathBuf::from(std::env::args().nth(1).expect("usage: study <config.json>"));
    let cfg: Config =
        serde_json::from_str(&std::fs::read_to_string(&cfg_path).expect("read config"))
            .expect("parse config");
    let base = cfg_path.parent().map(Path::to_path_buf).unwrap_or_default();
    let mut run = Run {
        engine: Engine::new(EngineConfig { state_dir: None }),
        base,
        warnings: Vec::new(),
        timings: Vec::new(),
    };
    let ws = run.path(&cfg.workspace);
    if ws.exists() {
        assert!(cfg.overwrite, "{} exists (set overwrite)", ws.display());
        std::fs::remove_file(&ws).expect("remove old workspace");
    }
    if let Some(dir) = ws.parent() {
        std::fs::create_dir_all(dir).expect("create workspace folder");
    }
    run.call("new_workspace", json!({ "path": ws.to_str() }));
    let exports = run.path(cfg.exports.as_deref().unwrap_or("exports"));
    std::fs::create_dir_all(&exports).expect("create exports folder");

    // Loci, locus set, ladder.
    let created = run.call(
        "import_loci_csv",
        json!({ "path": run.path(&cfg.loci_csv).to_str() }),
    );
    let loci: Vec<(i64, String)> = created["created"]
        .as_array()
        .expect("created loci")
        .iter()
        .map(|l| (id(l), l["label"].as_str().unwrap_or_default().to_string()))
        .collect();
    let set = id(&run.call(
        "create_locus_set",
        json!({ "label": "All loci", "locus_ids": loci.iter().map(|l| l.0).collect::<Vec<_>>() }),
    ));
    let ladder_id = match &cfg.ladder {
        Some(l) => id(&run.call(
            "create_ladder",
            json!({ "label": l.label, "spec": if l.spec.is_null() { json!({}) } else { l.spec.clone() } }),
        )),
        None => run
            .call("list_ladders", Value::Null)
            .as_array()
            .and_then(|a| a.iter().find(|l| l["label"] == "HD ROX 400"))
            .map(id)
            .expect("built-in HD ROX 400"),
    };

    // Plates and plate maps.
    let paths: Vec<String> = cfg
        .plates
        .iter()
        .map(|p| run.path(p).to_string_lossy().into_owned())
        .collect();
    let imported = run.timed("import plates", |r| {
        r.call(
            "import_plates",
            json!({ "paths": paths, "ladder_id": ladder_id }),
        )
    });
    let mut plate_report = Vec::new();
    for o in imported["plates"].as_array().into_iter().flatten() {
        let label = o["label"].as_str().unwrap_or_default().to_string();
        let mut entry = json!({ "label": label, "status": o["status"], "message": o["message"],
                                "sizing": o["sizing"], "plate_id": o["plate_id"] });
        if let (Some(pid), Some(dir)) = (o["plate_id"].as_i64(), &cfg.plate_maps) {
            let map = run.path(dir).join(format!("{label}.csv"));
            if map.exists() {
                let rep = run.call(
                    "apply_plate_map",
                    json!({ "plate_id": pid, "path": map.to_str(), "create_samples": true }),
                );
                let mut rep = rep;
                if let Some(o) = rep.as_object_mut() {
                    o.remove("assignments");
                }
                entry["plate_map"] = rep;
            }
        }
        plate_report.push(entry);
    }

    // Sizing of every well.
    let mut sizing =
        String::from("Plate,Well,Sizing,Quality,Reason,Error,Ladder Peaks (index:size)\n");
    for p in run
        .call("list_plates", Value::Null)
        .as_array()
        .into_iter()
        .flatten()
    {
        let d = run.call("get_plate", json!({ "id": id(p) }));
        for w in d["wells"].as_array().into_iter().flatten() {
            let wd = run.call("get_well", json!({ "id": id(w), "traces": false }));
            let peaks: Vec<String> = wd["ladder_peaks"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|k| format!("{}:{}", k["index"], k["size"]))
                .collect();
            let q = |v: &Value| v.as_str().unwrap_or_default().replace(['"', '\n'], " ");
            sizing.push_str(&format!(
                "{},{},{},{},\"{}\",\"{}\",{}\n",
                d["plate"]["label"].as_str().unwrap_or_default(),
                w["label"].as_str().unwrap_or_default(),
                w["sizing"].as_str().unwrap_or_default(),
                w["sizing_quality"]
                    .as_f64()
                    .map_or(String::new(), |v| format!("{v:.4}")),
                q(&w["sizing_reason"]),
                q(&w["sizing_error"]),
                peaks.join(" ")
            ));
        }
    }
    std::fs::write(exports.join("sizing.csv"), sizing).expect("write sizing");

    // Samples and designations.
    let samples: Vec<(i64, String)> = run
        .call("list_samples", Value::Null)
        .as_array()
        .into_iter()
        .flatten()
        .map(|s| (id(s), s["barcode"].as_str().unwrap_or_default().to_string()))
        .collect();
    for d in &cfg.designations {
        let ids = select(&samples, &Some(vec![d.pattern.clone()]), &[]);
        if !ids.is_empty() {
            run.call(
                "set_samples_designation",
                json!({ "sample_ids": ids, "designation": d.designation }),
            );
        }
    }

    // Estimators.
    let mut projects = Map::new();
    let mut estimator = |run: &mut Run, kind: &str, title: &str, link: Value, s: &SampleSet| {
        let mut p = json!({ "kind": kind, "title": title, "locus_set_id": set });
        if let (Some(o), Some(l)) = (p.as_object_mut(), link.as_object()) {
            o.extend(l.clone());
        }
        let pid = id(&run.call("create_project", p));
        if s.samples.is_some() || !s.exclude.is_empty() {
            let ids = select(&samples, &s.samples, &s.exclude);
            run.call(
                "add_project_samples",
                json!({ "id": pid, "sample_ids": ids }),
            );
        }
        run.set_params(pid, &s.params);
        run.timed(&format!("analyze {title}"), |r| r.analyze(pid, title));
        projects.insert(title.to_string(), json!(pid));
        pid
    };
    let be = estimator(
        &mut run,
        "bin_estimator",
        "Bins",
        json!({}),
        &cfg.bin_estimator,
    );
    let ae = estimator(
        &mut run,
        "artifact_estimator",
        "Artifacts",
        json!({ "bin_estimator_id": be }),
        &cfg.artifact_estimator,
    );
    run.write(&exports, &run.call("export_bins", json!({ "id": be })));
    run.write(
        &exports,
        &run.call("export_artifact_equations", json!({ "id": ae })),
    );

    let mut qb = None;
    if let Some(q) = &cfg.quant_bias {
        for (label, alleles) in &q.controls {
            let mut list = Vec::new();
            for (locus, size) in alleles {
                let Some((lid, _)) = loci.iter().find(|(_, l)| l == locus) else {
                    panic!("control {label}: unknown locus {locus}");
                };
                let bins = run.call(
                    "get_locus_bins",
                    json!({ "project_id": be, "locus_id": lid }),
                );
                let near = bins["bins"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .map(|b| {
                        (
                            id(b),
                            (b["base_size"].as_f64().unwrap_or(f64::NAN) - size).abs(),
                        )
                    })
                    .filter(|(_, d)| *d < 1.5)
                    .min_by(|a, b| a.1.total_cmp(&b.1));
                if let Some((bin, _)) = near {
                    list.push(json!({ "locus_id": lid, "bin_id": bin }));
                } else {
                    run.warnings.push(format!(
                        "control {label}: no bin within 1.5 bp of {size} at {locus}"
                    ));
                }
            }
            run.call(
                "create_control",
                json!({ "bin_estimator_id": be, "label": label, "alleles": list }),
            );
        }
        let pid = id(&run.call(
            "create_project",
            json!({ "kind": "quant_bias_estimator", "title": "Bias", "locus_set_id": set,
                    "bin_estimator_id": be, "artifact_estimator_id": ae }),
        ));
        let r = run.call(
            "import_control_mixtures_csv",
            json!({ "id": pid, "path": run.path(&q.mixtures_csv).to_str() }),
        );
        for p in r["problems"].as_array().into_iter().flatten() {
            run.warnings.push(format!("mixtures: {p}"));
        }
        run.set_params(pid, &q.params);
        run.timed("analyze Bias", |r| r.analyze(pid, "Bias"));
        let mut betas = String::from("Locus,Beta,SD,R Squared,Peaks,Mixtures\n");
        for (lid, label) in &loci {
            let v = run.call(
                "get_locus_quant_bias",
                json!({ "project_id": pid, "locus_id": lid }),
            );
            let e = &v["estimate"];
            let num = |k: &str| {
                e[k].as_f64()
                    .map_or("NA".to_string(), |x| format!("{x:.6}"))
            };
            betas.push_str(&format!(
                "{label},{},{},{},{},{}\n",
                num("beta"),
                num("sd"),
                num("r_squared"),
                e["n_peaks"],
                e["n_sets"]
            ));
        }
        std::fs::write(exports.join("quant_bias.csv"), betas).expect("write quant bias");
        let dir = exports.join("Bias");
        std::fs::create_dir_all(&dir).expect("create export folder");
        run.write(
            &dir,
            &run.call(
                "export_peak_data",
                json!({ "id": pid, "allow_stale": true }),
            ),
        );
        projects.insert("Bias".into(), json!(pid));
        qb = Some(pid);
    }

    // Genotyping and its variants.
    let g = &cfg.genotyping;
    let gt = id(&run.call(
        "create_project",
        json!({ "kind": "genotyping", "title": "Genotyping", "locus_set_id": set,
                "bin_estimator_id": be, "artifact_estimator_id": ae, "quant_bias_estimator_id": qb }),
    ));
    run.call(
        "add_project_samples",
        json!({ "id": gt, "sample_ids": select(&samples, &g.samples, &g.exclude) }),
    );
    run.set_params(gt, &g.params);
    let mut gts = vec![(
        "Genotyping".to_string(),
        gt,
        g.probabilities.unwrap_or(true),
    )];
    for v in &cfg.variants {
        let pid = id(&run.call("duplicate_project", json!({ "id": gt, "title": v.title })));
        if v.no_artifact_model {
            run.call(
                "update_project",
                json!({ "id": pid, "artifact_estimator_id": null }),
            );
        } else if v.artifact_params.is_some() || v.artifact_samples.is_some() {
            let title = format!("Artifacts: {}", v.title);
            let a = match &v.artifact_samples {
                Some(globs) => {
                    let a = id(&run.call(
                        "create_project",
                        json!({ "kind": "artifact_estimator", "title": title, "locus_set_id": set,
                                "bin_estimator_id": be }),
                    ));
                    run.call(
                        "add_project_samples",
                        json!({ "id": a, "sample_ids": select(&samples, &Some(globs.clone()), &[]) }),
                    );
                    run.set_params(a, &cfg.artifact_estimator.params);
                    a
                }
                None => id(&run.call("duplicate_project", json!({ "id": ae, "title": title }))),
            };
            if let Some(ap) = &v.artifact_params {
                run.set_params(a, ap);
            }
            run.timed(&format!("analyze {title}"), |r| r.analyze(a, &title));
            let dir = exports.join(v.title.replace(['/', '\\', ':'], "_"));
            std::fs::create_dir_all(&dir).expect("create export folder");
            run.write(
                &dir,
                &run.call("export_artifact_equations", json!({ "id": a })),
            );
            projects.insert(title, json!(a));
            run.call(
                "update_project",
                json!({ "id": pid, "artifact_estimator_id": a }),
            );
        }
        if let Some(p) = &v.params {
            run.set_params(pid, p);
        }
        gts.push((
            v.title.clone(),
            pid,
            v.probabilities.unwrap_or(g.probabilities.unwrap_or(true)),
        ));
    }
    for (title, pid, prob) in &gts {
        run.timed(&format!("analyze {title}"), |r| r.analyze(*pid, title));
        if *prob {
            run.timed(&format!("probabilities {title}"), |r| {
                r.call("calculate_peak_probabilities", json!({ "id": pid }))
            });
        }
        let dir = exports.join(title.replace(['/', '\\', ':'], "_"));
        std::fs::create_dir_all(&dir).expect("create export folder");
        for m in [
            "export_alleles_wide",
            "export_alleles_long",
            "export_peak_data",
        ] {
            run.write(
                &dir,
                &run.call(m, json!({ "id": pid, "allow_stale": true })),
            );
        }
        projects.insert(title.clone(), json!(pid));
    }

    let summary = json!({
        "workspace": ws.to_string_lossy(),
        "plates": plate_report,
        "projects": projects,
        "warnings": run.warnings,
        "timings_s": run.timings.iter().map(|(k, v)| json!({ "step": k, "seconds": v })).collect::<Vec<_>>(),
    });
    std::fs::write(
        exports.join("summary.json"),
        serde_json::to_string_pretty(&summary).unwrap_or_default(),
    )
    .expect("write summary");
    run.engine.close_workspace();
    eprintln!(
        "saved {} and exports in {}",
        ws.display(),
        exports.display()
    );
}

#[cfg(test)]
mod tests {
    use super::glob;

    #[test]
    fn glob_matches() {
        assert!(glob("*-ss*", "X-SS4"));
        assert!(glob("a?c", "ABC"));
        assert!(!glob("*NTC", "NTC-1"));
        assert!(glob("*", ""));
    }
}
