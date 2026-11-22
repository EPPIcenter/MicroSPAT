//! Samples: barcodes, designations, and where each sample was run.

use super::{check_label, color_col, header_key, json_col, some_of, CsvSource, IdParams};
use crate::error::{OrNotFound, Result, RpcError};
use crate::events::entity::{PLATES, SAMPLES};
use crate::rpc::Registry;
use crate::sizing::SizingState;
use crate::Engine;
use microspat_core::Color;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use ts_rs::TS;

/// What a sample is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum Designation {
    #[default]
    Sample,
    /// No-template control; signal above the contamination limit flags its plate and locus.
    NegativeControl,
    PositiveControl,
}

impl Designation {
    /// Database form.
    pub fn as_str(self) -> &'static str {
        match self {
            Designation::Sample => "sample",
            Designation::NegativeControl => "negative_control",
            Designation::PositiveControl => "positive_control",
        }
    }

    /// Parses the database form.
    pub fn from_db(s: &str) -> Designation {
        match s {
            "negative_control" => Designation::NegativeControl,
            "positive_control" => Designation::PositiveControl,
            _ => Designation::Sample,
        }
    }

    /// Designation of a sample created from a plate map: barcodes containing "NTC" are negative controls.
    pub fn infer(barcode: &str) -> Designation {
        if barcode.contains("NTC") {
            Designation::NegativeControl
        } else {
            Designation::Sample
        }
    }

    /// Parses a CSV designation, accepting the old app's synonyms.
    fn parse_csv(s: &str) -> Option<Designation> {
        match s.trim().to_ascii_lowercase().as_str() {
            "" | "s" | "sample" => Some(Designation::Sample),
            "neg" | "negative_control" | "negative" | "negative control" | "-" | "nc" | "ntc" => {
                Some(Designation::NegativeControl)
            }
            "pos" | "positive_control" | "positive" | "positive control" | "+" | "pc" => {
                Some(Designation::PositiveControl)
            }
            _ => None,
        }
    }
}

/// A sample with run counts.
#[derive(Debug, Clone, Serialize, TS)]
pub struct Sample {
    pub id: i64,
    pub barcode: String,
    pub designation: Designation,
    /// Runs (channel × locus) assigned to this sample.
    pub run_count: u32,
    /// Distinct plates the sample was run on.
    pub plate_count: u32,
    /// Distinct loci the sample has runs at.
    #[ts(optional)]
    pub locus_count: Option<u32>,
    /// Labels of the plates the sample was run on, sorted.
    #[ts(optional)]
    pub plate_labels: Option<Vec<String>>,
}

/// One run of a sample.
#[derive(Debug, Clone, Serialize, TS)]
pub struct SampleRun {
    pub run_id: i64,
    pub locus_id: i64,
    pub locus_label: String,
    pub plate_id: i64,
    pub plate_label: String,
    pub well_id: i64,
    pub well_label: String,
    pub channel_id: i64,
    pub color: Color,
    /// Highest raw signal in the locus range; null when the well is unsized.
    pub max_signal: Option<i32>,
    pub sizing: SizingState,
    /// Why the run is not good (the well's sizing reason, or its locus lying
    /// outside the sized range), as wells give it; absent when good.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub sizing_reason: Option<String>,
    /// Negative control with signal above the contamination limit.
    pub contaminated: bool,
}

/// A sample with all its runs, by locus then plate.
#[derive(Debug, Clone, Serialize, TS)]
pub struct SampleDetail {
    pub id: i64,
    pub barcode: String,
    pub designation: Designation,
    pub runs: Vec<SampleRun>,
}

/// Params of `create_sample`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateSampleParams {
    pub barcode: String,
    /// Defaults to `sample`.
    #[serde(default)]
    #[ts(optional)]
    pub designation: Option<Designation>,
}

/// Params of `update_sample`. Omitted fields are unchanged.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateSampleParams {
    pub id: i64,
    #[serde(default)]
    #[ts(optional)]
    pub barcode: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub designation: Option<Designation>,
}

/// Params of `set_samples_designation`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct SetSamplesDesignationParams {
    pub sample_ids: Vec<i64>,
    pub designation: Designation,
}

/// Params of `delete_samples`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct DeleteSamplesParams {
    pub sample_ids: Vec<i64>,
}

/// A sample a batch method left alone, and why.
#[derive(Debug, Clone, Serialize, TS)]
pub struct SampleRefusal {
    pub sample_id: i64,
    /// Null when the sample does not exist.
    pub barcode: Option<String>,
    pub reason: String,
}

/// Result of a batch sample method.
#[derive(Debug, Clone, Default, Serialize, TS)]
pub struct SamplesBatchResult {
    /// Samples changed (or deleted).
    pub done: Vec<i64>,
    /// Samples left alone, with the reason.
    pub refused: Vec<SampleRefusal>,
}

/// Result of `import_samples_csv`.
#[derive(Debug, Clone, Serialize, TS)]
pub struct ImportSamplesResult {
    pub created: Vec<Sample>,
    /// Barcodes already in the workspace; left unchanged.
    pub existing: Vec<String>,
}

pub(crate) fn register(r: &mut Registry) {
    r.query("list_samples", "All samples with run counts.", list);
    r.query(
        "get_sample",
        "One sample with its runs by locus and plate.",
        get,
    );
    r.mutation(
        "create_sample",
        &[SAMPLES],
        "Create a sample. Barcodes are unique (case-insensitive).",
        create,
    );
    r.mutation(
        "update_sample",
        &[SAMPLES, PLATES],
        "Change a sample's barcode or designation (designation drives contamination flags).",
        update,
    );
    r.mutation(
        "delete_sample",
        &[SAMPLES],
        "Delete a sample that has no runs.",
        delete,
    );
    r.mutation(
        "set_samples_designation",
        &[SAMPLES, PLATES],
        "Set the designation of many samples at once (one `changed` event). Missing ids are reported in `refused`.",
        set_designation_batch,
    );
    r.mutation(
        "delete_samples",
        &[SAMPLES],
        "Delete many samples at once (one `changed` event). Samples with runs or in projects are left alone and reported in `refused`.",
        delete_batch,
    );
    r.mutation(
        "import_samples_csv",
        &[SAMPLES],
        "Create samples from a CSV with a Barcode column and an optional Designation column \
         (sample, negative/neg/NTC, positive/pos). Existing barcodes are skipped and reported.",
        import_csv,
    );
}

/// One pass over runs per sample (no correlated subqueries); `{filter}` is a
/// `WHERE` clause over `s`, or empty.
const SELECT: &str =
    "SELECT s.id, s.barcode, s.designation, COUNT(r.id), COUNT(DISTINCT w.plate_id),
        COUNT(DISTINCT r.locus_id), json_group_array(DISTINCT pl.label)
    FROM sample s LEFT JOIN run r ON r.sample_id = s.id
    LEFT JOIN channel c ON c.id = r.channel_id LEFT JOIN well w ON w.id = c.well_id
    LEFT JOIN plate pl ON pl.id = w.plate_id
    {filter} GROUP BY s.id ORDER BY s.barcode";

fn row_to_sample(r: &rusqlite::Row) -> rusqlite::Result<Sample> {
    let labels: Vec<Option<String>> = json_col(r, 6)?;
    let mut labels: Vec<String> = labels.into_iter().flatten().collect();
    labels.sort();
    Ok(Sample {
        id: r.get(0)?,
        barcode: r.get(1)?,
        designation: Designation::from_db(&r.get::<_, String>(2)?),
        run_count: r.get(3)?,
        plate_count: r.get(4)?,
        locus_count: Some(r.get(5)?),
        plate_labels: Some(labels),
    })
}

fn select(filter: &str) -> String {
    SELECT.replace("{filter}", filter)
}

/// Loads one sample.
pub fn load(c: &Connection, id: i64) -> Result<Sample> {
    c.query_row(&select("WHERE s.id = ?1"), [id], row_to_sample)
        .optional()?
        .or_not_found(|| format!("Sample {id} does not exist"))
}

fn list(e: &Engine, _: ()) -> Result<Vec<Sample>> {
    e.workspace()?.read(|c| {
        let mut st = c.prepare(&select(""))?;
        let rows = st.query_map([], row_to_sample)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    })
}

fn get(e: &Engine, p: IdParams) -> Result<SampleDetail> {
    e.workspace()?.read(|c| {
        let s = load(c, p.id)?;
        let specs = super::plates::ladder_specs(c)?;
        let limit = crate::db::contamination_limit(c)?;
        let mut st = c.prepare(
            "SELECT r.id, l.id, l.label, pl.id, pl.label, w.id, w.label, ch.id, ch.color,
                    r.max_signal, w.sizing_quality, pl.ladder_id, w.ladder_peak_sizes,
                    l.min_base_length, l.max_base_length, w.sizing_error
             FROM run r JOIN locus l ON l.id = r.locus_id JOIN channel ch ON ch.id = r.channel_id
             JOIN well w ON w.id = ch.well_id JOIN plate pl ON pl.id = w.plate_id
             WHERE r.sample_id = ?1 ORDER BY l.label, pl.label, w.label",
        )?;
        let runs = st
            .query_map([p.id], |r| {
                let max_signal: Option<i32> = r.get(9)?;
                let ladder_id: i64 = r.get(11)?;
                let (sizing, sizing_reason) = match specs.get(&ladder_id) {
                    None => (
                        SizingState::Failed,
                        Some("The plate's ladder does not exist.".to_string()),
                    ),
                    Some(spec) => {
                        let sizes: Vec<f64> = json_col(r, 12)?;
                        let error: Option<String> = r.get(15)?;
                        crate::sizing::assess_run(
                            r.get(10)?,
                            &sizes,
                            error.as_deref(),
                            spec,
                            &(r.get(2)?, r.get(13)?, r.get(14)?),
                        )
                    }
                };
                Ok(SampleRun {
                    run_id: r.get(0)?,
                    locus_id: r.get(1)?,
                    locus_label: r.get(2)?,
                    plate_id: r.get(3)?,
                    plate_label: r.get(4)?,
                    well_id: r.get(5)?,
                    well_label: r.get(6)?,
                    channel_id: r.get(7)?,
                    color: color_col(r, 8)?,
                    max_signal,
                    sizing,
                    sizing_reason,
                    contaminated: s.designation == Designation::NegativeControl
                        && max_signal.is_some_and(|m| i64::from(m) > limit),
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        Ok(SampleDetail {
            id: s.id,
            barcode: s.barcode,
            designation: s.designation,
            runs,
        })
    })
}

/// The stored barcode of another sample with this barcode (case-insensitive), if any.
fn barcode_taken(c: &Connection, barcode: &str, except: i64) -> Result<Option<String>> {
    Ok(c.query_row(
        "SELECT barcode FROM sample WHERE barcode = ?1 AND id != ?2",
        params![barcode, except],
        |r| r.get(0),
    )
    .optional()?)
}

/// Inserts a sample; the barcode must be checked and free.
pub(crate) fn insert(c: &Connection, barcode: &str, d: Designation) -> Result<i64> {
    c.execute(
        "INSERT INTO sample (barcode, designation) VALUES (?1, ?2)",
        params![barcode, d.as_str()],
    )?;
    Ok(c.last_insert_rowid())
}

fn create(e: &Engine, p: CreateSampleParams) -> Result<Sample> {
    let barcode = check_label(&p.barcode, "Sample barcode")?;
    let s = e.workspace()?.write(|tx| {
        if let Some(existing) = barcode_taken(tx, &barcode, 0)? {
            return Err(RpcError::conflict(format!(
                "A sample with barcode \"{existing}\" already exists."
            )));
        }
        let id = insert(tx, &barcode, p.designation.unwrap_or_default())?;
        load(tx, id)
    })?;
    e.changed(SAMPLES, Some(vec![s.id]));
    Ok(s)
}

fn update(e: &Engine, p: UpdateSampleParams) -> Result<Sample> {
    let ws = e.workspace()?;
    let s = ws.write(|tx| {
        load(tx, p.id)?;
        if let Some(b) = &p.barcode {
            let b = check_label(b, "Sample barcode")?;
            if let Some(existing) = barcode_taken(tx, &b, p.id)? {
                return Err(RpcError::conflict(format!(
                    "A sample with barcode \"{existing}\" already exists."
                )));
            }
            tx.execute(
                "UPDATE sample SET barcode = ?1 WHERE id = ?2",
                params![b, p.id],
            )?;
        }
        if let Some(d) = p.designation {
            tx.execute(
                "UPDATE sample SET designation = ?1 WHERE id = ?2",
                params![d.as_str(), p.id],
            )?;
        }
        load(tx, p.id)
    })?;
    e.changed(SAMPLES, Some(vec![s.id]));
    if s.run_count > 0 && p.designation.is_some() {
        // Negative controls are checked by designation.
        let plates = ws.read(|c| crate::quality::plates_of_samples(c, &[s.id]))?;
        crate::quality::refresh_controls(&ws, &plates)?;
        e.changed(PLATES, None);
    }
    Ok(s)
}

/// Why a sample cannot be deleted, if it cannot.
fn delete_refusal(c: &Connection, s: &Sample) -> Result<Option<String>> {
    if s.run_count > 0 {
        return Ok(Some(format!(
            "Sample {} has {} runs on plate(s) {}. Clear or change those plate maps first.",
            s.barcode,
            s.run_count,
            some_of(s.plate_labels.as_deref().unwrap_or(&[]), 5)
        )));
    }
    let users = super::projects::projects_using_sample(c, s.id)?;
    if !users.is_empty() {
        return Ok(Some(format!(
            "Sample {} is in {}. Remove it from those projects first.",
            s.barcode,
            some_of(&users, 5)
        )));
    }
    Ok(None)
}

fn delete(e: &Engine, p: IdParams) -> Result<()> {
    e.workspace()?.write(|tx| {
        let s = load(tx, p.id)?;
        if let Some(reason) = delete_refusal(tx, &s)? {
            return Err(RpcError::in_use(reason));
        }
        tx.execute("DELETE FROM sample WHERE id = ?1", [p.id])?;
        Ok(())
    })?;
    e.changed(SAMPLES, Some(vec![p.id]));
    Ok(())
}

/// Samples by id among `ids` (unknown ids are absent).
fn load_many(c: &Connection, ids: &[i64]) -> Result<std::collections::HashMap<i64, Sample>> {
    if ids.is_empty() {
        return Ok(Default::default());
    }
    let mut st = c.prepare(&select(&format!("WHERE s.id IN ({})", super::id_list(ids))))?;
    let rows = st.query_map([], row_to_sample)?;
    Ok(rows
        .map(|r| r.map(|s| (s.id, s)))
        .collect::<rusqlite::Result<_>>()?)
}

fn missing(id: i64) -> SampleRefusal {
    SampleRefusal {
        sample_id: id,
        barcode: None,
        reason: format!("Sample {id} does not exist."),
    }
}

/// Distinct ids in first-seen order.
fn distinct(ids: &[i64]) -> Vec<i64> {
    let mut seen = HashSet::new();
    ids.iter().copied().filter(|i| seen.insert(*i)).collect()
}

fn set_designation_batch(e: &Engine, p: SetSamplesDesignationParams) -> Result<SamplesBatchResult> {
    let ids = distinct(&p.sample_ids);
    let ws = e.workspace()?;
    let (res, any_runs) = ws.write(|tx| {
        let found = load_many(tx, &ids)?;
        let mut res = SamplesBatchResult::default();
        let mut any_runs = false;
        let mut st = tx.prepare("UPDATE sample SET designation = ?1 WHERE id = ?2")?;
        for id in &ids {
            match found.get(id) {
                None => res.refused.push(missing(*id)),
                Some(s) => {
                    st.execute(params![p.designation.as_str(), id])?;
                    any_runs |= s.run_count > 0 && s.designation != p.designation;
                    res.done.push(*id);
                }
            }
        }
        Ok((res, any_runs))
    })?;
    if !res.done.is_empty() {
        e.changed(SAMPLES, Some(res.done.clone()));
    }
    if any_runs {
        let plates = ws.read(|c| crate::quality::plates_of_samples(c, &res.done))?;
        crate::quality::refresh_controls(&ws, &plates)?;
        e.changed(PLATES, None);
    }
    Ok(res)
}

fn delete_batch(e: &Engine, p: DeleteSamplesParams) -> Result<SamplesBatchResult> {
    let ids = distinct(&p.sample_ids);
    let res = e.workspace()?.write(|tx| {
        let found = load_many(tx, &ids)?;
        let mut res = SamplesBatchResult::default();
        for id in &ids {
            let Some(s) = found.get(id) else {
                res.refused.push(missing(*id));
                continue;
            };
            match delete_refusal(tx, s)? {
                Some(reason) => res.refused.push(SampleRefusal {
                    sample_id: *id,
                    barcode: Some(s.barcode.clone()),
                    reason,
                }),
                None => res.done.push(*id),
            }
        }
        if !res.done.is_empty() {
            tx.execute(
                &format!(
                    "DELETE FROM sample WHERE id IN ({})",
                    super::id_list(&res.done)
                ),
                [],
            )?;
        }
        Ok(res)
    })?;
    if !res.done.is_empty() {
        e.changed(SAMPLES, Some(res.done.clone()));
    }
    Ok(res)
}

fn import_csv(e: &Engine, p: CsvSource) -> Result<ImportSamplesResult> {
    let text = p.read()?;
    let mut rdr = csv::ReaderBuilder::new()
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(text.as_bytes());
    let headers: Vec<String> = rdr
        .headers()
        .map_err(|e| RpcError::invalid(format!("Cannot read the CSV header: {e}")))?
        .iter()
        .map(header_key)
        .collect();
    let ci_barcode = headers.iter().position(|h| h == "barcode").ok_or_else(|| {
        RpcError::invalid("The samples CSV needs a Barcode column (and optionally Designation).")
    })?;
    let ci_desig = headers.iter().position(|h| h == "designation");
    let mut rows = Vec::new();
    let mut problems = Vec::new();
    let mut seen = HashSet::new();
    for (k, rec) in rdr.records().enumerate() {
        let line = k + 2;
        let rec = rec.map_err(|e| RpcError::invalid(format!("line {line}: {e}")))?;
        let barcode = rec.get(ci_barcode).unwrap_or("").trim().to_string();
        if barcode.is_empty() {
            continue;
        }
        let d = match ci_desig.map(|i| rec.get(i).unwrap_or("")) {
            None => Designation::Sample,
            Some(s) => match Designation::parse_csv(s) {
                Some(d) => d,
                None => {
                    problems.push(format!(
                        "line {line}: designation \"{s}\" is not sample, negative or positive"
                    ));
                    continue;
                }
            },
        };
        if seen.insert(barcode.to_lowercase()) {
            rows.push((barcode, d));
        } else {
            problems.push(format!("line {line}: {barcode} appears twice"));
        }
    }
    if !problems.is_empty() {
        return Err(RpcError::invalid(format!(
            "The samples CSV has {} problem(s): {}. Nothing was imported.",
            problems.len(),
            some_of(&problems, 8)
        )));
    }
    let (created, existing) = e.workspace()?.write(|tx| {
        let mut created = Vec::new();
        let mut existing = Vec::new();
        for (barcode, d) in &rows {
            if let Some(stored) = barcode_taken(tx, barcode, 0)? {
                existing.push(stored);
            } else {
                let id = insert(tx, barcode, *d)?;
                created.push(load(tx, id)?);
            }
        }
        Ok((created, existing))
    })?;
    if !created.is_empty() {
        e.changed(SAMPLES, Some(created.iter().map(|s| s.id).collect()));
    }
    Ok(ImportSamplesResult { created, existing })
}
