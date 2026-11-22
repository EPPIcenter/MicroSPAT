//! Demo data: a synthetic study imported through the normal paths, so every
//! screen has something to show. Plate 1 arrives as a zip, plate 2 as a
//! folder, plate 3 as loose files, exercising every import route.
//!
//! On top of the plates it builds a complete, analyzed study: a bin
//! estimator and an artifact estimator over every sample, three lab-strain
//! controls, a quantification-bias estimator from two-strain control
//! mixtures of known proportions (plate 3, wells A01–C04), and a genotyping
//! project with peak probabilities computed. Samples carry 1–4 clones with
//! minor clones down to 5% of the major; plate 1 also holds four showcase
//! samples (`D1-SHOW-*`) with minor alleles one or two repeats below a major
//! allele, where only the artifact model tells them from stutter.

use super::import::{import_paths, ImportStatus, PlateImportOutcome};
use super::loci::{
    create_inner as create_locus, create_set_inner, CreateLocusParams, CreateLocusSetParams,
};
use crate::error::{io_err, Result, RpcError};
use crate::events::entity::{LADDERS, LOCI, LOCUS_SETS, SAMPLES};
use crate::projects::analysis::{analyze_locus, load_bins};
use crate::tasks::{Progress, Scaled};
use crate::Engine;
use microspat_core::synth::{generate_plate, FixedWell, SynthClone, SynthSpec, SynthWell};
use rusqlite::OptionalExtension;
use serde::Serialize;
use serde_json::json;
use std::io::Write;
use std::path::{Path, PathBuf};
use ts_rs::TS;

/// Name of the demo locus set.
pub const DEMO_LOCUS_SET: &str = "Demo panel";
const PLATES: [u64; 3] = [101, 102, 103];
/// Title of the demo genotyping project (its presence means the projects exist).
pub const DEMO_GENOTYPING: &str = "Demo genotyping";
/// Lab strains of the control mixtures, with the index of their allele in
/// each locus's pool.
pub const DEMO_STRAINS: [(&str, usize); 3] = [("3D7", 0), ("HB3", 2), ("DD2", 4)];

/// Two-strain control mixtures: (strain a, strain b, proportion of a).
/// Proportions outside 0.25–0.75 (0.9/0.1) are shown but not used for β.
pub fn demo_mixtures() -> Vec<(usize, usize, f64)> {
    let mut v = Vec::new();
    for (a, b) in [(0, 1), (0, 2), (1, 2)] {
        for p in [0.7, 0.5, 0.3, 0.9] {
            v.push((a, b, p));
        }
    }
    v
}

fn mixture_name(a: usize, b: usize, p: f64) -> String {
    format!(
        "MIX-{}-{}-{:02}",
        DEMO_STRAINS[a].0,
        DEMO_STRAINS[b].0,
        (p * 100.0).round() as u32
    )
}

/// Well of DEMO-2 whose capillary has unseparated dyes.
pub const DEMO_FAULT_WELL: &str = "F06";

/// The synthetic plate specs of the demo, with control mixtures and showcase wells.
pub fn demo_specs() -> Vec<SynthSpec> {
    PLATES
        .iter()
        .enumerate()
        .map(|(k, &seed)| {
            let mut spec = SynthSpec {
                plate_name: format!("DEMO-{}", k + 1),
                ..SynthSpec::demo(seed)
            };
            let pool = |l: usize, i: usize| spec.loci[l].alleles[i];
            if k == 0 {
                // A minor clone whose allele sits one repeat (PfY1) or two
                // repeats (the others) below the major clone's: exactly on its
                // stutter. Indices into each locus's allele pool.
                let n = spec.loci.len();
                let shows: [(f64, [usize; 6], f64, [usize; 6]); 4] = [
                    (0.88, [1, 2, 1, 1, 1, 2], 0.12, [0, 1, 0, 0, 0, 1]),
                    (0.88, [4, 4, 3, 5, 3, 4], 0.12, [3, 3, 2, 4, 2, 3]),
                    (0.85, [5, 2, 1, 1, 3, 1], 0.15, [4, 1, 0, 0, 2, 0]),
                    (0.90, [1, 4, 3, 5, 1, 2], 0.10, [0, 3, 2, 4, 0, 1]),
                ];
                for (i, (pa, a, pb, b)) in shows.iter().enumerate() {
                    let take = |idx: &[usize; 6]| {
                        (0..n)
                            .map(|l| pool(l, idx[l].min(spec.loci[l].alleles.len() - 1)))
                            .collect()
                    };
                    spec.fixed_wells.push(FixedWell {
                        well: format!("D{:02}", i + 1),
                        sample_name: format!("SHOW-{}", i + 1),
                        clones: vec![
                            SynthClone {
                                proportion: *pa,
                                alleles: take(a),
                            },
                            SynthClone {
                                proportion: *pb,
                                alleles: take(b),
                            },
                        ],
                    });
                }
            }
            if k == 1 {
                // One capillary whose dyes are not separated, so the plate's
                // quality report has a problem to show. Its blue alleles
                // copy into green outside every green locus, so no call
                // changes but that well's spectral flag.
                spec.spectral_fault_wells = vec![DEMO_FAULT_WELL.into()];
            }
            if k == 2 {
                for (i, &(a, b, p)) in demo_mixtures().iter().enumerate() {
                    let strain = |s: usize| -> Vec<f64> {
                        (0..spec.loci.len())
                            .map(|l| pool(l, DEMO_STRAINS[s].1))
                            .collect()
                    };
                    spec.fixed_wells.push(FixedWell {
                        well: format!("{}{:02}", ['A', 'B', 'C'][i / 4], i % 4 + 1),
                        sample_name: mixture_name(a, b, p),
                        clones: vec![
                            SynthClone {
                                proportion: p,
                                alleles: strain(a),
                            },
                            SynthClone {
                                proportion: 1.0 - p,
                                alleles: strain(b),
                            },
                        ],
                    });
                }
            }
            spec
        })
        .collect()
}

/// Result of `load_demo_data`.
#[derive(Debug, Clone, Serialize, TS)]
pub struct DemoResult {
    pub plates: Vec<PlateImportOutcome>,
    pub locus_set_id: i64,
    pub samples_created: u32,
}

/// Barcode of a demo well: plate number + synthetic sample name (`D1-S001`, `D1-NTC-H12`).
fn barcode(plate: usize, w: &SynthWell) -> String {
    format!("D{}-{}", plate + 1, w.truth.sample_name)
}

/// The plate map of a synthetic plate: every well carries every locus.
pub fn demo_plate_map(plate: usize, spec: &SynthSpec, wells: &[SynthWell]) -> String {
    let mut out = String::from("Well");
    for l in &spec.loci {
        out.push(',');
        out.push_str(&l.label);
    }
    out.push('\n');
    for w in wells {
        out.push_str(&w.well);
        for _ in &spec.loci {
            out.push(',');
            out.push_str(&barcode(plate, w));
        }
        out.push('\n');
    }
    out
}

/// Writes a plate's FSA files into a zip.
pub fn write_zip(path: &Path, wells: &[SynthWell]) -> Result<()> {
    let f = std::fs::File::create(path).map_err(|e| io_err(path, e))?;
    let mut z = zip::ZipWriter::new(f);
    let opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    for w in wells {
        z.start_file(format!("{}.fsa", w.well), opts)
            .map_err(|e| RpcError::io(e.to_string()))?;
        z.write_all(&w.fsa).map_err(|e| io_err(path, e))?;
    }
    z.finish().map_err(|e| RpcError::io(e.to_string()))?;
    Ok(())
}

/// Writes a plate's FSA files into a directory.
pub fn write_dir(dir: &Path, wells: &[SynthWell]) -> Result<Vec<PathBuf>> {
    std::fs::create_dir_all(dir).map_err(|e| io_err(dir, e))?;
    wells
        .iter()
        .map(|w| {
            let p = dir.join(format!("{}.fsa", w.well));
            std::fs::write(&p, &w.fsa).map_err(|e| io_err(&p, e))?;
            Ok(p)
        })
        .collect()
}

pub(crate) fn load_demo_data(e: &Engine, _: ()) -> Result<DemoResult> {
    e.workspace()?;
    e.run_task("load_demo_data", "Loading demo data", |task| {
        let e = task.engine();
        let ws = e.workspace()?;
        task.report(0.0, "Generating plates");
        let specs = demo_specs();
        let plates: Vec<Vec<SynthWell>> = specs
            .iter()
            .map(|s| generate_plate(s).map_err(|err| RpcError::internal(err.to_string())))
            .collect::<Result<_>>()?;

        // Ladder, loci and locus set, reusing what exists.
        let (ladder_id, set_id) = ws.write(|tx| {
            let ladder_id = match tx
                .query_row("SELECT id FROM ladder WHERE label = ?1", [super::ladders::DEFAULT_LADDER], |r| r.get(0))
                .optional()?
            {
                Some(id) => id,
                None => {
                    let (label, spec) = super::ladders::standard_ladders().remove(0);
                    tx.execute(
                        "INSERT INTO ladder (label, spec) VALUES (?1, ?2)",
                        rusqlite::params![label, serde_json::to_string(&spec)?],
                    )?;
                    tx.last_insert_rowid()
                }
            };
            let existing = super::loci::load_all(tx)?;
            let mut ids = Vec::new();
            for l in &specs[0].loci {
                match existing.iter().find(|x| x.label.eq_ignore_ascii_case(&l.label)) {
                    Some(x) if x.color == l.color => ids.push(x.id),
                    Some(_) => {
                        return Err(RpcError::conflict(format!(
                            "A locus named {} already exists on a different dye; rename it to load the demo.",
                            l.label
                        )))
                    }
                    None => {
                        let created = create_locus(
                            tx,
                            &CreateLocusParams {
                                label: l.label.clone(),
                                color: l.color,
                                min_base_length: l.min_size,
                                max_base_length: l.max_size,
                                nucleotide_repeat_length: l.repeat_length,
                            },
                        )?;
                        ids.push(created.id);
                    }
                }
            }
            let set_id = match tx
                .query_row("SELECT id FROM locus_set WHERE label = ?1", [DEMO_LOCUS_SET], |r| r.get(0))
                .optional()?
            {
                Some(id) => id,
                None => {
                    create_set_inner(
                        tx,
                        &CreateLocusSetParams {
                            label: DEMO_LOCUS_SET.into(),
                            locus_ids: ids,
                        },
                    )?
                    .id
                }
            };
            Ok((ladder_id, set_id))
        })?;
        e.changed(LADDERS, None);
        e.changed(LOCI, None);
        e.changed(LOCUS_SETS, None);

        // Stage the files the way a user would hand them over.
        task.report(0.05, "Writing files");
        let dir = tempfile::Builder::new()
            .prefix("microspat-demo-")
            .tempdir()
            .map_err(|err| RpcError::io(err.to_string()))?;
        let mut paths = Vec::new();
        let zip = dir.path().join("DEMO-1.zip");
        write_zip(&zip, &plates[0])?;
        paths.push(zip);
        let folder = dir.path().join("DEMO-2");
        write_dir(&folder, &plates[1])?;
        paths.push(folder);
        paths.extend(write_dir(&dir.path().join("loose"), &plates[2])?);

        let outcomes = import_paths(e, &paths, ladder_id, &Scaled::new(task, 0.1, 0.75))?;

        task.report(0.85, "Applying plate maps");
        let mut samples_created = 0;
        for o in &outcomes {
            let Some(k) = specs.iter().position(|s| s.plate_name == o.label) else { continue };
            let Some(plate_id) = o.plate_id.filter(|_| o.status == ImportStatus::Imported) else { continue };
            let map = demo_plate_map(k, &specs[k], &plates[k]);
            let report = ws.write(|tx| super::plate_map::apply_inner(tx, plate_id, &map, true, false))?;
            if !report.problems.is_empty() {
                return Err(RpcError::internal(format!("Demo plate map failed: {}", report.problems.join("; "))));
            }
            samples_created += report.created_samples.len() as u32;
            crate::quality::refresh_controls(&ws, &[plate_id])?;
            e.changed(crate::events::entity::PLATES, Some(vec![plate_id]));
        }
        e.changed(SAMPLES, None);
        e.changed(LOCI, None);
        demo_projects(e, set_id, &Scaled::new(task, 0.88, 0.12))?;
        task.report(1.0, "Done");
        Ok(DemoResult {
            plates: outcomes,
            locus_set_id: set_id,
            samples_created,
        })
    })
}

/// Builds and analyzes the demo projects (once per workspace).
fn demo_projects(e: &Engine, set_id: i64, progress: &dyn Progress) -> Result<()> {
    let ws = e.workspace()?;
    let exists: Option<i64> = ws.read(|c| {
        Ok(c.query_row(
            "SELECT id FROM project WHERE kind = 'genotyping' AND title = ?1",
            [DEMO_GENOTYPING],
            |r| r.get(0),
        )
        .optional()?)
    })?;
    if exists.is_some() {
        return Ok(());
    }
    let call = |m: &str, p: serde_json::Value| e.dispatch(m, p);
    let id_of = |v: &serde_json::Value| -> Result<i64> {
        v["project"]["id"]
            .as_i64()
            .or_else(|| v["id"].as_i64())
            .ok_or_else(|| RpcError::internal("demo: missing id"))
    };
    let loci: Vec<(i64, String)> = ws.read(|c| {
        Ok(super::loci::load_set(c, set_id)?
            .loci
            .into_iter()
            .map(|l| (l.id, l.label))
            .collect())
    })?;
    let mut done = 0usize;
    let steps = loci.len() * 4 + 1;
    let mut run = |pid: i64, what: &str| -> Result<()> {
        for (lid, label) in &loci {
            progress.report(done as f64 / steps as f64, &format!("{what}: {label}"));
            analyze_locus(e, pid, *lid)?;
            done += 1;
        }
        e.changed(crate::events::entity::PROJECTS, Some(vec![pid]));
        Ok(())
    };
    let be = id_of(&call(
        "create_project",
        json!({ "kind": "bin_estimator", "title": "Demo bins", "locus_set_id": set_id,
                "description": "Allele bins from every demo sample." }),
    )?)?;
    run(be, "Estimating bins")?;
    let ae = id_of(&call(
        "create_project",
        json!({ "kind": "artifact_estimator", "title": "Demo artifacts", "locus_set_id": set_id,
                "bin_estimator_id": be, "description": "Stutter model from mono-allelic runs." }),
    )?)?;
    run(ae, "Estimating artifacts")?;

    // Controls: each strain's allele is the bin nearest its planted size.
    let specs = demo_specs();
    let mut strain_ids = Vec::new();
    for (name, idx) in DEMO_STRAINS {
        let alleles = ws.read(|c| {
            loci.iter()
                .map(|(lid, label)| {
                    let size = specs[0]
                        .loci
                        .iter()
                        .find(|l| &l.label == label)
                        .map_or(0.0, |l| l.alleles[idx]);
                    let bin = load_bins(c, be, *lid)?
                        .into_iter()
                        .min_by(|a, b| {
                            (a.base_size - size)
                                .abs()
                                .total_cmp(&(b.base_size - size).abs())
                        })
                        .filter(|b| (b.base_size - size).abs() < 1.0)
                        .map(|b| b.id);
                    Ok(json!({ "locus_id": lid, "bin_id": bin }))
                })
                .collect::<Result<Vec<_>>>()
        })?;
        let c = call(
            "create_control",
            json!({ "bin_estimator_id": be, "label": name, "alleles": alleles }),
        )?;
        strain_ids.push(id_of(&c)?);
    }
    let qb = id_of(&call(
        "create_project",
        json!({ "kind": "quant_bias_estimator", "title": "Demo bias", "locus_set_id": set_id,
                "bin_estimator_id": be, "artifact_estimator_id": ae,
                "description": "Two-strain control mixtures at 70/30, 50/50, 30/70 and 90/10." }),
    )?)?;
    let samples = ws.read(super::projects::sample_ids_by_barcode)?;
    let mixtures: Vec<serde_json::Value> = demo_mixtures()
        .into_iter()
        .filter_map(|(a, b, p)| {
            let sid = samples.get(&format!("d3-{}", mixture_name(a, b, p)).to_lowercase())?;
            Some(json!({ "sample_id": sid, "components": [
                { "control_id": strain_ids[a], "proportion": p },
                { "control_id": strain_ids[b], "proportion": 1.0 - p } ] }))
        })
        .collect();
    call(
        "set_control_mixtures",
        json!({ "id": qb, "mixtures": mixtures }),
    )?;
    run(qb, "Estimating bias")?;
    let gt = id_of(&call(
        "create_project",
        json!({ "kind": "genotyping", "title": DEMO_GENOTYPING, "locus_set_id": set_id,
                "bin_estimator_id": be, "artifact_estimator_id": ae, "quant_bias_estimator_id": qb,
                "description": "Every demo sample except the control mixtures; NTCs are negative controls." }),
    )?)?;
    let ids: Vec<i64> = samples
        .iter()
        .filter(|(b, _)| b.starts_with('d') && !b.contains("-mix-"))
        .map(|(_, id)| *id)
        .collect();
    call(
        "add_project_samples",
        json!({ "id": gt, "sample_ids": ids }),
    )?;
    run(gt, "Genotyping")?;
    progress.report(0.95, "Calculating peak probabilities");
    super::calls::run_probabilities(e, gt, None)?;
    e.changed(crate::events::entity::PROJECTS, None);
    e.changed(crate::events::entity::CONTROLS, None);
    Ok(())
}
