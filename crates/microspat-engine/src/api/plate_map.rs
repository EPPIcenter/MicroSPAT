//! Plate maps: which sample and locus each well's channels carry.
//!
//! Format (as in the old app): a CSV with a `Well` column and one column per
//! locus label; each cell is a sample barcode, empty for none. Applying a map
//! replaces the plate's previous one. Everything is validated before anything
//! changes; runs whose (channel, locus, sample) are unchanged keep their ids,
//! so analysis attached to them survives re-applying a corrected map.

use super::loci::{load_all as load_loci, Locus};
use super::samples::Designation;
use super::{color_str, header_key, id_list, json_col, some_of, IdParams, TextFile};
use crate::codec;
use crate::error::{OrNotFound, Result, RpcError};
use crate::events::entity::{LOCI, PLATES, SAMPLES};
use crate::rpc::Registry;
use crate::sizing;
use crate::Engine;
use microspat_core::ladder::LadderSpec;
use microspat_core::plate::{PlateSize, Well};
use microspat_core::Color;
use rayon::prelude::*;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use ts_rs::TS;

/// Params of `apply_plate_map`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct ApplyPlateMapParams {
    pub plate_id: i64,
    /// CSV file path (from a picker or an upload)...
    #[serde(default)]
    #[ts(optional)]
    pub path: Option<String>,
    /// ...or the CSV text.
    #[serde(default)]
    #[ts(optional)]
    pub content: Option<String>,
    /// Create samples for unknown barcodes (barcodes containing "NTC" become negative controls).
    #[serde(default)]
    #[ts(optional)]
    pub create_samples: Option<bool>,
    /// Only validate and report; change nothing.
    #[serde(default)]
    #[ts(optional)]
    pub dry_run: Option<bool>,
}

/// What applying a plate map did (or, for a dry run or invalid map, would do).
#[derive(Debug, Clone, Default, Serialize, TS)]
pub struct PlateMapReport {
    /// False for a dry run or when there are problems.
    pub applied: bool,
    /// Everything that prevents applying the map. Empty when it is valid.
    pub problems: Vec<String>,
    /// Barcodes not in the workspace.
    pub unknown_samples: Vec<String>,
    /// Column headers that are not locus labels.
    pub unknown_loci: Vec<String>,
    /// Samples created (or that would be), with their designation.
    pub created_samples: Vec<CreatedSample>,
    /// Runs in the new map.
    pub run_count: u32,
    /// Runs kept from the previous map unchanged.
    pub runs_kept: u32,
    /// Runs of the previous map removed or reassigned.
    pub runs_removed: u32,
    /// Every run the map makes, keeps or removes, in well order then locus
    /// label. A cell that changes sample appears twice: the old run as
    /// `removed`, then the new one as `new`. Cells on wells or channels the plate
    /// lacks are left out (see `problems`).
    /// Always present in engine results (optional only in the type, for
    /// older mocks).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub assignments: Option<Vec<PlateMapAssignment>>,
}

/// What a plate map does to one run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum AssignmentChange {
    /// Not in the previous map.
    New,
    /// Same well, locus and sample as before; the run (and analysis on it) is kept.
    Unchanged,
    /// In the previous map but not in this one.
    Removed,
}

/// One run of a plate map.
#[derive(Debug, Clone, Serialize, TS)]
pub struct PlateMapAssignment {
    /// Well label, e.g. `A01`.
    pub well: String,
    pub locus_id: i64,
    pub locus_label: String,
    /// Barcode as stored, or as written in the map for a new sample.
    pub barcode: String,
    /// Null for a sample that does not exist yet.
    pub sample_id: Option<i64>,
    pub change: AssignmentChange,
    /// The sample does not exist and would be created (`create_samples`).
    pub creates_sample: bool,
}

/// A sample created by a plate map.
#[derive(Debug, Clone, Serialize, TS)]
pub struct CreatedSample {
    pub barcode: String,
    pub designation: Designation,
}

pub(crate) fn register(r: &mut Registry) {
    r.mutation(
        "apply_plate_map",
        &[PLATES, SAMPLES, LOCI],
        "Assign samples and loci to a plate's channels from a plate-map CSV (Well, then one column per locus label; cells are sample barcodes). \
         Replaces the previous map. Validates everything first: with problems, a dry run returns them and a real run fails with `invalid`.",
        apply,
    );
    r.mutation(
        "clear_plate_map",
        &[PLATES, SAMPLES, LOCI],
        "Remove every run of a plate.",
        clear,
    );
    r.query(
        "export_plate_map",
        "The plate's current map as CSV (every well; empty map gives a template).",
        export,
    );
}

struct ParsedMap {
    /// (normalized well label, locus, barcode)
    cells: Vec<(String, Locus, String)>,
}

fn parse_map(text: &str, loci: &[Locus], report: &mut PlateMapReport) -> ParsedMap {
    let mut cells = Vec::new();
    let mut rdr = csv::ReaderBuilder::new()
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(text.as_bytes());
    let headers: Vec<String> = match rdr.headers() {
        Ok(h) => h.iter().map(|s| s.to_string()).collect(),
        Err(e) => {
            report
                .problems
                .push(format!("Cannot read the CSV header: {e}"));
            return ParsedMap { cells };
        }
    };
    let Some(well_col) = headers.iter().position(|h| header_key(h) == "well") else {
        report
            .problems
            .push("The plate map needs a Well column followed by one column per locus.".into());
        return ParsedMap { cells };
    };
    let by_label: HashMap<String, &Locus> =
        loci.iter().map(|l| (l.label.to_lowercase(), l)).collect();
    let mut columns: Vec<(usize, &Locus)> = Vec::new();
    for (i, h) in headers.iter().enumerate() {
        if i == well_col || h.is_empty() {
            continue;
        }
        match by_label.get(&h.to_lowercase()) {
            Some(l) => columns.push((i, l)),
            None => report.unknown_loci.push(h.clone()),
        }
    }
    if !report.unknown_loci.is_empty() {
        report.problems.push(format!(
            "Unknown loci in the header: {}. Create them first (labels must match exactly, ignoring case).",
            some_of(&report.unknown_loci, 10)
        ));
    }
    let mut seen_wells = HashSet::new();
    for (k, rec) in rdr.records().enumerate() {
        let line = k + 2;
        let rec = match rec {
            Ok(r) => r,
            Err(e) => {
                report.problems.push(format!("line {line}: {e}"));
                continue;
            }
        };
        let raw_well = rec.get(well_col).unwrap_or("");
        if raw_well.is_empty() {
            if rec.iter().any(|f| !f.is_empty()) {
                report.problems.push(format!("line {line}: no well label"));
            }
            continue;
        }
        let well = match Well::parse(raw_well) {
            Ok(w) => w.label(),
            Err(e) => {
                report.problems.push(format!("line {line}: {e}"));
                continue;
            }
        };
        if !seen_wells.insert(well.clone()) {
            report
                .problems
                .push(format!("line {line}: well {well} appears twice"));
            continue;
        }
        for &(i, locus) in &columns {
            let barcode = rec.get(i).unwrap_or("").trim();
            if !barcode.is_empty() {
                cells.push((well.clone(), locus.clone(), barcode.to_string()));
            }
        }
    }
    ParsedMap { cells }
}

fn ranges_overlap(a: &Locus, b: &Locus) -> bool {
    a.min_base_length <= b.max_base_length && b.min_base_length <= a.max_base_length
}

fn apply(e: &Engine, p: ApplyPlateMapParams) -> Result<PlateMapReport> {
    let text = super::CsvSource {
        path: p.path.clone(),
        content: p.content.clone(),
    }
    .read()?;
    let create = p.create_samples.unwrap_or(false);
    let dry = p.dry_run.unwrap_or(false);
    let ws = e.workspace()?;
    let report = ws.write(|tx| apply_inner(tx, p.plate_id, &text, create, dry))?;
    if report.applied {
        crate::quality::refresh_controls(&ws, &[p.plate_id])?;
        e.changed(PLATES, Some(vec![p.plate_id]));
        e.changed(SAMPLES, None);
        e.changed(LOCI, None);
    }
    if !report.problems.is_empty() && !dry {
        return Err(RpcError::invalid(format!(
            "The plate map was not applied: {}",
            some_of(&report.problems, 6)
        )));
    }
    Ok(report)
}

/// Validates and (unless `dry`) applies a plate map inside a write transaction.
pub(crate) fn apply_inner(
    tx: &Connection,
    plate_id: i64,
    text: &str,
    create: bool,
    dry: bool,
) -> Result<PlateMapReport> {
    let plate_size: u32 = tx
        .query_row(
            "SELECT plate_size FROM plate WHERE id = ?1",
            [plate_id],
            |r| r.get(0),
        )
        .optional()?
        .or_not_found(|| format!("Plate {plate_id} does not exist"))?;
    let size = PlateSize::from_wells(plate_size).map_err(|e| RpcError::internal(e.to_string()))?;
    let loci = load_loci(tx)?;
    let mut report = PlateMapReport::default();
    let parsed = parse_map(text, &loci, &mut report);

    // Channels of the plate: (well label, color) -> channel id.
    let mut channels: HashMap<(String, Color), i64> = HashMap::new();
    let mut wells: HashSet<String> = HashSet::new();
    let mut st = tx.prepare(
        "SELECT w.label, c.color, c.id FROM channel c JOIN well w ON w.id = c.well_id WHERE w.plate_id = ?1",
    )?;
    for row in st.query_map([plate_id], |r| {
        Ok((
            r.get::<_, String>(0)?,
            super::color_col(r, 1)?,
            r.get::<_, i64>(2)?,
        ))
    })? {
        let (w, color, id) = row?;
        wells.insert(w.clone());
        channels.insert((w, color), id);
    }
    let barcodes: HashMap<String, (i64, String)> = {
        let mut st = tx.prepare("SELECT barcode, id FROM sample")?;
        let v = st
            .query_map([], |r| {
                let b: String = r.get(0)?;
                Ok((b.to_lowercase(), (r.get(1)?, b)))
            })?
            .collect::<rusqlite::Result<_>>()?;
        v
    };
    let samples: HashMap<String, i64> = barcodes.iter().map(|(k, v)| (k.clone(), v.0)).collect();

    let mut missing_wells = BTreeSet::new();
    let mut missing_channels = Vec::new();
    let mut unknown = BTreeMap::new();
    let mut per_well: HashMap<&str, Vec<&Locus>> = HashMap::new();
    for (well, locus, barcode) in &parsed.cells {
        if Well::parse_on(well, size).is_err() || !wells.contains(well) {
            missing_wells.insert(well.clone());
            continue;
        }
        if !channels.contains_key(&(well.clone(), locus.color)) {
            missing_channels.push(format!(
                "{well} has no {} channel for {}",
                color_str(locus.color),
                locus.label
            ));
        }
        if !samples.contains_key(&barcode.to_lowercase()) {
            unknown
                .entry(barcode.to_lowercase())
                .or_insert_with(|| barcode.clone());
        }
        per_well.entry(well).or_default().push(locus);
    }
    if !missing_wells.is_empty() {
        let v: Vec<String> = missing_wells.into_iter().collect();
        report
            .problems
            .push(format!("Wells not on this plate: {}", some_of(&v, 10)));
    }
    if !missing_channels.is_empty() {
        report.problems.push(some_of(&missing_channels, 5));
    }
    let mut clashes = Vec::new();
    for (well, ls) in &per_well {
        for (i, a) in ls.iter().enumerate() {
            for b in &ls[i + 1..] {
                if a.color == b.color && ranges_overlap(a, b) {
                    clashes.push(format!("{well}: {} and {}", a.label, b.label));
                }
            }
        }
    }
    if !clashes.is_empty() {
        clashes.sort();
        report.problems.push(format!(
            "Loci on the same dye with overlapping size ranges cannot share a well: {}",
            some_of(&clashes, 5)
        ));
    }
    report.unknown_samples = unknown.into_values().collect();
    if create {
        report.created_samples = report
            .unknown_samples
            .iter()
            .map(|b| CreatedSample {
                barcode: b.clone(),
                designation: Designation::infer(b),
            })
            .collect();
    } else if !report.unknown_samples.is_empty() {
        report.problems.push(format!(
            "Unknown samples ({}): {}. Turn on \"create missing samples\" to add them.",
            report.unknown_samples.len(),
            some_of(&report.unknown_samples, 10)
        ));
    }
    if parsed.cells.is_empty() && report.problems.is_empty() {
        report
            .problems
            .push("The plate map assigns no samples.".into());
    }
    report.run_count = parsed.cells.len() as u32;
    // (channel, locus) -> (run, sample), and per run (well, locus label, barcode).
    let mut existing: HashMap<(i64, i64), (i64, i64)> = HashMap::new();
    let mut existing_labels: HashMap<i64, (String, String, String)> = HashMap::new();
    {
        let mut st = tx.prepare(
            "SELECT r.channel_id, r.locus_id, r.id, r.sample_id, w.label, l.label, s.barcode
             FROM run r JOIN channel c ON c.id = r.channel_id JOIN well w ON w.id = c.well_id
             JOIN locus l ON l.id = r.locus_id JOIN sample s ON s.id = r.sample_id
             WHERE w.plate_id = ?1",
        )?;
        for row in st.query_map([plate_id], |r| {
            Ok((
                (r.get::<_, i64>(0)?, r.get::<_, i64>(1)?),
                (r.get::<_, i64>(2)?, r.get::<_, i64>(3)?),
                (r.get(4)?, r.get(5)?, r.get(6)?),
            ))
        })? {
            let (key, run, labels) = row?;
            existing_labels.insert(run.0, labels);
            existing.insert(key, run);
        }
    }
    report.assignments = Some(assignments(
        &parsed,
        &channels,
        &barcodes,
        &existing,
        &existing_labels,
        create,
    ));
    if !report.problems.is_empty() || dry {
        // Count what would be kept, for the preview.
        report.runs_kept = parsed
            .cells
            .iter()
            .filter(|(w, l, b)| {
                let ch = channels.get(&(w.clone(), l.color));
                let s = samples.get(&b.to_lowercase());
                matches!((ch, s), (Some(ch), Some(s)) if existing.get(&(*ch, l.id)).is_some_and(|(_, es)| es == s))
            })
            .count() as u32;
        report.runs_removed = existing.len() as u32 - report.runs_kept;
        return Ok(report);
    }

    let mut sample_ids = samples;
    for c in &report.created_samples {
        let id = super::samples::insert(tx, &c.barcode, c.designation)?;
        sample_ids.insert(c.barcode.to_lowercase(), id);
    }
    let mut desired: HashMap<(i64, i64), i64> = HashMap::new();
    for (well, locus, barcode) in &parsed.cells {
        let ch = channels[&(well.clone(), locus.color)];
        desired.insert((ch, locus.id), sample_ids[&barcode.to_lowercase()]);
    }
    let mut removed = Vec::new();
    for (key, (run, sample)) in &existing {
        if desired.get(key) != Some(sample) {
            removed.push(*run);
        }
    }
    if !removed.is_empty() {
        tx.execute(
            &format!("DELETE FROM run WHERE id IN ({})", id_list(&removed)),
            [],
        )?;
    }
    let mut ins =
        tx.prepare("INSERT INTO run (channel_id, locus_id, sample_id) VALUES (?1, ?2, ?3)")?;
    let mut kept = 0;
    for ((ch, locus), sample) in &desired {
        if existing
            .get(&(*ch, *locus))
            .is_some_and(|(_, s)| s == sample)
        {
            kept += 1;
        } else {
            ins.execute(params![ch, locus, sample])?;
        }
    }
    recompute_run_signals(
        tx,
        &format!("w.plate_id = {plate_id} AND r.max_signal IS NULL"),
    )?;
    report.runs_kept = kept;
    report.runs_removed = removed.len() as u32;
    report.applied = true;
    Ok(report)
}

/// The per-run view of a plate map against the plate's current runs.
fn assignments(
    parsed: &ParsedMap,
    channels: &HashMap<(String, Color), i64>,
    barcodes: &HashMap<String, (i64, String)>,
    existing: &HashMap<(i64, i64), (i64, i64)>,
    existing_labels: &HashMap<i64, (String, String, String)>,
    create: bool,
) -> Vec<PlateMapAssignment> {
    let mut out = Vec::new();
    let mut desired: HashSet<(i64, i64)> = HashSet::new();
    let mut kept_runs: HashSet<i64> = HashSet::new();
    for (well, locus, barcode) in &parsed.cells {
        let Some(&ch) = channels.get(&(well.clone(), locus.color)) else {
            continue;
        };
        desired.insert((ch, locus.id));
        let known = barcodes.get(&barcode.to_lowercase());
        let sample_id = known.map(|k| k.0);
        let unchanged = match (existing.get(&(ch, locus.id)), sample_id) {
            (Some(&(run, s)), Some(id)) if s == id => {
                kept_runs.insert(run);
                true
            }
            _ => false,
        };
        out.push(PlateMapAssignment {
            well: well.clone(),
            locus_id: locus.id,
            locus_label: locus.label.clone(),
            barcode: known.map_or_else(|| barcode.clone(), |k| k.1.clone()),
            sample_id,
            change: if unchanged {
                AssignmentChange::Unchanged
            } else {
                AssignmentChange::New
            },
            creates_sample: create && known.is_none(),
        });
    }
    for (&(_, locus_id), &(run, sample)) in existing {
        if kept_runs.contains(&run) {
            continue;
        }
        let Some((well, locus_label, barcode)) = existing_labels.get(&run) else {
            continue;
        };
        out.push(PlateMapAssignment {
            well: well.clone(),
            locus_id,
            locus_label: locus_label.clone(),
            barcode: barcode.clone(),
            sample_id: Some(sample),
            change: AssignmentChange::Removed,
            creates_sample: false,
        });
    }
    out.sort_by(|a, b| {
        super::plates::well_order_key(&a.well)
            .cmp(&super::plates::well_order_key(&b.well))
            .then_with(|| a.locus_label.cmp(&b.locus_label))
            .then_with(|| (a.change as u8).cmp(&(b.change as u8)).reverse())
    });
    out
}

fn clear(e: &Engine, p: IdParams) -> Result<()> {
    let ws = e.workspace()?;
    ws.write(|tx| {
        tx.query_row("SELECT id FROM plate WHERE id = ?1", [p.id], |r| r.get::<_, i64>(0))
            .optional()?
            .or_not_found(|| format!("Plate {} does not exist", p.id))?;
        tx.execute(
            "DELETE FROM run WHERE channel_id IN (SELECT c.id FROM channel c JOIN well w ON w.id = c.well_id WHERE w.plate_id = ?1)",
            [p.id],
        )?;
        Ok(())
    })?;
    crate::quality::refresh_controls(&ws, &[p.id])?;
    e.changed(PLATES, Some(vec![p.id]));
    e.changed(SAMPLES, None);
    e.changed(LOCI, None);
    Ok(())
}

fn export(e: &Engine, p: IdParams) -> Result<TextFile> {
    e.workspace()?.read(|c| {
        let label: String = c
            .query_row("SELECT label FROM plate WHERE id = ?1", [p.id], |r| {
                r.get(0)
            })
            .optional()?
            .or_not_found(|| format!("Plate {} does not exist", p.id))?;
        let mut st = c.prepare("SELECT label FROM well WHERE plate_id = ?1")?;
        let mut wells: Vec<String> = st
            .query_map([p.id], |r| r.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        wells.sort_by_key(|w| super::plates::well_order_key(w));
        let mut st = c.prepare(
            "SELECT w.label, l.label, s.barcode FROM run r JOIN locus l ON l.id = r.locus_id
             JOIN sample s ON s.id = r.sample_id JOIN channel c ON c.id = r.channel_id
             JOIN well w ON w.id = c.well_id WHERE w.plate_id = ?1",
        )?;
        let mut loci = BTreeSet::new();
        let mut cells: HashMap<(String, String), String> = HashMap::new();
        for row in st.query_map([p.id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })? {
            let (w, l, s) = row?;
            loci.insert(l.clone());
            cells.insert((w, l), s);
        }
        let mut out = csv::Writer::from_writer(Vec::new());
        let csv_err = |e: csv::Error| RpcError::internal(e.to_string());
        let mut header = vec!["Well".to_string()];
        header.extend(loci.iter().cloned());
        out.write_record(&header).map_err(csv_err)?;
        for w in &wells {
            let mut row = vec![w.clone()];
            row.extend(loci.iter().map(|l| {
                cells
                    .get(&(w.clone(), l.clone()))
                    .cloned()
                    .unwrap_or_default()
            }));
            out.write_record(&row).map_err(csv_err)?;
        }
        let bytes = out
            .into_inner()
            .map_err(|e| RpcError::internal(e.to_string()))?;
        let safe: String = label
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        Ok(TextFile {
            filename: format!("{safe}_plate_map.csv"),
            content: String::from_utf8_lossy(&bytes).into_owned(),
        })
    })
}

/// Recomputes `run.max_signal` (highest raw signal inside the locus range) for
/// runs matching `where_clause` (aliases: `r` run, `c` channel, `w` well).
pub(crate) fn recompute_run_signals(tx: &Connection, where_clause: &str) -> Result<()> {
    let mut st = tx.prepare(&format!(
        "SELECT r.id, c.well_id, t.data, l.min_base_length, l.max_base_length
         FROM run r JOIN channel c ON c.id = r.channel_id JOIN well w ON w.id = c.well_id
         JOIN trace t ON t.channel_id = c.id JOIN locus l ON l.id = r.locus_id WHERE {where_clause}"
    ))?;
    let runs: Vec<(i64, i64, Vec<u8>, f64, f64)> = st
        .query_map([], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
        })?
        .collect::<rusqlite::Result<_>>()?;
    if runs.is_empty() {
        return Ok(());
    }
    let well_ids: Vec<i64> = runs
        .iter()
        .map(|r| r.1)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let mut st = tx.prepare(&format!(
        "SELECT w.id, w.ladder_peak_indices, w.ladder_peak_sizes, w.sizing_quality, w.trace_len, l.spec
         FROM well w JOIN plate p ON p.id = w.plate_id JOIN ladder l ON l.id = p.ladder_id
         WHERE w.id IN ({})",
        id_list(&well_ids)
    ))?;
    #[allow(clippy::type_complexity)]
    let fits: Vec<(i64, Vec<usize>, Vec<f64>, Option<f64>, i64, LadderSpec)> = st
        .query_map([], |r| {
            Ok((
                r.get(0)?,
                json_col(r, 1)?,
                json_col(r, 2)?,
                r.get(3)?,
                r.get(4)?,
                json_col(r, 5)?,
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;
    let sizes: HashMap<i64, Option<Vec<f64>>> = fits
        .into_par_iter()
        .map(|(id, idx, sz, q, len, spec)| {
            let bs = q.and_then(|_| {
                sizing::base_sizes(&idx, &sz, len as usize, spec.base_size_precision)
            });
            (id, bs)
        })
        .collect();
    let signals: Vec<(i64, Option<i16>)> = runs
        .into_par_iter()
        .map(|(run, well, blob, min, max)| {
            let trace =
                codec::decode(&blob).map_err(|e| RpcError::internal(format!("run {run}: {e}")))?;
            let bs = sizes.get(&well).and_then(|b| b.as_deref());
            Ok((run, sizing::locus_max_signal(&trace, bs, min, max)))
        })
        .collect::<Result<_>>()?;
    let mut upd = tx.prepare("UPDATE run SET max_signal = ?1 WHERE id = ?2")?;
    for (run, s) in signals {
        upd.execute(params![s.map(i32::from), run])?;
    }
    Ok(())
}
