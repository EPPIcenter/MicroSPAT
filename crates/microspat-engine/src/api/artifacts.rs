//! Artifact estimators: the classes of a locus with their points and fits,
//! hand edits (breakpoints, regression method, deletion), and the equations CSV.

use super::projects::{locus_of, require_kind, ProjectLocusParams};
use super::{csv_text, safe_filename, IdParams, TextFile};
use crate::error::{OrNotFound, Result, RpcError};
use crate::events::entity::PROJECTS;
use crate::projects::analysis::{artifact_warnings, load_artifact, ArtifactResult};
use crate::projects::inputs::{self, AnalysisStatus};
use crate::projects::{load_row, locus_params, project_loci, ProjectKind};
use crate::rpc::Registry;
use crate::Engine;
use microspat_core::artifact::{ArtifactEquation, ArtifactEstimator, ArtifactPoint, Segment};
use microspat_core::stats::{ErrorEstimator, RegressionMethod};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// One artifact class with everything its plot needs.
#[derive(Debug, Clone, Serialize, TS)]
pub struct ArtifactEstimatorView {
    pub id: i64,
    pub project_id: i64,
    pub locus_id: i64,
    /// Distance in bp (e.g. "-3.02"), or "Global Artifact".
    pub label: String,
    /// Artifact position relative to its parent (bp); null for the global class.
    pub artifact_distance: Option<f64>,
    pub artifact_distance_buffer: Option<f64>,
    /// Supporting points: x = parent size, y = relative height.
    pub points: Vec<ArtifactPoint>,
    /// One fit per segment, by size; breakpoints are the segment boundaries.
    pub equations: Vec<ArtifactEquation>,
}

/// Artifact classes of one locus.
#[derive(Debug, Clone, Serialize, TS)]
pub struct LocusArtifacts {
    pub locus_id: i64,
    pub estimators: Vec<ArtifactEstimatorView>,
    /// Runs with one main peak in a bin, used for fitting.
    pub mono_allelic_runs: Option<u32>,
    pub status: AnalysisStatus,
    /// Problems with the stored result, such as an empty artifact model
    /// (dependents then do not account for stutter at this locus). Absent
    /// when none.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    #[ts(optional = nullable)]
    pub warnings: Vec<String>,
}

/// Params of `add_artifact_breakpoint` / `remove_artifact_breakpoint`.
#[derive(Debug, Clone, Copy, Deserialize, TS)]
pub struct ArtifactBreakpointParams {
    /// Artifact estimator (class) id.
    pub id: i64,
    /// Parent size (bp) of the breakpoint.
    pub size: f64,
}

/// Params of `set_artifact_equation_method`.
#[derive(Debug, Clone, Copy, Deserialize, TS)]
pub struct SetArtifactMethodParams {
    pub id: i64,
    /// Index into `equations`.
    pub equation_index: usize,
    pub method: RegressionMethod,
}

/// Params of `set_artifact_error_estimator`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct SetArtifactErrorEstimatorParams {
    /// Artifact estimator project.
    pub project_id: i64,
    pub locus_id: i64,
    pub error_estimator: ErrorEstimator,
    /// Classes (artifact estimator ids) to change. Omit for every distance
    /// class at the locus (the global class keeps MAD, as analysis fits it);
    /// that also sets the locus's `artifact.error_estimator` parameter, so a
    /// later re-analysis uses the same estimator.
    #[serde(default)]
    #[ts(optional)]
    pub ids: Option<Vec<i64>>,
}

pub(crate) fn register(r: &mut Registry) {
    r.query(
        "get_locus_artifact_estimators",
        "Artifact classes of one locus of an artifact estimator: points, segments and fits.",
        get,
    );
    r.mutation(
        "add_artifact_breakpoint",
        &[PROJECTS],
        "Split the segment containing a parent size in two and refit both halves.",
        add_breakpoint,
    );
    r.mutation(
        "remove_artifact_breakpoint",
        &[PROJECTS],
        "Merge the two segments meeting at (or nearest to, within 1 bp) a breakpoint and refit.",
        remove_breakpoint,
    );
    r.mutation(
        "clear_artifact_breakpoints",
        &[PROJECTS],
        "Replace all segments of a class by one spanning the locus and refit.",
        clear_breakpoints,
    );
    r.mutation(
        "set_artifact_equation_method",
        &[PROJECTS],
        "Change the regression method of one segment and refit it.",
        set_method,
    );
    r.mutation(
        "refit_artifact_estimator",
        &[PROJECTS],
        "Refit every segment of a class from its stored points.",
        refit,
    );
    r.mutation(
        "set_artifact_error_estimator",
        &[PROJECTS],
        "Switch the error estimate (densest half, MAD or RMS) of one, some or every distance class at a locus by refitting in place, keeping breakpoints, methods and deleted classes. For every class (the global class keeps MAD) it also sets the locus parameter without making the locus stale.",
        set_error_estimator,
    );
    r.mutation(
        "delete_artifact_estimator",
        &[PROJECTS],
        "Delete one artifact class; it no longer contributes to expected artifact heights.",
        delete,
    );
    r.query(
        "export_artifact_equations",
        "An artifact estimator's equations as CSV, one row per segment.",
        export,
    );
}

fn to_view(pid: i64, lid: i64, id: i64, e: ArtifactEstimator) -> ArtifactEstimatorView {
    ArtifactEstimatorView {
        id,
        project_id: pid,
        locus_id: lid,
        label: e.label,
        artifact_distance: e.artifact_distance,
        artifact_distance_buffer: e.artifact_distance_buffer,
        points: e.points,
        equations: e.equations,
    }
}

fn get(e: &Engine, p: ProjectLocusParams) -> Result<LocusArtifacts> {
    e.workspace()?
        .read(|c| locus_view(c, p.project_id, p.locus_id))
}

fn locus_view(c: &Connection, project_id: i64, locus_id: i64) -> Result<LocusArtifacts> {
    let proj = require_kind(c, project_id, ProjectKind::ArtifactEstimator)?;
    let locus = locus_of(c, &proj, locus_id)?;
    let mono = inputs::stored_result(c, proj.id, locus_id)?
        .and_then(|v| serde_json::from_value::<ArtifactResult>(v).ok())
        .map(|r| r.mono_allelic_runs);
    Ok(LocusArtifacts {
        locus_id,
        estimators: load_artifact(c, proj.id, locus_id)?
            .into_iter()
            .map(|(id, est)| to_view(proj.id, locus_id, id, est))
            .collect(),
        mono_allelic_runs: mono,
        status: inputs::locus_status(c, &proj, &locus)?,
        warnings: artifact_warnings(c, proj.id, &locus)?,
    })
}

fn set_error_estimator(e: &Engine, p: SetArtifactErrorEstimatorParams) -> Result<LocusArtifacts> {
    let error = p.error_estimator;
    let view = e.workspace()?.write(|tx| {
        let proj = require_kind(tx, p.project_id, ProjectKind::ArtifactEstimator)?;
        locus_of(tx, &proj, p.locus_id)?;
        let params = locus_params(tx, &proj, p.locus_id)?;
        let seed = params.artifact.unwrap_or_default().seed;
        let classes = load_artifact(tx, proj.id, p.locus_id)?;
        if let Some(ids) = &p.ids {
            for id in ids {
                if !classes.iter().any(|(i, _)| i == id) {
                    return Err(RpcError::not_found(format!(
                        "Artifact estimator {id} is not a class of this project at this locus."
                    )));
                }
            }
        }
        for (id, mut est) in classes {
            let chosen = match &p.ids {
                Some(ids) => ids.contains(&id),
                None => !est.is_global(),
            };
            if !chosen {
                continue;
            }
            let mut segs = est.segments();
            for s in &mut segs {
                s.error = error;
            }
            est.refit(&segs, seed).map_err(fit_err)?;
            tx.execute(
                "UPDATE artifact_estimator SET equations = ?1 WHERE id = ?2",
                params![serde_json::to_string(&est.equations)?, id],
            )?;
        }
        if p.ids.is_none() {
            let mut next = params.clone();
            if let Some(a) = &mut next.artifact {
                a.error_estimator = error;
            }
            if next != params {
                super::projects::save_params(tx, &proj, p.locus_id, &next)?;
                // The classes now are what analysis with the new parameter
                // would give them, edits aside (edits are not inputs), so a
                // result that was current for the old parameter stays current.
                inputs::replace_params_fingerprint(tx, proj.id, p.locus_id, &params, &next)?;
            }
        }
        super::projects::touch(tx, proj.id)?;
        locus_view(tx, proj.id, p.locus_id)
    })?;
    e.changed(PROJECTS, None);
    Ok(view)
}

/// Loads one class, applies `edit`, stores it, returns the view.
fn edit(
    e: &Engine,
    id: i64,
    f: impl FnOnce(&mut ArtifactEstimator, u64, (f64, f64)) -> Result<()>,
) -> Result<ArtifactEstimatorView> {
    let v = e.workspace()?.write(|tx| {
        let (pid, lid) = owner(tx, id)?;
        let proj = load_row(tx, pid)?;
        let locus = crate::api::loci::load(tx, lid)?;
        let seed = locus_params(tx, &proj, lid)?
            .artifact
            .unwrap_or_default()
            .seed;
        let (_, mut est) = load_artifact(tx, pid, lid)?
            .into_iter()
            .find(|(i, _)| *i == id)
            .or_not_found(|| format!("Artifact estimator {id} does not exist"))?;
        f(
            &mut est,
            seed,
            (locus.min_base_length, locus.max_base_length),
        )?;
        tx.execute(
            "UPDATE artifact_estimator SET equations = ?1 WHERE id = ?2",
            params![serde_json::to_string(&est.equations)?, id],
        )?;
        super::projects::touch(tx, pid)?;
        Ok(to_view(pid, lid, id, est))
    })?;
    e.changed(PROJECTS, None);
    Ok(v)
}

fn owner(c: &Connection, id: i64) -> Result<(i64, i64)> {
    c.query_row(
        "SELECT project_id, locus_id FROM artifact_estimator WHERE id = ?1",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .optional()?
    .or_not_found(|| format!("Artifact estimator {id} does not exist"))
}

fn fit_err(e: microspat_core::artifact::ArtifactError) -> RpcError {
    RpcError::invalid(format!("Cannot fit: {e}"))
}

fn add_breakpoint(e: &Engine, p: ArtifactBreakpointParams) -> Result<ArtifactEstimatorView> {
    edit(e, p.id, |est, seed, _| {
        if !est.add_breakpoint(p.size, seed).map_err(fit_err)? {
            return Err(RpcError::invalid(format!(
                "{:.2} bp is not inside a segment of this class.",
                p.size
            )));
        }
        Ok(())
    })
}

fn remove_breakpoint(e: &Engine, p: ArtifactBreakpointParams) -> Result<ArtifactEstimatorView> {
    edit(e, p.id, |est, seed, _| {
        let segs = est.segments();
        // Boundary k lies between segment k and k + 1.
        let best = (0..segs.len().saturating_sub(1))
            .map(|k| {
                let d = (segs[k].end_size - p.size)
                    .abs()
                    .min((segs[k + 1].start_size - p.size).abs());
                (k, d)
            })
            .min_by(|a, b| a.1.total_cmp(&b.1))
            .filter(|(_, d)| *d <= 1.0);
        let Some((k, _)) = best else {
            return Err(RpcError::invalid(format!(
                "There is no breakpoint near {:.2} bp.",
                p.size
            )));
        };
        let mut merged: Vec<Segment> = segs.clone();
        merged[k].end_size = segs[k + 1].end_size;
        merged.remove(k + 1);
        est.refit(&merged, seed).map_err(fit_err)
    })
}

fn clear_breakpoints(e: &Engine, p: IdParams) -> Result<ArtifactEstimatorView> {
    edit(e, p.id, |est, seed, (min, max)| {
        let method = est.equations.first().map_or(
            if est.is_global() {
                RegressionMethod::NoSlope
            } else {
                RegressionMethod::TheilSen
            },
            |eq| eq.segment.method,
        );
        est.clear_breakpoints(min, max, method, seed)
            .map_err(fit_err)
    })
}

fn set_method(e: &Engine, p: SetArtifactMethodParams) -> Result<ArtifactEstimatorView> {
    edit(e, p.id, |est, seed, _| {
        if !est
            .set_method(p.equation_index, p.method, seed)
            .map_err(fit_err)?
        {
            return Err(RpcError::not_found(format!(
                "This class has no equation {}.",
                p.equation_index
            )));
        }
        Ok(())
    })
}

fn refit(e: &Engine, p: IdParams) -> Result<ArtifactEstimatorView> {
    edit(e, p.id, |est, seed, _| {
        let segs = est.segments();
        est.refit(&segs, seed).map_err(fit_err)
    })
}

fn delete(e: &Engine, p: IdParams) -> Result<()> {
    e.workspace()?.write(|tx| {
        let (pid, _) = owner(tx, p.id)?;
        tx.execute("DELETE FROM artifact_estimator WHERE id = ?1", [p.id])?;
        super::projects::touch(tx, pid)?;
        Ok(())
    })?;
    e.changed(PROJECTS, None);
    Ok(())
}

fn method_name(m: RegressionMethod) -> &'static str {
    match m {
        RegressionMethod::LeastSquares => "least_squares",
        RegressionMethod::TheilSen => "theil_sen",
        RegressionMethod::Ransac => "ransac",
        RegressionMethod::NoSlope => "no_slope",
    }
}

fn export(e: &Engine, p: IdParams) -> Result<TextFile> {
    e.workspace()?.read(|c| {
        let proj = require_kind(c, p.id, ProjectKind::ArtifactEstimator)?;
        let mut rows = vec![[
            "Locus",
            "Label",
            "Artifact Distance",
            "Distance Buffer",
            "Start Size",
            "End Size",
            "Method",
            "Slope",
            "Intercept",
            "SD",
            "R Squared",
            "Points",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect::<Vec<_>>()];
        let opt = |v: Option<f64>| v.map_or(String::new(), |x| format!("{x:.4}"));
        for l in project_loci(c, &proj)? {
            for (_, est) in load_artifact(c, proj.id, l.id)? {
                for eq in &est.equations {
                    rows.push(vec![
                        l.label.clone(),
                        est.label.clone(),
                        opt(est.artifact_distance),
                        opt(est.artifact_distance_buffer),
                        format!("{:.3}", eq.segment.start_size),
                        format!("{:.3}", eq.segment.end_size),
                        method_name(eq.segment.method).into(),
                        format!("{:.6e}", eq.fit.slope),
                        format!("{:.6}", eq.fit.intercept),
                        format!("{:.6}", eq.fit.sd),
                        format!("{:.4}", eq.fit.r_squared),
                        eq.n_points.to_string(),
                    ]);
                }
            }
        }
        Ok(TextFile {
            filename: format!("{}_artifact_equations.csv", safe_filename(&proj.title)),
            content: csv_text(&rows)?,
        })
    })
}
