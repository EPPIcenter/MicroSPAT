//! Analysis projects: one schema and one service layer for four kinds.
//!
//! Every project has a title, a locus set, per-locus parameters, a set of
//! samples, and links to the estimators it depends on. Kinds differ only in
//! what analyzing a locus produces:
//!
//! | kind | depends on | a locus analysis stores |
//! |---|---|---|
//! | bin estimator | – | bins (`bin`), the peak scatter (`project_locus.scatter`) |
//! | artifact estimator | bin estimator | artifact classes (`artifact_estimator`) |
//! | quantification-bias estimator | bin estimator, artifact estimator? | each control mixture's call (`genotype`), β (`project_locus.result`) |
//! | genotyping | bin estimator, artifact estimator?, quantification-bias estimator? | one call per sample (`genotype`) |
//!
//! Locus analysis is the same pipeline for every kind ([`pipeline`]): load the
//! locus's runs, scan (cached by content), size and filter, then the kind's
//! step ([`analysis`]). Every result records a fingerprint of each input it
//! used ([`inputs`]), which is how staleness is computed.

pub mod analysis;
pub mod inputs;
pub mod pipeline;

use crate::api::loci::{self, Locus};
use crate::error::{OrNotFound, Result, RpcError};
use microspat_core::artifact::ArtifactParams;
use microspat_core::bins::BinParams;
use microspat_core::genotyping::GenotypingParams;
use microspat_core::peaks::{FilterParams, ScanParams};
use microspat_core::quant_bias::QuantBiasParams;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use ts_rs::TS;

/// What a project does.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ProjectKind {
    /// Clusters peak sizes into allele bins.
    BinEstimator,
    /// Models stutter and other artifacts from mono-allelic runs.
    ArtifactEstimator,
    /// Estimates size-dependent amplification bias from control mixtures.
    QuantBiasEstimator,
    /// Calls alleles in samples.
    Genotyping,
}

impl ProjectKind {
    /// Database form.
    pub fn as_str(self) -> &'static str {
        match self {
            ProjectKind::BinEstimator => "bin_estimator",
            ProjectKind::ArtifactEstimator => "artifact_estimator",
            ProjectKind::QuantBiasEstimator => "quant_bias_estimator",
            ProjectKind::Genotyping => "genotyping",
        }
    }

    /// Parses the database form.
    pub fn from_db(s: &str) -> Option<ProjectKind> {
        match s {
            "bin_estimator" => Some(ProjectKind::BinEstimator),
            "artifact_estimator" => Some(ProjectKind::ArtifactEstimator),
            "quant_bias_estimator" => Some(ProjectKind::QuantBiasEstimator),
            "genotyping" => Some(ProjectKind::Genotyping),
            _ => None,
        }
    }

    /// Human name, for messages.
    pub fn noun(self) -> &'static str {
        match self {
            ProjectKind::BinEstimator => "bin estimator",
            ProjectKind::ArtifactEstimator => "artifact estimator",
            ProjectKind::QuantBiasEstimator => "quantification-bias estimator",
            ProjectKind::Genotyping => "genotyping project",
        }
    }

    /// True for kinds whose results are one call per sample × locus.
    pub fn has_calls(self) -> bool {
        matches!(
            self,
            ProjectKind::QuantBiasEstimator | ProjectKind::Genotyping
        )
    }

    /// True for kinds that use a bin estimator.
    pub fn needs_bins(self) -> bool {
        self != ProjectKind::BinEstimator
    }

    /// True for kinds that may use every sample with runs instead of a list.
    pub fn may_use_all_samples(self) -> bool {
        matches!(
            self,
            ProjectKind::BinEstimator | ProjectKind::ArtifactEstimator
        )
    }
}

/// Parameters of one project at one locus. The scanning and filter sections
/// apply to every kind; exactly the kind's own section is present.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct LocusParams {
    /// Peak scanning. Changing it re-scans every run.
    pub scan: ScanParams,
    /// Peak filters.
    pub filter: FilterParams,
    /// Bin estimators.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub bins: Option<BinParams>,
    /// Artifact estimators.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub artifact: Option<ArtifactParams>,
    /// Quantification-bias estimators.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub quant_bias: Option<QuantBiasParams>,
    /// Genotyping projects.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub genotyping: Option<GenotypingParams>,
}

/// Default filters for a new project.
///
/// Core's [`FilterParams::default`] keeps every relative maximum (minimum
/// height 0 RFU, the old application's default). On 3730-like traces that is
/// ~25 noise maxima per run inside a locus range. Pooled over a few hundred
/// runs they form dense clusters that the bin estimator turns into spurious
/// bins, so estimators default to a 100 RFU floor
/// ([`ESTIMATOR_MIN_PEAK_HEIGHT`]; below the 200 RFU genotyping height
/// limit, so nothing callable is lost).
///
/// Artifact estimators keep the 100 RFU floor too, although it truncates the
/// low-level peaks their global estimator models (a review simulation showed
/// the global estimate rising from 0.0059 to 0.0100 of the main peak). At 0
/// RFU the noise maxima enter the global estimator and inflate its error far
/// more: on the synthetic study, after the probabilistic pass, recall of
/// callable minor alleles falls (engine README, Accuracy, row "estimator
/// floor 0 RFU"). Calling projects keep core's defaults: genotyping flags
/// low peaks itself and reports them.
///
/// Estimators also drop crosstalk at a 10× ratio ([`ESTIMATOR_MAX_CROSSTALK`])
/// where calling projects keep core's 100×. A run that passes as
/// mono-allelic still carries the leaked alleles of its neighbors, and in an
/// artifact estimator those become distance classes or global artifact that
/// then hide true minor alleles everywhere.
pub fn default_filter(kind: ProjectKind) -> FilterParams {
    match kind {
        ProjectKind::BinEstimator | ProjectKind::ArtifactEstimator => FilterParams {
            min_peak_height: ESTIMATOR_MIN_PEAK_HEIGHT,
            max_crosstalk: ESTIMATOR_MAX_CROSSTALK,
            ..FilterParams::default()
        },
        _ => FilterParams::default(),
    }
}

/// Default artifact estimation settings: core's.
pub fn default_artifact() -> ArtifactParams {
    ArtifactParams::default()
}

/// Minimum peak height (RFU) bin and artifact estimators filter at by
/// default (the old application used 0; see [`default_filter`] for why).
pub const ESTIMATOR_MIN_PEAK_HEIGHT: f64 = 100.0;

/// Crosstalk ratio at which bin and artifact estimators drop a peak by
/// default (see [`default_filter`]).
pub const ESTIMATOR_MAX_CROSSTALK: f64 = 10.0;

impl LocusParams {
    /// Defaults for a kind.
    pub fn defaults(kind: ProjectKind) -> LocusParams {
        LocusParams {
            scan: ScanParams::default(),
            filter: default_filter(kind),
            bins: (kind == ProjectKind::BinEstimator).then(BinParams::default),
            artifact: (kind == ProjectKind::ArtifactEstimator).then(default_artifact),
            quant_bias: (kind == ProjectKind::QuantBiasEstimator).then(QuantBiasParams::default),
            genotyping: (kind == ProjectKind::Genotyping).then(GenotypingParams::default),
        }
    }

    /// The stored JSON merged over the kind's defaults. Sections of other
    /// kinds are dropped; unknown fields are ignored. -0.0 is read as 0.0, so
    /// equal settings compare and fingerprint equal however they were stored.
    pub fn effective(kind: ProjectKind, stored: &serde_json::Value) -> Result<LocusParams> {
        let mut base = serde_json::to_value(LocusParams::defaults(kind))?;
        merge(&mut base, stored);
        positive_zeros(&mut base);
        let mut p: LocusParams = serde_json::from_value(base)
            .map_err(|e| RpcError::invalid(format!("Invalid locus parameters: {e}")))?;
        let d = LocusParams::defaults(kind);
        if d.bins.is_none() {
            p.bins = None;
        }
        if d.artifact.is_none() {
            p.artifact = None;
        }
        if d.quant_bias.is_none() {
            p.quant_bias = None;
        }
        if d.genotyping.is_none() {
            p.genotyping = None;
        }
        Ok(p)
    }

    /// What to store for these settings: only the values that differ from
    /// the kind's defaults. A value the user never changed then follows the
    /// defaults when they change, instead of keeping the default of the day
    /// the locus was first customized.
    pub fn stored_form(&self, kind: ProjectKind) -> Result<serde_json::Value> {
        let mut v = serde_json::to_value(self)?;
        let d = serde_json::to_value(LocusParams::defaults(kind))?;
        strip_defaults(&mut v, &d);
        Ok(v)
    }

    /// Checks values a user can get wrong; the message names the field.
    pub fn validate(&self) -> Result<()> {
        let bad = |m: String| Err(RpcError::invalid(m));
        let s = &self.scan;
        if s.smoothing_window.is_multiple_of(2) || s.smoothing_window < 3 {
            return bad("Smoothing window must be an odd number of at least 3.".into());
        }
        if s.smoothing_order >= s.smoothing_window {
            return bad("Smoothing order must be less than the smoothing window.".into());
        }
        if s.relmax_window == 0 || s.maxima_window == 0 {
            return bad("Maxima and relative-maximum windows must be at least 1.".into());
        }
        if !(s.tophat_factor > 0.0 && s.tophat_factor < 1.0) {
            return bad("Top-hat factor must be between 0 and 1.".into());
        }
        let f = &self.filter;
        for (name, v) in [
            ("Min. peak height", f.min_peak_height),
            ("Max. peak height", f.max_peak_height),
            ("Min. peak height ratio", f.min_peak_height_ratio),
            ("Max. bleedthrough", f.max_bleedthrough),
            ("Max. crosstalk", f.max_crosstalk),
            ("Min. peak distance", f.min_peak_distance),
        ] {
            if v.is_nan() || v < 0.0 {
                return bad(format!("{name} must be a number ≥ 0."));
            }
        }
        if f.min_peak_height > f.max_peak_height {
            return bad("Min. peak height must not exceed max. peak height.".into());
        }
        if let Some(b) = &self.bins {
            if !(b.default_bin_buffer.is_finite() && b.default_bin_buffer >= 0.0) {
                return bad("Default bin buffer must be ≥ 0.".into());
            }
        }
        if let Some(a) = &self.artifact {
            if !(0.0..=1.0).contains(&a.max_secondary_relative_peak_height) {
                return bad("Max. secondary relative peak height must be between 0 and 1.".into());
            }
        }
        if let Some(q) = &self.quant_bias {
            if !(0.0..0.5).contains(&q.min_true_proportion) {
                return bad("Min. true proportion must be in [0, 0.5).".into());
            }
        }
        if let Some(g) = &self.genotyping {
            if !g.pullup_sd_limit.is_finite() || g.pullup_sd_limit < 0.0 {
                return bad("Pull-up SD limit must be a number ≥ 0.".into());
            }
            for (name, v) in [
                ("Probability threshold", g.probability_threshold),
                (
                    "Bootstrap probability threshold",
                    g.bootstrap_probability_threshold,
                ),
                ("Relative peak height limit", g.relative_peak_height_limit),
            ] {
                if !(0.0..=1.0).contains(&v) {
                    return bad(format!("{name} must be between 0 and 1."));
                }
            }
        }
        Ok(())
    }
}

/// Rewrites -0.0 as 0.0 (equal as numbers, different as JSON text).
fn positive_zeros(v: &mut serde_json::Value) {
    match v {
        serde_json::Value::Object(m) => m.values_mut().for_each(positive_zeros),
        serde_json::Value::Array(a) => a.iter_mut().for_each(positive_zeros),
        serde_json::Value::Number(n) if n.as_f64() == Some(0.0) && n.is_f64() => {
            *v = serde_json::json!(0.0);
        }
        _ => {}
    }
}

/// Removes from `v` every value equal to the one at the same place in
/// `defaults`, and objects left empty.
fn strip_defaults(v: &mut serde_json::Value, defaults: &serde_json::Value) {
    let (serde_json::Value::Object(m), serde_json::Value::Object(d)) = (v, defaults) else {
        return;
    };
    m.retain(|k, x| match d.get(k) {
        Some(dx) if dx == x => false,
        Some(dx) if x.is_object() => {
            strip_defaults(x, dx);
            x.as_object().is_some_and(|o| !o.is_empty())
        }
        _ => true,
    });
}

/// JSON merge: objects merge key by key, anything else replaces.
pub(crate) fn merge(base: &mut serde_json::Value, patch: &serde_json::Value) {
    match (base, patch) {
        (serde_json::Value::Object(b), serde_json::Value::Object(p)) => {
            for (k, v) in p {
                match b.get_mut(k) {
                    Some(slot) if slot.is_object() && v.is_object() => merge(slot, v),
                    Some(slot) => *slot = v.clone(),
                    None => {
                        b.insert(k.clone(), v.clone());
                    }
                }
            }
        }
        (b, p) => *b = p.clone(),
    }
}

/// A project row.
#[derive(Debug, Clone)]
pub struct ProjectRow {
    pub id: i64,
    pub kind: ProjectKind,
    pub title: String,
    pub description: String,
    pub locus_set_id: i64,
    pub bin_estimator_id: Option<i64>,
    pub artifact_estimator_id: Option<i64>,
    pub quant_bias_estimator_id: Option<i64>,
    pub all_samples: bool,
    pub created_at: String,
    pub updated_at: String,
    pub prob_fingerprint: Option<String>,
    pub prob_computed_at: Option<String>,
}

pub(crate) const PROJECT_COLUMNS: &str =
    "id, kind, title, description, locus_set_id, bin_estimator_id,
    artifact_estimator_id, quant_bias_estimator_id, all_samples, created_at, updated_at,
    prob_fingerprint, prob_computed_at";

pub(crate) fn row_to_project(r: &rusqlite::Row) -> rusqlite::Result<ProjectRow> {
    let kind: String = r.get(1)?;
    Ok(ProjectRow {
        id: r.get(0)?,
        kind: ProjectKind::from_db(&kind).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                1,
                rusqlite::types::Type::Text,
                format!("unknown project kind {kind}").into(),
            )
        })?,
        title: r.get(2)?,
        description: r.get(3)?,
        locus_set_id: r.get(4)?,
        bin_estimator_id: r.get(5)?,
        artifact_estimator_id: r.get(6)?,
        quant_bias_estimator_id: r.get(7)?,
        all_samples: r.get(8)?,
        created_at: r.get(9)?,
        updated_at: r.get(10)?,
        prob_fingerprint: r.get(11)?,
        prob_computed_at: r.get(12)?,
    })
}

/// Loads one project.
pub fn load_row(c: &Connection, id: i64) -> Result<ProjectRow> {
    c.query_row(
        &format!("SELECT {PROJECT_COLUMNS} FROM project WHERE id = ?1"),
        [id],
        row_to_project,
    )
    .optional()?
    .or_not_found(|| format!("Project {id} does not exist"))
}

/// Loads one project and checks its kind.
pub fn load_kind(c: &Connection, id: i64, kind: ProjectKind) -> Result<ProjectRow> {
    let p = load_row(c, id)?;
    if p.kind != kind {
        return Err(RpcError::invalid(format!(
            "\"{}\" is a {}, not a {}.",
            p.title,
            p.kind.noun(),
            kind.noun()
        )));
    }
    Ok(p)
}

/// All projects, by kind then title.
pub fn load_rows(c: &Connection) -> Result<Vec<ProjectRow>> {
    let mut st = c.prepare(&format!(
        "SELECT {PROJECT_COLUMNS} FROM project ORDER BY kind, title"
    ))?;
    let v = st
        .query_map([], row_to_project)?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

/// Loci of the project's locus set, by label.
pub fn project_loci(c: &Connection, p: &ProjectRow) -> Result<Vec<Locus>> {
    Ok(loci::load_set(c, p.locus_set_id)?.loci)
}

/// One locus of the project, or `invalid` when it is not in the locus set.
pub fn project_locus(c: &Connection, p: &ProjectRow, locus_id: i64) -> Result<Locus> {
    project_loci(c, p)?
        .into_iter()
        .find(|l| l.id == locus_id)
        .ok_or_else(|| {
            RpcError::invalid(format!(
                "Locus {locus_id} is not in the locus set of \"{}\".",
                p.title
            ))
        })
}

/// Effective parameters of a project at a locus.
pub fn locus_params(c: &Connection, p: &ProjectRow, locus_id: i64) -> Result<LocusParams> {
    let stored: Option<String> = c
        .query_row(
            "SELECT params FROM project_locus WHERE project_id = ?1 AND locus_id = ?2",
            [p.id, locus_id],
            |r| r.get(0),
        )
        .optional()?;
    let v = match stored {
        Some(s) => serde_json::from_str(&s)?,
        None => serde_json::json!({}),
    };
    LocusParams::effective(p.kind, &v)
}

/// Samples whose runs the project uses: None means every sample with runs.
pub fn included_samples(c: &Connection, p: &ProjectRow) -> Result<Option<HashSet<i64>>> {
    if p.all_samples && p.kind.may_use_all_samples() {
        return Ok(None);
    }
    Ok(Some(project_sample_ids(c, p.id)?.into_iter().collect()))
}

/// Ids of the project's listed samples, ascending.
pub fn project_sample_ids(c: &Connection, project_id: i64) -> Result<Vec<i64>> {
    let mut st = c.prepare_cached(
        "SELECT sample_id FROM project_sample WHERE project_id = ?1 ORDER BY sample_id",
    )?;
    let v = st
        .query_map([project_id], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn params_merge_over_defaults_and_drop_foreign_sections() {
        let p = LocusParams::effective(
            ProjectKind::Genotyping,
            &serde_json::json!({
                "filter": { "min_peak_height": 50.0 },
                "genotyping": { "probability_threshold": 0.8 },
                "bins": { "min_peak_frequency": 3 }
            }),
        )
        .unwrap();
        assert_eq!(p.filter.min_peak_height, 50.0);
        assert_eq!(
            p.filter.max_crosstalk,
            FilterParams::default().max_crosstalk
        );
        let g = p.genotyping.unwrap();
        assert_eq!(g.probability_threshold, 0.8);
        assert_eq!(
            g.failure_threshold,
            GenotypingParams::default().failure_threshold
        );
        assert!(p.bins.is_none());
        let be = LocusParams::defaults(ProjectKind::BinEstimator);
        assert_eq!(be.filter.min_peak_height, ESTIMATOR_MIN_PEAK_HEIGHT);
        assert!(be.bins.is_some() && be.genotyping.is_none());
        let mut bad = be.clone();
        bad.scan.smoothing_window = 10;
        assert!(bad.validate().is_err());
    }

    #[test]
    fn stored_form_keeps_only_changed_values() {
        let kind = ProjectKind::ArtifactEstimator;
        let d = LocusParams::defaults(kind);
        assert_eq!(d.stored_form(kind).unwrap(), serde_json::json!({}));
        let mut p = d.clone();
        p.filter.min_peak_height = 50.0;
        if let Some(a) = &mut p.artifact {
            a.error_estimator = microspat_core::stats::ErrorEstimator::Rms;
        }
        let stored = p.stored_form(kind).unwrap();
        assert_eq!(
            stored,
            serde_json::json!({
                "filter": { "min_peak_height": 50.0 },
                "artifact": { "error_estimator": "rms" }
            })
        );
        assert_eq!(LocusParams::effective(kind, &stored).unwrap(), p);
    }
}
