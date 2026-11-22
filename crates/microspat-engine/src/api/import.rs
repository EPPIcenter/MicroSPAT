//! Plate import: zip archives of FSA files, directories of FSA files, and
//! loose `.fsa` files, in any mix.
//!
//! Two passes keep memory bounded however many plates are selected:
//!
//! 1. **Scan.** Every file is read and parsed (in parallel) only to learn its
//!    plate name, well, and content hash; the parsed data is dropped. Files
//!    are grouped into plates by (where they came from, plate name recorded in
//!    the file): a zip or a directory holding two plates yields two plates,
//!    and loose files are grouped by plate name alone.
//! 2. **Import, one plate at a time.** Duplicate check (same plate hash, or
//!    any well's FSA already in the workspace), then re-read and parse the
//!    plate's files, fit every well's ladder and compute signal summaries and
//!    compressed traces in parallel, and write the plate in one short
//!    transaction. A `changed: plates` event goes out per imported plate.
//!
//! Each plate gets an outcome (imported, duplicate, failed with a reason); one
//! bad plate never stops the others.

use super::plates::{plate_summaries, SizingCounts, StoredFit};
use super::{color_str, some_of};
use crate::codec;
use crate::error::{io_err, Result, RpcError};
use crate::events::entity::{LADDERS, PLATES};
use crate::rpc::Registry;
use crate::sizing;
use crate::tasks::{Progress, Scaled};
use crate::Engine;
use microspat_core::abif::{self, Fsa};
use microspat_core::ladder::{self, LadderFit, LadderSpec};
use microspat_core::plate::{PlateSize, Well};
use rayon::prelude::*;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};
use ts_rs::TS;

/// Directory levels searched below a chosen directory.
const MAX_DIR_DEPTH: usize = 4;

/// Params of `import_plates`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct ImportPlatesParams {
    /// Zip files, directories, and `.fsa` files, in any mix.
    pub paths: Vec<String>,
    /// Ladder to size every well with.
    pub ladder_id: i64,
}

/// Outcome of one plate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum ImportStatus {
    Imported,
    /// Already in the workspace; nothing was changed.
    Duplicate,
    Failed,
}

/// What happened to one plate (or to a file that could not be assigned to a plate).
#[derive(Debug, Clone, Serialize, TS)]
pub struct PlateImportOutcome {
    /// Plate name from the files (or the file name when unknown).
    pub label: String,
    /// The zip, directory, or files it came from.
    pub source: String,
    pub status: ImportStatus,
    pub plate_id: Option<i64>,
    pub well_count: u32,
    /// Sizing summary of an imported plate.
    pub sizing: Option<SizingCounts>,
    /// Why it was not imported, or notes.
    pub message: Option<String>,
    /// Issue counts of an imported plate's quality report.
    pub quality: Option<crate::quality::QualitySummary>,
}

/// Result of `import_plates`.
#[derive(Debug, Clone, Serialize, TS)]
pub struct ImportPlatesResult {
    pub plates: Vec<PlateImportOutcome>,
}

pub(crate) fn register(r: &mut Registry) {
    r.task(
        "import_plates",
        &[PLATES, LADDERS],
        "Import plates from zip archives, directories, and loose .fsa files (grouped by the plate name in the files), \
         sizing every well with the chosen ladder. Runs as a task; returns one outcome per plate.",
        import_plates,
    );
}

fn import_plates(e: &Engine, p: ImportPlatesParams) -> Result<ImportPlatesResult> {
    if p.paths.is_empty() {
        return Err(RpcError::invalid(
            "Choose at least one zip, folder, or .fsa file.",
        ));
    }
    let ws = e.workspace()?;
    ws.read(|c| super::ladders::load(c, p.ladder_id))?;
    let label = if p.paths.len() == 1 {
        format!("Importing {}", file_name(Path::new(&p.paths[0])))
    } else {
        format!("Importing {} items", p.paths.len())
    };
    let paths: Vec<PathBuf> = p.paths.iter().map(PathBuf::from).collect();
    let ladder_id = p.ladder_id;
    e.run_task("import_plates", label, move |task| {
        let plates = import_paths(task.engine(), &paths, ladder_id, task)?;
        Ok(ImportPlatesResult { plates })
    })
}

/// Where a file's bytes come from.
#[derive(Debug, Clone)]
enum FileRef {
    Path(PathBuf),
    ZipEntry {
        zip: PathBuf,
        index: usize,
        name: String,
    },
}

impl FileRef {
    fn display(&self) -> String {
        match self {
            FileRef::Path(p) => file_name(p),
            FileRef::ZipEntry { name, .. } => name.clone(),
        }
    }
}

/// What the scan learns about one file.
struct FileMeta {
    file: FileRef,
    /// Zip or directory chosen by the user; None for loose files.
    scope: Option<PathBuf>,
    plate_label: Option<String>,
    well: Option<String>,
    hash: String,
}

fn file_name(p: &Path) -> String {
    p.file_name().map_or_else(
        || p.display().to_string(),
        |n| n.to_string_lossy().into_owned(),
    )
}

fn file_stem(p: &Path) -> String {
    p.file_stem()
        .map_or_else(|| file_name(p), |n| n.to_string_lossy().into_owned())
}

fn is_fsa_name(name: &str) -> bool {
    let base = name.rsplit(['/', '\\']).next().unwrap_or(name);
    !base.starts_with('.')
        && !name.contains("__MACOSX")
        && base.to_ascii_lowercase().ends_with(".fsa")
}

fn is_zip(p: &Path) -> bool {
    p.extension().is_some_and(|e| e.eq_ignore_ascii_case("zip"))
}

fn walk_dir(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    let mut entries: Vec<_> = std::fs::read_dir(dir)?.collect::<std::io::Result<_>>()?;
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let path = entry.path();
        if path.is_dir() {
            if depth < MAX_DIR_DEPTH {
                walk_dir(&path, depth + 1, out)?;
            }
        } else if is_fsa_name(&path.to_string_lossy()) {
            out.push(path);
        }
    }
    Ok(())
}

fn meta_of(
    file: FileRef,
    scope: Option<PathBuf>,
    bytes: &[u8],
) -> std::result::Result<FileMeta, String> {
    let fsa = abif::parse_fsa(bytes).map_err(|e| format!("{}: {e}", file.display()))?;
    Ok(FileMeta {
        plate_label: fsa.plate_label().map(str::to_string),
        well: fsa.well.clone(),
        hash: fsa.content_hash,
        file,
        scope,
    })
}

fn open_zip(path: &Path) -> std::result::Result<zip::ZipArchive<std::fs::File>, String> {
    let f = std::fs::File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    zip::ZipArchive::new(f)
        .map_err(|e| format!("{} is not a readable zip archive: {e}", file_name(path)))
}

/// Upper bound on a single `.fsa` file read from a zip archive (guards against corrupt headers / zip bombs).
const MAX_FSA_BYTES: u64 = 64 * 1024 * 1024;

fn read_zip_entry(
    z: &mut zip::ZipArchive<std::fs::File>,
    index: usize,
) -> std::result::Result<Vec<u8>, String> {
    let mut entry = z.by_index(index).map_err(|e| e.to_string())?;
    let name = entry.name().map(|n| n.to_string()).unwrap_or_default();
    let cap = entry.size().min(MAX_FSA_BYTES) as usize;
    let mut buf = Vec::with_capacity(cap);
    (&mut entry)
        .take(MAX_FSA_BYTES + 1)
        .read_to_end(&mut buf)
        .map_err(|e| format!("{name}: {e}"))?;
    if buf.len() as u64 > MAX_FSA_BYTES {
        return Err(format!("{name}: exceeds the 64 MiB single-file limit"));
    }
    Ok(buf)
}

/// Pass 1: parse every file for its plate, well and hash. Failures are per file.
fn scan(paths: &[PathBuf], progress: &dyn Progress) -> (Vec<FileMeta>, Vec<PlateImportOutcome>) {
    let mut metas = Vec::new();
    let mut failures = Vec::new();
    let fail = |label: String, source: String, msg: String| PlateImportOutcome {
        label,
        source,
        status: ImportStatus::Failed,
        plate_id: None,
        well_count: 0,
        sizing: None,
        message: Some(msg),
        quality: None,
    };
    let mut loose = Vec::new();
    for (k, path) in paths.iter().enumerate() {
        progress.report(
            k as f64 / paths.len() as f64,
            &format!("Reading {}", file_name(path)),
        );
        if path.is_dir() {
            let mut files = Vec::new();
            if let Err(e) = walk_dir(path, 0, &mut files) {
                failures.push(fail(
                    file_name(path),
                    path.display().to_string(),
                    e.to_string(),
                ));
                continue;
            }
            if files.is_empty() {
                failures.push(fail(
                    file_name(path),
                    path.display().to_string(),
                    "the folder contains no .fsa files".into(),
                ));
                continue;
            }
            let scanned: Vec<_> = files
                .into_par_iter()
                .map(|f| {
                    std::fs::read(&f)
                        .map_err(|e| format!("{}: {e}", f.display()))
                        .and_then(|b| meta_of(FileRef::Path(f.clone()), Some(path.clone()), &b))
                })
                .collect();
            collect_scanned(scanned, path, &mut metas, &mut failures);
        } else if is_zip(path) {
            let entries: std::result::Result<Vec<(usize, String, Vec<u8>)>, String> =
                open_zip(path).and_then(|mut z| {
                    let mut out = Vec::new();
                    for i in 0..z.len() {
                        let name = z
                            .by_index(i)
                            .map_err(|e| e.to_string())?
                            .name()
                            .map_err(|e| e.to_string())?
                            .to_string();
                        if is_fsa_name(&name) {
                            out.push((i, name, read_zip_entry(&mut z, i)?));
                        }
                    }
                    Ok(out)
                });
            match entries {
                Err(e) => failures.push(fail(file_name(path), path.display().to_string(), e)),
                Ok(entries) if entries.is_empty() => failures.push(fail(
                    file_name(path),
                    path.display().to_string(),
                    "the zip contains no .fsa files".into(),
                )),
                Ok(entries) => {
                    let scanned: Vec<_> = entries
                        .into_par_iter()
                        .map(|(index, name, bytes)| {
                            meta_of(
                                FileRef::ZipEntry {
                                    zip: path.clone(),
                                    index,
                                    name,
                                },
                                Some(path.clone()),
                                &bytes,
                            )
                        })
                        .collect();
                    collect_scanned(scanned, path, &mut metas, &mut failures);
                }
            }
        } else if path.is_file() {
            loose.push(path.clone());
        } else {
            failures.push(fail(
                file_name(path),
                path.display().to_string(),
                "file not found".into(),
            ));
        }
    }
    let scanned: Vec<_> = loose
        .par_iter()
        .map(|f| {
            std::fs::read(f)
                .map_err(|e| format!("{}: {e}", f.display()))
                .and_then(|b| meta_of(FileRef::Path(f.clone()), None, &b))
                .map_err(|e| (f.clone(), e))
        })
        .collect();
    for s in scanned {
        match s {
            Ok(m) => metas.push(m),
            Err((f, e)) => failures.push(fail(
                file_name(&f),
                f.display().to_string(),
                format!("not a readable FSA file ({e})"),
            )),
        }
    }
    (metas, failures)
}

/// Files of a zip or folder: any unreadable file fails that whole source, so a
/// plate is never silently imported with wells missing.
fn collect_scanned(
    scanned: Vec<std::result::Result<FileMeta, String>>,
    source: &Path,
    metas: &mut Vec<FileMeta>,
    failures: &mut Vec<PlateImportOutcome>,
) {
    let (ok, bad): (Vec<_>, Vec<_>) = scanned.into_iter().partition(|r| r.is_ok());
    if bad.is_empty() {
        metas.extend(ok.into_iter().flatten());
    } else {
        let errors: Vec<String> = bad.into_iter().filter_map(|r| r.err()).collect();
        failures.push(PlateImportOutcome {
            label: file_name(source),
            source: source.display().to_string(),
            status: ImportStatus::Failed,
            plate_id: None,
            well_count: 0,
            sizing: None,
            message: Some(format!(
                "{} file(s) could not be read: {}",
                errors.len(),
                some_of(&errors, 3)
            )),
            quality: None,
        });
    }
}

/// (zip or folder the files came from, plate name).
type GroupKey = (Option<PathBuf>, String);

/// A plate's worth of files.
struct Group {
    label: String,
    source: String,
    files: Vec<FileMeta>,
}

fn group(metas: Vec<FileMeta>, failures: &mut Vec<PlateImportOutcome>) -> Vec<Group> {
    // In the order the files were chosen, so outcomes read like the selection.
    let mut groups: Vec<(GroupKey, Vec<FileMeta>)> = Vec::new();
    for m in metas {
        let label = match (&m.plate_label, &m.scope) {
            (Some(l), _) => l.clone(),
            (None, Some(scope)) => file_stem(scope),
            (None, None) => {
                failures.push(PlateImportOutcome {
                    label: m.file.display(),
                    source: m.file.display(),
                    status: ImportStatus::Failed,
                    plate_id: None,
                    well_count: 0,
                    sizing: None,
                    message: Some("the file records no plate name; put it in a zip or folder with the rest of its plate".into()),
                    quality: None,
                });
                continue;
            }
        };
        let key = (m.scope.clone(), label);
        match groups.iter_mut().find(|(k, _)| *k == key) {
            Some((_, files)) => files.push(m),
            None => groups.push((key, vec![m])),
        }
    }
    groups
        .into_iter()
        .map(|((scope, label), files)| {
            let source = match &scope {
                Some(s) => file_name(s),
                None if files.len() == 1 => files[0].file.display(),
                None => format!("{} files", files.len()),
            };
            Group {
                label,
                source,
                files,
            }
        })
        .collect()
}

/// Imports everything under `paths` with the given ladder; one outcome per plate.
pub(crate) fn import_paths(
    e: &Engine,
    paths: &[PathBuf],
    ladder_id: i64,
    progress: &dyn Progress,
) -> Result<Vec<PlateImportOutcome>> {
    let ws = e.workspace()?;
    let spec = ws.read(|c| super::ladders::load(c, ladder_id))?.spec;
    let scan_scope = Scaled::new(progress, 0.0, 0.2);
    let (metas, mut outcomes) = scan(paths, &scan_scope);
    let groups = group(metas, &mut outcomes);
    let n = groups.len().max(1);
    let mut imported = Vec::new();
    for (k, g) in groups.into_iter().enumerate() {
        let scope = Scaled::new(progress, 0.2 + 0.8 * k as f64 / n as f64, 0.8 / n as f64);
        scope.report(0.0, &format!("Plate {} ({} of {n})", g.label, k + 1));
        let outcome = import_group(&ws, &g, ladder_id, &spec, &scope).unwrap_or_else(|err| {
            PlateImportOutcome {
                label: g.label.clone(),
                source: g.source.clone(),
                status: ImportStatus::Failed,
                plate_id: None,
                well_count: g.files.len() as u32,
                sizing: None,
                message: Some(err.message),
                quality: None,
            }
        });
        if let Some(id) = outcome.plate_id {
            imported.push(id);
            e.changed(PLATES, Some(vec![id]));
        }
        outcomes.push(outcome);
    }
    if !imported.is_empty() {
        e.changed(LADDERS, Some(vec![ladder_id]));
    }
    progress.report(1.0, "Done");
    Ok(outcomes)
}

/// A well ready to insert.
struct PreparedWell {
    label: String,
    fsa: Fsa,
    fit: StoredFit,
    channel_signals: Vec<Option<i16>>,
    blobs: Vec<Vec<u8>>,
}

fn duplicate_message(c: &Connection, plate_hash: &str, hashes: &[&str]) -> Result<Option<String>> {
    if let Some((label, at)) = c
        .query_row(
            "SELECT label, imported_at FROM plate WHERE content_hash = ?1",
            [plate_hash],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .optional()?
    {
        return Ok(Some(format!(
            "this plate was already imported as \"{label}\" ({})",
            &at[..at.len().min(10)]
        )));
    }
    let mut st = c.prepare(
        "SELECT p.label FROM well w JOIN plate p ON p.id = w.plate_id WHERE w.fsa_hash = ?1",
    )?;
    let mut found = 0;
    let mut plates = std::collections::BTreeSet::new();
    for h in hashes {
        if let Some(label) = st.query_row([h], |r| r.get::<_, String>(0)).optional()? {
            found += 1;
            plates.insert(label);
        }
    }
    if found > 0 {
        let v: Vec<String> = plates.into_iter().collect();
        return Ok(Some(format!(
            "{found} of its {} wells were already imported in plate {}",
            hashes.len(),
            some_of(&v, 3)
        )));
    }
    Ok(None)
}

fn import_group(
    ws: &crate::Workspace,
    g: &Group,
    ladder_id: i64,
    spec: &LadderSpec,
    progress: &dyn Progress,
) -> Result<PlateImportOutcome> {
    let outcome = |status, plate_id, sizing, message: Option<String>| PlateImportOutcome {
        label: g.label.clone(),
        source: g.source.clone(),
        status,
        plate_id,
        well_count: g.files.len() as u32,
        sizing,
        message,
        quality: None,
    };
    // Wells: every file needs a distinct, valid position.
    let mut labels = HashSet::new();
    let mut problems = Vec::new();
    for f in &g.files {
        match f.well.as_deref().map(Well::parse) {
            Some(Ok(w)) if labels.insert(w.label()) => {}
            Some(Ok(w)) => {
                problems.push(format!("well {} appears in more than one file", w.label()))
            }
            Some(Err(e)) => problems.push(format!("{}: {e}", f.file.display())),
            None => problems.push(format!("{} records no well position", f.file.display())),
        }
    }
    if !problems.is_empty() {
        return Ok(outcome(
            ImportStatus::Failed,
            None,
            None,
            Some(some_of(&problems, 3)),
        ));
    }
    let mut hashes: Vec<&str> = g.files.iter().map(|f| f.hash.as_str()).collect();
    hashes.sort_unstable();
    let plate_hash = abif::content_hash(hashes.join("\n").as_bytes());
    if let Some(msg) = ws.read(|c| duplicate_message(c, &plate_hash, &hashes))? {
        return Ok(outcome(ImportStatus::Duplicate, None, None, Some(msg)));
    }

    // Re-read and parse the plate's files.
    progress.report(0.1, &format!("Reading {}", g.label));
    let bytes = read_group(g).map_err(RpcError::io)?;
    progress.report(0.3, &format!("Sizing {}", g.label));
    let parsed: Vec<(String, Fsa, std::result::Result<LadderFit, String>)> = bytes
        .into_par_iter()
        .map(|(name, b)| {
            let fsa = abif::parse_fsa(&b).map_err(|e| RpcError::invalid(format!("{name}: {e}")))?;
            let label = fsa
                .well
                .as_deref()
                .and_then(|w| Well::parse(w).ok())
                .map(Well::label)
                .ok_or_else(|| RpcError::invalid(format!("{name} records no well position")))?;
            let fit = sizing::fit_fsa(&fsa, spec);
            Ok((label, fsa, fit))
        })
        .collect::<Result<_>>()?;
    // Wells the trace alone cannot settle are fitted again against the plate.
    let (wells, mut fits): (Vec<(String, Fsa)>, Vec<_>) =
        parsed.into_iter().map(|(l, f, r)| ((l, f), r)).unzip();
    ladder::resolve_with_plate(spec, &mut fits, |k, prior| {
        sizing::fit_fsa_with_prior(&wells[k].1, spec, Some(prior))
    });
    let prepared: Vec<PreparedWell> = wells
        .into_par_iter()
        .zip(fits)
        .map(|((label, fsa), result)| {
            let fit = StoredFit::from_result(&result);
            let channel_signals = fsa
                .channels
                .iter()
                .map(|c| sizing::sized_max_signal(&c.data, &fit.peak_indices))
                .collect();
            let blobs = fsa
                .channels
                .iter()
                .map(|c| codec::encode(&c.data))
                .collect();
            PreparedWell {
                label,
                fsa,
                fit,
                channel_signals,
                blobs,
            }
        })
        .collect();
    let size = plate_size(&prepared)?;
    progress.report(0.7, &format!("Checking {}", g.label));
    let report = {
        let limits = ws.read(crate::db::quality_limits)?;
        let wells: Vec<crate::quality::QualityWell<'_>> = prepared
            .iter()
            .map(|w| crate::quality::QualityWell {
                label: &w.label,
                dyes: w
                    .fsa
                    .channels
                    .iter()
                    .map(|c| (c.color, c.data.as_slice()))
                    .collect(),
                fit: &w.fit,
                offscale: &w.fsa.offscale_indices,
            })
            .collect();
        // A new plate has no plate map, so no negative controls yet.
        crate::quality::assess(&wells, spec, size, None, limits)
    };
    let quality = crate::quality::QualitySummary::of(&report);
    progress.report(0.8, &format!("Saving {}", g.label));
    let first = prepared
        .iter()
        .min_by_key(|w| super::plates::well_order_key(&w.label))
        .ok_or_else(|| RpcError::invalid("the plate has no wells"))?;
    let run_date = prepared
        .iter()
        .filter_map(|w| w.fsa.run_start)
        .min()
        .map(|d| d.iso8601());
    let rt = &first.fsa.run_traces;
    let plate_id = ws.write(|tx| {
        // Another import may have committed the same plate since the check.
        if let Some(msg) = duplicate_message(tx, &plate_hash, &hashes)? {
            return Err(RpcError::conflict(msg));
        }
        tx.execute(
            "INSERT INTO plate (label, content_hash, run_date, instrument, instrument_model, plate_size, ladder_id,
                                source, voltage, current, power, temperature)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                g.label,
                plate_hash,
                run_date,
                first.fsa.instrument_name,
                first.fsa.instrument_model,
                size.wells(),
                ladder_id,
                g.source,
                codec::encode(&rt.voltage),
                codec::encode(&rt.current),
                codec::encode(&rt.power),
                codec::encode(&rt.temperature),
            ],
        )?;
        let plate_id = tx.last_insert_rowid();
        let mut ins_well = tx.prepare(
            "INSERT INTO well (plate_id, label, sample_name, fsa_hash, trace_len, ladder_peak_indices,
                               ladder_peak_sizes, sizing_quality, sizing_error, offscale_indices)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        )?;
        let mut ins_ch = tx.prepare(
            "INSERT INTO channel (well_id, dye_number, color, dye_name, wavelength, max_signal)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )?;
        let mut ins_trace = tx.prepare("INSERT INTO trace (channel_id, data) VALUES (?1, ?2)")?;
        for w in &prepared {
            let len = w.fsa.channels.iter().map(|c| c.data.len()).max().unwrap_or(0);
            ins_well.execute(params![
                plate_id,
                w.label,
                w.fsa.sample_name,
                w.fsa.content_hash,
                len as i64,
                serde_json::to_string(&w.fit.peak_indices)?,
                serde_json::to_string(&w.fit.peak_sizes)?,
                w.fit.quality,
                w.fit.error,
                serde_json::to_string(&w.fsa.offscale_indices)?,
            ])?;
            let well_id = tx.last_insert_rowid();
            for ((c, signal), blob) in w.fsa.channels.iter().zip(&w.channel_signals).zip(&w.blobs) {
                ins_ch.execute(params![
                    well_id,
                    c.dye_number,
                    color_str(c.color),
                    c.dye_name,
                    c.wavelength,
                    signal.map(i32::from)
                ])?;
                ins_trace.execute(params![tx.last_insert_rowid(), blob])?;
            }
        }
        crate::quality::store(tx, plate_id, &report)?;
        Ok(plate_id)
    });
    let plate_id = match plate_id {
        Ok(id) => id,
        Err(e) if e.code == crate::ErrorCode::Conflict => {
            return Ok(outcome(
                ImportStatus::Duplicate,
                None,
                None,
                Some(e.message),
            ));
        }
        Err(e) => return Err(e),
    };
    let summary = ws.read(|c| plate_summaries(c, Some(plate_id)))?.pop();
    let notes = summary.as_ref().and_then(|s| {
        let bad = s.sizing.failed + s.sizing.unusable;
        (bad > 0).then(|| format!("{bad} well(s) could not be sized"))
    });
    Ok(PlateImportOutcome {
        quality: Some(quality),
        ..outcome(
            ImportStatus::Imported,
            Some(plate_id),
            summary.map(|s| s.sizing),
            notes,
        )
    })
}

fn read_group(g: &Group) -> std::result::Result<Vec<(String, Vec<u8>)>, String> {
    let mut out = Vec::with_capacity(g.files.len());
    let mut zips: BTreeMap<PathBuf, zip::ZipArchive<std::fs::File>> = BTreeMap::new();
    for f in &g.files {
        match &f.file {
            FileRef::Path(p) => out.push((
                file_name(p),
                std::fs::read(p).map_err(|e| io_err(p, e).message)?,
            )),
            FileRef::ZipEntry { zip, index, name } => {
                if !zips.contains_key(zip) {
                    zips.insert(zip.clone(), open_zip(zip)?);
                }
                let z = zips.get_mut(zip).ok_or("zip vanished")?;
                out.push((name.clone(), read_zip_entry(z, *index)?));
            }
        }
    }
    Ok(out)
}

fn plate_size(wells: &[PreparedWell]) -> Result<PlateSize> {
    let recorded = wells.iter().find_map(|w| w.fsa.plate_size);
    let needs_384 = wells
        .iter()
        .filter_map(|w| Well::parse(&w.label).ok())
        .any(|w| w.row >= 8 || w.column >= 12);
    let size = match recorded.and_then(|n| PlateSize::from_wells(n).ok()) {
        Some(PlateSize::W96) if needs_384 => PlateSize::W384,
        Some(s) => s,
        None if needs_384 => PlateSize::W384,
        None => PlateSize::W96,
    };
    if wells.len() > size.wells() as usize {
        return Err(RpcError::invalid(format!(
            "{} wells do not fit a {}-well plate",
            wells.len(),
            size.wells()
        )));
    }
    Ok(size)
}
