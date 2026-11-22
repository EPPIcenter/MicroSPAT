//! Bin estimators: bins of a locus, hand edits, the peak scatter behind them,
//! and the bins CSV.

use super::projects::{locus_of, require_kind, ProjectLocusParams};
use super::{csv_text, safe_filename, IdParams, TextFile};
use crate::error::{Result, RpcError};
use crate::events::entity::{CONTROLS, PROJECTS};
use crate::peak_codec;
use crate::projects::analysis::load_bins;
use crate::projects::inputs::{self, AnalysisStatus};
use crate::projects::{project_loci, ProjectKind};
use crate::rpc::Registry;
use crate::Engine;
use microspat_core::Bin;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use ts_rs::TS;

/// Bins of one locus of a bin estimator.
#[derive(Debug, Clone, Serialize, TS)]
pub struct LocusBins {
    pub locus_id: i64,
    /// By size.
    pub bins: Vec<Bin>,
    pub status: AnalysisStatus,
}

/// Params of `update_locus_bins`: a batch of edits applied together.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateLocusBinsParams {
    pub project_id: i64,
    pub locus_id: i64,
    /// Bins to create (id ≤ 0) or change (moved, resized, relabeled).
    #[serde(default)]
    pub bins: Vec<Bin>,
    /// Ids of bins to delete.
    #[serde(default)]
    #[ts(optional)]
    pub delete_ids: Option<Vec<i64>>,
}

/// Peaks behind a locus's bins, column-wise (one entry per peak).
#[derive(Debug, Clone, Serialize, TS)]
pub struct BinScatter {
    pub locus_id: i64,
    /// Peak sizes (bp).
    pub sizes: Vec<f32>,
    /// Heights relative to the tallest peak of the run (0..1).
    pub relative_heights: Vec<f32>,
    pub status: AnalysisStatus,
}

pub(crate) fn register(r: &mut Registry) {
    r.query(
        "get_locus_bins",
        "Bins of one locus of a bin estimator, with the locus's analysis status.",
        get,
    );
    r.mutation(
        "update_locus_bins",
        &[PROJECTS, CONTROLS],
        "Apply a batch of bin edits at one locus: new bins (id ≤ 0), moved, resized or relabeled bins, and deletions. Labels must stay unique. Projects using these bins become stale.",
        update,
    );
    r.query(
        "get_bin_estimator_peaks",
        "Every peak of a bin estimator's last analysis at a locus (size, relative height), for the bin plot.",
        scatter,
    );
    r.query(
        "export_bins",
        "A bin estimator's bins as CSV (Locus, Label, Base Size, Bin Buffer, Peak Count).",
        export,
    );
}

fn view(c: &Connection, pid: i64, locus_id: i64) -> Result<LocusBins> {
    let p = require_kind(c, pid, ProjectKind::BinEstimator)?;
    let locus = locus_of(c, &p, locus_id)?;
    Ok(LocusBins {
        locus_id,
        bins: load_bins(c, pid, locus_id)?,
        status: inputs::locus_status(c, &p, &locus)?,
    })
}

fn get(e: &Engine, p: ProjectLocusParams) -> Result<LocusBins> {
    e.workspace()?.read(|c| view(c, p.project_id, p.locus_id))
}

fn check_bin(b: &Bin) -> Result<String> {
    let label = b.label.trim();
    if label.is_empty() || label.len() > 50 {
        return Err(RpcError::invalid("A bin label must be 1–50 characters."));
    }
    if !(b.base_size.is_finite() && b.base_size > 0.0) {
        return Err(RpcError::invalid(format!(
            "Bin {label}: the center must be a positive size."
        )));
    }
    if !(b.bin_buffer.is_finite() && b.bin_buffer > 0.0 && b.bin_buffer < 50.0) {
        return Err(RpcError::invalid(format!(
            "Bin {label}: the buffer must be between 0 and 50 bp."
        )));
    }
    Ok(label.to_string())
}

fn update(e: &Engine, p: UpdateLocusBinsParams) -> Result<LocusBins> {
    let out = e.workspace()?.write(|tx| {
        let proj = require_kind(tx, p.project_id, ProjectKind::BinEstimator)?;
        locus_of(tx, &proj, p.locus_id)?;
        let existing: HashMap<i64, Bin> = load_bins(tx, p.project_id, p.locus_id)?
            .into_iter()
            .map(|b| (b.id, b))
            .collect();
        let deletes: HashSet<i64> = p.delete_ids.clone().unwrap_or_default().into_iter().collect();
        for id in &deletes {
            if !existing.contains_key(id) {
                return Err(RpcError::not_found(format!("Bin {id} is not at this locus.")));
            }
        }
        let mut final_labels: HashMap<i64, String> = existing
            .iter()
            .filter(|(id, _)| !deletes.contains(id))
            .map(|(&id, b)| (id, b.label.clone()))
            .collect();
        let mut new_labels = Vec::new();
        for b in &p.bins {
            let label = check_bin(b)?;
            if b.id > 0 {
                if !existing.contains_key(&b.id) || deletes.contains(&b.id) {
                    return Err(RpcError::not_found(format!(
                        "Bin {} is not at this locus.",
                        b.id
                    )));
                }
                final_labels.insert(b.id, label);
            } else {
                new_labels.push(label);
            }
        }
        let mut seen = HashSet::new();
        for l in final_labels.values().chain(&new_labels) {
            if !seen.insert(l.to_lowercase()) {
                return Err(RpcError::conflict(format!(
                    "Two bins would both be labeled \"{l}\"."
                )));
            }
        }
        for id in &deletes {
            tx.execute("DELETE FROM bin WHERE id = ?1", [id])?;
        }
        // Relabels may swap labels; clear them first to dodge the unique index.
        for b in p.bins.iter().filter(|b| b.id > 0) {
            tx.execute(
                "UPDATE bin SET label = ?1 WHERE id = ?2",
                params![format!("\u{0}{}", b.id), b.id],
            )?;
        }
        for b in &p.bins {
            let label = b.label.trim();
            if b.id > 0 {
                tx.execute(
                    "UPDATE bin SET label = ?1, base_size = ?2, bin_buffer = ?3 WHERE id = ?4",
                    params![label, b.base_size, b.bin_buffer, b.id],
                )?;
            } else {
                tx.execute(
                    "INSERT INTO bin (project_id, locus_id, label, base_size, bin_buffer, peak_count)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![p.project_id, p.locus_id, label, b.base_size, b.bin_buffer, b.peak_count],
                )?;
            }
        }
        super::projects::touch(tx, p.project_id)?;
        view(tx, p.project_id, p.locus_id)
    })?;
    // Every project binning with these bins may now be stale.
    e.changed(PROJECTS, None);
    e.changed(CONTROLS, None);
    Ok(out)
}

fn scatter(e: &Engine, p: ProjectLocusParams) -> Result<BinScatter> {
    e.workspace()?.read(|c| {
        let proj = require_kind(c, p.project_id, ProjectKind::BinEstimator)?;
        let locus = locus_of(c, &proj, p.locus_id)?;
        let blob: Option<Vec<u8>> = c
            .query_row(
                "SELECT scatter FROM project_locus WHERE project_id = ?1 AND locus_id = ?2",
                [p.project_id, p.locus_id],
                |r| r.get(0),
            )
            .ok()
            .flatten();
        let pairs = peak_codec::decode_pairs(&blob.unwrap_or_default());
        Ok(BinScatter {
            locus_id: p.locus_id,
            sizes: pairs.iter().map(|p| p.0).collect(),
            relative_heights: pairs.iter().map(|p| p.1).collect(),
            status: inputs::locus_status(c, &proj, &locus)?,
        })
    })
}

fn export(e: &Engine, p: IdParams) -> Result<TextFile> {
    e.workspace()?.read(|c| {
        let proj = require_kind(c, p.id, ProjectKind::BinEstimator)?;
        let mut rows = vec![vec![
            "Locus".to_string(),
            "Label".into(),
            "Base Size".into(),
            "Bin Buffer".into(),
            "Peak Count".into(),
        ]];
        for l in project_loci(c, &proj)? {
            for b in load_bins(c, proj.id, l.id)? {
                rows.push(vec![
                    l.label.clone(),
                    b.label,
                    format!("{:.3}", b.base_size),
                    format!("{:.3}", b.bin_buffer),
                    b.peak_count.to_string(),
                ]);
            }
        }
        Ok(TextFile {
            filename: format!("{}_bins.csv", safe_filename(&proj.title)),
            content: csv_text(&rows)?,
        })
    })
}
