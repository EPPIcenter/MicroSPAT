//! Staleness by content fingerprints.
//!
//! A project × locus result depends on a handful of inputs. Each has a
//! fingerprint (a stable hash of exactly what the analysis read):
//!
//! | component | what is hashed | kinds |
//! |---|---|---|
//! | `params` | the effective locus parameters | all |
//! | `locus` | the locus size range, repeat length and dye | all |
//! | `runs` | every run used: run, sample and channel ids, the well's ladder fit, its usable/unusable sizing state, and the ladder's base-size precision | all |
//! | `plate_quality` | each referenced plate's quality report presence/version, measured pull-up targeting the locus's dye, and unseparated status of referenced wells (omitted when `measured_pullup` is false) | all |
//! | `samples` | the project's sample ids | quant-bias, genotyping |
//! | `bins` | the linked bin estimator's id and its bins at the locus | artifact, quant-bias, genotyping |
//! | `artifact` | the linked artifact estimator's id and its classes at the locus | quant-bias, genotyping |
//! | `beta` | the linked quantification-bias estimator's id and β at the locus | genotyping |
//! | `controls` | control mixtures and the controls' bins at the locus | quant-bias |
//!
//! Analysis stores the map of fingerprints it computed from the same snapshot
//! it read its data from. Reading a result recomputes the current map and
//! compares: equal means current, otherwise each differing component becomes
//! a reason. Nothing else has to remember to set a flag: a new plate map, a
//! re-sized well, a deleted plate, a changed ladder limit, an edited bin, a
//! re-fit artifact model or a new β all change a fingerprint by themselves.
//!
//! The project-wide probabilistic pass is tracked the same way: it records a
//! hash of each locus's `analysis_rev` (bumped by every locus analysis), the
//! sample set with designations (controls are left out of the population
//! model) and its options.

use super::{included_samples, locus_params, project_loci, ProjectKind, ProjectRow};
use crate::api::loci::Locus;
use crate::api::{color_str, json_col};
use crate::error::Result;
use crate::fingerprint::{of_json, Fingerprint};
use crate::sizing;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use ts_rs::TS;

pub const PARAMS: &str = "params";
pub const LOCUS: &str = "locus";
pub const RUNS: &str = "runs";
pub const PLATE_QUALITY: &str = "plate_quality";
pub const SAMPLES: &str = "samples";
pub const BINS: &str = "bins";
pub const ARTIFACT: &str = "artifact";
pub const BETA: &str = "beta";
pub const CONTROLS: &str = "controls";

/// Fingerprints of a result's inputs, by component (stored as JSON).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Inputs(pub BTreeMap<String, String>);

/// Whether a project × locus (or the probabilistic pass) is up to date.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum AnalysisState {
    /// Never analyzed.
    NotAnalyzed,
    /// Analyzed with the current inputs.
    Current,
    /// An input changed since; `reasons` say which.
    Stale,
}

/// Status of a result.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct AnalysisStatus {
    pub state: AnalysisState,
    /// Why it is stale, for display (empty unless stale).
    pub reasons: Vec<String>,
    /// When it was computed (ISO 8601 UTC).
    pub analyzed_at: Option<String>,
}

impl AnalysisStatus {
    /// True when current.
    pub fn is_current(&self) -> bool {
        self.state == AnalysisState::Current
    }
}

/// One indexed run row used for `runs` and `plate_quality` fingerprints.
pub struct RunIndexRow {
    pub run_id: i64,
    pub sample_id: i64,
    pub plate_id: i64,
    pub well_label: String,
    pub hash: u64,
}

/// Fingerprinted runs of each locus (and cached plate quality pull-up tables),
/// loaded once per request and shared by every project that reads the locus.
#[derive(Default)]
pub struct RunsIndex {
    by_locus: HashMap<i64, Vec<RunIndexRow>>,
    specs: Option<HashMap<i64, microspat_core::ladder::LadderSpec>>,
    plate_quality: Option<HashMap<i64, crate::quality::PlatePullUpData>>,
}

impl RunsIndex {
    /// Indexed rows of every run of `locus_id` and cached plate pull-up data.
    pub(crate) fn rows_and_quality(
        &mut self,
        c: &Connection,
        locus_id: i64,
    ) -> Result<(
        &[RunIndexRow],
        &HashMap<i64, crate::quality::PlatePullUpData>,
    )> {
        if self.specs.is_none() {
            self.specs = Some(crate::api::plates::ladder_specs(c)?);
        }
        if self.plate_quality.is_none() {
            self.plate_quality = Some(crate::quality::load_all_pull_up(c)?);
        }
        if !self.by_locus.contains_key(&locus_id) {
            let specs = self.specs.as_ref().map(|s| s as &HashMap<_, _>);
            let default = microspat_core::ladder::LadderSpec::default();
            let mut st = c.prepare_cached(
                "SELECT r.id, r.sample_id, r.channel_id, w.ladder_peak_indices, w.ladder_peak_sizes,
                        w.sizing_quality, p.ladder_id, l.min_base_length, l.max_base_length,
                        w.plate_id, w.label
                 FROM run r JOIN channel ch ON ch.id = r.channel_id JOIN well w ON w.id = ch.well_id
                 JOIN plate p ON p.id = w.plate_id JOIN locus l ON l.id = r.locus_id
                 WHERE r.locus_id = ?1 ORDER BY r.id",
            )?;
            let rows = st
                .query_map([locus_id], |r| {
                    let ladder: i64 = r.get(6)?;
                    let q: Option<f64> = r.get(5)?;
                    let spec = specs.and_then(|s| s.get(&ladder)).unwrap_or(&default);
                    let sizes_json: String = r.get(4)?;
                    let sizes: Vec<f64> = serde_json::from_str(&sizes_json).unwrap_or_default();
                    let usable = sizing::run_state(q, &sizes, spec, r.get(7)?, r.get(8)?).usable();
                    let mut f = Fingerprint::new();
                    f.i64(r.get(0)?)
                        .i64(r.get(1)?)
                        .i64(r.get(2)?)
                        .str(&r.get::<_, String>(3)?)
                        .str(&sizes_json)
                        .opt_f64(q)
                        .u64(u64::from(usable))
                        .u64(u64::from(spec.base_size_precision));
                    Ok(RunIndexRow {
                        run_id: r.get(0)?,
                        sample_id: r.get(1)?,
                        plate_id: r.get(9)?,
                        well_label: r.get(10)?,
                        hash: f.finish(),
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            self.by_locus.insert(locus_id, rows);
        }
        let rows = self
            .by_locus
            .get(&locus_id)
            .map_or(&[][..], |v| v.as_slice());
        let pq = self.plate_quality.as_ref().expect("initialized above");
        Ok((rows, pq))
    }
}

/// Fingerprint of the bins of a bin estimator at a locus.
pub fn bins_fingerprint(c: &Connection, be: Option<i64>, locus_id: i64) -> Result<String> {
    let mut f = Fingerprint::new();
    f.opt_i64(be);
    if let Some(be) = be {
        let mut st = c.prepare_cached(
            "SELECT id, label, base_size, bin_buffer FROM bin WHERE project_id = ?1 AND locus_id = ?2 ORDER BY id",
        )?;
        let mut rows = st.query([be, locus_id])?;
        while let Some(r) = rows.next()? {
            f.i64(r.get(0)?)
                .str(&r.get::<_, String>(1)?)
                .f64(r.get(2)?)
                .f64(r.get(3)?);
        }
    }
    Ok(f.hex())
}

/// Fingerprint of an artifact estimator's model at a locus.
pub fn artifact_fingerprint(c: &Connection, ae: Option<i64>, locus_id: i64) -> Result<String> {
    let mut f = Fingerprint::new();
    f.opt_i64(ae);
    if let Some(ae) = ae {
        let mut st = c.prepare_cached(
            "SELECT id, artifact_distance, artifact_distance_buffer, equations FROM artifact_estimator
             WHERE project_id = ?1 AND locus_id = ?2 ORDER BY id",
        )?;
        let mut rows = st.query([ae, locus_id])?;
        while let Some(r) = rows.next()? {
            f.i64(r.get(0)?)
                .opt_f64(r.get(1)?)
                .opt_f64(r.get(2)?)
                .str(&r.get::<_, String>(3)?);
        }
        // An estimator that was never analyzed differs from one with no classes.
        let analyzed: Option<i64> = c
            .query_row(
                "SELECT analysis_rev FROM project_locus WHERE project_id = ?1 AND locus_id = ?2 AND analyzed_at IS NOT NULL",
                [ae, locus_id],
                |r| r.get(0),
            )
            .optional()?;
        f.u64(u64::from(analyzed.is_some()));
    }
    Ok(f.hex())
}

/// β of a quantification-bias estimator at a locus, if estimated.
pub fn stored_beta(c: &Connection, qb: i64, locus_id: i64) -> Result<Option<f64>> {
    let result: Option<Option<String>> = c
        .query_row(
            "SELECT result FROM project_locus WHERE project_id = ?1 AND locus_id = ?2",
            [qb, locus_id],
            |r| r.get(0),
        )
        .optional()?;
    let Some(Some(json)) = result else {
        return Ok(None);
    };
    let v: serde_json::Value = serde_json::from_str(&json)?;
    Ok(v.get("estimate")
        .and_then(|e| e.get("beta"))
        .and_then(|b| b.as_f64()))
}

/// Fingerprint of the β a genotyping project would use.
pub fn beta_fingerprint(c: &Connection, qb: Option<i64>, locus_id: i64) -> Result<String> {
    let mut f = Fingerprint::new();
    f.opt_i64(qb);
    if let Some(qb) = qb {
        f.opt_f64(stored_beta(c, qb, locus_id)?);
    }
    Ok(f.hex())
}

/// Fingerprint of control mixtures and the controls' bins at a locus.
pub fn controls_fingerprint(c: &Connection, project_id: i64, locus_id: i64) -> Result<String> {
    let mut f = Fingerprint::new();
    let mut st = c.prepare_cached(
        "SELECT m.sample_id, m.control_id, m.proportion, a.bin_id FROM control_mixture m
         LEFT JOIN control_allele a ON a.control_id = m.control_id AND a.locus_id = ?2
         WHERE m.project_id = ?1 ORDER BY m.sample_id, m.control_id",
    )?;
    let mut rows = st.query([project_id, locus_id])?;
    while let Some(r) = rows.next()? {
        f.i64(r.get(0)?)
            .i64(r.get(1)?)
            .f64(r.get(2)?)
            .opt_i64(r.get(3)?);
    }
    Ok(f.hex())
}

fn locus_fingerprint(l: &Locus) -> String {
    Fingerprint::new()
        .f64(l.min_base_length)
        .f64(l.max_base_length)
        .f64(l.nucleotide_repeat_length)
        .str(color_str(l.color))
        .hex()
}

/// The current inputs of a project at a locus.
pub fn current(
    c: &Connection,
    p: &ProjectRow,
    locus: &Locus,
    idx: &mut RunsIndex,
    samples: Option<&HashSet<i64>>,
) -> Result<Inputs> {
    let mut m = BTreeMap::new();
    let params = locus_params(c, p, locus.id)?;
    m.insert(PARAMS.into(), of_json(&params));
    m.insert(LOCUS.into(), locus_fingerprint(locus));
    let use_measured_pullup = match p.kind {
        ProjectKind::Genotyping => params.genotyping.is_none_or(|g| g.measured_pullup),
        _ => true,
    };
    let (rows, pq_map) = idx.rows_and_quality(c, locus.id)?;
    let mut f = Fingerprint::new();
    let mut plates: BTreeMap<i64, BTreeSet<String>> = BTreeMap::new();
    for r in rows {
        if samples.is_none_or(|s| s.contains(&r.sample_id)) {
            f.i64(r.run_id).u64(r.hash);
            if use_measured_pullup {
                plates
                    .entry(r.plate_id)
                    .or_default()
                    .insert(r.well_label.clone());
            }
        }
    }
    m.insert(RUNS.into(), f.hex());
    if use_measured_pullup {
        let mut pf = Fingerprint::new();
        for (pid, wells) in &plates {
            pf.i64(*pid);
            if let Some(pq) = pq_map.get(pid) {
                pf.u64(u64::from(pq.version));
                if let Some(pu) = pq.by_target.get(&locus.color) {
                    pf.u64(pu.sources.len() as u64);
                    for &(src, frac, spread) in &pu.sources {
                        pf.str(color_str(src)).f64(frac).f64(spread);
                    }
                } else {
                    pf.u64(0);
                }
                let unsep: Vec<&str> = wells
                    .iter()
                    .filter(|w| pq.unseparated_wells.contains(w.as_str()))
                    .map(String::as_str)
                    .collect();
                pf.u64(unsep.len() as u64);
                for w in unsep {
                    pf.str(w);
                }
            } else {
                pf.u64(0);
            }
        }
        m.insert(PLATE_QUALITY.into(), pf.hex());
    }
    if p.kind.has_calls() {
        let mut ids: Vec<i64> = samples
            .map(|s| s.iter().copied().collect())
            .unwrap_or_default();
        ids.sort_unstable();
        let mut f = Fingerprint::new();
        for id in ids {
            f.i64(id);
        }
        m.insert(SAMPLES.into(), f.hex());
    }
    if p.kind.needs_bins() {
        m.insert(
            BINS.into(),
            bins_fingerprint(c, p.bin_estimator_id, locus.id)?,
        );
    }
    if p.kind.has_calls() {
        m.insert(
            ARTIFACT.into(),
            artifact_fingerprint(c, p.artifact_estimator_id, locus.id)?,
        );
    }
    if p.kind == ProjectKind::Genotyping {
        m.insert(
            BETA.into(),
            beta_fingerprint(c, p.quant_bias_estimator_id, locus.id)?,
        );
    }
    if p.kind == ProjectKind::QuantBiasEstimator {
        m.insert(CONTROLS.into(), controls_fingerprint(c, p.id, locus.id)?);
    }
    Ok(Inputs(m))
}

fn reason(component: &str) -> &'static str {
    match component {
        PARAMS => "Parameters changed",
        LOCUS => "The locus size range, repeat length or dye changed",
        RUNS => "Runs changed (plates imported, deleted, re-sized or re-mapped, or ladder limits changed)",
        PLATE_QUALITY => "Plate quality reports changed (measured pull-up or unseparated capillaries updated)",
        SAMPLES => "Samples were added or removed",
        BINS => "Bins changed (edited, re-estimated, or a different bin estimator)",
        ARTIFACT => "The artifact model changed (re-fit, edited, or a different artifact estimator)",
        BETA => "The quantification bias (β) changed",
        CONTROLS => "Control mixtures or control alleles changed",
        _ => "Inputs changed",
    }
}

/// Compares stored and current inputs.
pub fn compare(stored: Option<&str>, analyzed_at: Option<String>, now: &Inputs) -> AnalysisStatus {
    let Some(stored) = stored.filter(|_| analyzed_at.is_some()) else {
        return AnalysisStatus {
            state: AnalysisState::NotAnalyzed,
            reasons: Vec::new(),
            analyzed_at: None,
        };
    };
    let old: Inputs = serde_json::from_str(stored).unwrap_or_default();
    let mut reasons: Vec<String> = Vec::new();
    for (k, v) in &now.0 {
        if old.0.get(k) != Some(v) {
            reasons.push(reason(k).to_string());
        }
    }
    for k in old.0.keys() {
        if !now.0.contains_key(k) {
            reasons.push(reason(k).to_string());
        }
    }
    reasons.dedup();
    AnalysisStatus {
        state: if reasons.is_empty() {
            AnalysisState::Current
        } else {
            AnalysisState::Stale
        },
        reasons,
        analyzed_at,
    }
}

/// Status of every locus of a project, in locus-set order.
pub fn locus_statuses(
    c: &Connection,
    p: &ProjectRow,
    idx: &mut RunsIndex,
) -> Result<Vec<(Locus, AnalysisStatus)>> {
    let samples = included_samples(c, p)?;
    let mut stored: HashMap<i64, (Option<String>, Option<String>)> = HashMap::new();
    let mut st = c.prepare_cached(
        "SELECT locus_id, fingerprint, analyzed_at FROM project_locus WHERE project_id = ?1",
    )?;
    for row in st.query_map([p.id], |r| {
        Ok((r.get::<_, i64>(0)?, (r.get(1)?, r.get(2)?)))
    })? {
        let (l, v) = row?;
        stored.insert(l, v);
    }
    project_loci(c, p)?
        .into_iter()
        .map(|l| {
            let now = current(c, p, &l, idx, samples.as_ref())?;
            let (fp, at) = stored.remove(&l.id).unwrap_or((None, None));
            let s = compare(fp.as_deref(), at, &now);
            Ok((l, s))
        })
        .collect()
}

/// Status of one locus of a project.
pub fn locus_status(c: &Connection, p: &ProjectRow, locus: &Locus) -> Result<AnalysisStatus> {
    let samples = included_samples(c, p)?;
    let now = current(c, p, locus, &mut RunsIndex::default(), samples.as_ref())?;
    let (fp, at): (Option<String>, Option<String>) = c
        .query_row(
            "SELECT fingerprint, analyzed_at FROM project_locus WHERE project_id = ?1 AND locus_id = ?2",
            [p.id, locus.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?
        .unwrap_or((None, None));
    Ok(compare(fp.as_deref(), at, &now))
}

/// Fingerprint of what the probabilistic pass of a genotyping project reads.
pub fn probability_inputs(c: &Connection, p: &ProjectRow) -> Result<String> {
    let mut f = Fingerprint::new();
    let mut revs: HashMap<i64, i64> = HashMap::new();
    let mut st = c.prepare_cached(
        "SELECT locus_id, analysis_rev FROM project_locus WHERE project_id = ?1 AND analyzed_at IS NOT NULL",
    )?;
    for row in st.query_map([p.id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))? {
        let (l, rev) = row?;
        revs.insert(l, rev);
    }
    for l in project_loci(c, p)? {
        f.i64(l.id).opt_i64(revs.get(&l.id).copied());
    }
    let mut st = c.prepare_cached(
        "SELECT s.id, s.designation FROM project_sample ps JOIN sample s ON s.id = ps.sample_id
         WHERE ps.project_id = ?1 ORDER BY s.id",
    )?;
    let mut rows = st.query([p.id])?;
    while let Some(r) = rows.next()? {
        f.i64(r.get(0)?).str(&r.get::<_, String>(1)?);
    }
    let options: Option<String> = c.query_row(
        "SELECT prob_options FROM project WHERE id = ?1",
        [p.id],
        |r| r.get(0),
    )?;
    f.str(&options.unwrap_or_default());
    Ok(f.hex())
}

/// Status of the probabilistic pass of a genotyping project.
pub fn probability_status(c: &Connection, p: &ProjectRow) -> Result<AnalysisStatus> {
    let Some(stored) = p.prob_fingerprint.as_deref() else {
        return Ok(AnalysisStatus {
            state: AnalysisState::NotAnalyzed,
            reasons: Vec::new(),
            analyzed_at: None,
        });
    };
    let now = probability_inputs(c, p)?;
    Ok(if now == stored {
        AnalysisStatus {
            state: AnalysisState::Current,
            reasons: Vec::new(),
            analyzed_at: p.prob_computed_at.clone(),
        }
    } else {
        AnalysisStatus {
            state: AnalysisState::Stale,
            reasons: vec![
                "Loci were re-analyzed, samples added or removed, or designations changed since probabilities were computed".into(),
            ],
            analyzed_at: p.prob_computed_at.clone(),
        }
    })
}

/// After a parameter change that leaves a stored result exactly as analysis
/// with the new parameters would leave it (the artifact error estimator, set
/// by refitting in place): records the new parameters' fingerprint, but only
/// when the result was recorded against the old ones, so a result that was
/// already stale for its parameters stays stale.
pub fn replace_params_fingerprint(
    tx: &Connection,
    project_id: i64,
    locus_id: i64,
    old: &super::LocusParams,
    new: &super::LocusParams,
) -> Result<()> {
    let stored: Option<Option<String>> = tx
        .query_row(
            "SELECT fingerprint FROM project_locus WHERE project_id = ?1 AND locus_id = ?2",
            [project_id, locus_id],
            |r| r.get(0),
        )
        .optional()?;
    let Some(Some(stored)) = stored else {
        return Ok(());
    };
    let Ok(mut inputs) = serde_json::from_str::<Inputs>(&stored) else {
        return Ok(());
    };
    if inputs.0.get(PARAMS) != Some(&of_json(old)) {
        return Ok(());
    }
    inputs.0.insert(PARAMS.into(), of_json(new));
    tx.execute(
        "UPDATE project_locus SET fingerprint = ?1 WHERE project_id = ?2 AND locus_id = ?3",
        rusqlite::params![serde_json::to_string(&inputs)?, project_id, locus_id],
    )?;
    Ok(())
}

/// Reads a project_locus result column as JSON.
pub fn stored_result(
    c: &Connection,
    project_id: i64,
    locus_id: i64,
) -> Result<Option<serde_json::Value>> {
    let v: Option<Option<serde_json::Value>> = c
        .query_row(
            "SELECT result FROM project_locus WHERE project_id = ?1 AND locus_id = ?2 AND result IS NOT NULL",
            [project_id, locus_id],
            |r| json_col(r, 0).map(Some),
        )
        .optional()?;
    Ok(v.flatten())
}
