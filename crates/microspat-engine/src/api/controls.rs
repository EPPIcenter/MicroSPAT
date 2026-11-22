//! Controls (known strains with a known allele per locus, in a bin
//! estimator's bins) and the control mixtures of quantification-bias
//! estimators.
//!
//! Mixture CSV (as in the old app): a `Barcode` column, then any number of
//! columns whose cells read `CONTROL;PROPORTION` (e.g. `3D7;0.75`). Every
//! sample must exist, every control must belong to the project's bin
//! estimator, and each sample's proportions must sum to 1 (±0.01; they are
//! stored rescaled to sum to exactly 1, which β estimation requires).

use super::projects::{require_kind, sample_ids_by_barcode, touch, MixtureComponent};
use super::{check_label, header_key, some_of};
use crate::error::{OrNotFound, Result, RpcError};
use crate::events::entity::{CONTROLS, PROJECTS};
use crate::projects::{load_kind, ProjectKind};
use crate::rpc::Registry;
use crate::Engine;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use ts_rs::TS;

/// A sample's composition: (sample id, [(control id, proportion)]).
type Mixture = (i64, Vec<(i64, f64)>);
/// A parsed CSV row: (barcode, [(control label, proportion)]).
type CsvRow = (String, Vec<(String, f64)>);

/// A control's allele at one locus.
#[derive(Debug, Clone, Serialize, TS)]
pub struct ControlAllele {
    pub locus_id: i64,
    pub locus_label: String,
    /// Null when not set, or when its bin was deleted (`deleted_bin` then says which).
    pub bin_id: Option<i64>,
    pub bin_label: Option<String>,
    /// Present when the allele was set to a bin that has since been deleted
    /// (edited away or dropped by re-estimating bins): the bin as it was.
    /// Absent for an allele that was never set or was unset on purpose.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub deleted_bin: Option<DeletedBin>,
}

/// A deleted bin a control's allele pointed at.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct DeletedBin {
    pub label: String,
    pub base_size: f64,
}

/// A control's allele at a locus as stored: (bin id, bin label, deleted bin).
type StoredAllele = (Option<i64>, Option<String>, Option<DeletedBin>);

/// Alleles of one control by locus.
pub(crate) fn stored_alleles(
    c: &Connection,
    control_id: i64,
) -> Result<HashMap<i64, StoredAllele>> {
    let mut st = c.prepare_cached(
        "SELECT a.locus_id, a.bin_id, b.label, a.deleted_bin_label, a.deleted_bin_size
         FROM control_allele a LEFT JOIN bin b ON b.id = a.bin_id WHERE a.control_id = ?1",
    )?;
    let v = st
        .query_map([control_id], |r| {
            let bin_id: Option<i64> = r.get(1)?;
            let deleted = match (bin_id, r.get::<_, Option<String>>(3)?, r.get(4)?) {
                (None, Some(label), Some(base_size)) => Some(DeletedBin { label, base_size }),
                _ => None,
            };
            Ok((r.get(0)?, (bin_id, r.get(2)?, deleted)))
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

/// A control.
#[derive(Debug, Clone, Serialize, TS)]
pub struct Control {
    pub id: i64,
    pub label: String,
    pub bin_estimator_id: i64,
    pub bin_estimator_title: String,
    /// One entry per locus of the bin estimator's locus set.
    pub alleles: Vec<ControlAllele>,
    /// Control mixtures that use it.
    pub mixture_count: u32,
}

/// A control's allele as given by the user.
#[derive(Debug, Clone, Copy, Deserialize, TS)]
pub struct ControlAlleleInput {
    pub locus_id: i64,
    /// Bin of the control's bin estimator at that locus; null to unset.
    pub bin_id: Option<i64>,
}

/// Params of `list_controls`.
#[derive(Debug, Clone, Default, Deserialize, TS)]
pub struct ListControlsParams {
    #[serde(default)]
    #[ts(optional)]
    pub bin_estimator_id: Option<i64>,
}

/// Params of `create_control`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateControlParams {
    pub bin_estimator_id: i64,
    pub label: String,
    #[serde(default)]
    #[ts(optional)]
    pub alleles: Option<Vec<ControlAlleleInput>>,
}

/// Params of `update_control`. Given alleles replace those loci only.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateControlParams {
    pub id: i64,
    #[serde(default)]
    #[ts(optional)]
    pub label: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub alleles: Option<Vec<ControlAlleleInput>>,
}

/// One sample's known composition.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct SampleMixture {
    pub sample_id: i64,
    pub components: Vec<MixtureComponent>,
}

/// Params of `set_control_mixtures`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct SetControlMixturesParams {
    /// Quantification-bias estimator.
    pub id: i64,
    pub mixtures: Vec<SampleMixture>,
}

/// Params of `import_control_mixtures_csv`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct ImportControlMixturesParams {
    pub id: i64,
    #[serde(default)]
    #[ts(optional)]
    pub path: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub content: Option<String>,
    /// Only validate and report.
    #[serde(default)]
    #[ts(optional)]
    pub dry_run: Option<bool>,
}

/// A parsed mixture, for the import preview.
#[derive(Debug, Clone, Serialize, TS)]
pub struct MixturePreview {
    pub barcode: String,
    pub components: Vec<MixtureComponent>,
}

/// What setting or importing mixtures did (or would do).
#[derive(Debug, Clone, Default, Serialize, TS)]
pub struct MixturesReport {
    /// False for a dry run or with problems.
    pub applied: bool,
    /// Everything wrong; nothing is applied when non-empty.
    pub problems: Vec<String>,
    pub mixtures: Vec<MixturePreview>,
    /// Samples new to the project.
    pub added: u32,
    /// Samples whose composition was replaced.
    pub replaced: u32,
}

pub(crate) fn register(r: &mut Registry) {
    r.query(
        "list_controls",
        "Controls, optionally of one bin estimator, with their allele at every locus.",
        list,
    );
    r.mutation(
        "create_control",
        &[CONTROLS, PROJECTS],
        "Create a control of a bin estimator (labels unique per bin estimator).",
        create,
    );
    r.mutation(
        "update_control",
        &[CONTROLS, PROJECTS],
        "Rename a control or set its alleles (bins of its bin estimator). Estimators using it become stale.",
        update,
    );
    r.mutation(
        "delete_control",
        &[CONTROLS],
        "Delete a control that no control mixture uses.",
        delete,
    );
    r.mutation(
        "set_control_mixtures",
        &[PROJECTS, CONTROLS],
        "Set the known composition of control-mixture samples of a quantification-bias estimator (adds the samples). Proportions must sum to 1.",
        set_mixtures,
    );
    r.mutation(
        "import_control_mixtures_csv",
        &[PROJECTS, CONTROLS],
        "Set control mixtures from a CSV: Barcode, then cells \"CONTROL;PROPORTION\". Validates everything first; a dry run only reports.",
        import_csv,
    );
}

/// Loads controls matching `filter` (a WHERE clause on `c`).
fn load_controls(c: &Connection, filter: &str) -> Result<Vec<Control>> {
    let mut st = c.prepare(&format!(
        "SELECT c.id, c.label, c.bin_estimator_id, p.title, p.locus_set_id,
           (SELECT COUNT(*) FROM control_mixture m WHERE m.control_id = c.id)
         FROM control c JOIN project p ON p.id = c.bin_estimator_id {filter} ORDER BY p.title, c.label"
    ))?;
    #[allow(clippy::type_complexity)]
    let rows: Vec<(i64, String, i64, String, i64, u32)> = st
        .query_map([], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;
    let mut out = Vec::new();
    for (id, label, be, title, set, n) in rows {
        let loci = crate::api::loci::load_set(c, set)?.loci;
        let mut set_alleles = stored_alleles(c, id)?;
        out.push(Control {
            id,
            label,
            bin_estimator_id: be,
            bin_estimator_title: title,
            alleles: loci
                .into_iter()
                .map(|l| {
                    let (bin_id, bin_label, deleted_bin) =
                        set_alleles.remove(&l.id).unwrap_or_default();
                    ControlAllele {
                        locus_id: l.id,
                        locus_label: l.label,
                        bin_id,
                        bin_label,
                        deleted_bin,
                    }
                })
                .collect(),
            mixture_count: n,
        });
    }
    Ok(out)
}

fn load_control(c: &Connection, id: i64) -> Result<Control> {
    load_controls(c, &format!("WHERE c.id = {id}"))?
        .pop()
        .or_not_found(|| format!("Control {id} does not exist"))
}

fn list(e: &Engine, p: ListControlsParams) -> Result<Vec<Control>> {
    e.workspace()?.read(|c| {
        let f = p.bin_estimator_id.map_or(String::new(), |id| {
            format!("WHERE c.bin_estimator_id = {id}")
        });
        load_controls(c, &f)
    })
}

fn set_alleles(
    tx: &Connection,
    control: i64,
    be: i64,
    alleles: &[ControlAlleleInput],
) -> Result<()> {
    for a in alleles {
        if let Some(bin) = a.bin_id {
            let ok: Option<i64> = tx
                .query_row(
                    "SELECT id FROM bin WHERE id = ?1 AND project_id = ?2 AND locus_id = ?3",
                    [bin, be, a.locus_id],
                    |r| r.get(0),
                )
                .optional()?;
            if ok.is_none() {
                return Err(RpcError::invalid(format!(
                    "Bin {bin} is not a bin of this control's bin estimator at locus {}.",
                    a.locus_id
                )));
            }
        }
        // Setting the allele (even to null) is a decision, so a remembered
        // deleted bin no longer applies.
        tx.execute(
            "INSERT INTO control_allele (control_id, locus_id, bin_id) VALUES (?1, ?2, ?3)
             ON CONFLICT (control_id, locus_id) DO UPDATE SET bin_id = excluded.bin_id,
                deleted_bin_label = NULL, deleted_bin_size = NULL",
            params![control, a.locus_id, a.bin_id],
        )?;
    }
    Ok(())
}

/// The stored label of another control of this bin estimator with this label, if any.
fn label_taken(c: &Connection, be: i64, label: &str, except: i64) -> Result<Option<String>> {
    Ok(c.query_row(
        "SELECT label FROM control WHERE bin_estimator_id = ?1 AND label = ?2 AND id != ?3",
        params![be, label, except],
        |r| r.get(0),
    )
    .optional()?)
}

pub(crate) fn create_inner(tx: &Connection, p: &CreateControlParams) -> Result<Control> {
    let label = check_label(&p.label, "Control")?;
    load_kind(tx, p.bin_estimator_id, ProjectKind::BinEstimator)?;
    if let Some(existing) = label_taken(tx, p.bin_estimator_id, &label, 0)? {
        return Err(RpcError::conflict(format!(
            "This bin estimator already has a control named \"{existing}\"."
        )));
    }
    tx.execute(
        "INSERT INTO control (bin_estimator_id, label) VALUES (?1, ?2)",
        params![p.bin_estimator_id, label],
    )?;
    let id = tx.last_insert_rowid();
    set_alleles(
        tx,
        id,
        p.bin_estimator_id,
        p.alleles.as_deref().unwrap_or(&[]),
    )?;
    load_control(tx, id)
}

fn create(e: &Engine, p: CreateControlParams) -> Result<Control> {
    let c = e.workspace()?.write(|tx| create_inner(tx, &p))?;
    e.changed(CONTROLS, Some(vec![c.id]));
    Ok(c)
}

fn update(e: &Engine, p: UpdateControlParams) -> Result<Control> {
    let c = e.workspace()?.write(|tx| {
        let cur = load_control(tx, p.id)?;
        if let Some(l) = &p.label {
            let l = check_label(l, "Control")?;
            if let Some(existing) = label_taken(tx, cur.bin_estimator_id, &l, p.id)? {
                return Err(RpcError::conflict(format!(
                    "This bin estimator already has a control named \"{existing}\"."
                )));
            }
            tx.execute(
                "UPDATE control SET label = ?1 WHERE id = ?2",
                params![l, p.id],
            )?;
        }
        if let Some(a) = &p.alleles {
            set_alleles(tx, p.id, cur.bin_estimator_id, a)?;
        }
        load_control(tx, p.id)
    })?;
    e.changed(CONTROLS, Some(vec![p.id]));
    e.changed(PROJECTS, None);
    Ok(c)
}

fn delete(e: &Engine, p: super::IdParams) -> Result<()> {
    e.workspace()?.write(|tx| {
        let c = load_control(tx, p.id)?;
        if c.mixture_count > 0 {
            let mut st = tx.prepare(
                "SELECT DISTINCT p.title FROM control_mixture m JOIN project p ON p.id = m.project_id
                 WHERE m.control_id = ?1 ORDER BY p.title",
            )?;
            let titles: Vec<String> = st
                .query_map([p.id], |r| r.get(0))?
                .collect::<rusqlite::Result<_>>()?;
            return Err(RpcError::in_use(format!(
                "Control {} is in {} control mixture(s) of {}. Remove those samples first.",
                c.label,
                c.mixture_count,
                some_of(&titles, 5)
            )));
        }
        tx.execute("DELETE FROM control WHERE id = ?1", [p.id])?;
        Ok(())
    })?;
    e.changed(CONTROLS, Some(vec![p.id]));
    Ok(())
}

/// Validates mixtures (sample id → components) against a project; returns
/// the problems and the normalized mixtures. `incomplete` holds the indices
/// of mixtures that lost components already reported (unknown control
/// labels): their sum and emptiness are not checked, so each root problem is
/// reported once.
fn validate(
    tx: &Connection,
    be: i64,
    mixtures: &[(String, i64, Vec<MixtureComponent>)],
    incomplete: &HashSet<usize>,
) -> Result<(Vec<String>, Vec<Mixture>)> {
    let controls: HashMap<i64, String> = {
        let mut st = tx.prepare("SELECT id, label FROM control WHERE bin_estimator_id = ?1")?;
        let v = st
            .query_map([be], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<rusqlite::Result<_>>()?;
        v
    };
    let mut problems = Vec::new();
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for (i, (name, sample, comps)) in mixtures.iter().enumerate() {
        if !seen.insert(*sample) {
            problems.push(format!("{name} appears twice"));
            continue;
        }
        if incomplete.contains(&i) {
            continue;
        }
        if comps.is_empty() {
            problems.push(format!("{name} has no controls"));
            continue;
        }
        let mut ids = HashSet::new();
        let mut total = 0.0;
        let mut ok = true;
        for c in comps {
            if !controls.contains_key(&c.control_id) {
                problems.push(format!(
                    "{name}: control {} does not belong to the project's bin estimator",
                    c.label.clone().unwrap_or_else(|| c.control_id.to_string())
                ));
                ok = false;
            }
            if !ids.insert(c.control_id) {
                problems.push(format!("{name}: a control is listed twice"));
                ok = false;
            }
            if !(c.proportion.is_finite() && c.proportion > 0.0 && c.proportion <= 1.0) {
                problems.push(format!(
                    "{name}: proportion {} must be in (0, 1]",
                    c.proportion
                ));
                ok = false;
            }
            total += c.proportion;
        }
        if ok && (total - 1.0).abs() > 0.01 {
            problems.push(format!("{name}: proportions sum to {total:.3}, not 1"));
            ok = false;
        }
        if ok {
            out.push((
                *sample,
                comps
                    .iter()
                    .map(|c| (c.control_id, c.proportion / total))
                    .collect(),
            ));
        }
    }
    Ok((problems, out))
}

fn apply(tx: &Connection, pid: i64, mixtures: &[Mixture]) -> Result<(u32, u32)> {
    let (mut added, mut replaced) = (0, 0);
    for (sample, comps) in mixtures {
        let n = tx.execute(
            "INSERT OR IGNORE INTO project_sample (project_id, sample_id) VALUES (?1, ?2)",
            [pid, *sample],
        )?;
        if n == 1 {
            added += 1;
        } else {
            replaced += 1;
        }
        tx.execute(
            "DELETE FROM control_mixture WHERE project_id = ?1 AND sample_id = ?2",
            [pid, *sample],
        )?;
        for (ctl, prop) in comps {
            tx.execute(
                "INSERT INTO control_mixture (project_id, sample_id, control_id, proportion) VALUES (?1, ?2, ?3, ?4)",
                params![pid, sample, ctl, prop],
            )?;
        }
    }
    touch(tx, pid)?;
    Ok((added, replaced))
}

fn preview(
    tx: &Connection,
    mixtures: &[(String, i64, Vec<MixtureComponent>)],
) -> Result<Vec<MixturePreview>> {
    let mut st = tx.prepare_cached("SELECT label FROM control WHERE id = ?1")?;
    mixtures
        .iter()
        .map(|(name, _, comps)| {
            Ok(MixturePreview {
                barcode: name.clone(),
                components: comps
                    .iter()
                    .map(|c| {
                        Ok(MixtureComponent {
                            control_id: c.control_id,
                            label: st
                                .query_row([c.control_id], |r| r.get(0))
                                .optional()?
                                .or(c.label.clone()),
                            proportion: c.proportion,
                        })
                    })
                    .collect::<Result<_>>()?,
            })
        })
        .collect()
}

fn set_mixtures(e: &Engine, p: SetControlMixturesParams) -> Result<MixturesReport> {
    let report = e.workspace()?.write(|tx| {
        let proj = require_kind(tx, p.id, ProjectKind::QuantBiasEstimator)?;
        let be = proj.bin_estimator_id.unwrap_or(0);
        let mut named = Vec::new();
        for m in &p.mixtures {
            let s = super::samples::load(tx, m.sample_id)?;
            named.push((s.barcode, m.sample_id, m.components.clone()));
        }
        let (problems, valid) = validate(tx, be, &named, &HashSet::new())?;
        if !problems.is_empty() {
            return Err(RpcError::invalid(format!(
                "The control mixtures were not set: {}",
                some_of(&problems, 6)
            )));
        }
        let (added, replaced) = apply(tx, p.id, &valid)?;
        Ok(MixturesReport {
            applied: true,
            problems,
            mixtures: preview(tx, &named)?,
            added,
            replaced,
        })
    })?;
    e.changed(PROJECTS, Some(vec![p.id]));
    // Mixture counts of controls changed.
    e.changed(CONTROLS, None);
    Ok(report)
}

/// Parses a mixtures CSV into (barcode, components with labels) and problems.
fn parse_csv(text: &str) -> Result<(Vec<CsvRow>, Vec<String>)> {
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
    let ci = headers.iter().position(|h| h == "barcode").ok_or_else(|| {
        RpcError::invalid(
            "The controls CSV needs a Barcode column, then columns of CONTROL;PROPORTION.",
        )
    })?;
    let mut rows = Vec::new();
    let mut problems = Vec::new();
    for (k, rec) in rdr.records().enumerate() {
        let line = k + 2;
        let rec = match rec {
            Ok(r) => r,
            Err(e) => {
                problems.push(format!("line {line}: {e}"));
                continue;
            }
        };
        let barcode = rec.get(ci).unwrap_or("").trim().to_string();
        if barcode.is_empty() {
            if rec.iter().any(|f| !f.is_empty()) {
                problems.push(format!("line {line}: no barcode"));
            }
            continue;
        }
        let mut comps = Vec::new();
        for (i, cell) in rec.iter().enumerate() {
            if i == ci || cell.trim().is_empty() {
                continue;
            }
            let parts: Vec<&str> = cell.split(';').map(str::trim).collect();
            match parts.as_slice() {
                [label, prop] if !label.is_empty() => match prop.parse::<f64>() {
                    Ok(v) => comps.push((label.to_string(), v)),
                    Err(_) => problems.push(format!(
                        "line {line}: \"{cell}\": proportion \"{prop}\" is not a number"
                    )),
                },
                _ => problems.push(format!(
                    "line {line}: \"{cell}\" should read CONTROL;PROPORTION"
                )),
            }
        }
        rows.push((barcode, comps));
    }
    if rows.is_empty() && problems.is_empty() {
        problems.push("The controls CSV has no rows.".into());
    }
    Ok((rows, problems))
}

fn import_csv(e: &Engine, p: ImportControlMixturesParams) -> Result<MixturesReport> {
    let text = super::CsvSource {
        path: p.path.clone(),
        content: p.content.clone(),
    }
    .read()?;
    let (rows, mut problems) = parse_csv(&text)?;
    let dry = p.dry_run.unwrap_or(false);
    let report = e.workspace()?.write(|tx| {
        let proj = require_kind(tx, p.id, ProjectKind::QuantBiasEstimator)?;
        let be = proj.bin_estimator_id.unwrap_or(0);
        let samples = sample_ids_by_barcode(tx)?;
        let controls: BTreeMap<String, i64> = {
            let mut st = tx.prepare("SELECT label, id FROM control WHERE bin_estimator_id = ?1")?;
            let v = st
                .query_map([be], |r| Ok((r.get::<_, String>(0)?.to_lowercase(), r.get(1)?)))?
                .collect::<rusqlite::Result<_>>()?;
            v
        };
        let mut named = Vec::new();
        let mut incomplete = HashSet::new();
        let mut unknown_samples = Vec::new();
        for (barcode, comps) in &rows {
            let Some(&sid) = samples.get(&barcode.to_lowercase()) else {
                unknown_samples.push(barcode.clone());
                continue;
            };
            let mut mc = Vec::new();
            for (label, prop) in comps {
                match controls.get(&label.to_lowercase()) {
                    Some(&id) => mc.push(MixtureComponent {
                        control_id: id,
                        label: Some(label.clone()),
                        proportion: *prop,
                    }),
                    None => {
                        problems.push(format!(
                            "{barcode}: control \"{label}\" is not a control of this project's bin estimator"
                        ));
                        incomplete.insert(named.len());
                    }
                }
            }
            named.push((barcode.clone(), sid, mc));
        }
        if !unknown_samples.is_empty() {
            problems.push(format!(
                "Unknown barcodes ({}): {}",
                unknown_samples.len(),
                some_of(&unknown_samples, 10)
            ));
        }
        let (more, valid) = validate(tx, be, &named, &incomplete)?;
        problems.extend(more);
        let mut report = MixturesReport {
            applied: false,
            mixtures: preview(tx, &named)?,
            ..MixturesReport::default()
        };
        if problems.is_empty() && !dry {
            let (added, replaced) = apply(tx, p.id, &valid)?;
            report.applied = true;
            report.added = added;
            report.replaced = replaced;
        } else if problems.is_empty() {
            let present: HashSet<i64> =
                crate::projects::project_sample_ids(tx, p.id)?.into_iter().collect();
            report.replaced = valid.iter().filter(|(s, _)| present.contains(s)).count() as u32;
            report.added = valid.len() as u32 - report.replaced;
        }
        report.problems = problems;
        if !report.problems.is_empty() && !dry {
            return Err(RpcError::invalid(format!(
                "The controls CSV was not applied: {}",
                some_of(&report.problems, 6)
            )));
        }
        Ok(report)
    })?;
    if report.applied {
        e.changed(PROJECTS, Some(vec![p.id]));
        e.changed(CONTROLS, None);
    }
    Ok(report)
}
