//! Locus analysis for each project kind.
//!
//! [`analyze_locus`] reads one snapshot (project, parameters, runs, upstream
//! estimators, and the fingerprints of all of these), computes outside any
//! lock, and writes the result together with the fingerprints in one
//! transaction. If an input changes while it computes, the stored
//! fingerprints describe what was actually used, so the result simply shows
//! as stale.

use super::inputs::{self, Inputs, RunsIndex};
use super::pipeline::{self, RunPeaks};
use super::{included_samples, locus_params, project_locus, ProjectKind, ProjectRow};
use crate::api::loci::Locus;
use crate::error::{OrNotFound, Result, RpcError};
use crate::peak_codec;
use crate::Engine;
use microspat_core::artifact::{self, ArtifactEstimator, ArtifactModel};
use microspat_core::bins::{self, default_label};
use microspat_core::genotyping::{self, Run, SampleLocusCall};
use microspat_core::quant_bias::{self, BiasEstimate, QuantBiasParams};
use microspat_core::{Bin, Peak};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use ts_rs::TS;

/// What analyzing one locus did.
#[derive(Debug, Clone, Serialize, TS)]
pub struct LocusAnalysis {
    pub locus_id: i64,
    pub locus_label: String,
    /// Runs read.
    pub run_count: u32,
    /// Runs with usable sizing.
    pub usable_runs: u32,
    /// One line describing the result, e.g. "12 bins from 3,410 peaks".
    pub summary: String,
    /// Things the user should know (no bins upstream, no control runs, ...).
    pub warnings: Vec<String>,
    /// Wall time in milliseconds.
    pub ms: u32,
}

/// Stored result of a bin estimator locus.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BinResult {
    pub run_count: u32,
    pub peak_count: u32,
}

/// Stored result of an artifact estimator locus.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ArtifactResult {
    pub run_count: u32,
    /// Runs with exactly one main peak, sitting in a bin.
    pub mono_allelic_runs: u32,
    /// Why the model came out empty, when it did (absent in results stored
    /// before this was recorded).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,
}

/// Stored result of a quantification-bias estimator locus.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct QuantBiasResult {
    pub estimate: Option<BiasEstimate>,
    /// The parameters the fit used, so views explain the stored fit rather
    /// than what current parameters would select. Absent in results stored
    /// before this was recorded.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<QuantBiasParams>,
}

/// Stored result of a genotyping locus. Prevalence is filled by the
/// probabilistic pass and cleared by re-analysis.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct GenotypingResult {
    #[serde(default)]
    pub prevalence: Option<BTreeMap<i64, f64>>,
}

/// Bins of a bin estimator at a locus, by size.
pub fn load_bins(c: &Connection, be: i64, locus_id: i64) -> Result<Vec<Bin>> {
    let mut st = c.prepare_cached(
        "SELECT id, label, base_size, bin_buffer, peak_count FROM bin
         WHERE project_id = ?1 AND locus_id = ?2 ORDER BY base_size, id",
    )?;
    let v = st
        .query_map([be, locus_id], |r| {
            Ok(Bin {
                id: r.get(0)?,
                label: r.get(1)?,
                base_size: r.get(2)?,
                bin_buffer: r.get(3)?,
                peak_count: r.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

/// Artifact classes of an artifact estimator at a locus, with their ids.
pub fn load_artifact(
    c: &Connection,
    ae: i64,
    locus_id: i64,
) -> Result<Vec<(i64, ArtifactEstimator)>> {
    let mut st = c.prepare_cached(
        "SELECT id, label, artifact_distance, artifact_distance_buffer, points, equations
         FROM artifact_estimator WHERE project_id = ?1 AND locus_id = ?2 ORDER BY id",
    )?;
    let v = st
        .query_map([ae, locus_id], |r| {
            Ok((
                r.get(0)?,
                ArtifactEstimator {
                    label: r.get(1)?,
                    artifact_distance: r.get(2)?,
                    artifact_distance_buffer: r.get(3)?,
                    points: crate::api::json_col(r, 4)?,
                    equations: crate::api::json_col(r, 5)?,
                },
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

/// The artifact model a project uses at a locus (None without a link).
pub fn artifact_model(
    c: &Connection,
    ae: Option<i64>,
    locus_id: i64,
) -> Result<Option<ArtifactModel>> {
    let Some(ae) = ae else { return Ok(None) };
    Ok(Some(ArtifactModel {
        estimators: load_artifact(c, ae, locus_id)?
            .into_iter()
            .map(|(_, e)| e)
            .collect(),
    }))
}

/// Warning of a calling project whose linked artifact estimator has no
/// model at a locus.
pub fn no_model_upstream(locus_label: &str) -> String {
    format!(
        "No artifact model for this locus ({locus_label}): stutter is not being accounted for. The linked artifact estimator has no artifact classes here."
    )
}

/// Why an analyzed artifact estimator has no model at a locus; empty when it
/// has one or was never analyzed there. Classes deleted by hand count too.
pub fn artifact_warnings(c: &Connection, ae: i64, locus: &Locus) -> Result<Vec<String>> {
    let Some(stored) = inputs::stored_result(c, ae, locus.id)? else {
        return Ok(Vec::new());
    };
    let classes: i64 = c.query_row(
        "SELECT COUNT(*) FROM artifact_estimator WHERE project_id = ?1 AND locus_id = ?2",
        [ae, locus.id],
        |r| r.get(0),
    )?;
    if classes > 0 {
        return Ok(Vec::new());
    }
    let stored: Vec<String> = serde_json::from_value::<ArtifactResult>(stored)
        .map(|r| r.warnings)
        .unwrap_or_default();
    Ok(if stored.is_empty() {
        vec![format!(
            "No artifact model at {0}: every artifact class was deleted. Projects using this estimator will not account for stutter at {0}.",
            locus.label
        )]
    } else {
        stored
    })
}

/// Control mixtures of a project: sample → [(control, proportion)].
pub fn load_mixtures(c: &Connection, project_id: i64) -> Result<BTreeMap<i64, Vec<(i64, f64)>>> {
    let mut out: BTreeMap<i64, Vec<(i64, f64)>> = BTreeMap::new();
    let mut st = c.prepare_cached(
        "SELECT sample_id, control_id, proportion FROM control_mixture WHERE project_id = ?1
         ORDER BY sample_id, control_id",
    )?;
    for row in st.query_map([project_id], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, i64>(1)?,
            r.get::<_, f64>(2)?,
        ))
    })? {
        let (s, ctl, p) = row?;
        out.entry(s).or_default().push((ctl, p));
    }
    Ok(out)
}

/// Bin of each control at a locus (None: no allele set, or its bin was deleted).
pub fn control_bins(c: &Connection, locus_id: i64) -> Result<HashMap<i64, Option<i64>>> {
    let mut st =
        c.prepare_cached("SELECT control_id, bin_id FROM control_allele WHERE locus_id = ?1")?;
    let v = st
        .query_map([locus_id], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

/// Upstream data a locus analysis reads.
struct Upstream {
    bins: Vec<Bin>,
    model: Option<ArtifactModel>,
    beta: Option<f64>,
    mixtures: BTreeMap<i64, Vec<(i64, f64)>>,
    control_bins: HashMap<i64, Option<i64>>,
}

struct Snapshot {
    project: ProjectRow,
    locus: Locus,
    params: super::LocusParams,
    samples: Option<HashSet<i64>>,
    inputs: Inputs,
    loaded: pipeline::LoadedLocus,
    upstream: Upstream,
}

fn snapshot(c: &Connection, project_id: i64, locus_id: i64) -> Result<Snapshot> {
    let project = super::load_row(c, project_id)?;
    let locus = project_locus(c, &project, locus_id)?;
    let params = locus_params(c, &project, locus_id)?;
    let samples = included_samples(c, &project)?;
    let inputs = inputs::current(
        c,
        &project,
        &locus,
        &mut RunsIndex::default(),
        samples.as_ref(),
    )?;
    let loaded = pipeline::load(c, &locus, samples.as_ref())?;
    let bins = match project.bin_estimator_id {
        Some(be) if project.kind.needs_bins() => load_bins(c, be, locus_id)?,
        _ => Vec::new(),
    };
    let model = if project.kind.has_calls() {
        artifact_model(c, project.artifact_estimator_id, locus_id)?
    } else {
        None
    };
    let beta = match (project.kind, project.quant_bias_estimator_id) {
        (ProjectKind::Genotyping, Some(qb)) => inputs::stored_beta(c, qb, locus_id)?,
        _ => None,
    };
    let (mixtures, control_bins) = if project.kind == ProjectKind::QuantBiasEstimator {
        (load_mixtures(c, project_id)?, control_bins(c, locus_id)?)
    } else {
        (BTreeMap::new(), HashMap::new())
    };
    Ok(Snapshot {
        project,
        locus,
        params,
        samples,
        inputs,
        loaded,
        upstream: Upstream {
            bins,
            model,
            beta,
            mixtures,
            control_bins,
        },
    })
}

/// What the kind-specific step writes.
enum Output {
    Bins {
        bins: Vec<Bin>,
        scatter: Vec<(f64, f64)>,
        result: BinResult,
    },
    Artifact {
        model: ArtifactModel,
        result: ArtifactResult,
    },
    Calls {
        calls: Vec<SampleLocusCall>,
        result: serde_json::Value,
    },
}

/// Analyzes one locus of a project and stores the result.
pub fn analyze_locus(engine: &Engine, project_id: i64, locus_id: i64) -> Result<LocusAnalysis> {
    let t = std::time::Instant::now();
    let ws = engine.workspace()?;
    let snap = ws.read(|c| snapshot(c, project_id, locus_id))?;
    let opts = pipeline::AnnotateOptions {
        use_measured_pullup: match snap.project.kind {
            ProjectKind::Genotyping => snap.params.genotyping.is_none_or(|g| g.measured_pullup),
            _ => true,
        },
        drop_measured_pullup: matches!(
            snap.project.kind,
            ProjectKind::BinEstimator | ProjectKind::ArtifactEstimator
        ),
    };
    let runs = pipeline::annotate(
        engine.scan_cache(),
        &snap.loaded,
        &snap.params.scan,
        &snap.params.filter,
        opts,
    )?;
    let usable = runs.iter().filter(|r| r.sizing_ok).count() as u32;
    let mut warnings = Vec::new();
    if opts.use_measured_pullup && !snap.loaded.unchecked_plates.is_empty() {
        warnings.push(format!(
            "Plate quality has not been checked for {}: fixed bleedthrough limit used for those plates. Check plate quality on the Plates page, then re-analyze.",
            crate::api::some_of(&snap.loaded.unchecked_plates, 6)
        ));
    }
    if runs.is_empty() {
        warnings.push(format!(
            "No runs of {} for this project's samples.",
            snap.locus.label
        ));
    }
    if snap.project.kind.needs_bins() && snap.upstream.bins.is_empty() {
        warnings.push(format!(
            "The bin estimator has no bins at {}; nothing can be binned.",
            snap.locus.label
        ));
    }
    let (output, summary) = match snap.project.kind {
        ProjectKind::BinEstimator => bin_step(&snap, &runs)?,
        ProjectKind::ArtifactEstimator => artifact_step(&snap, &runs, &mut warnings)?,
        ProjectKind::QuantBiasEstimator => quant_bias_step(&snap, &runs, &mut warnings)?,
        ProjectKind::Genotyping => genotyping_step(&snap, runs.clone())?,
    };
    if snap.project.kind.has_calls()
        && snap
            .upstream
            .model
            .as_ref()
            .is_some_and(|m| m.estimators.is_empty())
    {
        warnings.push(no_model_upstream(&snap.locus.label));
    }
    let fingerprint = serde_json::to_string(&snap.inputs)?;
    ws.write(|tx| {
        // The project may have been deleted meanwhile.
        super::load_row(tx, project_id)?;
        store(tx, &snap, output, &fingerprint)
    })?;
    Ok(LocusAnalysis {
        locus_id,
        locus_label: snap.locus.label.clone(),
        run_count: runs.len() as u32,
        usable_runs: usable,
        summary,
        warnings,
        ms: t.elapsed().as_millis() as u32,
    })
}

fn bin_step(snap: &Snapshot, runs: &[RunPeaks]) -> Result<(Output, String)> {
    let mut scatter = Vec::new();
    for r in runs.iter().filter(|r| r.sizing_ok) {
        scatter.extend(r.peaks.iter().map(|p| (p.size, p.relative_height)));
    }
    let sizes: Vec<f64> = scatter.iter().map(|(s, _)| *s).collect();
    let params = snap.params.bins.unwrap_or_default();
    let bins = if sizes.is_empty() {
        Vec::new()
    } else {
        bins::estimate_bins(&sizes, snap.locus.nucleotide_repeat_length, &params)
            .map_err(|e| RpcError::invalid(format!("Cannot estimate bins: {e}")))?
    };
    let summary = format!("{} bins from {} peaks", bins.len(), sizes.len());
    Ok((
        Output::Bins {
            result: BinResult {
                run_count: runs.len() as u32,
                peak_count: sizes.len() as u32,
            },
            bins,
            scatter,
        },
        summary,
    ))
}

fn artifact_step(
    snap: &Snapshot,
    runs: &[RunPeaks],
    warnings: &mut Vec<String>,
) -> Result<(Output, String)> {
    let params = snap.params.artifact.unwrap_or_default();
    let mut qualifying: Vec<Vec<Peak>> = Vec::new();
    for r in runs.iter().filter(|r| r.sizing_ok && !r.peaks.is_empty()) {
        let mut peaks = r.peaks.clone();
        bins::annotate_bins(&mut peaks, &snap.upstream.bins);
        // The main peak must be an allele, or its "artifacts" are measured
        // from the wrong parent.
        let main_in_bin = peaks
            .iter()
            .max_by(|a, b| a.height.total_cmp(&b.height))
            .is_some_and(|p| p.in_bin);
        if main_in_bin {
            qualifying.push(peaks);
        }
    }
    let mono = qualifying
        .iter()
        .filter(|p| artifact::is_mono_allelic(p, params.max_secondary_relative_peak_height))
        .count() as u32;
    let refs: Vec<&[Peak]> = qualifying.iter().map(|v| v.as_slice()).collect();
    let model = artifact::estimate_artifact_model(&refs, &snap.locus.info(), &params)
        .map_err(|e| RpcError::invalid(format!("Cannot estimate artifacts: {e}")))?;
    let summary = format!(
        "{} artifact classes from {} mono-allelic runs",
        model.estimators.len(),
        mono
    );
    let empty = if !model.estimators.is_empty() {
        Vec::new()
    } else {
        let label = &snap.locus.label;
        let why = if snap.upstream.bins.is_empty() {
            "the bin estimator has no bins here, so no run qualifies (the tallest peak must be in a bin)".to_string()
        } else if qualifying.is_empty() {
            "no run's tallest peak is in a bin".to_string()
        } else if mono == 0 {
            format!(
                "none of the {} runs whose tallest peak is in a bin is mono-allelic",
                qualifying.len()
            )
        } else {
            format!("no artifact distance class passed the frequency limits in {mono} mono-allelic runs")
        };
        vec![format!(
            "No artifact model at {label}: {why}. Projects using this estimator will not account for stutter at {label}."
        )]
    };
    warnings.extend(empty.iter().cloned());
    Ok((
        Output::Artifact {
            model,
            result: ArtifactResult {
                run_count: runs.len() as u32,
                mono_allelic_runs: mono,
                warnings: empty,
            },
        },
        summary,
    ))
}

fn core_runs(runs: Vec<RunPeaks>) -> Vec<Run> {
    runs.into_iter()
        .map(|r| Run {
            run_id: r.run_id,
            sample_id: r.sample_id,
            sizing_ok: r.sizing_ok,
            peaks: r.peaks,
        })
        .collect()
}

fn empty_call(sample_id: i64, locus_id: i64) -> SampleLocusCall {
    SampleLocusCall {
        sample_id,
        locus_id,
        reference_run_id: None,
        peaks: Vec::new(),
        alleles: BTreeSet::new(),
        flags: Default::default(),
    }
}

/// True when a peak carries part of a control mixture.
pub fn is_true_peak(p: &Peak) -> bool {
    p.true_proportion.is_some_and(|t| t > 0.0)
}

fn quant_bias_step(
    snap: &Snapshot,
    runs: &[RunPeaks],
    warnings: &mut Vec<String>,
) -> Result<(Output, String)> {
    let params = snap.params.quant_bias.unwrap_or_default();
    let mut core: Vec<Run> = core_runs(runs.to_vec());
    for r in core.iter_mut() {
        genotyping::annotate_run(
            &mut r.peaks,
            &snap.upstream.bins,
            snap.upstream.model.as_ref(),
        );
    }
    let mut by_sample: BTreeMap<i64, Vec<&Run>> = BTreeMap::new();
    for r in &core {
        by_sample.entry(r.sample_id).or_default().push(r);
    }
    let mut calls = Vec::new();
    let mut missing_alleles = BTreeSet::new();
    for (&sample, mixture) in &snap.upstream.mixtures {
        let mut call = empty_call(sample, snap.locus.id);
        let rs = by_sample.get(&sample).cloned().unwrap_or_default();
        if let Some(run) = genotyping::select_reference_run(&rs, params.offscale_threshold) {
            let components: Vec<(i64, f64)> = mixture
                .iter()
                .filter_map(|&(ctl, prop)| match snap.upstream.control_bins.get(&ctl) {
                    Some(Some(b)) => Some((*b, prop)),
                    _ => {
                        missing_alleles.insert(ctl);
                        None
                    }
                })
                .collect();
            call.reference_run_id = Some(run.run_id);
            call.peaks = run.peaks.clone();
            quant_bias::assign_true_proportions(&mut call.peaks, &components);
            call.alleles = components.iter().map(|(b, _)| *b).collect();
        }
        calls.push(call);
    }
    if !missing_alleles.is_empty() {
        warnings.push(format!(
            "{} control(s) have no allele at {}; their share was left out.",
            missing_alleles.len(),
            snap.locus.label
        ));
    }
    let refs: Vec<&[Peak]> = calls
        .iter()
        .filter(|c| c.reference_run_id.is_some())
        .map(|c| c.peaks.as_slice())
        .collect();
    let estimate = quant_bias::estimate_beta(&refs, &params)
        .map_err(|e| RpcError::invalid(format!("Cannot estimate bias: {e}")))?;
    if estimate.is_none() {
        warnings.push(format!(
            "No control run at {} qualified for estimating β (two or more control peaks above the minimum height, not off-scale).",
            snap.locus.label
        ));
    }
    let beta = estimate.map(|e| e.beta);
    for call in calls.iter_mut() {
        quant_bias::quantify(&mut call.peaks, is_true_peak, beta);
    }
    let summary = match &estimate {
        Some(e) => format!(
            "β = {:.4} (SD {:.3}, R² {:.2}) from {} control runs",
            e.beta, e.sd, e.r_squared, e.n_sets
        ),
        None => "no estimate".to_string(),
    };
    Ok((
        Output::Calls {
            calls,
            result: serde_json::to_value(QuantBiasResult {
                estimate,
                params: Some(params),
            })?,
        },
        summary,
    ))
}

fn genotyping_step(snap: &Snapshot, runs: Vec<RunPeaks>) -> Result<(Output, String)> {
    let params = snap.params.genotyping.unwrap_or_default();
    let mut core = core_runs(runs);
    let mut calls = genotyping::analyze_locus(
        snap.locus.id,
        &mut core,
        &snap.upstream.bins,
        snap.upstream.model.as_ref(),
        snap.upstream.beta,
        &params,
    );
    let have: HashSet<i64> = calls.iter().map(|c| c.sample_id).collect();
    if let Some(samples) = &snap.samples {
        for &s in samples {
            if !have.contains(&s) {
                calls.push(empty_call(s, snap.locus.id));
            }
        }
    }
    calls.sort_by_key(|c| c.sample_id);
    let failed = calls.iter().filter(|c| c.flags.failure).count();
    let typed = calls
        .iter()
        .filter(|c| c.reference_run_id.is_some() && !c.flags.failure)
        .count();
    let summary = format!(
        "{} samples called, {} failed, {} without a usable run",
        typed,
        failed,
        calls.len() - typed - failed
    );
    Ok((
        Output::Calls {
            calls,
            result: serde_json::to_value(GenotypingResult::default())?,
        },
        summary,
    ))
}

fn store(tx: &Connection, snap: &Snapshot, output: Output, fingerprint: &str) -> Result<()> {
    let pid = snap.project.id;
    let lid = snap.locus.id;
    let (result, scatter) = match output {
        Output::Bins {
            bins,
            scatter,
            result,
        } => {
            replace_bins(tx, pid, lid, &bins)?;
            (
                serde_json::to_string(&result)?,
                Some(peak_codec::encode_pairs(&scatter)),
            )
        }
        Output::Artifact { model, result } => {
            tx.execute(
                "DELETE FROM artifact_estimator WHERE project_id = ?1 AND locus_id = ?2",
                [pid, lid],
            )?;
            for e in &model.estimators {
                insert_artifact(tx, pid, lid, e)?;
            }
            (serde_json::to_string(&result)?, None)
        }
        Output::Calls { calls, result } => {
            store_calls(tx, pid, lid, &calls)?;
            (serde_json::to_string(&result)?, None)
        }
    };
    tx.execute(
        "INSERT INTO project_locus (project_id, locus_id, analyzed_at, analysis_rev, fingerprint, result, scatter)
         VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 1, ?3, ?4, ?5)
         ON CONFLICT (project_id, locus_id) DO UPDATE SET analyzed_at = excluded.analyzed_at,
            analysis_rev = analysis_rev + 1, fingerprint = excluded.fingerprint,
            result = excluded.result, scatter = excluded.scatter",
        params![pid, lid, fingerprint, result, scatter],
    )?;
    Ok(())
}

/// Inserts one artifact class.
pub fn insert_artifact(tx: &Connection, pid: i64, lid: i64, e: &ArtifactEstimator) -> Result<i64> {
    tx.execute(
        "INSERT INTO artifact_estimator (project_id, locus_id, label, artifact_distance,
         artifact_distance_buffer, points, equations) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            pid,
            lid,
            e.label,
            e.artifact_distance,
            e.artifact_distance_buffer,
            serde_json::to_string(&e.points)?,
            serde_json::to_string(&e.equations)?
        ],
    )?;
    Ok(tx.last_insert_rowid())
}

/// Replaces the bins of a locus with freshly estimated ones. A new bin whose
/// label matches an existing bin takes over its id, so controls and calls
/// that refer to the allele keep pointing at it.
fn replace_bins(tx: &Connection, pid: i64, lid: i64, bins: &[Bin]) -> Result<()> {
    let existing: HashMap<String, i64> = {
        let mut st =
            tx.prepare("SELECT label, id FROM bin WHERE project_id = ?1 AND locus_id = ?2")?;
        let v = st
            .query_map([pid, lid], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<rusqlite::Result<_>>()?;
        v
    };
    let mut labels = HashSet::new();
    let mut keep = HashSet::new();
    let mut rows = Vec::new();
    for b in bins {
        // Rounded centers can collide for short repeats; fall back to 0.1 bp.
        let mut label = b.label.clone();
        if !labels.insert(label.clone()) {
            label = format!("{:.1}", b.base_size);
            labels.insert(label.clone());
        }
        rows.push((label, b));
    }
    for (label, _) in &rows {
        if let Some(&id) = existing.get(label) {
            keep.insert(id);
        }
    }
    let stale: Vec<i64> = existing
        .values()
        .filter(|id| !keep.contains(id))
        .copied()
        .collect();
    if !stale.is_empty() {
        tx.execute(
            &format!(
                "DELETE FROM bin WHERE id IN ({})",
                crate::api::id_list(&stale)
            ),
            [],
        )?;
    }
    for (label, b) in rows {
        match existing.get(&label) {
            Some(&id) => tx.execute(
                "UPDATE bin SET base_size = ?1, bin_buffer = ?2, peak_count = ?3 WHERE id = ?4",
                params![b.base_size, b.bin_buffer, b.peak_count, id],
            )?,
            None => tx.execute(
                "INSERT INTO bin (project_id, locus_id, label, base_size, bin_buffer, peak_count)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![pid, lid, label, b.base_size, b.bin_buffer, b.peak_count],
            )?,
        };
    }
    Ok(())
}

/// Writes calls, keeping each sample's comment. Clears manual curation.
fn store_calls(tx: &Connection, pid: i64, lid: i64, calls: &[SampleLocusCall]) -> Result<()> {
    let mut st = tx.prepare(
        "INSERT INTO genotype (project_id, sample_id, locus_id, reference_run_id, peaks, alleles,
            failure, offscale, manual_curation)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0)
         ON CONFLICT (project_id, locus_id, sample_id) DO UPDATE SET
            reference_run_id = excluded.reference_run_id, peaks = excluded.peaks,
            alleles = excluded.alleles, failure = excluded.failure, offscale = excluded.offscale,
            manual_curation = 0",
    )?;
    let keep: HashSet<i64> = calls.iter().map(|c| c.sample_id).collect();
    for c in calls {
        st.execute(params![
            pid,
            c.sample_id,
            lid,
            c.reference_run_id,
            peak_codec::encode(&c.peaks),
            serde_json::to_string(&c.alleles)?,
            c.flags.failure,
            c.flags.offscale,
        ])?;
    }
    // Calls of samples no longer analyzed here (e.g. a mixture removed).
    let mut st =
        tx.prepare("SELECT sample_id FROM genotype WHERE project_id = ?1 AND locus_id = ?2")?;
    let gone: Vec<i64> = st
        .query_map([pid, lid], |r| r.get::<_, i64>(0))?
        .filter_map(|r| r.ok())
        .filter(|s| !keep.contains(s))
        .collect();
    for s in gone {
        tx.execute(
            "DELETE FROM genotype WHERE project_id = ?1 AND locus_id = ?2 AND sample_id = ?3",
            [pid, lid, s],
        )?;
    }
    Ok(())
}

/// A stored call.
pub fn load_call(
    c: &Connection,
    pid: i64,
    sample_id: i64,
    locus_id: i64,
) -> Result<(SampleLocusCall, Option<String>)> {
    c.query_row(
        "SELECT reference_run_id, peaks, alleles, failure, offscale, manual_curation, comment
         FROM genotype WHERE project_id = ?1 AND sample_id = ?2 AND locus_id = ?3",
        [pid, sample_id, locus_id],
        |r| row_to_call(r, sample_id, locus_id, 0),
    )
    .optional()?
    .or_not_found(|| "This sample has no call at this locus yet. Analyze the locus first.".into())?
    .map_err(RpcError::internal)
}

type CallRow = std::result::Result<(SampleLocusCall, Option<String>), String>;

/// Reads columns `reference_run_id, peaks, alleles, failure, offscale,
/// manual_curation, comment` starting at `at`.
pub fn row_to_call(
    r: &rusqlite::Row,
    sample_id: i64,
    locus_id: i64,
    at: usize,
) -> rusqlite::Result<CallRow> {
    let blob: Vec<u8> = r.get(at + 1)?;
    let alleles: String = r.get(at + 2)?;
    let call = (|| {
        let peaks = peak_codec::decode(&blob)?;
        // Derived from the stored peaks rather than stored itself.
        let spectral = genotyping::has_spectral_breakdown(&peaks);
        Ok((
            SampleLocusCall {
                sample_id,
                locus_id,
                reference_run_id: r.get(at).map_err(|e| e.to_string())?,
                peaks,
                alleles: serde_json::from_str(&alleles).map_err(|e| e.to_string())?,
                flags: genotyping::CallFlags {
                    failure: r.get(at + 3).map_err(|e| e.to_string())?,
                    offscale: r.get(at + 4).map_err(|e| e.to_string())?,
                    spectral,
                    manual_curation: r.get(at + 5).map_err(|e| e.to_string())?,
                },
            },
            r.get(at + 6).map_err(|e| e.to_string())?,
        ))
    })();
    Ok(call)
}

/// Writes a call's peaks, alleles and flags back (after curation or the probabilistic pass).
pub fn update_call(tx: &Connection, pid: i64, call: &SampleLocusCall) -> Result<()> {
    tx.execute(
        "UPDATE genotype SET peaks = ?1, alleles = ?2, failure = ?3, offscale = ?4, manual_curation = ?5
         WHERE project_id = ?6 AND sample_id = ?7 AND locus_id = ?8",
        params![
            peak_codec::encode(&call.peaks),
            serde_json::to_string(&call.alleles)?,
            call.flags.failure,
            call.flags.offscale,
            call.flags.manual_curation,
            pid,
            call.sample_id,
            call.locus_id
        ],
    )?;
    Ok(())
}

/// Default label for a bin at `base_size` (re-exported for the bin editor).
pub fn bin_label(base_size: f64) -> String {
    default_label(base_size)
}
