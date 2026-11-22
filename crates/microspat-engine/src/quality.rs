//! Plate quality reports as stored in the workspace (`plate_quality`, one
//! row per plate; core's `quality` module has the measurements).
//!
//! **When it is computed.** `import_plates` and `size_plate` measure every
//! well in the same parallel pass that fits the ladders, from traces
//! already in memory, and store the report in the plate's own write
//! transaction. `set_well_ladder_peaks` recomputes the plate's report after
//! its commit (one well's fit moves the plate's consensus and that well's
//! sized range). The negative-control part depends on the plate map and on
//! sample designations, so the mutations that change those
//! (`apply_plate_map`, `clear_plate_map`, designation and locus-range
//! updates) refresh only that part, from the negative-control wells and
//! their neighbors, and derive the issues again.
//!
//! **Older workspaces.** A plate imported before reports existed has no
//! row; `get_plate_quality` says so and `compute_plate_quality` fills it.
//! Opening a workspace does not compute anything by itself: a plate takes
//! about as long to measure as to import, and a background pass would race
//! the user's own edits for the writer. The plate list shows such plates as
//! not checked, and one call checks them all.

use crate::api::plates::{load_well_traces, StoredFit, WellTraces};
use crate::api::{color_col, id_list, json_col};
use crate::error::{Result, RpcError};
use crate::sizing;
use crate::Workspace;
use microspat_core::ladder::LadderSpec;
use microspat_core::peaks::DyePullUp;
use microspat_core::plate::{PlateSize, Well};
use microspat_core::quality::{
    self, ControlRun, ControlSignal, LeakEstimate, PlateQuality, QualityLimits, Severity, WellFlag,
    WellInput, WellLadder, WellMeasurement, CONTROL_NEIGHBOR_DISTANCE, QUALITY_VERSION,
};
use microspat_core::Color;
use rayon::prelude::*;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use ts_rs::TS;

/// Slim deserialization of a stored `PlateQuality` report for pull-up lookups
/// and staleness checks, skipping per-well numeric metrics, crosstalk, controls
/// and issues.
#[derive(Deserialize)]
struct WellFlagsSlice {
    well: String,
    flags: Vec<WellFlag>,
}

#[derive(Deserialize)]
struct PullUpReportSlice {
    version: u32,
    pull_up: Vec<LeakEstimate>,
    wells: Vec<WellFlagsSlice>,
}

/// Parsed per-plate pull-up data and unseparated capillary wells cached for
/// peak annotation, staleness fingerprints, and run-view annotations.
#[derive(Debug, Clone)]
pub(crate) struct PlatePullUpData {
    pub version: u32,
    pub by_target: HashMap<Color, DyePullUp>,
    pub raw_by_target: HashMap<Color, Vec<LeakEstimate>>,
    pub unseparated_wells: HashSet<String>,
}

impl PlatePullUpData {
    fn from_slice(q: PullUpReportSlice) -> Self {
        let mut by_target: HashMap<Color, DyePullUp> = HashMap::new();
        let mut raw_by_target: HashMap<Color, Vec<LeakEstimate>> = HashMap::new();
        for l in q.pull_up {
            if let (Some(frac), Some(spread)) = (l.fraction, l.spread) {
                by_target
                    .entry(l.target)
                    .or_default()
                    .sources
                    .push((l.source, frac, spread));
                raw_by_target.entry(l.target).or_default().push(l);
            }
        }
        for pu in by_target.values_mut() {
            pu.sources.sort_by_key(|(c, _, _)| *c);
        }
        for v in raw_by_target.values_mut() {
            v.sort_by_key(|l| l.source);
        }
        let unseparated_wells: HashSet<String> = q
            .wells
            .into_iter()
            .filter(|w| w.flags.contains(&WellFlag::UnseparatedDyes))
            .map(|w| w.well)
            .collect();
        PlatePullUpData {
            version: q.version,
            by_target,
            raw_by_target,
            unseparated_wells,
        }
    }
}

/// Loads current (`version >= QUALITY_VERSION`) plate pull-up data for `plate_ids`.
pub(crate) fn load_pull_up_for_plates(
    c: &Connection,
    plate_ids: &[i64],
) -> Result<HashMap<i64, PlatePullUpData>> {
    if plate_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let mut st = c.prepare(&format!(
        "SELECT plate_id, report FROM plate_quality WHERE version >= ?1 AND plate_id IN ({})",
        id_list(plate_ids)
    ))?;
    let rows = st.query_map([QUALITY_VERSION], |r| {
        Ok((r.get::<_, i64>(0)?, json_col::<PullUpReportSlice>(r, 1)?))
    })?;
    let mut out = HashMap::new();
    for row in rows {
        let (pid, report) = row?;
        out.insert(pid, PlatePullUpData::from_slice(report));
    }
    Ok(out)
}

/// Loads all current (`version >= QUALITY_VERSION`) plate pull-up data in the workspace.
pub(crate) fn load_all_pull_up(c: &Connection) -> Result<HashMap<i64, PlatePullUpData>> {
    let mut st =
        c.prepare_cached("SELECT plate_id, report FROM plate_quality WHERE version >= ?1")?;
    let rows = st.query_map([QUALITY_VERSION], |r| {
        Ok((r.get::<_, i64>(0)?, json_col::<PullUpReportSlice>(r, 1)?))
    })?;
    let mut out = HashMap::new();
    for row in rows {
        let (pid, report) = row?;
        out.insert(pid, PlatePullUpData::from_slice(report));
    }
    Ok(out)
}

/// Issue counts of a plate's report, for the plate list.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, TS)]
pub struct QualitySummary {
    pub problems: u32,
    pub warnings: u32,
    pub infos: u32,
    /// Worst severity; null when the report lists no issue.
    pub worst: Option<Severity>,
    /// Measured with an older version of the checks.
    pub outdated: bool,
}

impl QualitySummary {
    pub fn of(q: &PlateQuality) -> QualitySummary {
        let count = |s: Severity| q.issues.iter().filter(|i| i.severity == s).count() as u32;
        QualitySummary {
            problems: count(Severity::Problem),
            warnings: count(Severity::Warning),
            infos: count(Severity::Info),
            worst: q.issues.iter().map(|i| i.severity).max(),
            outdated: q.version < quality::QUALITY_VERSION,
        }
    }
}

/// One well's data as the measurements need it.
pub(crate) struct QualityWell<'a> {
    pub label: &'a str,
    pub dyes: Vec<(Color, &'a [i16])>,
    pub fit: &'a StoredFit,
    pub offscale: &'a [usize],
}

/// A negative-control run to check: well id, well label, locus label and
/// range, sample barcode, dye.
#[derive(Debug, Clone)]
pub(crate) struct ControlRunRow {
    pub well_id: i64,
    pub well: String,
    pub locus: String,
    pub min: f64,
    pub max: f64,
    pub sample: String,
    pub color: Color,
    pub offscale_indices: Vec<usize>,
}

fn reference(fit: &StoredFit, spec: &LadderSpec) -> bool {
    fit.error.is_none() && sizing::state(fit.quality, &fit.peak_sizes, spec).usable()
}

fn input<'a>(w: &QualityWell<'a>, spec: &LadderSpec) -> Option<WellInput<'a>> {
    let well = Well::parse(w.label).ok()?;
    Some(WellInput {
        well,
        dyes: w.dyes.clone(),
        ladder: w.fit.quality.map(|q| WellLadder {
            peak_indices: &w.fit.peak_indices,
            peak_sizes: &w.fit.peak_sizes,
            sizing_quality: q,
            reference: reference(w.fit, spec),
        }),
        offscale_indices: w.offscale,
    })
}

/// Measures a plate in parallel (core `assess_plate_with_limits`, spread over wells).
pub(crate) fn assess(
    wells: &[QualityWell<'_>],
    spec: &LadderSpec,
    size: PlateSize,
    controls: Option<Vec<ControlSignal>>,
    limits: QualityLimits,
) -> PlateQuality {
    let inputs: Vec<WellInput<'_>> = wells.iter().filter_map(|w| input(w, spec)).collect();
    let measured: Vec<WellMeasurement> = inputs
        .par_iter()
        .map(|w| quality::measure_well(w, spec, size))
        .collect();
    let caps: Vec<Option<(u8, u32)>> = inputs
        .iter()
        .map(|w| microspat_core::plate::capillary(w.well, size))
        .collect();
    let by_cap: HashMap<(u8, u32), usize> = caps
        .iter()
        .enumerate()
        .filter_map(|(k, c)| c.map(|c| (c, k)))
        .collect();
    let max = quality::CROSSTALK_DISTANCES
        .iter()
        .copied()
        .max()
        .unwrap_or(0);
    let samples: Vec<quality::CrosstalkSample> = measured
        .par_iter()
        .enumerate()
        .flat_map_iter(|(k, m)| {
            let mut neighbors = Vec::new();
            if let Some((q, c)) = caps[k] {
                for d in 1..=max {
                    for n in [c.checked_sub(d), Some(c + d)].into_iter().flatten() {
                        if let Some(&j) = by_cap.get(&(q, n)) {
                            neighbors.push((d, inputs[j].dyes.as_slice()));
                        }
                    }
                }
            }
            quality::measure_crosstalk(&m.sources, &neighbors)
        })
        .collect();
    quality::summarize_plate_with_limits(spec, measured, &samples, controls, limits)
}

/// The tallest peak over `plate_quality.limits.control_height_limit` in each
/// negative-control run. `traces` must hold the control wells and their neighbors.
pub(crate) fn control_signals(
    runs: &[ControlRunRow],
    traces: &HashMap<i64, &WellTraces>,
    fits: &HashMap<i64, (&StoredFit, usize)>,
    labels: &HashMap<i64, String>,
    spec: &LadderSpec,
    size: PlateSize,
    plate_quality: &PlateQuality,
) -> Vec<ControlSignal> {
    let by_label: HashMap<&str, i64> = labels.iter().map(|(id, l)| (l.as_str(), *id)).collect();
    let limit = plate_quality.limits.control_height_limit;
    let pull_up_by_target: HashMap<Color, DyePullUp> = [
        Color::Blue,
        Color::Green,
        Color::Yellow,
        Color::Red,
        Color::Orange,
    ]
    .into_iter()
    .map(|c| (c, plate_quality.pull_up_for(c)))
    .collect();
    let mut out: Vec<ControlSignal> = runs
        .par_iter()
        .filter_map(|r| {
            let channels = traces.get(&r.well_id)?;
            let (fit, len) = fits.get(&r.well_id)?;
            let base = fit.base_sizes(*len, spec.base_size_precision)?;
            let trace = channels.iter().find(|c| c.1 == r.color)?.2.as_slice();
            let other_dyes: Vec<(Color, &[i16])> = channels
                .iter()
                .filter(|c| c.1 != r.color)
                .map(|c| (c.1, c.2.as_slice()))
                .collect();
            let well = Well::parse(&r.well).ok()?;
            let neighbors: Vec<&[i16]> =
                microspat_core::plate::neighbor_wells(well, size, CONTROL_NEIGHBOR_DISTANCE)
                    .ok()?
                    .into_iter()
                    .filter_map(|n| by_label.get(n.label().as_str()))
                    .filter_map(|id| traces.get(id))
                    .filter_map(|chs| chs.iter().find(|c| c.1 == r.color))
                    .map(|c| c.2.as_slice())
                    .collect();
            let pull_up = (!plate_quality.is_unseparated(&r.well))
                .then(|| pull_up_by_target.get(&r.color))
                .flatten();
            quality::check_negative_control(
                &ControlRun {
                    well: r.well.clone(),
                    locus: r.locus.clone(),
                    sample: r.sample.clone(),
                    color: r.color,
                    trace,
                    base_sizes: &base,
                    other_dyes,
                    neighbors,
                    pull_up,
                    offscale_indices: &r.offscale_indices,
                    min_size: r.min,
                    max_size: r.max,
                },
                limit,
            )
        })
        .collect();
    out.sort_by(|a, b| a.well.cmp(&b.well).then(a.locus.cmp(&b.locus)));
    out
}

/// Negative-control runs of a plate.
pub(crate) fn control_runs(c: &Connection, plate_id: i64) -> Result<Vec<ControlRunRow>> {
    let mut st = c.prepare(
        "SELECT w.id, w.label, l.label, l.min_base_length, l.max_base_length, s.barcode, c.color,
                w.offscale_indices
         FROM run r JOIN sample s ON s.id = r.sample_id JOIN locus l ON l.id = r.locus_id
         JOIN channel c ON c.id = r.channel_id JOIN well w ON w.id = c.well_id
         WHERE w.plate_id = ?1 AND s.designation = 'negative_control'
         ORDER BY w.label, l.label",
    )?;
    let v = st
        .query_map([plate_id], |r| {
            Ok(ControlRunRow {
                well_id: r.get(0)?,
                well: r.get(1)?,
                locus: r.get(2)?,
                min: r.get(3)?,
                max: r.get(4)?,
                sample: r.get(5)?,
                color: color_col(r, 6)?,
                offscale_indices: json_col(r, 7)?,
            })
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

/// True when a plate map has assigned at least one run of the plate.
fn has_map(c: &Connection, plate_id: i64) -> Result<bool> {
    Ok(c.query_row(
        "SELECT EXISTS (SELECT 1 FROM run r JOIN channel c ON c.id = r.channel_id
         JOIN well w ON w.id = c.well_id WHERE w.plate_id = ?1)",
        [plate_id],
        |r| r.get(0),
    )?)
}

/// Stores a plate's report.
pub(crate) fn store(c: &Connection, plate_id: i64, q: &PlateQuality) -> Result<()> {
    let s = QualitySummary::of(q);
    c.execute(
        "INSERT OR REPLACE INTO plate_quality (plate_id, version, computed_at, problems, warnings, infos, report)
         VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ?3, ?4, ?5, ?6)",
        params![
            plate_id,
            q.version,
            s.problems,
            s.warnings,
            s.infos,
            serde_json::to_string(q)?
        ],
    )?;
    Ok(())
}

/// A plate's stored report with when it was computed; None when missing.
pub(crate) fn load(c: &Connection, plate_id: i64) -> Result<Option<(PlateQuality, String)>> {
    Ok(c.query_row(
        "SELECT report, computed_at FROM plate_quality WHERE plate_id = ?1",
        [plate_id],
        |r| Ok((json_col(r, 0)?, r.get(1)?)),
    )
    .optional()?)
}

/// Issue counts by plate, from the summary columns.
pub(crate) fn summaries(c: &Connection) -> Result<HashMap<i64, QualitySummary>> {
    let mut st =
        c.prepare("SELECT plate_id, problems, warnings, infos, version FROM plate_quality")?;
    let rows = st.query_map([], |r| {
        let (p, w, i): (u32, u32, u32) = (r.get(1)?, r.get(2)?, r.get(3)?);
        let worst = if p > 0 {
            Some(Severity::Problem)
        } else if w > 0 {
            Some(Severity::Warning)
        } else if i > 0 {
            Some(Severity::Info)
        } else {
            None
        };
        Ok((
            r.get::<_, i64>(0)?,
            QualitySummary {
                problems: p,
                warnings: w,
                infos: i,
                worst,
                outdated: r.get::<_, u32>(4)? < quality::QUALITY_VERSION,
            },
        ))
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Plate size, ladder spec, and every well's (id, label, fit, trace length, off-scale scans).
type PlateWells = (
    PlateSize,
    LadderSpec,
    Vec<(i64, String, StoredFit, usize, Vec<usize>)>,
);

fn plate_wells(c: &Connection, plate_id: i64, filter: &str) -> Result<PlateWells> {
    let (size, spec): (u32, LadderSpec) = c
        .query_row(
            "SELECT p.plate_size, l.spec FROM plate p JOIN ladder l ON l.id = p.ladder_id WHERE p.id = ?1",
            [plate_id],
            |r| Ok((r.get(0)?, json_col(r, 1)?)),
        )
        .optional()?
        .ok_or_else(|| RpcError::not_found(format!("Plate {plate_id} does not exist")))?;
    let size = PlateSize::from_wells(size).unwrap_or(PlateSize::W96);
    let mut st = c.prepare(&format!(
        "SELECT w.id, w.label, w.ladder_peak_indices, w.ladder_peak_sizes, w.sizing_quality,
                w.sizing_error, w.trace_len, w.offscale_indices
         FROM well w WHERE w.plate_id = ?1 {filter}"
    ))?;
    let wells = st
        .query_map([plate_id], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                StoredFit {
                    peak_indices: json_col(r, 2)?,
                    peak_sizes: json_col(r, 3)?,
                    quality: r.get(4)?,
                    error: r.get(5)?,
                },
                r.get::<_, i64>(6)? as usize,
                json_col(r, 7)?,
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok((size, spec, wells))
}

/// Measures a plate from its stored traces and fits, with its negative
/// controls when a plate map is applied, on a read snapshot.
pub(crate) fn compute(c: &Connection, plate_id: i64) -> Result<PlateQuality> {
    let (_, spec, wells) = plate_wells(c, plate_id, "")?;
    let traces: Vec<(i64, WellTraces)> = load_well_traces(c, &format!("w.plate_id = {plate_id}"))?
        .into_iter()
        .collect();
    let fits: HashMap<i64, StoredFit> = wells.into_iter().map(|w| (w.0, w.2)).collect();
    assess_with(c, plate_id, &spec, &traces, &fits)
}

/// Measures a plate from the given traces and fits (new fits not yet
/// stored, when re-sizing); labels, off-scale scans and the plate map are
/// read from the workspace.
pub(crate) fn assess_with(
    c: &Connection,
    plate_id: i64,
    spec: &LadderSpec,
    traces: &[(i64, WellTraces)],
    fits: &HashMap<i64, StoredFit>,
) -> Result<PlateQuality> {
    let (size, _, wells) = plate_wells(c, plate_id, "")?;
    let limits = crate::db::quality_limits(c)?;
    let by_id: HashMap<i64, &WellTraces> = traces.iter().map(|(id, t)| (*id, t)).collect();
    let qwells: Vec<QualityWell<'_>> = wells
        .iter()
        .filter_map(|(id, label, _, _, off)| {
            Some(QualityWell {
                label,
                dyes: by_id
                    .get(id)
                    .map(|chs| chs.iter().map(|ch| (ch.1, ch.2.as_slice())).collect())
                    .unwrap_or_default(),
                fit: fits.get(id)?,
                offscale: off,
            })
        })
        .collect();
    let mut q = assess(&qwells, spec, size, None, limits);
    if has_map(c, plate_id)? {
        let runs = control_runs(c, plate_id)?;
        let lens: HashMap<i64, (&StoredFit, usize)> = wells
            .iter()
            .filter_map(|(id, _, _, len, _)| fits.get(id).map(|f| (*id, (f, *len))))
            .collect();
        let labels: HashMap<i64, String> = wells.iter().map(|w| (w.0, w.1.clone())).collect();
        q.controls = control_signals(&runs, &by_id, &lens, &labels, spec, size, &q);
        q.controls_checked = true;
        quality::derive_issues(&mut q, spec);
    }
    Ok(q)
}

/// Recomputes and stores the report of each plate (read, measure, write).
pub(crate) fn recompute(ws: &Workspace, plate_ids: &[i64]) -> Result<()> {
    for &id in plate_ids {
        let q = ws.read(|c| compute(c, id))?;
        ws.write(|tx| {
            // The plate may have been deleted meanwhile.
            let exists: bool = tx.query_row(
                "SELECT EXISTS (SELECT 1 FROM plate WHERE id = ?1)",
                [id],
                |r| r.get(0),
            )?;
            if exists {
                store(tx, id, &q)?;
            }
            Ok(())
        })?;
    }
    Ok(())
}

/// Checks the negative controls of each plate again and derives its issues,
/// keeping the rest of the stored report. Plates without a report are left
/// for `compute_plate_quality`.
pub(crate) fn refresh_controls(ws: &Workspace, plate_ids: &[i64]) -> Result<()> {
    for &plate_id in plate_ids {
        let updated = ws.read(|c| {
            let Some((mut q, _)) = load(c, plate_id)? else {
                return Ok(None);
            };
            let limits = crate::db::quality_limits(c)?;
            let mapped = has_map(c, plate_id)?;
            let runs = control_runs(c, plate_id)?;
            let (size, spec, wells) = plate_wells(c, plate_id, "")?;
            q.limits = limits;
            // Refresh unseparated flags before checking negative controls so
            // pull-up fallback reflects the current spectral limits too.
            quality::derive_issues(&mut q, &spec);
            let labels: HashMap<i64, String> = wells.iter().map(|w| (w.0, w.1.clone())).collect();
            let mut needed: Vec<i64> = Vec::new();
            for r in &runs {
                needed.push(r.well_id);
                if let Ok(w) = Well::parse(&r.well) {
                    let by_label: HashMap<&str, i64> =
                        labels.iter().map(|(id, l)| (l.as_str(), *id)).collect();
                    for n in
                        microspat_core::plate::neighbor_wells(w, size, CONTROL_NEIGHBOR_DISTANCE)
                            .unwrap_or_default()
                    {
                        if let Some(&id) = by_label.get(n.label().as_str()) {
                            needed.push(id);
                        }
                    }
                }
            }
            needed.sort_unstable();
            needed.dedup();
            let traces = if needed.is_empty() {
                BTreeMap::new()
            } else {
                load_well_traces(c, &format!("w.id IN ({})", id_list(&needed)))?
            };
            let by_id: HashMap<i64, &WellTraces> = traces.iter().map(|(id, t)| (*id, t)).collect();
            let fits: HashMap<i64, (&StoredFit, usize)> = wells
                .iter()
                .filter(|w| needed.contains(&w.0))
                .map(|(id, _, fit, len, _)| (*id, (fit, *len)))
                .collect();
            q.controls = control_signals(&runs, &by_id, &fits, &labels, &spec, size, &q);
            q.controls_checked = mapped;
            quality::derive_issues(&mut q, &spec);
            Ok(Some(q))
        })?;
        if let Some(q) = updated {
            ws.write(|tx| {
                let exists: bool = tx.query_row(
                    "SELECT EXISTS (SELECT 1 FROM plate_quality WHERE plate_id = ?1)",
                    [plate_id],
                    |r| r.get(0),
                )?;
                if exists {
                    store(tx, plate_id, &q)?;
                }
                Ok(())
            })?;
        }
    }
    Ok(())
}

/// Applies updated workspace `QualityLimits` to all stored `plate_quality`
/// reports (re-scanning negative controls when control or spectral limits changed).
pub(crate) fn refresh_for_limits(
    ws: &Workspace,
    limits: &QualityLimits,
    rescan_controls: bool,
) -> Result<()> {
    if rescan_controls {
        let plate_ids: Vec<i64> = ws.read(|c| {
            let mut st = c.prepare("SELECT plate_id FROM plate_quality ORDER BY plate_id")?;
            let v = st
                .query_map([], |r| r.get(0))?
                .collect::<rusqlite::Result<_>>()?;
            Ok(v)
        })?;
        if plate_ids.is_empty() {
            return Ok(());
        }
        return refresh_controls(ws, &plate_ids);
    }
    ws.write(|tx| {
        let updates: Vec<(i64, QualitySummary, String)> = {
            let mut st = tx.prepare(
                "SELECT q.plate_id, q.report, l.spec
                 FROM plate_quality q
                 JOIN plate p ON p.id = q.plate_id
                 JOIN ladder l ON l.id = p.ladder_id
                 ORDER BY q.plate_id",
            )?;
            let rows = st.query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    json_col::<PlateQuality>(r, 1)?,
                    json_col::<LadderSpec>(r, 2)?,
                ))
            })?;
            let mut out = Vec::new();
            for row in rows {
                let (plate_id, mut q, spec) = row?;
                q.limits = limits.clone();
                quality::derive_issues(&mut q, &spec);
                let summary = QualitySummary::of(&q);
                out.push((plate_id, summary, serde_json::to_string(&q)?));
            }
            out
        };
        let mut st = tx.prepare(
            "UPDATE plate_quality
             SET problems = ?2, warnings = ?3, infos = ?4, report = ?5
             WHERE plate_id = ?1",
        )?;
        for (plate_id, s, report_json) in updates {
            st.execute(params![
                plate_id,
                s.problems,
                s.warnings,
                s.infos,
                report_json
            ])?;
        }
        Ok(())
    })
}

/// Plates where any of the given samples has a run.
pub(crate) fn plates_of_samples(c: &Connection, sample_ids: &[i64]) -> Result<Vec<i64>> {
    if sample_ids.is_empty() {
        return Ok(Vec::new());
    }
    let mut st = c.prepare(&format!(
        "SELECT DISTINCT w.plate_id FROM run r JOIN channel c ON c.id = r.channel_id
         JOIN well w ON w.id = c.well_id WHERE r.sample_id IN ({})",
        id_list(sample_ids)
    ))?;
    let v = st
        .query_map([], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

/// Plates where the locus has a run.
pub(crate) fn plates_of_locus(c: &Connection, locus_id: i64) -> Result<Vec<i64>> {
    let mut st = c.prepare(
        "SELECT DISTINCT w.plate_id FROM run r JOIN channel c ON c.id = r.channel_id
         JOIN well w ON w.id = c.well_id WHERE r.locus_id = ?1",
    )?;
    let v = st
        .query_map([locus_id], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}
