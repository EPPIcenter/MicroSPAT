//! Plates, wells and channels: listing, the plate view, well detail, traces,
//! re-sizing and manual ladder edits.

use super::{color_col, color_str, json_col, IdParams};
use crate::codec;
use crate::error::{OrNotFound, Result, RpcError};
use crate::events::entity::{LADDERS, LOCI, PLATES, SAMPLES};
use crate::rpc::Registry;
use crate::sizing::{self, SizingState};
use crate::tasks::Progress;
use crate::Engine;
use microspat_core::ladder::{self, LadderFit, LadderPrior, LadderSpec};
use microspat_core::Color;
use rayon::prelude::*;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use ts_rs::TS;

use super::samples::Designation;

/// Decoded channels of one well: (channel id, color, trace).
pub(crate) type WellTraces = Vec<(i64, Color, Vec<i16>)>;
/// A new fit for a well with its channels' sized-range signals.
type FitUpdate = (i64, StoredFit, Vec<(i64, Option<i16>)>);
type RunTraceBlobs = (
    Option<Vec<u8>>,
    Option<Vec<u8>>,
    Option<Vec<u8>>,
    Option<Vec<u8>>,
);

/// Wells per sizing state.
#[derive(Debug, Clone, Default, Serialize, TS)]
pub struct SizingCounts {
    pub good: u32,
    pub flagged: u32,
    pub unusable: u32,
    pub failed: u32,
}

/// A plate in the plate list.
#[derive(Debug, Clone, Serialize, TS)]
pub struct PlateSummary {
    pub id: i64,
    pub label: String,
    /// Run start recorded by the instrument (ISO 8601, local time, no zone).
    pub run_date: Option<String>,
    pub instrument: Option<String>,
    pub instrument_model: Option<String>,
    /// 96 or 384.
    pub plate_size: u32,
    pub ladder_id: i64,
    pub ladder_label: String,
    /// When it was imported (ISO 8601 UTC).
    pub imported_at: String,
    /// File, zip or folder it came from.
    pub source: Option<String>,
    pub well_count: u32,
    pub sizing: SizingCounts,
    /// True when a plate map has assigned at least one run.
    pub has_plate_map: bool,
    pub run_count: u32,
    /// Labels of loci whose negative control on this plate shows signal above the limit.
    pub contaminated_loci: Vec<String>,
    /// Issue counts of the plate's quality report; null for a plate
    /// imported before quality checks existed (`compute_plate_quality`).
    pub quality: Option<crate::quality::QualitySummary>,
}

/// One run (locus read for a sample) in a channel.
#[derive(Debug, Clone, Serialize, TS)]
pub struct RunSummary {
    pub id: i64,
    pub locus_id: i64,
    pub locus_label: String,
    pub sample_id: i64,
    pub sample_barcode: String,
    pub designation: Designation,
    /// Highest raw signal in the locus range; null when the well is unsized.
    pub max_signal: Option<i32>,
    /// This run is a negative control above the contamination limit.
    pub contaminated: bool,
    /// A negative control of the same locus on this plate is contaminated.
    pub locus_contaminated: bool,
}

/// One dye of a well, without its trace.
#[derive(Debug, Clone, Serialize, TS)]
pub struct ChannelSummary {
    pub id: i64,
    pub color: Color,
    /// Highest raw signal in the sized range; null when the well is unsized.
    pub max_signal: Option<i32>,
    pub runs: Vec<RunSummary>,
}

/// A well in the plate view.
#[derive(Debug, Clone, Serialize, TS)]
pub struct WellSummary {
    pub id: i64,
    /// Normalized label, e.g. `A01`.
    pub label: String,
    /// Sample name recorded in the FSA file.
    pub sample_name: Option<String>,
    pub sizing: SizingState,
    pub sizing_quality: Option<f64>,
    pub sizing_error: Option<String>,
    /// Why the well is not good (failed, too few ladder peaks, quality over a
    /// limit, loci outside the sized range); null when good.
    #[ts(optional = nullable)]
    pub sizing_reason: Option<String>,
    pub manual_ladder: bool,
    pub offscale_count: u32,
    pub channels: Vec<ChannelSummary>,
}

/// A locus present on a plate.
#[derive(Debug, Clone, Serialize, TS)]
pub struct PlateLocus {
    pub locus_id: i64,
    pub label: String,
    pub color: Color,
    pub run_count: u32,
    pub contaminated: bool,
}

/// Everything the plate view shows.
#[derive(Debug, Clone, Serialize, TS)]
pub struct PlateDetail {
    pub plate: PlateSummary,
    /// Wells in row-major order.
    pub wells: Vec<WellSummary>,
    pub loci: Vec<PlateLocus>,
}

/// Instrument run conditions over the run.
#[derive(Debug, Clone, Serialize, TS)]
pub struct PlateRunTraces {
    pub voltage: Vec<i16>,
    pub current: Vec<i16>,
    pub power: Vec<i16>,
    pub temperature: Vec<i16>,
}

/// A ladder in brief.
#[derive(Debug, Clone, Serialize, TS)]
pub struct LadderRef {
    pub id: i64,
    pub label: String,
    pub color: Color,
}

/// A matched ladder peak.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS)]
pub struct LadderPeak {
    /// Data-point index.
    pub index: usize,
    /// Assigned ladder size (bp).
    pub size: f64,
}

/// A peak of the ladder channel the automatic fit considers.
#[derive(Debug, Clone, Copy, Serialize, TS)]
pub struct LadderCandidate {
    /// Data-point index.
    pub index: usize,
    /// Raw height (RFU).
    pub height: f64,
}

/// One dye of a well, with its trace when asked for.
#[derive(Debug, Clone, Serialize, TS)]
pub struct WellChannel {
    pub id: i64,
    pub color: Color,
    pub dye_number: u8,
    pub dye_name: Option<String>,
    pub wavelength: Option<u16>,
    pub max_signal: Option<i32>,
    /// Raw signal; null unless `traces` was requested.
    pub trace: Option<Vec<i16>>,
    pub runs: Vec<RunSummary>,
}

/// Everything the well view shows.
#[derive(Debug, Clone, Serialize, TS)]
pub struct WellDetail {
    pub id: i64,
    pub plate_id: i64,
    pub plate_label: String,
    pub label: String,
    pub sample_name: Option<String>,
    pub ladder: LadderRef,
    pub sizing: SizingState,
    pub sizing_quality: Option<f64>,
    pub sizing_error: Option<String>,
    /// Why the well is not good; null when good.
    #[ts(optional = nullable)]
    pub sizing_reason: Option<String>,
    pub manual_ladder: bool,
    pub ladder_peaks: Vec<LadderPeak>,
    /// Ladder-channel peaks the automatic fit considers (height limits,
    /// bleedthrough and overlap applied), to pick from when editing the
    /// ladder by hand. Only with `traces`.
    #[ts(optional = nullable)]
    pub ladder_candidates: Option<Vec<LadderCandidate>>,
    pub offscale_indices: Vec<usize>,
    pub trace_len: u32,
    /// Base size (bp) of every data point; null when unsized or traces were not requested.
    pub base_sizes: Option<Vec<f64>>,
    /// In dye order.
    pub channels: Vec<WellChannel>,
}

/// Params of `get_well`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct GetWellParams {
    pub id: i64,
    /// Include traces and base sizes (default true).
    #[serde(default)]
    #[ts(optional)]
    pub traces: Option<bool>,
}

/// Params of `set_well_ladder_peaks` and `preview_well_ladder_peaks`. Give
/// `peaks` (indices with their ladder sizes) or `peak_indices` (sizes then
/// assigned by the fitter, guided by where the plate's other wells put each
/// size), or neither for the automatic fit.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct SetWellLadderPeaksParams {
    /// Well id.
    pub id: i64,
    /// Ladder peak indices chosen by hand; null or omitted with no `peaks`
    /// to go back to the automatic fit.
    #[serde(default)]
    #[ts(optional = nullable)]
    pub peak_indices: Option<Vec<usize>>,
    /// Hand-picked peaks with the ladder size of each (must be sizes of the
    /// plate's ladder, increasing with the index).
    #[serde(default)]
    #[ts(optional = nullable)]
    pub peaks: Option<Vec<LadderPeak>>,
}

/// What a proposed set of ladder peaks would give (nothing is stored).
#[derive(Debug, Clone, Serialize, TS)]
pub struct LadderPreview {
    /// State the well would have; `failed` when no fit is possible.
    pub sizing: SizingState,
    pub sizing_quality: Option<f64>,
    /// Why it would not be good, or why it cannot be fitted; null when good.
    pub reason: Option<String>,
    /// The peaks with their assigned sizes (empty when no fit).
    pub peaks: Vec<LadderPeak>,
}

/// Params of `size_plate`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct SizePlateParams {
    /// Plate id.
    pub id: i64,
    /// Switch the plate to this ladder first; omit to keep its ladder.
    #[serde(default)]
    #[ts(optional)]
    pub ladder_id: Option<i64>,
}

/// A single channel's trace with its base sizes.
#[derive(Debug, Clone, Serialize, TS)]
pub struct ChannelTrace {
    pub channel_id: i64,
    pub well_id: i64,
    pub color: Color,
    pub trace: Vec<i16>,
    /// Null when the well is unsized.
    pub base_sizes: Option<Vec<f64>>,
}

pub(crate) fn register(r: &mut Registry) {
    r.query(
        "list_plates",
        "All plates with sizing, plate-map and contamination summaries.",
        list,
    );
    r.query(
        "get_plate",
        "The plate view: every well's sizing and per-dye signal summary, without traces.",
        get,
    );
    r.query(
        "get_plate_run_traces",
        "Voltage, current, power and temperature over the run.",
        run_traces,
    );
    r.mutation(
        "delete_plate",
        &[PLATES, SAMPLES, LOCI, LADDERS],
        "Delete a plate with its wells, traces and runs.",
        delete,
    );
    r.task(
        "size_plate",
        &[PLATES, SAMPLES, LADDERS],
        "Fit the ladder of every well again (after ladder settings changed), optionally with a different ladder. Replaces manual ladder edits.",
        size_plate,
    );
    r.query(
        "get_well",
        "Well detail: dye traces, base sizes, ladder peaks with sizes, quality.",
        get_well,
    );
    r.mutation(
        "set_well_ladder_peaks",
        &[PLATES, SAMPLES],
        "Refit a well's ladder from hand-picked peaks: `peaks` with their sizes, or `peak_indices` \
         (sizes assigned using the plate's other wells as a guide); neither for the automatic fit. \
         Returns the well without traces.",
        set_well_ladder_peaks,
    );
    r.query(
        "preview_well_ladder_peaks",
        "Dry run of set_well_ladder_peaks: the sizes, quality, state and reason the proposed peaks would give. Stores nothing.",
        preview_well_ladder_peaks,
    );
    r.query(
        "get_channel_trace",
        "One channel's raw trace and base sizes.",
        get_channel_trace,
    );
}

/// Ladder specs by ladder id.
pub fn ladder_specs(c: &Connection) -> Result<HashMap<i64, LadderSpec>> {
    let mut st = c.prepare("SELECT id, spec FROM ladder")?;
    let v = st
        .query_map([], |r| Ok((r.get(0)?, json_col(r, 1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

fn plate_ladder(c: &Connection, plate_id: i64) -> Result<(i64, String, LadderSpec)> {
    c.query_row(
        "SELECT l.id, l.label, l.spec FROM plate p JOIN ladder l ON l.id = p.ladder_id WHERE p.id = ?1",
        [plate_id],
        |r| Ok((r.get(0)?, r.get(1)?, json_col(r, 2)?)),
    )
    .optional()?
    .or_not_found(|| format!("Plate {plate_id} does not exist"))
}

/// Summaries of all plates, or of one.
pub fn plate_summaries(c: &Connection, only: Option<i64>) -> Result<Vec<PlateSummary>> {
    let filter = only.map_or(String::new(), |id| format!("WHERE p.id = {id}"));
    let mut st = c.prepare(&format!(
        "SELECT p.id, p.label, p.run_date, p.instrument, p.instrument_model, p.plate_size, p.ladder_id,
                l.label, p.imported_at, p.source, COUNT(w.id)
         FROM plate p JOIN ladder l ON l.id = p.ladder_id LEFT JOIN well w ON w.plate_id = p.id
         {filter} GROUP BY p.id ORDER BY p.imported_at DESC, p.id DESC"
    ))?;
    let mut plates: Vec<PlateSummary> = st
        .query_map([], |r| {
            Ok(PlateSummary {
                id: r.get(0)?,
                label: r.get(1)?,
                run_date: r.get(2)?,
                instrument: r.get(3)?,
                instrument_model: r.get(4)?,
                plate_size: r.get(5)?,
                ladder_id: r.get(6)?,
                ladder_label: r.get(7)?,
                imported_at: r.get(8)?,
                source: r.get(9)?,
                well_count: r.get(10)?,
                sizing: SizingCounts::default(),
                has_plate_map: false,
                run_count: 0,
                contaminated_loci: Vec::new(),
                quality: None,
            })
        })?
        .collect::<rusqlite::Result<_>>()?;
    let wfilter = only.map_or(String::new(), |id| format!("WHERE w.plate_id = {id}"));
    let mut counts: HashMap<i64, SizingCounts> = HashMap::new();
    for (plate, state, _) in well_states(c, &wfilter)?.into_values() {
        let n = counts.entry(plate).or_default();
        match state {
            SizingState::Good => n.good += 1,
            SizingState::Flagged => n.flagged += 1,
            SizingState::Unusable => n.unusable += 1,
            SizingState::Failed => n.failed += 1,
        }
    }
    let mut runs: HashMap<i64, u32> = HashMap::new();
    let mut st = c.prepare(&format!(
        "SELECT w.plate_id, COUNT(*) FROM run r JOIN channel c ON c.id = r.channel_id
         JOIN well w ON w.id = c.well_id {wfilter} GROUP BY w.plate_id"
    ))?;
    for row in st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))? {
        let (p, n) = row?;
        runs.insert(p, n);
    }
    let mut contaminated: HashMap<i64, Vec<String>> = HashMap::new();
    for (plate, locus) in contaminated_plate_loci(c, only)? {
        contaminated.entry(plate).or_default().push(locus.1);
    }
    let mut quality = crate::quality::summaries(c)?;
    for p in &mut plates {
        p.quality = quality.remove(&p.id);
        p.sizing = counts.remove(&p.id).unwrap_or_default();
        p.run_count = runs.get(&p.id).copied().unwrap_or(0);
        p.has_plate_map = p.run_count > 0;
        p.contaminated_loci = contaminated.remove(&p.id).unwrap_or_default();
    }
    Ok(plates)
}

/// Loci assigned to each well (label, size range), for wells matching `filter`
/// (a `WHERE` clause over `w`, or empty).
fn well_loci(c: &Connection, filter: &str) -> Result<HashMap<i64, Vec<sizing::WellLocus>>> {
    let mut st = c.prepare(&format!(
        "SELECT DISTINCT c.well_id, l.label, l.min_base_length, l.max_base_length
         FROM run r JOIN channel c ON c.id = r.channel_id JOIN locus l ON l.id = r.locus_id
         JOIN well w ON w.id = c.well_id {filter}"
    ))?;
    let mut out: HashMap<i64, Vec<sizing::WellLocus>> = HashMap::new();
    for row in st.query_map([], |r| {
        Ok((r.get::<_, i64>(0)?, (r.get(1)?, r.get(2)?, r.get(3)?)))
    })? {
        let (w, l) = row?;
        out.entry(w).or_default().push(l);
    }
    Ok(out)
}

/// A well's plate id, sizing state and reason.
pub(crate) type WellState = (i64, SizingState, Option<String>);

/// Sizing state and reason of every well matching `filter` (a `WHERE` clause
/// over `w`, or empty): well id → (plate id, state, reason).
pub(crate) fn well_states(c: &Connection, filter: &str) -> Result<HashMap<i64, WellState>> {
    let specs = ladder_specs(c)?;
    let loci = well_loci(c, filter)?;
    let mut st = c.prepare(&format!(
        "SELECT w.id, w.plate_id, p.ladder_id, w.sizing_quality, w.ladder_peak_sizes, w.sizing_error
         FROM well w JOIN plate p ON p.id = w.plate_id {filter}"
    ))?;
    let default = LadderSpec::default();
    let rows = st.query_map([], |r| {
        let id: i64 = r.get(0)?;
        let spec = specs.get(&r.get::<_, i64>(2)?).unwrap_or(&default);
        let sizes: Vec<f64> = json_col(r, 4)?;
        let error: Option<String> = r.get(5)?;
        let (state, reason) = sizing::assess_well(
            r.get(3)?,
            &sizes,
            error.as_deref(),
            spec,
            loci.get(&id).map_or(&[], |v| v.as_slice()),
        );
        Ok((id, (r.get(1)?, state, reason)))
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Where each ladder size lands on a plate, from its usable, unambiguous
/// wells other than `except`. None when there is none.
fn plate_prior(
    c: &Connection,
    plate_id: i64,
    except: i64,
    spec: &LadderSpec,
) -> Result<Option<LadderPrior>> {
    let mut st = c.prepare(
        "SELECT ladder_peak_indices, ladder_peak_sizes, sizing_quality FROM well
         WHERE plate_id = ?1 AND id != ?2 AND sizing_quality IS NOT NULL AND sizing_error IS NULL",
    )?;
    let fits: Vec<(Vec<usize>, Vec<f64>)> = st
        .query_map([plate_id, except], |r| {
            let idx: Vec<usize> = json_col(r, 0)?;
            let sizes: Vec<f64> = json_col(r, 1)?;
            Ok((idx, sizes, r.get::<_, Option<f64>>(2)?))
        })?
        .filter_map(|row| match row {
            Ok((idx, sizes, q)) if sizing::state(q, &sizes, spec).usable() => {
                Some(Ok((idx, sizes)))
            }
            Ok(_) => None,
            Err(e) => Some(Err(e)),
        })
        .collect::<rusqlite::Result<_>>()?;
    Ok(LadderPrior::from_fits(
        spec,
        fits.iter().map(|(i, s)| (i.as_slice(), s.as_slice())),
    ))
}

/// `(plate_id, (locus_id, locus_label))` pairs with a negative control above the limit.
pub fn contaminated_plate_loci(
    c: &Connection,
    only: Option<i64>,
) -> Result<Vec<(i64, (i64, String))>> {
    let limit = crate::db::contamination_limit(c)?;
    let filter = only.map_or(String::new(), |id| format!("AND w.plate_id = {id}"));
    let mut st = c.prepare(&format!(
        "SELECT DISTINCT w.plate_id, l.id, l.label FROM run r JOIN sample s ON s.id = r.sample_id
         JOIN locus l ON l.id = r.locus_id JOIN channel c ON c.id = r.channel_id
         JOIN well w ON w.id = c.well_id
         WHERE s.designation = 'negative_control' AND r.max_signal > ?1 {filter}
         ORDER BY l.label"
    ))?;
    let v = st
        .query_map([limit], |r| Ok((r.get(0)?, (r.get(1)?, r.get(2)?))))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

fn list(e: &Engine, _: ()) -> Result<Vec<PlateSummary>> {
    e.workspace()?.read(|c| plate_summaries(c, None))
}

/// Runs of a plate (or of one well) by channel id.
fn runs_by_channel(
    c: &Connection,
    plate_id: i64,
    well_id: Option<i64>,
) -> Result<HashMap<i64, Vec<RunSummary>>> {
    let limit = crate::db::contamination_limit(c)?;
    let hot: std::collections::HashSet<i64> = contaminated_plate_loci(c, Some(plate_id))?
        .into_iter()
        .map(|(_, (l, _))| l)
        .collect();
    let wf = well_id.map_or(String::new(), |w| format!("AND w.id = {w}"));
    let mut st = c.prepare(&format!(
        "SELECT r.channel_id, r.id, l.id, l.label, s.id, s.barcode, s.designation, r.max_signal
         FROM run r JOIN locus l ON l.id = r.locus_id JOIN sample s ON s.id = r.sample_id
         JOIN channel c ON c.id = r.channel_id JOIN well w ON w.id = c.well_id
         WHERE w.plate_id = ?1 {wf} ORDER BY l.min_base_length"
    ))?;
    let mut out: HashMap<i64, Vec<RunSummary>> = HashMap::new();
    let rows = st.query_map([plate_id], |r| {
        let designation = Designation::from_db(&r.get::<_, String>(6)?);
        let max_signal: Option<i32> = r.get(7)?;
        let locus_id: i64 = r.get(2)?;
        Ok((
            r.get::<_, i64>(0)?,
            RunSummary {
                id: r.get(1)?,
                locus_id,
                locus_label: r.get(3)?,
                sample_id: r.get(4)?,
                sample_barcode: r.get(5)?,
                designation,
                max_signal,
                contaminated: designation == Designation::NegativeControl
                    && max_signal.is_some_and(|m| i64::from(m) > limit),
                locus_contaminated: hot.contains(&locus_id),
            },
        ))
    })?;
    for row in rows {
        let (ch, run) = row?;
        out.entry(ch).or_default().push(run);
    }
    Ok(out)
}

fn get(e: &Engine, p: IdParams) -> Result<PlateDetail> {
    e.workspace()?.read(|c| {
        let plate = plate_summaries(c, Some(p.id))?
            .pop()
            .or_not_found(|| format!("Plate {} does not exist", p.id))?;
        let mut states = well_states(c, &format!("WHERE w.plate_id = {}", p.id))?;
        let mut runs = runs_by_channel(c, p.id, None)?;
        let mut channels: HashMap<i64, Vec<ChannelSummary>> = HashMap::new();
        let mut st = c.prepare(
            "SELECT c.well_id, c.id, c.color, c.max_signal FROM channel c JOIN well w ON w.id = c.well_id
             WHERE w.plate_id = ?1 ORDER BY c.dye_number",
        )?;
        for row in st.query_map([p.id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, color_col(r, 2)?, r.get(3)?)))? {
            let (well, id, color, max_signal) = row?;
            channels.entry(well).or_default().push(ChannelSummary {
                id,
                color,
                max_signal,
                runs: runs.remove(&id).unwrap_or_default(),
            });
        }
        let mut st = c.prepare(
            "SELECT id, label, sample_name, sizing_quality, sizing_error, manual_ladder, offscale_indices
             FROM well WHERE plate_id = ?1",
        )?;
        let mut wells: Vec<WellSummary> = st
            .query_map([p.id], |r| {
                let id: i64 = r.get(0)?;
                let q: Option<f64> = r.get(3)?;
                let off: Vec<usize> = json_col(r, 6)?;
                let (_, state, reason) = states
                    .remove(&id)
                    .unwrap_or((p.id, SizingState::Failed, None));
                Ok(WellSummary {
                    id,
                    label: r.get(1)?,
                    sample_name: r.get(2)?,
                    sizing: state,
                    sizing_quality: q,
                    sizing_error: r.get(4)?,
                    sizing_reason: reason,
                    manual_ladder: r.get(5)?,
                    offscale_count: off.len() as u32,
                    channels: Vec::new(),
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        for w in &mut wells {
            w.channels = channels.remove(&w.id).unwrap_or_default();
        }
        wells.sort_by_key(|w| well_order_key(&w.label));
        let hot: std::collections::HashSet<i64> = contaminated_plate_loci(c, Some(p.id))?
            .into_iter()
            .map(|(_, (l, _))| l)
            .collect();
        let mut st = c.prepare(
            "SELECT l.id, l.label, l.color, COUNT(*) FROM run r JOIN locus l ON l.id = r.locus_id
             JOIN channel c ON c.id = r.channel_id JOIN well w ON w.id = c.well_id
             WHERE w.plate_id = ?1 GROUP BY l.id ORDER BY l.label",
        )?;
        let loci = st
            .query_map([p.id], |r| {
                let locus_id: i64 = r.get(0)?;
                Ok(PlateLocus {
                    locus_id,
                    label: r.get(1)?,
                    color: color_col(r, 2)?,
                    run_count: r.get(3)?,
                    contaminated: hot.contains(&locus_id),
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        Ok(PlateDetail { plate, wells, loci })
    })
}

/// Sort key for row-major well order (`A01, A02, …`); unparsable labels last.
pub(crate) fn well_order_key(label: &str) -> (u32, u32, String) {
    microspat_core::plate::Well::parse(label)
        .map(|w| (w.row, w.column, String::new()))
        .unwrap_or((u32::MAX, u32::MAX, label.to_string()))
}

fn decode_blob(blob: Option<Vec<u8>>) -> Result<Vec<i16>> {
    blob.map_or(Ok(Vec::new()), |b| {
        codec::decode(&b).map_err(|e| RpcError::internal(e.to_string()))
    })
}

fn run_traces(e: &Engine, p: IdParams) -> Result<PlateRunTraces> {
    e.workspace()?.read(|c| {
        let blobs: RunTraceBlobs = c
            .query_row(
                "SELECT voltage, current, power, temperature FROM plate WHERE id = ?1",
                [p.id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()?
            .or_not_found(|| format!("Plate {} does not exist", p.id))?;
        Ok(PlateRunTraces {
            voltage: decode_blob(blobs.0)?,
            current: decode_blob(blobs.1)?,
            power: decode_blob(blobs.2)?,
            temperature: decode_blob(blobs.3)?,
        })
    })
}

fn delete(e: &Engine, p: IdParams) -> Result<()> {
    e.workspace()?.write(|tx| {
        plate_ladder(tx, p.id)?;
        // Calls keep their reference run; deleting it would silently discard
        // reviewed results. Other uses (estimator inputs, non-reference runs)
        // only make results stale, which the fingerprints report.
        let users = super::projects::projects_referencing_runs(tx, &format!("w.plate_id = {}", p.id))?;
        if !users.is_empty() {
            let label: String =
                tx.query_row("SELECT label FROM plate WHERE id = ?1", [p.id], |r| r.get(0))?;
            let names: Vec<String> = users
                .iter()
                .map(|(n, k)| format!("{n} ({k} calls)"))
                .collect();
            return Err(RpcError::in_use(format!(
                "Plate {label} holds the reference runs of calls in {}. Remove those samples from the projects (or delete the projects) first.",
                super::some_of(&names, 5)
            )));
        }
        tx.execute("DELETE FROM plate WHERE id = ?1", [p.id])?;
        Ok(())
    })?;
    e.changed(PLATES, Some(vec![p.id]));
    e.changed(SAMPLES, None);
    e.changed(LOCI, None);
    e.changed(LADDERS, None);
    Ok(())
}

/// The stored ladder fit of a well.
#[derive(Debug, Clone)]
pub struct StoredFit {
    pub peak_indices: Vec<usize>,
    pub peak_sizes: Vec<f64>,
    pub quality: Option<f64>,
    pub error: Option<String>,
}

impl StoredFit {
    /// From a fit attempt. An ambiguous assignment keeps its explanation in
    /// `error` next to the quality (see `sizing`).
    pub fn from_result(r: &std::result::Result<LadderFit, String>) -> StoredFit {
        match r {
            Ok(f) if f.sizing_quality.is_finite() => StoredFit {
                peak_indices: f.peak_indices.clone(),
                peak_sizes: f.peak_sizes.clone(),
                quality: Some(f.sizing_quality),
                error: f.ambiguity.as_ref().map(|a| a.reason(&f.peak_sizes)),
            },
            Ok(f) => StoredFit {
                peak_indices: f.peak_indices.clone(),
                peak_sizes: f.peak_sizes.clone(),
                quality: None,
                error: Some("sizing quality is undefined".into()),
            },
            Err(e) => StoredFit {
                peak_indices: Vec::new(),
                peak_sizes: Vec::new(),
                quality: None,
                error: Some(e.clone()),
            },
        }
    }

    /// Base sizes for a trace of `len` points; None when there is no usable fit.
    pub fn base_sizes(&self, len: usize, precision: u32) -> Option<Vec<f64>> {
        self.quality?;
        sizing::base_sizes(&self.peak_indices, &self.peak_sizes, len, precision)
    }
}

/// Writes a well's fit.
pub(crate) fn store_fit(c: &Connection, well_id: i64, fit: &StoredFit, manual: bool) -> Result<()> {
    c.execute(
        "UPDATE well SET ladder_peak_indices = ?1, ladder_peak_sizes = ?2, sizing_quality = ?3,
         sizing_error = ?4, manual_ladder = ?5 WHERE id = ?6",
        params![
            serde_json::to_string(&fit.peak_indices)?,
            serde_json::to_string(&fit.peak_sizes)?,
            fit.quality,
            fit.error,
            manual,
            well_id
        ],
    )?;
    Ok(())
}

pub(crate) fn load_fit(c: &Connection, well_id: i64) -> Result<(StoredFit, usize)> {
    c.query_row(
        "SELECT ladder_peak_indices, ladder_peak_sizes, sizing_quality, sizing_error, trace_len FROM well WHERE id = ?1",
        [well_id],
        |r| {
            Ok((
                StoredFit {
                    peak_indices: json_col(r, 0)?,
                    peak_sizes: json_col(r, 1)?,
                    quality: r.get(2)?,
                    error: r.get(3)?,
                },
                r.get::<_, i64>(4)? as usize,
            ))
        },
    )
    .optional()?
    .or_not_found(|| format!("Well {well_id} does not exist"))
}

/// Traces of every channel of the given wells: well id → [(channel id, color, trace)].
pub(crate) fn load_well_traces(
    c: &Connection,
    where_clause: &str,
) -> Result<BTreeMap<i64, WellTraces>> {
    let mut st = c.prepare(&format!(
        "SELECT c.well_id, c.id, c.color, t.data FROM channel c JOIN trace t ON t.channel_id = c.id
         JOIN well w ON w.id = c.well_id WHERE {where_clause} ORDER BY c.dye_number"
    ))?;
    let raw: Vec<(i64, i64, Color, Vec<u8>)> = st
        .query_map([], |r| {
            Ok((r.get(0)?, r.get(1)?, color_col(r, 2)?, r.get(3)?))
        })?
        .collect::<rusqlite::Result<_>>()?;
    let decoded: Vec<(i64, i64, Color, Vec<i16>)> = raw
        .into_par_iter()
        .map(|(w, ch, color, blob)| {
            codec::decode(&blob)
                .map(|t| (w, ch, color, t))
                .map_err(|e| RpcError::internal(format!("channel {ch}: {e}")))
        })
        .collect::<Result<_>>()?;
    let mut out: BTreeMap<i64, WellTraces> = BTreeMap::new();
    for (w, ch, color, t) in decoded {
        out.entry(w).or_default().push((ch, color, t));
    }
    Ok(out)
}

/// How a well's ladder is fitted.
enum FitRequest {
    /// Automatic fit; an ambiguous one is settled with the plate's prior.
    Auto(Option<LadderPrior>),
    /// Hand-picked peaks; sizes assigned by the fitter with the plate's prior.
    Indices(Vec<usize>, Option<LadderPrior>),
    /// Hand-picked peaks with stated sizes.
    Assigned(Vec<(usize, f64)>),
}

impl FitRequest {
    fn is_manual(&self) -> bool {
        !matches!(self, FitRequest::Auto(_))
    }

    /// From `set_well_ladder_peaks` params; the prior is read from the plate.
    fn from_params(
        c: &Connection,
        p: &SetWellLadderPeaksParams,
        plate_id: i64,
        spec: &LadderSpec,
    ) -> Result<FitRequest> {
        // Shared by set and preview, so both reject the same input the same way.
        Ok(match (&p.peaks, &p.peak_indices) {
            (Some(_), Some(_)) => {
                return Err(RpcError::invalid(
                    "Give either peaks (with sizes) or peak_indices, not both.",
                ))
            }
            (Some(v), None) if v.is_empty() => {
                return Err(RpcError::invalid(
                    "No ladder peaks were given. Pick the ladder peaks, or omit peaks and peak_indices for the automatic fit.",
                ))
            }
            (None, Some(v)) if v.is_empty() => {
                return Err(RpcError::invalid(
                    "No ladder peaks were given. Pick the ladder peaks, or omit peaks and peak_indices for the automatic fit.",
                ))
            }
            (Some(peaks), None) => {
                FitRequest::Assigned(peaks.iter().map(|k| (k.index, k.size)).collect())
            }
            (None, Some(idx)) => {
                FitRequest::Indices(idx.clone(), plate_prior(c, plate_id, p.id, spec)?)
            }
            (None, None) => FitRequest::Auto(plate_prior(c, plate_id, p.id, spec)?),
        })
    }
}

/// Fits one well from its channel traces.
fn fit_channels(
    channels: &[(i64, Color, Vec<i16>)],
    spec: &LadderSpec,
    request: &FitRequest,
) -> std::result::Result<LadderFit, String> {
    let ladder = ladder_channel(channels, spec)?;
    match request {
        FitRequest::Indices(idx, prior) => {
            ladder::refit_ladder_with_prior(ladder, idx, spec, prior.as_ref())
                .map_err(|e| e.to_string())
        }
        FitRequest::Assigned(pairs) => {
            ladder::fit_assigned(ladder.len(), pairs, spec).map_err(|e| e.to_string())
        }
        FitRequest::Auto(prior) => {
            ladder::fit_ladder_in_plate(ladder, &other_dyes(channels, spec), spec, prior.as_ref())
                .map_err(|e| e.to_string())
        }
    }
}

fn ladder_channel<'a>(
    channels: &'a [(i64, Color, Vec<i16>)],
    spec: &LadderSpec,
) -> std::result::Result<&'a [i16], String> {
    channels
        .iter()
        .find(|(_, c, _)| *c == spec.color)
        .map(|(_, _, t)| t.as_slice())
        .ok_or_else(|| {
            format!(
                "the well has no {} dye channel for the ladder",
                color_str(spec.color)
            )
        })
}

fn other_dyes<'a>(channels: &'a [(i64, Color, Vec<i16>)], spec: &LadderSpec) -> Vec<&'a [i16]> {
    channels
        .iter()
        .filter(|(_, c, _)| *c != spec.color)
        .map(|(_, _, t)| t.as_slice())
        .collect()
}

/// Stores new fits and refreshes the channel signals of the given wells.
fn store_fits(tx: &Connection, fits: &[FitUpdate], manual: bool) -> Result<()> {
    let mut upd = tx.prepare("UPDATE channel SET max_signal = ?1 WHERE id = ?2")?;
    for (well, fit, signals) in fits {
        store_fit(tx, *well, fit, manual)?;
        for (ch, s) in signals {
            upd.execute(params![s.map(i32::from), ch])?;
        }
    }
    Ok(())
}

fn size_plate(e: &Engine, p: SizePlateParams) -> Result<PlateSummary> {
    let ws = e.workspace()?;
    let label = ws.read(|c| {
        Ok(plate_summaries(c, Some(p.id))?
            .pop()
            .or_not_found(|| format!("Plate {} does not exist", p.id))?
            .label)
    })?;
    let ladder_id = p.ladder_id;
    let summary = e.run_task("size_plate", format!("Sizing {label}"), move |task| {
        let ws = task.engine().workspace()?;
        let spec = match ladder_id {
            Some(id) => ws.read(|c| super::ladders::load(c, id))?.spec,
            None => ws.read(|c| plate_ladder(c, p.id))?.2,
        };
        task.report(0.05, "Loading traces");
        let wells = ws.read(|c| load_well_traces(c, &format!("w.plate_id = {}", p.id)))?;
        task.report(0.3, "Fitting ladders");
        let wells: Vec<(i64, WellTraces)> = wells.into_iter().collect();
        let mut results: Vec<std::result::Result<LadderFit, String>> = wells
            .par_iter()
            .map(|(_, channels)| fit_channels(channels, &spec, &FitRequest::Auto(None)))
            .collect();
        ladder::resolve_with_plate(&spec, &mut results, |k, prior| {
            let channels = &wells[k].1;
            let trace = ladder_channel(channels, &spec)?;
            ladder::fit_ladder_with_prior(trace, &other_dyes(channels, &spec), &spec, Some(prior))
                .map_err(|e| e.to_string())
        });
        let fits: Vec<FitUpdate> = wells
            .iter()
            .zip(&results)
            .map(|((well, channels), result)| {
                let fit = StoredFit::from_result(result);
                let signals = channels
                    .iter()
                    .map(|(ch, _, t)| (*ch, sizing::sized_max_signal(t, &fit.peak_indices)))
                    .collect();
                (*well, fit, signals)
            })
            .collect();
        task.report(0.7, "Checking quality");
        let new_fits: HashMap<i64, StoredFit> =
            fits.iter().map(|(w, f, _)| (*w, f.clone())).collect();
        let report = ws.read(|c| crate::quality::assess_with(c, p.id, &spec, &wells, &new_fits))?;
        task.report(0.8, "Saving");
        ws.write(|tx| {
            if let Some(id) = ladder_id {
                tx.execute("UPDATE plate SET ladder_id = ?1 WHERE id = ?2", [id, p.id])?;
            }
            store_fits(tx, &fits, false)?;
            crate::quality::store(tx, p.id, &report)?;
            super::plate_map::recompute_run_signals(tx, &format!("w.plate_id = {}", p.id))?;
            Ok(())
        })?;
        let e = task.engine();
        e.changed(PLATES, Some(vec![p.id]));
        e.changed(SAMPLES, None);
        if ladder_id.is_some() {
            e.changed(LADDERS, None);
        }
        ws.read(|c| plate_summaries(c, Some(p.id)))?
            .pop()
            .or_not_found(|| format!("Plate {} does not exist", p.id))
    })?;
    Ok(summary)
}

/// Loads the detail of one well.
pub fn load_well(c: &Connection, id: i64, traces: bool) -> Result<WellDetail> {
    #[allow(clippy::type_complexity)]
    let (plate_id, plate_label, label, sample_name, manual, offscale): (i64, String, String, Option<String>, bool, Vec<usize>) = c
        .query_row(
            "SELECT w.plate_id, p.label, w.label, w.sample_name, w.manual_ladder, w.offscale_indices
             FROM well w JOIN plate p ON p.id = w.plate_id WHERE w.id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, json_col(r, 5)?)),
        )
        .optional()?
        .or_not_found(|| format!("Well {id} does not exist"))?;
    let (ladder_id, ladder_label, spec) = plate_ladder(c, plate_id)?;
    let (fit, len) = load_fit(c, id)?;
    let loci = well_loci(c, &format!("WHERE w.id = {id}"))?
        .remove(&id)
        .unwrap_or_default();
    let (state, reason) = sizing::assess_well(
        fit.quality,
        &fit.peak_sizes,
        fit.error.as_deref(),
        &spec,
        &loci,
    );
    let mut runs = runs_by_channel(c, plate_id, Some(id))?;
    let mut ladder_candidates = None;
    let mut traces_by_channel: HashMap<i64, Vec<i16>> = if traces {
        let channels = load_well_traces(c, &format!("w.id = {id}"))?
            .remove(&id)
            .unwrap_or_default();
        if let Ok(trace) = ladder_channel(&channels, &spec) {
            ladder_candidates =
                ladder::ladder_candidates(trace, &other_dyes(&channels, &spec), &spec)
                    .ok()
                    .map(|v| {
                        v.into_iter()
                            .map(|(index, height)| LadderCandidate { index, height })
                            .collect()
                    });
        }
        channels.into_iter().map(|(ch, _, t)| (ch, t)).collect()
    } else {
        HashMap::new()
    };
    let mut st = c.prepare(
        "SELECT id, color, dye_number, dye_name, wavelength, max_signal FROM channel WHERE well_id = ?1 ORDER BY dye_number",
    )?;
    let channels = st
        .query_map([id], |r| {
            let ch: i64 = r.get(0)?;
            Ok(WellChannel {
                id: ch,
                color: color_col(r, 1)?,
                dye_number: r.get(2)?,
                dye_name: r.get(3)?,
                wavelength: r.get(4)?,
                max_signal: r.get(5)?,
                trace: traces_by_channel.remove(&ch),
                runs: runs.remove(&ch).unwrap_or_default(),
            })
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(WellDetail {
        id,
        plate_id,
        plate_label,
        label,
        sample_name,
        ladder: LadderRef {
            id: ladder_id,
            label: ladder_label,
            color: spec.color,
        },
        sizing: state,
        sizing_quality: fit.quality,
        sizing_error: fit.error.clone(),
        sizing_reason: reason,
        manual_ladder: manual,
        ladder_peaks: fit
            .peak_indices
            .iter()
            .zip(&fit.peak_sizes)
            .map(|(&index, &size)| LadderPeak { index, size })
            .collect(),
        ladder_candidates,
        offscale_indices: offscale,
        trace_len: len as u32,
        base_sizes: if traces {
            fit.base_sizes(len, spec.base_size_precision)
        } else {
            None
        },
        channels,
    })
}

fn get_well(e: &Engine, p: GetWellParams) -> Result<WellDetail> {
    e.workspace()?
        .read(|c| load_well(c, p.id, p.traces.unwrap_or(true)))
}

fn set_well_ladder_peaks(e: &Engine, p: SetWellLadderPeaksParams) -> Result<WellDetail> {
    let ws = e.workspace()?;
    let (plate_id, detail) = ws.write(|tx| {
        let plate_id: i64 = tx
            .query_row("SELECT plate_id FROM well WHERE id = ?1", [p.id], |r| {
                r.get(0)
            })
            .optional()?
            .or_not_found(|| format!("Well {} does not exist", p.id))?;
        let (_, _, spec) = plate_ladder(tx, plate_id)?;
        let request = FitRequest::from_params(tx, &p, plate_id, &spec)?;
        let channels = load_well_traces(tx, &format!("w.id = {}", p.id))?
            .remove(&p.id)
            .unwrap_or_default();
        let result = fit_channels(&channels, &spec, &request);
        if let (true, Err(msg)) = (request.is_manual(), &result) {
            return Err(RpcError::invalid(format!(
                "Cannot fit the ladder with these peaks: {msg}"
            )));
        }
        let fit = StoredFit::from_result(&result);
        let signals = channels
            .iter()
            .map(|(ch, _, t)| (*ch, sizing::sized_max_signal(t, &fit.peak_indices)))
            .collect();
        store_fits(tx, &[(p.id, fit, signals)], request.is_manual())?;
        super::plate_map::recompute_run_signals(tx, &format!("w.id = {}", p.id))?;
        Ok((plate_id, load_well(tx, p.id, false)?))
    })?;
    // One well's fit moves the plate's consensus and that well's sized
    // range; the report is cheap enough to measure again whole.
    crate::quality::recompute(&ws, &[plate_id])?;
    e.changed(PLATES, Some(vec![plate_id]));
    e.changed(SAMPLES, None);
    Ok(detail)
}

fn preview_well_ladder_peaks(e: &Engine, p: SetWellLadderPeaksParams) -> Result<LadderPreview> {
    e.workspace()?.read(|c| {
        let plate_id: i64 = c
            .query_row("SELECT plate_id FROM well WHERE id = ?1", [p.id], |r| {
                r.get(0)
            })
            .optional()?
            .or_not_found(|| format!("Well {} does not exist", p.id))?;
        let (_, _, spec) = plate_ladder(c, plate_id)?;
        let request = FitRequest::from_params(c, &p, plate_id, &spec)?;
        let channels = load_well_traces(c, &format!("w.id = {}", p.id))?
            .remove(&p.id)
            .unwrap_or_default();
        Ok(match fit_channels(&channels, &spec, &request) {
            Err(msg) => LadderPreview {
                sizing: SizingState::Failed,
                sizing_quality: None,
                reason: Some(capitalize(&msg)),
                peaks: Vec::new(),
            },
            Ok(fit) => {
                let fit = StoredFit::from_result(&Ok(fit));
                let loci = well_loci(c, &format!("WHERE w.id = {}", p.id))?
                    .remove(&p.id)
                    .unwrap_or_default();
                let (sizing, reason) = sizing::assess_well(
                    fit.quality,
                    &fit.peak_sizes,
                    fit.error.as_deref(),
                    &spec,
                    &loci,
                );
                LadderPreview {
                    sizing,
                    sizing_quality: fit.quality,
                    reason,
                    peaks: fit
                        .peak_indices
                        .iter()
                        .zip(&fit.peak_sizes)
                        .map(|(&index, &size)| LadderPeak { index, size })
                        .collect(),
                }
            }
        })
    })
}

/// First letter upper-cased, for core error messages shown as sentences.
fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        Some(f) => f.to_uppercase().chain(c).collect::<String>() + ".",
        None => String::new(),
    }
}

fn get_channel_trace(e: &Engine, p: IdParams) -> Result<ChannelTrace> {
    e.workspace()?.read(|c| {
        let (well_id, color, plate_id, blob): (i64, Color, i64, Vec<u8>) = c
            .query_row(
                "SELECT c.well_id, c.color, w.plate_id, t.data FROM channel c JOIN well w ON w.id = c.well_id
                 JOIN trace t ON t.channel_id = c.id WHERE c.id = ?1",
                [p.id],
                |r| Ok((r.get(0)?, color_col(r, 1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()?
            .or_not_found(|| format!("Channel {} does not exist", p.id))?;
        let trace = codec::decode(&blob).map_err(|e| RpcError::internal(e.to_string()))?;
        let (_, _, spec) = plate_ladder(c, plate_id)?;
        let (fit, len) = load_fit(c, well_id)?;
        Ok(ChannelTrace {
            channel_id: p.id,
            well_id,
            color,
            trace,
            base_sizes: fit.base_sizes(len, spec.base_size_precision),
        })
    })
}
