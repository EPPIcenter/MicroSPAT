//! Projects of every kind: list, create, update, duplicate, delete; their
//! samples; per-locus parameters; locus analysis and its staleness.

use super::{check_label, header_key, some_of, CsvSource, IdParams};
use crate::error::{OrNotFound, Result, RpcError};
use crate::events::entity::{CONTROLS, PROJECTS};
use crate::projects::analysis::{self, LocusAnalysis};
use crate::projects::inputs::{self, AnalysisState, AnalysisStatus, RunsIndex};
use crate::projects::{
    included_samples, load_kind, load_row, load_rows, locus_params, project_loci, LocusParams,
    ProjectKind, ProjectRow,
};
use crate::rpc::Registry;
use crate::Engine;
use microspat_core::Color;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use ts_rs::TS;

/// A project in brief.
#[derive(Debug, Clone, Serialize, TS)]
pub struct ProjectRef {
    pub id: i64,
    pub kind: ProjectKind,
    pub title: String,
}

/// A project in the project list.
#[derive(Debug, Clone, Serialize, TS)]
pub struct ProjectSummary {
    pub id: i64,
    pub kind: ProjectKind,
    pub title: String,
    pub description: String,
    pub locus_set_id: i64,
    pub locus_set_label: String,
    pub bin_estimator: Option<ProjectRef>,
    pub artifact_estimator: Option<ProjectRef>,
    pub quant_bias_estimator: Option<ProjectRef>,
    /// Bin and artifact estimators: use every sample with runs at the project's loci.
    pub all_samples: bool,
    /// Samples the project uses.
    pub sample_count: u32,
    pub locus_count: u32,
    pub current_loci: u32,
    pub stale_loci: u32,
    pub unanalyzed_loci: u32,
    /// Genotyping only: state of the project-wide probabilistic pass.
    pub probabilities: Option<AnalysisStatus>,
    pub created_at: String,
    pub updated_at: String,
}

/// One locus of a project with its analysis status.
#[derive(Debug, Clone, Serialize, TS)]
pub struct ProjectLocus {
    pub locus_id: i64,
    pub label: String,
    pub color: Color,
    pub min_base_length: f64,
    pub max_base_length: f64,
    pub nucleotide_repeat_length: f64,
    pub status: AnalysisStatus,
    /// True when this locus uses non-default parameters.
    pub custom_params: bool,
    /// Artifact estimators: problems with the stored result, such as an
    /// empty artifact model (dependents then do not account for stutter at
    /// this locus). Absent when none.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    #[ts(optional = nullable)]
    pub warnings: Vec<String>,
}

/// A project with its loci, dependents and upstream warnings.
#[derive(Debug, Clone, Serialize, TS)]
pub struct ProjectDetail {
    pub project: ProjectSummary,
    pub loci: Vec<ProjectLocus>,
    /// Projects that link to this one.
    pub dependents: Vec<ProjectRef>,
    /// Linked estimators whose own results are not current at some locus.
    pub upstream_warnings: Vec<String>,
}

/// Params of `list_projects`.
#[derive(Debug, Clone, Default, Deserialize, TS)]
pub struct ListProjectsParams {
    /// Only this kind.
    #[serde(default)]
    #[ts(optional)]
    pub kind: Option<ProjectKind>,
}

/// Params of `create_project`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateProjectParams {
    pub kind: ProjectKind,
    pub title: String,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    pub locus_set_id: i64,
    /// Required for every kind except bin estimators.
    #[serde(default)]
    #[ts(optional)]
    pub bin_estimator_id: Option<i64>,
    /// Optional for quantification-bias estimators and genotyping projects.
    #[serde(default)]
    #[ts(optional)]
    pub artifact_estimator_id: Option<i64>,
    /// Optional for genotyping projects.
    #[serde(default)]
    #[ts(optional)]
    pub quant_bias_estimator_id: Option<i64>,
    /// Bin and artifact estimators: use every sample with runs (default true).
    #[serde(default)]
    #[ts(optional)]
    pub all_samples: Option<bool>,
}

/// Params of `update_project`. Omitted fields are unchanged; null clears an optional link.
#[derive(Debug, Clone, TS)]
pub struct UpdateProjectParams {
    pub id: i64,
    #[ts(optional)]
    pub title: Option<String>,
    #[ts(optional)]
    pub description: Option<String>,
    #[ts(optional)]
    pub bin_estimator_id: Option<i64>,
    #[ts(optional, type = "number | null")]
    pub artifact_estimator_id: Option<Option<i64>>,
    #[ts(optional, type = "number | null")]
    pub quant_bias_estimator_id: Option<Option<i64>>,
    #[ts(optional)]
    pub all_samples: Option<bool>,
}

// By hand: an absent link means "unchanged" and null means "unlink", which
// serde's derive cannot tell apart for `Option<Option<_>>`.
impl<'de> Deserialize<'de> for UpdateProjectParams {
    fn deserialize<D: Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        use serde::de::Error;
        let mut m = serde_json::Map::<String, serde_json::Value>::deserialize(d)?;
        fn take<T: serde::de::DeserializeOwned, E: Error>(
            m: &mut serde_json::Map<String, serde_json::Value>,
            k: &str,
        ) -> std::result::Result<Option<T>, E> {
            m.remove(k)
                .map(|v| serde_json::from_value(v).map_err(|e| E::custom(format!("{k}: {e}"))))
                .transpose()
        }
        let id =
            take::<i64, D::Error>(&mut m, "id")?.ok_or_else(|| D::Error::missing_field("id"))?;
        Ok(UpdateProjectParams {
            id,
            title: take(&mut m, "title")?,
            description: take(&mut m, "description")?,
            bin_estimator_id: take(&mut m, "bin_estimator_id")?,
            artifact_estimator_id: take(&mut m, "artifact_estimator_id")?,
            quant_bias_estimator_id: take(&mut m, "quant_bias_estimator_id")?,
            all_samples: take(&mut m, "all_samples")?,
        })
    }
}

/// Params of `duplicate_project`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct DuplicateProjectParams {
    pub id: i64,
    pub title: String,
}

/// A sample of a project.
#[derive(Debug, Clone, Serialize, TS)]
pub struct ProjectSampleRow {
    pub sample_id: i64,
    pub barcode: String,
    pub designation: super::samples::Designation,
    /// Runs of this sample at the project's loci.
    pub run_count: u32,
    /// From the probabilistic pass (genotyping).
    pub moi: Option<u32>,
    /// Known composition (quantification-bias estimators).
    pub controls: Vec<MixtureComponent>,
    /// Genotyping: most alleles called at any one locus of the project's
    /// locus set (over calls with a reference run). Absent for other kinds
    /// and for samples without such a call.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub max_alleles: Option<u32>,
}

/// One control in a control mixture.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct MixtureComponent {
    pub control_id: i64,
    /// Filled in on output; ignored on input.
    #[serde(default)]
    #[ts(optional)]
    pub label: Option<String>,
    pub proportion: f64,
}

/// Params of `add_project_samples` / `remove_project_samples`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct ProjectSamplesParams {
    pub id: i64,
    pub sample_ids: Vec<i64>,
}

/// Params of `import_project_samples_csv`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct ImportProjectSamplesParams {
    pub id: i64,
    #[serde(default)]
    #[ts(optional)]
    pub path: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub content: Option<String>,
}

/// Result of adding samples.
#[derive(Debug, Clone, Serialize, TS)]
pub struct AddSamplesResult {
    pub added: u32,
    /// Already in the project.
    pub already: u32,
}

/// Params naming a project and one of its loci.
#[derive(Debug, Clone, Copy, Deserialize, TS)]
pub struct ProjectLocusParams {
    pub project_id: i64,
    pub locus_id: i64,
}

/// Parameters of one locus.
#[derive(Debug, Clone, Serialize, TS)]
pub struct LocusParamsView {
    pub locus_id: i64,
    pub params: LocusParams,
    /// True when nothing differs from the kind's defaults.
    pub is_default: bool,
}

/// Params of `update_project_locus_params`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateLocusParamsParams {
    pub project_id: i64,
    /// Loci to change; omit for every locus of the project ("apply to all").
    #[serde(default)]
    #[ts(optional)]
    pub locus_ids: Option<Vec<i64>>,
    /// Fields to set, merged into each locus's parameters (a partial object is fine).
    #[ts(as = "super::TsPartialSections<LocusParams>")]
    pub params: serde_json::Value,
}

/// Params of `reset_project_locus_params`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct ResetLocusParamsParams {
    pub project_id: i64,
    /// Omit for every locus.
    #[serde(default)]
    #[ts(optional)]
    pub locus_ids: Option<Vec<i64>>,
}

/// Params of `analyze_project`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct AnalyzeProjectParams {
    pub id: i64,
    /// Loci to analyze; omit for every locus.
    #[serde(default)]
    #[ts(optional)]
    pub locus_ids: Option<Vec<i64>>,
    /// Skip loci that are already current.
    #[serde(default)]
    #[ts(optional)]
    pub only_stale: Option<bool>,
}

/// Result of `analyze_project`.
#[derive(Debug, Clone, Serialize, TS)]
pub struct AnalyzeProjectResult {
    pub loci: Vec<LocusAnalysis>,
}

pub(crate) fn register(r: &mut Registry) {
    r.query(
        "list_projects",
        "Projects (optionally of one kind) with sample counts and how many loci are current, stale or not analyzed.",
        list,
    );
    r.query(
        "get_project",
        "One project: summary, every locus with its analysis status and staleness reasons, dependents, and upstream warnings.",
        get,
    );
    r.mutation(
        "create_project",
        &[PROJECTS],
        "Create a project. Artifact, quantification-bias and genotyping projects need a bin estimator; linked estimators must cover the locus set.",
        create,
    );
    r.mutation(
        "update_project",
        &[PROJECTS],
        "Change title, description, linked estimators (null unlinks an optional one) or the all-samples setting.",
        update,
    );
    r.mutation(
        "duplicate_project",
        &[PROJECTS, CONTROLS],
        "Copy a project with its parameters and samples; estimators also keep their results (bins, controls, artifact classes, β).",
        duplicate,
    );
    r.mutation(
        "delete_project",
        &[PROJECTS, CONTROLS],
        "Delete a project and its results. Refused while another project links to it.",
        delete,
    );
    r.query(
        "list_project_samples",
        "Samples a project uses, with run counts, MOI (genotyping) and control mixtures (quantification bias).",
        list_samples,
    );
    r.mutation(
        "add_project_samples",
        &[PROJECTS],
        "Add samples by id. For a bin or artifact estimator this switches it to the listed samples.",
        add_samples,
    );
    r.mutation(
        "import_project_samples_csv",
        &[PROJECTS],
        "Add samples from a CSV with a Barcode column. Every barcode must exist; nothing is added otherwise.",
        import_samples_csv,
    );
    r.mutation(
        "remove_project_samples",
        &[PROJECTS, CONTROLS],
        "Remove samples (and their calls and control mixtures) from a project.",
        remove_samples,
    );
    r.query(
        "get_project_locus_params",
        "Effective parameters of a project at one locus.",
        get_params,
    );
    r.mutation(
        "update_project_locus_params",
        &[PROJECTS],
        "Merge parameter values into some loci, or every locus when locus_ids is omitted (apply to all). Affected results become stale.",
        update_params,
    );
    r.mutation(
        "reset_project_locus_params",
        &[PROJECTS],
        "Reset loci (or every locus) to the kind's default parameters.",
        reset_params,
    );
    r.task(
        "analyze_project",
        &[PROJECTS, CONTROLS],
        "Analyze loci of a project (all, a list, or only stale ones): scan, filter, then estimate bins, artifacts or β, or call alleles. Replaces earlier results and manual calls of those loci.",
        analyze,
    );
}

// ------------------------------------------------------------------ helpers

fn project_ref(c: &Connection, id: Option<i64>) -> Result<Option<ProjectRef>> {
    let Some(id) = id else { return Ok(None) };
    let p = load_row(c, id)?;
    Ok(Some(ProjectRef {
        id: p.id,
        kind: p.kind,
        title: p.title,
    }))
}

/// Samples with runs at any locus of a locus set.
fn samples_with_runs(c: &Connection, locus_set_id: i64) -> Result<Vec<i64>> {
    let mut st = c.prepare_cached(
        "SELECT DISTINCT r.sample_id FROM run r JOIN locus_set_member m ON m.locus_id = r.locus_id
         WHERE m.locus_set_id = ?1 ORDER BY r.sample_id",
    )?;
    let v = st
        .query_map([locus_set_id], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

/// Sample ids a project uses, ascending.
pub(crate) fn used_sample_ids(c: &Connection, p: &ProjectRow) -> Result<Vec<i64>> {
    match included_samples(c, p)? {
        None => samples_with_runs(c, p.locus_set_id),
        Some(s) => {
            let mut v: Vec<i64> = s.into_iter().collect();
            v.sort_unstable();
            Ok(v)
        }
    }
}

fn summarize(
    c: &Connection,
    p: &ProjectRow,
    idx: &mut RunsIndex,
) -> Result<(
    ProjectSummary,
    Vec<(crate::api::loci::Locus, AnalysisStatus)>,
)> {
    let set_label: String = c.query_row(
        "SELECT label FROM locus_set WHERE id = ?1",
        [p.locus_set_id],
        |r| r.get(0),
    )?;
    let statuses = inputs::locus_statuses(c, p, idx)?;
    let count = |s: AnalysisState| statuses.iter().filter(|(_, x)| x.state == s).count() as u32;
    let probabilities = if p.kind == ProjectKind::Genotyping {
        Some(inputs::probability_status(c, p)?)
    } else {
        None
    };
    Ok((
        ProjectSummary {
            id: p.id,
            kind: p.kind,
            title: p.title.clone(),
            description: p.description.clone(),
            locus_set_id: p.locus_set_id,
            locus_set_label: set_label,
            bin_estimator: project_ref(c, p.bin_estimator_id)?,
            artifact_estimator: project_ref(c, p.artifact_estimator_id)?,
            quant_bias_estimator: project_ref(c, p.quant_bias_estimator_id)?,
            all_samples: p.all_samples && p.kind.may_use_all_samples(),
            sample_count: used_sample_ids(c, p)?.len() as u32,
            locus_count: statuses.len() as u32,
            current_loci: count(AnalysisState::Current),
            stale_loci: count(AnalysisState::Stale),
            unanalyzed_loci: count(AnalysisState::NotAnalyzed),
            probabilities,
            created_at: p.created_at.clone(),
            updated_at: p.updated_at.clone(),
        },
        statuses,
    ))
}

fn dependents(c: &Connection, id: i64) -> Result<Vec<ProjectRef>> {
    let mut st = c.prepare_cached(
        "SELECT id, kind, title FROM project WHERE bin_estimator_id = ?1 OR artifact_estimator_id = ?1
         OR quant_bias_estimator_id = ?1 ORDER BY kind, title",
    )?;
    let v = st
        .query_map([id], |r| {
            let kind: String = r.get(1)?;
            Ok(ProjectRef {
                id: r.get(0)?,
                kind: ProjectKind::from_db(&kind).unwrap_or(ProjectKind::Genotyping),
                title: r.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

/// Full detail of a project.
pub fn load_detail(c: &Connection, id: i64) -> Result<ProjectDetail> {
    let p = load_row(c, id)?;
    let mut idx = RunsIndex::default();
    let (summary, statuses) = summarize(c, &p, &mut idx)?;
    let custom: HashSet<i64> = {
        let mut st = c.prepare_cached(
            "SELECT locus_id FROM project_locus WHERE project_id = ?1 AND params != '{}'",
        )?;
        let v = st
            .query_map([id], |r| r.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        v
    };
    let loci = statuses
        .into_iter()
        .map(|(l, status)| {
            let warnings = if p.kind == ProjectKind::ArtifactEstimator {
                analysis::artifact_warnings(c, p.id, &l)?
            } else {
                Vec::new()
            };
            Ok(ProjectLocus {
                locus_id: l.id,
                custom_params: custom.contains(&l.id),
                label: l.label,
                color: l.color,
                min_base_length: l.min_base_length,
                max_base_length: l.max_base_length,
                nucleotide_repeat_length: l.nucleotide_repeat_length,
                status,
                warnings,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let mut upstream_warnings = Vec::new();
    for up in [
        p.bin_estimator_id,
        p.artifact_estimator_id,
        p.quant_bias_estimator_id,
    ]
    .into_iter()
    .flatten()
    {
        let u = load_row(c, up)?;
        let ours: HashSet<i64> = loci.iter().map(|l| l.locus_id).collect();
        let bad: Vec<String> = inputs::locus_statuses(c, &u, &mut idx)?
            .into_iter()
            .filter(|(l, s)| ours.contains(&l.id) && !s.is_current())
            .map(|(l, s)| match s.state {
                AnalysisState::NotAnalyzed => format!("{} (not analyzed)", l.label),
                _ => format!("{} (stale)", l.label),
            })
            .collect();
        if !bad.is_empty() {
            upstream_warnings.push(format!(
                "The {} \"{}\" needs analysis at {}.",
                u.kind.noun(),
                u.title,
                some_of(&bad, 8)
            ));
        }
        if u.kind == ProjectKind::ArtifactEstimator && p.kind.has_calls() {
            let mut empty = Vec::new();
            for l in project_loci(c, &p)? {
                if !analysis::artifact_warnings(c, u.id, &l)?.is_empty() {
                    empty.push(l.label);
                }
            }
            if !empty.is_empty() {
                upstream_warnings.push(format!(
                    "No artifact model for {} in the artifact estimator \"{}\": stutter is not being accounted for at {}.",
                    if empty.len() == 1 { "this locus" } else { "these loci" },
                    u.title,
                    some_of(&empty, 8)
                ));
            }
        }
    }
    let uses_measured = if p.kind == ProjectKind::Genotyping {
        project_loci(c, &p)?.into_iter().any(|l| {
            locus_params(c, &p, l.id)
                .is_ok_and(|lp| lp.genotyping.is_none_or(|g| g.measured_pullup))
        })
    } else {
        true
    };
    if uses_measured {
        let samples = included_samples(c, &p)?;
        if !matches!(&samples, Some(s) if s.is_empty()) {
            let sample_filter = match &samples {
                Some(s) => {
                    let ids: Vec<i64> = s.iter().copied().collect();
                    format!("AND r.sample_id IN ({})", super::id_list(&ids))
                }
                None => String::new(),
            };
            let sql = format!(
                "SELECT DISTINCT pl.label
                 FROM run r
                 JOIN channel ch ON ch.id = r.channel_id
                 JOIN well w ON w.id = ch.well_id
                 JOIN plate pl ON pl.id = w.plate_id
                 JOIN locus_set_member m ON m.locus_id = r.locus_id
                 LEFT JOIN plate_quality pq ON pq.plate_id = pl.id
                 WHERE m.locus_set_id = ?1 {sample_filter}
                   AND (pq.plate_id IS NULL OR pq.version < ?2)
                 ORDER BY pl.label"
            );
            let mut st = c.prepare(&sql)?;
            let unchecked: Vec<String> = st
                .query_map(
                    [
                        p.locus_set_id,
                        i64::from(microspat_core::quality::QUALITY_VERSION),
                    ],
                    |r| r.get(0),
                )?
                .collect::<rusqlite::Result<_>>()?;
            if !unchecked.is_empty() {
                upstream_warnings.push(format!(
                    "Plate quality has not been checked for {}: analysis falls back to the fixed bleedthrough limit on those plates. Check plate quality on the Plates page.",
                    some_of(&unchecked, 6)
                ));
            }
        }
    }
    Ok(ProjectDetail {
        project: summary,
        loci,
        dependents: dependents(c, id)?,
        upstream_warnings,
    })
}

fn list(e: &Engine, p: ListProjectsParams) -> Result<Vec<ProjectSummary>> {
    e.workspace()?.read(|c| {
        let mut idx = RunsIndex::default();
        load_rows(c)?
            .into_iter()
            .filter(|r| p.kind.is_none_or(|k| k == r.kind))
            .map(|r| Ok(summarize(c, &r, &mut idx)?.0))
            .collect()
    })
}

fn get(e: &Engine, p: IdParams) -> Result<ProjectDetail> {
    e.workspace()?.read(|c| load_detail(c, p.id))
}

/// The stored title of another project of this kind with this title, if any.
fn title_taken(
    c: &Connection,
    kind: ProjectKind,
    title: &str,
    except: i64,
) -> Result<Option<String>> {
    Ok(c.query_row(
        "SELECT title FROM project WHERE kind = ?1 AND title = ?2 AND id != ?3",
        params![kind.as_str(), title, except],
        |r| r.get(0),
    )
    .optional()?)
}

/// Checks that `id` is a `kind` project covering every locus of `locus_set_id`.
fn check_link(c: &Connection, id: i64, kind: ProjectKind, locus_set_id: i64) -> Result<()> {
    let up = load_row(c, id)?;
    if up.kind != kind {
        return Err(RpcError::invalid(format!(
            "\"{}\" is a {}, not a {}.",
            up.title,
            up.kind.noun(),
            kind.noun()
        )));
    }
    let mut st = c.prepare_cached(
        "SELECT l.label FROM locus_set_member m JOIN locus l ON l.id = m.locus_id
         WHERE m.locus_set_id = ?1 AND m.locus_id NOT IN
           (SELECT locus_id FROM locus_set_member WHERE locus_set_id = ?2) ORDER BY l.label",
    )?;
    let missing: Vec<String> = st
        .query_map([locus_set_id, up.locus_set_id], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    if !missing.is_empty() {
        return Err(RpcError::invalid(format!(
            "The {} \"{}\" does not cover locus {}.",
            kind.noun(),
            up.title,
            some_of(&missing, 6)
        )));
    }
    Ok(())
}

fn check_links(
    c: &Connection,
    kind: ProjectKind,
    locus_set_id: i64,
    be: Option<i64>,
    ae: Option<i64>,
    qb: Option<i64>,
) -> Result<()> {
    match (kind, be) {
        (ProjectKind::BinEstimator, Some(_)) => {
            return Err(RpcError::invalid(
                "A bin estimator does not link to another bin estimator.",
            ))
        }
        (ProjectKind::BinEstimator, None) => {}
        (_, None) => {
            return Err(RpcError::invalid(format!(
                "A {} needs a bin estimator.",
                kind.noun()
            )))
        }
        (_, Some(be)) => check_link(c, be, ProjectKind::BinEstimator, locus_set_id)?,
    }
    if let Some(ae) = ae {
        if !kind.has_calls() {
            return Err(RpcError::invalid(format!(
                "A {} does not use an artifact estimator.",
                kind.noun()
            )));
        }
        check_link(c, ae, ProjectKind::ArtifactEstimator, locus_set_id)?;
    }
    if let Some(qb) = qb {
        if kind != ProjectKind::Genotyping {
            return Err(RpcError::invalid(format!(
                "A {} does not use a quantification-bias estimator.",
                kind.noun()
            )));
        }
        check_link(c, qb, ProjectKind::QuantBiasEstimator, locus_set_id)?;
    }
    Ok(())
}

fn create(e: &Engine, p: CreateProjectParams) -> Result<ProjectDetail> {
    let title = check_label(&p.title, "Project")?;
    let d = e.workspace()?.write(|tx| {
        crate::api::loci::load_set(tx, p.locus_set_id)?;
        if let Some(existing) = title_taken(tx, p.kind, &title, 0)? {
            return Err(RpcError::conflict(format!(
                "A {} named \"{existing}\" already exists.",
                p.kind.noun()
            )));
        }
        check_links(
            tx,
            p.kind,
            p.locus_set_id,
            p.bin_estimator_id,
            p.artifact_estimator_id,
            p.quant_bias_estimator_id,
        )?;
        let all = p.kind.may_use_all_samples() && p.all_samples.unwrap_or(true);
        tx.execute(
            "INSERT INTO project (kind, title, description, locus_set_id, bin_estimator_id,
             artifact_estimator_id, quant_bias_estimator_id, all_samples)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                p.kind.as_str(),
                title,
                p.description.as_deref().unwrap_or("").trim(),
                p.locus_set_id,
                p.bin_estimator_id,
                p.artifact_estimator_id,
                p.quant_bias_estimator_id,
                all
            ],
        )?;
        load_detail(tx, tx.last_insert_rowid())
    })?;
    e.changed(PROJECTS, Some(vec![d.project.id]));
    Ok(d)
}

fn update(e: &Engine, p: UpdateProjectParams) -> Result<ProjectDetail> {
    let d = e.workspace()?.write(|tx| {
        let cur = load_row(tx, p.id)?;
        let title = match &p.title {
            Some(t) => check_label(t, "Project")?,
            None => cur.title.clone(),
        };
        if let Some(existing) = title_taken(tx, cur.kind, &title, p.id)? {
            return Err(RpcError::conflict(format!(
                "A {} named \"{existing}\" already exists.",
                cur.kind.noun()
            )));
        }
        let be = p.bin_estimator_id.or(cur.bin_estimator_id);
        let ae = p.artifact_estimator_id.unwrap_or(cur.artifact_estimator_id);
        let qb = p.quant_bias_estimator_id.unwrap_or(cur.quant_bias_estimator_id);
        check_links(tx, cur.kind, cur.locus_set_id, be, ae, qb)?;
        if cur.kind == ProjectKind::QuantBiasEstimator && be != cur.bin_estimator_id {
            let n: u32 = tx.query_row(
                "SELECT COUNT(*) FROM control_mixture WHERE project_id = ?1",
                [p.id],
                |r| r.get(0),
            )?;
            if n > 0 {
                return Err(RpcError::in_use(
                    "The control mixtures refer to controls of the current bin estimator. Remove the samples first, then change the bin estimator.",
                ));
            }
        }
        let all = p.all_samples.unwrap_or(cur.all_samples) && cur.kind.may_use_all_samples();
        tx.execute(
            "UPDATE project SET title = ?1, description = ?2, bin_estimator_id = ?3,
             artifact_estimator_id = ?4, quant_bias_estimator_id = ?5, all_samples = ?6,
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?7",
            params![
                title,
                p.description.as_deref().map(str::trim).unwrap_or(&cur.description),
                be,
                ae,
                qb,
                all,
                p.id
            ],
        )?;
        load_detail(tx, p.id)
    })?;
    e.changed(PROJECTS, Some(vec![p.id]));
    Ok(d)
}

fn duplicate(e: &Engine, p: DuplicateProjectParams) -> Result<ProjectDetail> {
    let title = check_label(&p.title, "Project")?;
    let d = e.workspace()?.write(|tx| {
        let src = load_row(tx, p.id)?;
        if let Some(existing) = title_taken(tx, src.kind, &title, 0)? {
            return Err(RpcError::conflict(format!(
                "A {} named \"{existing}\" already exists.",
                src.kind.noun()
            )));
        }
        tx.execute(
            "INSERT INTO project (kind, title, description, locus_set_id, bin_estimator_id,
             artifact_estimator_id, quant_bias_estimator_id, all_samples, prob_options)
             SELECT kind, ?1, description, locus_set_id, bin_estimator_id, artifact_estimator_id,
             quant_bias_estimator_id, all_samples, prob_options FROM project WHERE id = ?2",
            params![title, p.id],
        )?;
        let id = tx.last_insert_rowid();
        tx.execute(
            "INSERT INTO project_sample (project_id, sample_id) SELECT ?1, sample_id FROM project_sample WHERE project_id = ?2",
            [id, p.id],
        )?;
        let estimator = src.kind != ProjectKind::Genotyping;
        if estimator {
            tx.execute(
                "INSERT INTO project_locus (project_id, locus_id, params, analyzed_at, analysis_rev, fingerprint, result, scatter)
                 SELECT ?1, locus_id, params, analyzed_at, analysis_rev, fingerprint, result, scatter
                 FROM project_locus WHERE project_id = ?2",
                [id, p.id],
            )?;
        } else {
            tx.execute(
                "INSERT INTO project_locus (project_id, locus_id, params) SELECT ?1, locus_id, params
                 FROM project_locus WHERE project_id = ?2",
                [id, p.id],
            )?;
        }
        match src.kind {
            ProjectKind::BinEstimator => {
                // Bins get new ids; controls follow them.
                let mut map: HashMap<i64, i64> = HashMap::new();
                let old: Vec<(i64, i64, String, f64, f64, i64)> = {
                    let mut st = tx.prepare(
                        "SELECT id, locus_id, label, base_size, bin_buffer, peak_count FROM bin WHERE project_id = ?1",
                    )?;
                    let v = st
                        .query_map([p.id], |r| {
                            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))
                        })?
                        .collect::<rusqlite::Result<_>>()?;
                    v
                };
                for (bid, lid, label, base, buf, n) in old {
                    tx.execute(
                        "INSERT INTO bin (project_id, locus_id, label, base_size, bin_buffer, peak_count)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        params![id, lid, label, base, buf, n],
                    )?;
                    map.insert(bid, tx.last_insert_rowid());
                }
                let controls: Vec<(i64, String)> = {
                    let mut st =
                        tx.prepare("SELECT id, label FROM control WHERE bin_estimator_id = ?1")?;
                    let v = st
                        .query_map([p.id], |r| Ok((r.get(0)?, r.get(1)?)))?
                        .collect::<rusqlite::Result<_>>()?;
                    v
                };
                for (cid, label) in controls {
                    tx.execute(
                        "INSERT INTO control (bin_estimator_id, label) VALUES (?1, ?2)",
                        params![id, label],
                    )?;
                    let nid = tx.last_insert_rowid();
                    #[allow(clippy::type_complexity)]
                    let alleles: Vec<(i64, Option<i64>, Option<String>, Option<f64>)> = {
                        let mut st = tx.prepare(
                            "SELECT locus_id, bin_id, deleted_bin_label, deleted_bin_size
                             FROM control_allele WHERE control_id = ?1",
                        )?;
                        let v = st
                            .query_map([cid], |r| {
                                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
                            })?
                            .collect::<rusqlite::Result<_>>()?;
                        v
                    };
                    for (lid, bin, deleted_label, deleted_size) in alleles {
                        tx.execute(
                            "INSERT INTO control_allele (control_id, locus_id, bin_id,
                             deleted_bin_label, deleted_bin_size) VALUES (?1, ?2, ?3, ?4, ?5)",
                            params![
                                nid,
                                lid,
                                bin.and_then(|b| map.get(&b).copied()),
                                deleted_label,
                                deleted_size
                            ],
                        )?;
                    }
                }
            }
            ProjectKind::ArtifactEstimator => {
                tx.execute(
                    "INSERT INTO artifact_estimator (project_id, locus_id, label, artifact_distance,
                     artifact_distance_buffer, points, equations)
                     SELECT ?1, locus_id, label, artifact_distance, artifact_distance_buffer, points, equations
                     FROM artifact_estimator WHERE project_id = ?2 ORDER BY id",
                    [id, p.id],
                )?;
            }
            ProjectKind::QuantBiasEstimator => {
                tx.execute(
                    "INSERT INTO control_mixture (project_id, sample_id, control_id, proportion)
                     SELECT ?1, sample_id, control_id, proportion FROM control_mixture WHERE project_id = ?2",
                    [id, p.id],
                )?;
                tx.execute(
                    "INSERT INTO genotype (project_id, sample_id, locus_id, reference_run_id, peaks, alleles,
                     failure, offscale, manual_curation, comment, reviewed_key)
                     SELECT ?1, sample_id, locus_id, reference_run_id, peaks, alleles, failure, offscale,
                     manual_curation, comment, reviewed_key FROM genotype WHERE project_id = ?2",
                    [id, p.id],
                )?;
            }
            ProjectKind::Genotyping => {}
        }
        load_detail(tx, id)
    })?;
    e.changed(PROJECTS, Some(vec![d.project.id]));
    e.changed(CONTROLS, None);
    Ok(d)
}

fn delete(e: &Engine, p: IdParams) -> Result<()> {
    e.workspace()?.write(|tx| {
        let cur = load_row(tx, p.id)?;
        let deps = dependents(tx, p.id)?;
        if !deps.is_empty() {
            let names: Vec<String> = deps
                .iter()
                .map(|d| format!("{} \"{}\"", d.kind.noun(), d.title))
                .collect();
            return Err(RpcError::in_use(format!(
                "\"{}\" is used by {}. Unlink or delete those first.",
                cur.title,
                some_of(&names, 5)
            )));
        }
        // Mixtures restrict deleting controls; they belong to this project only
        // when it is a quantification-bias estimator, and cascade from it.
        tx.execute("DELETE FROM control_mixture WHERE project_id = ?1", [p.id])?;
        tx.execute("DELETE FROM project WHERE id = ?1", [p.id])?;
        Ok(())
    })?;
    e.changed(PROJECTS, Some(vec![p.id]));
    e.changed(CONTROLS, None);
    Ok(())
}

// ------------------------------------------------------------------ samples

/// Loads the sample rows of a project.
pub fn sample_rows(c: &Connection, p: &ProjectRow) -> Result<Vec<ProjectSampleRow>> {
    let ids = used_sample_ids(c, p)?;
    let mut runs: HashMap<i64, u32> = HashMap::new();
    let mut st = c.prepare_cached(
        "SELECT r.sample_id, COUNT(*) FROM run r JOIN locus_set_member m ON m.locus_id = r.locus_id
         WHERE m.locus_set_id = ?1 GROUP BY r.sample_id",
    )?;
    for row in st.query_map([p.locus_set_id], |r| Ok((r.get(0)?, r.get(1)?)))? {
        let (s, n) = row?;
        runs.insert(s, n);
    }
    let mut moi: HashMap<i64, Option<u32>> = HashMap::new();
    let mut st =
        c.prepare_cached("SELECT sample_id, moi FROM project_sample WHERE project_id = ?1")?;
    for row in st.query_map([p.id], |r| Ok((r.get(0)?, r.get(1)?)))? {
        let (s, m) = row?;
        moi.insert(s, m);
    }
    let mut mixtures: HashMap<i64, Vec<MixtureComponent>> = HashMap::new();
    let mut st = c.prepare_cached(
        "SELECT m.sample_id, m.control_id, c.label, m.proportion FROM control_mixture m
         JOIN control c ON c.id = m.control_id WHERE m.project_id = ?1 ORDER BY c.label",
    )?;
    for row in st.query_map([p.id], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            MixtureComponent {
                control_id: r.get(1)?,
                label: Some(r.get(2)?),
                proportion: r.get(3)?,
            },
        ))
    })? {
        let (s, m) = row?;
        mixtures.entry(s).or_default().push(m);
    }
    let mut max_alleles: HashMap<i64, u32> = HashMap::new();
    if p.kind == ProjectKind::Genotyping {
        let mut st = c.prepare_cached(
            "SELECT g.sample_id, MAX(json_array_length(g.alleles)) FROM genotype g
             JOIN locus_set_member m ON m.locus_id = g.locus_id AND m.locus_set_id = ?2
             WHERE g.project_id = ?1 AND g.reference_run_id IS NOT NULL GROUP BY g.sample_id",
        )?;
        for row in st.query_map([p.id, p.locus_set_id], |r| Ok((r.get(0)?, r.get(1)?)))? {
            let (s, n) = row?;
            max_alleles.insert(s, n);
        }
    }
    let mut out = Vec::with_capacity(ids.len());
    let mut st = c.prepare_cached("SELECT barcode, designation FROM sample WHERE id = ?1")?;
    for id in ids {
        let (barcode, d): (String, String) = st.query_row([id], |r| Ok((r.get(0)?, r.get(1)?)))?;
        out.push(ProjectSampleRow {
            sample_id: id,
            barcode,
            designation: super::samples::Designation::from_db(&d),
            run_count: runs.get(&id).copied().unwrap_or(0),
            moi: moi.get(&id).copied().flatten(),
            controls: mixtures.remove(&id).unwrap_or_default(),
            max_alleles: max_alleles.get(&id).copied(),
        });
    }
    out.sort_by(|a, b| a.barcode.cmp(&b.barcode));
    Ok(out)
}

fn list_samples(e: &Engine, p: IdParams) -> Result<Vec<ProjectSampleRow>> {
    e.workspace()?.read(|c| {
        let proj = load_row(c, p.id)?;
        sample_rows(c, &proj)
    })
}

/// Adds samples (which must exist); returns (added, already).
pub(crate) fn add_samples_inner(
    tx: &Connection,
    p: &ProjectRow,
    ids: &[i64],
) -> Result<(u32, u32)> {
    if p.kind == ProjectKind::QuantBiasEstimator {
        return Err(RpcError::invalid(
            "Samples of a quantification-bias estimator are control mixtures: add them with their composition (set_control_mixtures or the controls CSV).",
        ));
    }
    let mut added = 0;
    let mut already = 0;
    let unique: HashSet<i64> = ids.iter().copied().collect();
    for &s in &unique {
        super::samples::load(tx, s)?;
        let n = tx.execute(
            "INSERT OR IGNORE INTO project_sample (project_id, sample_id) VALUES (?1, ?2)",
            [p.id, s],
        )?;
        if n == 1 {
            added += 1;
        } else {
            already += 1;
        }
    }
    if p.kind.may_use_all_samples() && p.all_samples {
        tx.execute("UPDATE project SET all_samples = 0 WHERE id = ?1", [p.id])?;
    }
    touch(tx, p.id)?;
    Ok((added, already))
}

pub(crate) fn touch(tx: &Connection, id: i64) -> Result<()> {
    tx.execute(
        "UPDATE project SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1",
        [id],
    )?;
    Ok(())
}

fn add_samples(e: &Engine, p: ProjectSamplesParams) -> Result<AddSamplesResult> {
    let (added, already) = e.workspace()?.write(|tx| {
        let proj = load_row(tx, p.id)?;
        add_samples_inner(tx, &proj, &p.sample_ids)
    })?;
    e.changed(PROJECTS, Some(vec![p.id]));
    Ok(AddSamplesResult { added, already })
}

/// Reads the Barcode column of a CSV.
pub(crate) fn barcodes_from_csv(text: &str) -> Result<Vec<String>> {
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
    let ci = headers
        .iter()
        .position(|h| h == "barcode")
        .ok_or_else(|| RpcError::invalid("The CSV needs a Barcode column."))?;
    let mut out = Vec::new();
    for (k, rec) in rdr.records().enumerate() {
        let rec = rec.map_err(|e| RpcError::invalid(format!("line {}: {e}", k + 2)))?;
        let b = rec.get(ci).unwrap_or("").trim();
        if !b.is_empty() {
            out.push(b.to_string());
        }
    }
    if out.is_empty() {
        return Err(RpcError::invalid("The CSV lists no barcodes."));
    }
    Ok(out)
}

/// Sample ids by lowercase barcode.
pub(crate) fn sample_ids_by_barcode(c: &Connection) -> Result<HashMap<String, i64>> {
    let mut st = c.prepare_cached("SELECT barcode, id FROM sample")?;
    let v = st
        .query_map([], |r| {
            Ok((r.get::<_, String>(0)?.to_lowercase(), r.get(1)?))
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

fn import_samples_csv(e: &Engine, p: ImportProjectSamplesParams) -> Result<AddSamplesResult> {
    let text = CsvSource {
        path: p.path.clone(),
        content: p.content.clone(),
    }
    .read()?;
    let barcodes = barcodes_from_csv(&text)?;
    let (added, already) = e.workspace()?.write(|tx| {
        let proj = load_row(tx, p.id)?;
        let known = sample_ids_by_barcode(tx)?;
        let mut ids = Vec::new();
        let mut unknown = Vec::new();
        for b in &barcodes {
            match known.get(&b.to_lowercase()) {
                Some(&id) => ids.push(id),
                None => unknown.push(b.clone()),
            }
        }
        if !unknown.is_empty() {
            return Err(RpcError::invalid(format!(
                "Unknown barcodes ({}): {}. Nothing was added.",
                unknown.len(),
                some_of(&unknown, 10)
            )));
        }
        add_samples_inner(tx, &proj, &ids)
    })?;
    e.changed(PROJECTS, Some(vec![p.id]));
    Ok(AddSamplesResult { added, already })
}

fn remove_samples(e: &Engine, p: ProjectSamplesParams) -> Result<u32> {
    let (n, kind) = e.workspace()?.write(|tx| {
        let proj = load_row(tx, p.id)?;
        if proj.kind.may_use_all_samples() && proj.all_samples {
            return Err(RpcError::invalid(
                "This estimator uses every sample with runs. Add the samples to keep instead (that switches it to a list).",
            ));
        }
        let mut n = 0;
        for &s in &p.sample_ids {
            n += tx.execute(
                "DELETE FROM project_sample WHERE project_id = ?1 AND sample_id = ?2",
                [p.id, s],
            )?;
        }
        touch(tx, p.id)?;
        Ok((n as u32, proj.kind))
    })?;
    e.changed(PROJECTS, Some(vec![p.id]));
    // Removing a control mixture changes its controls' mixture counts.
    if kind == ProjectKind::QuantBiasEstimator && n > 0 {
        e.changed(CONTROLS, None);
    }
    Ok(n)
}

// --------------------------------------------------------------- parameters

fn params_view(c: &Connection, p: &ProjectRow, locus_id: i64) -> Result<LocusParamsView> {
    let params = locus_params(c, p, locus_id)?;
    Ok(LocusParamsView {
        locus_id,
        is_default: params == LocusParams::defaults(p.kind),
        params,
    })
}

fn get_params(e: &Engine, p: ProjectLocusParams) -> Result<LocusParamsView> {
    e.workspace()?.read(|c| {
        let proj = load_row(c, p.project_id)?;
        crate::projects::project_locus(c, &proj, p.locus_id)?;
        params_view(c, &proj, p.locus_id)
    })
}

fn target_loci(c: &Connection, p: &ProjectRow, ids: Option<&[i64]>) -> Result<Vec<i64>> {
    let all: Vec<i64> = project_loci(c, p)?.into_iter().map(|l| l.id).collect();
    match ids {
        None => Ok(all),
        Some(ids) => {
            for id in ids {
                if !all.contains(id) {
                    return Err(RpcError::invalid(format!(
                        "Locus {id} is not in the locus set of \"{}\".",
                        p.title
                    )));
                }
            }
            Ok(ids.to_vec())
        }
    }
}

fn store_params(tx: &Connection, pid: i64, lid: i64, json: &str) -> Result<()> {
    tx.execute(
        "INSERT INTO project_locus (project_id, locus_id, params) VALUES (?1, ?2, ?3)
         ON CONFLICT (project_id, locus_id) DO UPDATE SET params = excluded.params",
        params![pid, lid, json],
    )?;
    Ok(())
}

/// Stores a locus's parameters (`{}` when they are the kind's defaults).
pub(crate) fn save_params(
    tx: &Connection,
    proj: &ProjectRow,
    lid: i64,
    params: &LocusParams,
) -> Result<()> {
    let json = serde_json::to_string(&params.stored_form(proj.kind)?)?;
    store_params(tx, proj.id, lid, &json)
}

fn update_params(e: &Engine, p: UpdateLocusParamsParams) -> Result<Vec<LocusParamsView>> {
    if !p.params.is_object() {
        return Err(RpcError::invalid("params must be an object."));
    }
    let out = e.workspace()?.write(|tx| {
        let proj = load_row(tx, p.project_id)?;
        let loci = target_loci(tx, &proj, p.locus_ids.as_deref())?;
        let mut out = Vec::new();
        for lid in loci {
            let mut cur = serde_json::to_value(locus_params(tx, &proj, lid)?)?;
            crate::projects::merge(&mut cur, &p.params);
            let next = LocusParams::effective(proj.kind, &cur)?;
            next.validate()?;
            save_params(tx, &proj, lid, &next)?;
            out.push(params_view(tx, &proj, lid)?);
        }
        touch(tx, proj.id)?;
        Ok(out)
    })?;
    e.changed(PROJECTS, Some(vec![p.project_id]));
    Ok(out)
}

fn reset_params(e: &Engine, p: ResetLocusParamsParams) -> Result<Vec<LocusParamsView>> {
    let out = e.workspace()?.write(|tx| {
        let proj = load_row(tx, p.project_id)?;
        let loci = target_loci(tx, &proj, p.locus_ids.as_deref())?;
        let mut out = Vec::new();
        for lid in loci {
            store_params(tx, proj.id, lid, "{}")?;
            out.push(params_view(tx, &proj, lid)?);
        }
        touch(tx, proj.id)?;
        Ok(out)
    })?;
    e.changed(PROJECTS, Some(vec![p.project_id]));
    Ok(out)
}

// ----------------------------------------------------------------- analysis

fn analyze(e: &Engine, p: AnalyzeProjectParams) -> Result<AnalyzeProjectResult> {
    let ws = e.workspace()?;
    let (proj, loci) = ws.read(|c| {
        let proj = load_row(c, p.id)?;
        let all = target_loci(c, &proj, p.locus_ids.as_deref())?;
        let loci: Vec<(i64, String)> = if p.only_stale.unwrap_or(false) {
            let st: BTreeMap<i64, bool> =
                inputs::locus_statuses(c, &proj, &mut RunsIndex::default())?
                    .into_iter()
                    .map(|(l, s)| (l.id, s.is_current()))
                    .collect();
            project_loci(c, &proj)?
                .into_iter()
                .filter(|l| all.contains(&l.id) && !st.get(&l.id).copied().unwrap_or(false))
                .map(|l| (l.id, l.label))
                .collect()
        } else {
            project_loci(c, &proj)?
                .into_iter()
                .filter(|l| all.contains(&l.id))
                .map(|l| (l.id, l.label))
                .collect()
        };
        Ok((proj, loci))
    })?;
    let label = match loci.as_slice() {
        [(_, l)] => format!("Analyzing {l} in {}", proj.title),
        _ => format!("Analyzing {} loci in {}", loci.len(), proj.title),
    };
    let pid = proj.id;
    let kind = proj.kind;
    e.run_task("analyze_project", label, move |task| {
        let e = task.engine();
        let mut out = Vec::new();
        let n = loci.len().max(1) as f64;
        for (k, (lid, label)) in loci.iter().enumerate() {
            crate::tasks::Progress::report(task, k as f64 / n, &format!("Analyzing {label}"));
            out.push(analysis::analyze_locus(e, pid, *lid)?);
            e.changed(PROJECTS, Some(vec![pid]));
        }
        // Dependents' staleness may have changed too.
        e.changed(PROJECTS, None);
        // Re-estimated bins may drop bins that controls point at.
        if kind == ProjectKind::BinEstimator {
            e.changed(CONTROLS, None);
        }
        Ok(AnalyzeProjectResult { loci: out })
    })
}

/// Projects using a locus set (for in-use checks).
pub fn projects_using_locus_set(c: &Connection, set_id: i64) -> Result<Vec<String>> {
    let mut st = c.prepare_cached(
        "SELECT kind, title FROM project WHERE locus_set_id = ?1 ORDER BY kind, title",
    )?;
    let v = st
        .query_map([set_id], |r| {
            let kind: String = r.get(0)?;
            let title: String = r.get(1)?;
            Ok(format!(
                "{} \"{title}\"",
                ProjectKind::from_db(&kind).map_or("project", |k| k.noun())
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

/// Projects whose calls use runs matching `where_clause` as reference
/// (aliases `r` run, `c` channel, `w` well), with call counts.
pub fn projects_referencing_runs(c: &Connection, where_clause: &str) -> Result<Vec<(String, u32)>> {
    let mut st = c.prepare(&format!(
        "SELECT p.kind, p.title, COUNT(*) FROM genotype g JOIN project p ON p.id = g.project_id
         JOIN run r ON r.id = g.reference_run_id JOIN channel c ON c.id = r.channel_id
         JOIN well w ON w.id = c.well_id WHERE {where_clause} GROUP BY p.id ORDER BY p.kind, p.title"
    ))?;
    let v = st
        .query_map([], |r| {
            let kind: String = r.get(0)?;
            let title: String = r.get(1)?;
            Ok((
                format!(
                    "{} \"{title}\"",
                    ProjectKind::from_db(&kind).map_or("project", |k| k.noun())
                ),
                r.get(2)?,
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

/// Projects listing a sample.
pub fn projects_using_sample(c: &Connection, sample_id: i64) -> Result<Vec<String>> {
    let mut st = c.prepare_cached(
        "SELECT p.kind, p.title FROM project_sample s JOIN project p ON p.id = s.project_id
         WHERE s.sample_id = ?1 ORDER BY p.kind, p.title",
    )?;
    let v = st
        .query_map([sample_id], |r| {
            let kind: String = r.get(0)?;
            let title: String = r.get(1)?;
            Ok(format!(
                "{} \"{title}\"",
                ProjectKind::from_db(&kind).map_or("project", |k| k.noun())
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

/// Checks a project exists and has a kind; for handlers of kind-specific methods.
pub(crate) fn require_kind(c: &Connection, id: i64, kind: ProjectKind) -> Result<ProjectRow> {
    load_kind(c, id, kind)
}

/// Loads a project that stores calls (genotyping or quantification bias).
pub(crate) fn require_calls(c: &Connection, id: i64) -> Result<ProjectRow> {
    let p = load_row(c, id)?;
    if !p.kind.has_calls() {
        return Err(RpcError::invalid(format!(
            "\"{}\" is a {}; it has no per-sample calls.",
            p.title,
            p.kind.noun()
        )));
    }
    Ok(p)
}

/// Locus of a project by id, with `not_found` for unknown loci.
pub(crate) fn locus_of(
    c: &Connection,
    p: &ProjectRow,
    locus_id: i64,
) -> Result<crate::api::loci::Locus> {
    crate::api::loci::load(c, locus_id)?;
    crate::projects::project_locus(c, p, locus_id)
}

/// Checks a sample is in the project.
pub(crate) fn require_sample(c: &Connection, p: &ProjectRow, sample_id: i64) -> Result<()> {
    let ok: Option<i64> = c
        .query_row(
            "SELECT sample_id FROM project_sample WHERE project_id = ?1 AND sample_id = ?2",
            [p.id, sample_id],
            |r| r.get(0),
        )
        .optional()?;
    ok.map(|_| ())
        .or_not_found(|| format!("Sample {sample_id} is not in \"{}\".", p.title))
}
