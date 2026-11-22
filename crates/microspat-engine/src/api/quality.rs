//! Plate quality reports: read one, compute missing or outdated ones, and
//! export one as CSV. `crate::quality` computes and stores them.

use super::{csv_text, safe_filename, IdParams, TextFile};
use crate::error::{OrNotFound, Result};
use crate::events::entity::{PLATES, PROJECTS};
use crate::quality::{self as q, QualitySummary};
use crate::rpc::Registry;
use crate::tasks::Progress;
use crate::Engine;
use microspat_core::quality::{PlateQuality, QUALITY_VERSION};
use microspat_core::Color;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A plate's quality report with the plate it belongs to.
#[derive(Debug, Clone, Serialize, TS)]
pub struct PlateQualityView {
    pub plate_id: i64,
    pub plate_label: String,
    /// Instrument name and model recorded in the files.
    pub instrument: Option<String>,
    pub instrument_model: Option<String>,
    /// Run start recorded by the instrument (ISO 8601, local time).
    pub run_date: Option<String>,
    /// When the report was computed (ISO 8601 UTC); null without a report.
    pub computed_at: Option<String>,
    /// Null for a plate imported before quality checks existed.
    pub report: Option<PlateQuality>,
    pub summary: Option<QualitySummary>,
}

/// Params of `compute_plate_quality`.
#[derive(Debug, Clone, Default, Deserialize, TS)]
pub struct ComputePlateQualityParams {
    /// Plates to check; omit for every plate without a current report.
    #[serde(default)]
    #[ts(optional)]
    pub ids: Option<Vec<i64>>,
}

/// Result of `compute_plate_quality`.
#[derive(Debug, Clone, Serialize, TS)]
pub struct ComputePlateQualityResult {
    /// Plates whose report was computed.
    pub plate_ids: Vec<i64>,
}

pub(crate) fn register(r: &mut Registry) {
    r.query(
        "get_plate_quality",
        "A plate's quality report: per-well measures, pull-up and crosstalk, negative-control peaks, and issues (worst first). The report is null for a plate imported before quality checks existed.",
        get,
    );
    r.task(
        "compute_plate_quality",
        &[PLATES],
        "Measure the quality of the given plates again, or of every plate without a current report. Runs as a task.",
        compute,
    );
    r.query(
        "export_plate_quality",
        "A plate's quality report as CSV: one row per well with its measures and flags, then the plate's pull-up and crosstalk, then its issues.",
        export,
    );
}

fn get(e: &Engine, p: IdParams) -> Result<PlateQualityView> {
    e.workspace()?.read(|c| {
        let (plate_label, instrument, instrument_model, run_date): (
            String,
            Option<String>,
            Option<String>,
            Option<String>,
        ) = c
            .query_row(
                "SELECT label, instrument, instrument_model, run_date FROM plate WHERE id = ?1",
                [p.id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()?
            .or_not_found(|| format!("Plate {} does not exist", p.id))?;
        let stored = q::load(c, p.id)?;
        let (report, computed_at) = match stored {
            Some((r, at)) => (Some(r), Some(at)),
            None => (None, None),
        };
        Ok(PlateQualityView {
            plate_id: p.id,
            plate_label,
            instrument,
            instrument_model,
            run_date,
            computed_at,
            summary: report.as_ref().map(QualitySummary::of),
            report,
        })
    })
}

fn compute(e: &Engine, p: ComputePlateQualityParams) -> Result<ComputePlateQualityResult> {
    let ws = e.workspace()?;
    let ids: Vec<i64> = match p.ids {
        Some(ids) => {
            ws.read(|c| {
                for &id in &ids {
                    c.query_row("SELECT id FROM plate WHERE id = ?1", [id], |r| {
                        r.get::<_, i64>(0)
                    })
                    .optional()?
                    .or_not_found(|| format!("Plate {id} does not exist"))?;
                }
                Ok(())
            })?;
            ids
        }
        None => ws.read(|c| {
            let mut st = c.prepare(
                "SELECT p.id FROM plate p LEFT JOIN plate_quality q ON q.plate_id = p.id
                 WHERE q.plate_id IS NULL OR q.version < ?1 ORDER BY p.id",
            )?;
            let v = st
                .query_map([QUALITY_VERSION], |r| r.get(0))?
                .collect::<rusqlite::Result<_>>()?;
            Ok(v)
        })?,
    };
    let label = match ids.len() {
        1 => "Checking plate quality".to_string(),
        n => format!("Checking the quality of {n} plates"),
    };
    e.run_task("compute_plate_quality", label, move |task| {
        let ws = task.engine().workspace()?;
        let n = ids.len().max(1);
        for (k, &id) in ids.iter().enumerate() {
            task.report(k as f64 / n as f64, &format!("Plate {} of {n}", k + 1));
            q::recompute(&ws, &[id])?;
            task.engine().changed(PLATES, Some(vec![id]));
        }
        if !ids.is_empty() {
            task.engine().changed(PROJECTS, None);
        }
        Ok(ComputePlateQualityResult { plate_ids: ids })
    })
}

fn color_name(c: Color) -> &'static str {
    super::color_str(c)
}

fn num(v: Option<f64>, decimals: usize) -> String {
    v.map_or_else(String::new, |x| format!("{x:.decimals$}"))
}

fn title_case(s: &str) -> String {
    let mut c = s.chars();
    c.next()
        .map(|f| f.to_uppercase().chain(c).collect())
        .unwrap_or_default()
}

/// One row per well; the plate's own values (ladder height, pull-up per
/// dye pair, crosstalk per distance) repeat on every row, so the file is a
/// single table that sorts and filters in a spreadsheet.
fn export(e: &Engine, p: IdParams) -> Result<TextFile> {
    let view = get(e, p)?;
    let report = view.report.or_not_found(|| {
        format!(
            "Plate {} has no quality report yet. Check its quality first.",
            view.plate_label
        )
    })?;
    let mut colors: Vec<Color> = Vec::new();
    for c in report
        .wells
        .iter()
        .flat_map(|w| w.dyes.iter().map(|d| d.color))
    {
        if !colors.contains(&c) {
            colors.push(c);
        }
    }
    let mut header: Vec<String> = [
        "Plate",
        "Instrument",
        "Run Date",
        "Well",
        "Capillary",
        "Sizing Quality",
        "Plate Error",
        "Ladder Height",
        "Ladder Fade",
        "Max Sample Signal",
        "Off-scale Points",
        "Tall Peaks",
        "Breakdowns",
        "Copies",
        "Breakdown Fraction",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    for c in &colors {
        let cap = title_case(color_name(*c));
        for what in ["Noise SD", "Baseline", "Max Signal", "Off-scale Points"] {
            header.push(format!("{cap} {what}"));
        }
    }
    header.push("Flags".into());
    header.push("Issues".into());
    header.push("Plate Ladder Height".into());
    for l in &report.pull_up {
        header.push(format!(
            "Pull-up {} Into {}",
            title_case(color_name(l.source)),
            title_case(color_name(l.target))
        ));
    }
    for x in &report.crosstalk {
        header.push(format!(
            "Crosstalk {} Away{}",
            x.distance,
            if x.saturated { " Off-scale" } else { "" }
        ));
    }
    let mut plate_cols = vec![num(report.ladder_height, 0)];
    plate_cols.extend(report.pull_up.iter().map(|l| num(l.fraction, 4)));
    plate_cols.extend(report.crosstalk.iter().map(|x| num(x.fraction, 4)));
    let mut rows = vec![header];
    let instrument = view.instrument.clone().unwrap_or_default();
    let date = view.run_date.clone().unwrap_or_default();
    let tag = |v: serde_json::Result<serde_json::Value>| {
        v.ok()
            .and_then(|v| v.as_str().map(str::to_string))
            .unwrap_or_default()
    };
    for w in &report.wells {
        let mut row = vec![
            view.plate_label.clone(),
            instrument.clone(),
            date.clone(),
            w.well.clone(),
            w.capillary.map_or_else(String::new, |c| c.to_string()),
            num(w.sizing_quality, 3),
            num(w.plate_error, 3),
            num(w.ladder_height, 0),
            num(w.ladder_fade, 3),
            num(w.signal, 0),
            w.offscale_points.to_string(),
            w.tall_peaks.to_string(),
            w.breakdowns.to_string(),
            w.copies.to_string(),
            num(w.breakdown_fraction, 3),
        ];
        for c in &colors {
            match w.dyes.iter().find(|d| d.color == *c) {
                Some(d) => {
                    row.push(format!("{:.1}", d.noise_sd));
                    row.push(format!("{:.1}", d.baseline));
                    row.push(format!("{:.0}", d.max_signal));
                    row.push(d.offscale_points.to_string());
                }
                None => row.extend(std::iter::repeat_n(String::new(), 4)),
            }
        }
        row.push(
            w.flags
                .iter()
                .map(|f| tag(serde_json::to_value(f)))
                .collect::<Vec<_>>()
                .join(";"),
        );
        row.push(
            report
                .issues
                .iter()
                .filter(|i| i.wells.contains(&w.well))
                .map(|i| i.title.clone())
                .collect::<Vec<_>>()
                .join(";"),
        );
        row.extend(plate_cols.iter().cloned());
        rows.push(row);
    }
    Ok(TextFile {
        filename: format!("{}_quality.csv", safe_filename(&view.plate_label)),
        content: csv_text(&rows)?,
    })
}
