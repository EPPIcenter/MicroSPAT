//! Genotyping exports: alleles wide and long, and full peak data; and the
//! control-mixture peak data of quantification-bias estimators.
//!
//! Exports refuse to run while any locus (or the probabilistic pass, once it
//! has been run) is stale, unless `allow_stale` is set, so outdated calls are
//! never written out as if current.

use super::calls::{
    all_calls, allele_numbers, controls_at_locus, fit_params, reference_wells, sample_table,
    StoredCall,
};
use super::projects::require_kind;
use super::{csv_text, safe_filename, some_of, TextFile};
use crate::error::{Result, RpcError};
use crate::projects::analysis::load_bins;
use crate::projects::inputs::{self, AnalysisState, RunsIndex};
use crate::projects::{project_loci, ProjectKind, ProjectRow};
use crate::rpc::Registry;
use crate::Engine;
use microspat_core::quant_bias::{control_points, ControlPeakExclusion};
use microspat_core::Bin;
use rusqlite::Connection;
use serde::Deserialize;
use std::collections::{BTreeMap, HashMap};
use ts_rs::TS;

/// Params of the genotyping exports.
#[derive(Debug, Clone, Copy, Deserialize, TS)]
pub struct ExportParams {
    /// Genotyping project.
    pub id: i64,
    /// Export even if some loci (or probabilities) are stale or not analyzed.
    #[serde(default)]
    #[ts(optional)]
    pub allow_stale: Option<bool>,
}

pub(crate) fn register(r: &mut Registry) {
    r.query(
        "export_alleles_wide",
        "Alleles as CSV, one row per sample and one column per locus, alleles joined by \";\".",
        wide,
    );
    r.query(
        "export_alleles_long",
        "Alleles as CSV, one row per sample × locus × allele: size, height, proportion and bias-corrected proportion of the called signal, probability, MOI, reviewed.",
        long,
    );
    r.query(
        "export_peak_data",
        "Every peak of every reference run as CSV (the old MicroSPAT peak-data columns; Proportion and Corrected Proportion are shares of the called signal as in the long export, NA for uncalled peaks; Height Share of All Peaks is height over every peak of the run; then the spectral dip ratio, spectral flag, expected pull-up and pull-up error). For a quantification-bias estimator: every peak of each control mixture's reference run with its true and observed proportions and whether, or why not, it entered the β fit.",
        peaks,
    );
}

fn check_current(c: &Connection, p: &ProjectRow, allow: bool) -> Result<()> {
    if allow {
        return Ok(());
    }
    let bad: Vec<String> = inputs::locus_statuses(c, p, &mut RunsIndex::default())?
        .into_iter()
        .filter(|(_, s)| !s.is_current())
        .map(|(l, s)| {
            format!(
                "{} ({})",
                l.label,
                if s.state == AnalysisState::NotAnalyzed {
                    "not analyzed"
                } else {
                    "stale"
                }
            )
        })
        .collect();
    if !bad.is_empty() {
        return Err(RpcError::invalid(format!(
            "Some loci need analysis: {}. Analyze them, or export anyway with allow_stale.",
            some_of(&bad, 8)
        )));
    }
    if inputs::probability_status(c, p)?.state == AnalysisState::Stale {
        return Err(RpcError::invalid(
            "Peak probabilities are stale. Recalculate them, or export anyway with allow_stale.",
        ));
    }
    Ok(())
}

struct Data {
    project: ProjectRow,
    loci: Vec<(i64, String)>,
    bins: HashMap<i64, Bin>,
    samples: BTreeMap<i64, super::calls::SampleEntry>,
    calls: Vec<StoredCall>,
}

fn load(c: &Connection, p: ExportParams) -> Result<Data> {
    let project = require_kind(c, p.id, ProjectKind::Genotyping)?;
    load_project(c, project, p)
}

fn load_project(c: &Connection, project: ProjectRow, p: ExportParams) -> Result<Data> {
    check_current(c, &project, p.allow_stale.unwrap_or(false))?;
    let loci: Vec<(i64, String)> = project_loci(c, &project)?
        .into_iter()
        .map(|l| (l.id, l.label))
        .collect();
    let mut bins = HashMap::new();
    if let Some(be) = project.bin_estimator_id {
        for (l, _) in &loci {
            for b in load_bins(c, be, *l)? {
                bins.insert(b.id, b);
            }
        }
    }
    Ok(Data {
        samples: sample_table(c, project.id)?,
        calls: all_calls(c, project.id)?,
        project,
        loci,
        bins,
    })
}

fn label(bins: &HashMap<i64, Bin>, id: i64) -> String {
    bins.get(&id)
        .map_or_else(|| "?".into(), |b| b.label.clone())
}

fn num(v: Option<f64>, digits: usize) -> String {
    v.map_or_else(String::new, |x| format!("{x:.digits$}"))
}

fn sorted_alleles(d: &Data, alleles: &std::collections::BTreeSet<i64>) -> Vec<i64> {
    let mut v: Vec<i64> = alleles.iter().copied().collect();
    v.sort_by(|a, b| {
        let s = |id: &i64| d.bins.get(id).map_or(f64::INFINITY, |b| b.base_size);
        s(a).total_cmp(&s(b))
    });
    v
}

fn by_barcode(d: &Data) -> Vec<(i64, &String)> {
    let mut v: Vec<(i64, &String)> = d.samples.iter().map(|(id, s)| (*id, &s.0)).collect();
    v.sort_by(|a, b| a.1.cmp(b.1));
    v
}

fn wide(e: &Engine, p: ExportParams) -> Result<TextFile> {
    e.workspace()?.read(|c| {
        let d = load(c, p)?;
        let mut cells: HashMap<(i64, i64), String> = HashMap::new();
        for StoredCall { call, .. } in &d.calls {
            let v: Vec<String> = sorted_alleles(&d, &call.alleles)
                .into_iter()
                .map(|b| label(&d.bins, b))
                .collect();
            cells.insert((call.sample_id, call.locus_id), v.join(";"));
        }
        let mut rows = vec![std::iter::once("Sample".to_string())
            .chain(d.loci.iter().map(|(_, l)| l.clone()))
            .collect::<Vec<_>>()];
        for (sid, barcode) in by_barcode(&d) {
            let mut row = vec![barcode.clone()];
            for (lid, _) in &d.loci {
                row.push(cells.remove(&(sid, *lid)).unwrap_or_default());
            }
            rows.push(row);
        }
        Ok(TextFile {
            filename: format!("{}_alleles.csv", safe_filename(&d.project.title)),
            content: csv_text(&rows)?,
        })
    })
}

fn long(e: &Engine, p: ExportParams) -> Result<TextFile> {
    e.workspace()?.read(|c| {
        let d = load(c, p)?;
        let locus_label: HashMap<i64, &String> = d.loci.iter().map(|(i, l)| (*i, l)).collect();
        let order: HashMap<i64, usize> = d
            .loci
            .iter()
            .enumerate()
            .map(|(k, (i, _))| (*i, k))
            .collect();
        let mut calls: Vec<_> = d.calls.iter().collect();
        calls.sort_by_key(|s| {
            (
                d.samples.get(&s.call.sample_id).map(|x| x.0.clone()),
                order.get(&s.call.locus_id).copied(),
            )
        });
        let mut rows = vec![[
            "Sample",
            "Locus",
            "Allele",
            "Size",
            "Height",
            "Proportion",
            "Corrected Proportion",
            "Probability",
            "MOI",
            "Reviewed",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect::<Vec<_>>()];
        for stored in calls {
            let call = &stored.call;
            let Some((barcode, _, moi)) = d.samples.get(&call.sample_id) else {
                continue;
            };
            let reviewed = if stored.reviewed() { "True" } else { "False" };
            for b in sorted_alleles(&d, &call.alleles) {
                let n = allele_numbers(call, b);
                rows.push(vec![
                    barcode.clone(),
                    locus_label
                        .get(&call.locus_id)
                        .map_or(String::new(), |l| l.to_string()),
                    label(&d.bins, b),
                    num(n.size, 2),
                    num(n.height, 0),
                    num(n.proportion, 4),
                    num(n.corrected, 4),
                    num(n.probability, 4),
                    moi.map_or(String::new(), |m| m.to_string()),
                    reviewed.to_string(),
                ]);
            }
        }
        Ok(TextFile {
            filename: format!("{}_alleles_long.csv", safe_filename(&d.project.title)),
            content: csv_text(&rows)?,
        })
    })
}

fn peaks(e: &Engine, p: ExportParams) -> Result<TextFile> {
    e.workspace()?.read(|c| {
        let project = crate::projects::load_row(c, p.id)?;
        if project.kind == ProjectKind::QuantBiasEstimator {
            let d = load_project(c, project, p)?;
            return control_peaks(c, &d);
        }
        let d = load(c, p)?;
        let locus_label: HashMap<i64, &String> = d.loci.iter().map(|(i, l)| (*i, l)).collect();
        let wells: HashMap<i64, String> = {
            let mut st = c.prepare(
                "SELECT g.reference_run_id, w.label FROM genotype g JOIN run r ON r.id = g.reference_run_id
                 JOIN channel ch ON ch.id = r.channel_id JOIN well w ON w.id = ch.well_id
                 WHERE g.project_id = ?1",
            )?;
            let v = st
                .query_map([d.project.id], |r| Ok((r.get(0)?, r.get(1)?)))?
                .collect::<rusqlite::Result<_>>()?;
            v
        };
        // The old app's columns, in its order, plus "Height Share of All
        // Peaks", "Spectral Dip Ratio", "Spectral Flag", "Expected Pull-Up"
        // and "Pull-Up Error" at the end. Peak tails are not computed by this
        // version's
        // scanner and are written as NA. "Proportion" and "Corrected
        // Proportion" mean what they mean in the long export and in core's
        // quantification: the peak's share of the called signal (height minus
        // expected artifact, over the called peaks), NA for peaks not called.
        // The old app wrote height over every peak of the run as "Proportion"
        // next to a corrected share over called peaks only, so the two did not
        // agree; that raw share is kept under its own name.
        let header = [
            "Sample",
            "Locus",
            "Peak Height",
            "Relative Peak Height",
            "Proportion",
            "Corrected Proportion",
            "Peak Size",
            "Peak Area",
            "Left Tail",
            "Right Tail",
            "Artifact Contribution",
            "Artifact Error",
            "In Bin",
            "Called Allele",
            "Allele Label",
            "Bleedthrough Ratio",
            "Crosstalk Ratio",
            "Probability",
            "Well",
            "Artifact Flag",
            "Below Relative Threshold Flag",
            "Bleedthrough Flag",
            "Crosstalk Flag",
            "Height Share of All Peaks",
            "Spectral Dip Ratio",
            "Spectral Flag",
            "Expected Pull-Up",
            "Pull-Up Error",
        ];
        let mut rows = vec![header.iter().map(|s| s.to_string()).collect::<Vec<_>>()];
        let na = |v: Option<f64>| v.map_or_else(|| "NA".to_string(), |x| format!("{x:.4}"));
        let na2 = |v: Option<f64>| v.map_or_else(|| "NA".to_string(), |x| format!("{x:.2}"));
        let tf = |b: bool| if b { "True" } else { "False" }.to_string();
        for StoredCall { call, .. } in &d.calls {
            if call.flags.failure {
                continue;
            }
            let Some((barcode, _, _)) = d.samples.get(&call.sample_id) else {
                continue;
            };
            let total: f64 = call.peaks.iter().map(|p| p.height).sum();
            let well = call
                .reference_run_id
                .and_then(|r| wells.get(&r).cloned())
                .unwrap_or_default();
            for pk in &call.peaks {
                let binned = pk.bin_id.is_some();
                rows.push(vec![
                    barcode.clone(),
                    locus_label.get(&call.locus_id).map_or(String::new(), |l| l.to_string()),
                    format!("{:.0}", pk.height),
                    format!("{:.4}", pk.relative_height),
                    na(pk.relative_quantification),
                    na(pk.corrected_relative_quantification),
                    format!("{:.2}", pk.size),
                    format!("{:.0}", pk.area),
                    "NA".into(),
                    "NA".into(),
                    format!("{:.2}", pk.artifact_contribution),
                    format!("{:.2}", pk.artifact_error),
                    tf(pk.in_bin),
                    if binned {
                        tf(pk.bin_id.is_some_and(|b| call.alleles.contains(&b)))
                    } else {
                        String::new()
                    },
                    pk.bin_id.map_or(String::new(), |b| label(&d.bins, b)),
                    format!("{:.4}", pk.bleedthrough_ratio),
                    format!("{:.4}", pk.crosstalk_ratio),
                    na(pk.probability),
                    well.clone(),
                    tf(pk.flags.artifact),
                    tf(pk.flags.below_relative_threshold),
                    tf(pk.flags.bleedthrough),
                    tf(pk.flags.crosstalk),
                    format!("{:.4}", if total > 0.0 { pk.height / total } else { 0.0 }),
                    format!("{:.4}", pk.spectral_dip_ratio),
                    tf(pk.flags.spectral),
                    na2(pk.pullup_contribution),
                    na2(pk.pullup_error),
                ]);
            }
        }
        Ok(TextFile {
            filename: format!("{}_peak_data.csv", safe_filename(&d.project.title)),
            content: csv_text(&rows)?,
        })
    })
}

/// The exclusion's API name (`get_locus_quant_bias` uses the same).
fn exclusion_name(x: ControlPeakExclusion) -> String {
    serde_json::to_value(x)
        .ok()
        .and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_default()
}

/// Peak data of a quantification-bias estimator: every peak of each control
/// mixture's reference run, with the mixture's controls at that allele, the
/// true proportion, the observed shares, and the β fit's verdict under the
/// parameters the stored fit used (as `get_locus_quant_bias`).
fn control_peaks(c: &Connection, d: &Data) -> Result<TextFile> {
    let header = [
        "Sample",
        "Locus",
        "Plate",
        "Well",
        "Peak Size",
        "Peak Height",
        "Relative Peak Height",
        "Peak Area",
        "Artifact Contribution",
        "Artifact Error",
        "In Bin",
        "Allele Label",
        "Controls",
        "True Proportion",
        "Proportion",
        "Corrected Proportion",
        "Fit Observed Proportion",
        "Log-Ratio Error",
        "Used In Fit",
        "Exclusion Reason",
        "Height Share of All Peaks",
    ];
    let mut rows = vec![header.iter().map(|s| s.to_string()).collect::<Vec<_>>()];
    let na = |v: Option<f64>| v.map_or_else(|| "NA".to_string(), |x| format!("{x:.4}"));
    let tf = |b: bool| if b { "True" } else { "False" }.to_string();
    let wells = reference_wells(c, d.project.id, None)?;
    let mixtures = crate::projects::analysis::load_mixtures(c, d.project.id)?;
    let order: HashMap<i64, usize> = d
        .loci
        .iter()
        .enumerate()
        .map(|(k, (i, _))| (*i, k))
        .collect();
    let mut calls: Vec<&StoredCall> = d.calls.iter().collect();
    calls.sort_by_key(|s| {
        (
            d.samples.get(&s.call.sample_id).map(|x| x.0.clone()),
            order.get(&s.call.locus_id).copied(),
        )
    });
    let mut per_locus = HashMap::new();
    for (lid, _) in &d.loci {
        per_locus.insert(
            *lid,
            (
                fit_params(c, &d.project, *lid)?.0,
                controls_at_locus(c, *lid)?,
            ),
        );
    }
    for StoredCall { call, .. } in calls {
        let Some((barcode, _, _)) = d.samples.get(&call.sample_id) else {
            continue;
        };
        let Some((params, controls)) = per_locus.get(&call.locus_id) else {
            continue;
        };
        let locus = d
            .loci
            .iter()
            .find(|(i, _)| *i == call.locus_id)
            .map_or(String::new(), |(_, l)| l.clone());
        let (plate, well) = wells
            .get(&(call.sample_id, call.locus_id))
            .cloned()
            .unwrap_or_default();
        let fit: HashMap<usize, _> = control_points(&call.peaks, params)
            .into_iter()
            .map(|p| (p.peak, p))
            .collect();
        let total: f64 = call.peaks.iter().map(|p| p.height).sum();
        for (i, pk) in call.peaks.iter().enumerate() {
            let at_allele: Vec<String> = mixtures
                .get(&call.sample_id)
                .into_iter()
                .flatten()
                .filter_map(|(ctl, _)| controls.get(ctl))
                .filter(|(_, bin, _, _)| bin.is_some() && *bin == pk.bin_id)
                .map(|(label, _, _, _)| label.clone())
                .collect();
            let pt = fit.get(&i);
            rows.push(vec![
                barcode.clone(),
                locus.clone(),
                plate.clone(),
                well.clone(),
                format!("{:.2}", pk.size),
                format!("{:.0}", pk.height),
                format!("{:.4}", pk.relative_height),
                format!("{:.0}", pk.area),
                format!("{:.2}", pk.artifact_contribution),
                format!("{:.2}", pk.artifact_error),
                tf(pk.in_bin),
                pk.bin_id.map_or(String::new(), |b| label(&d.bins, b)),
                at_allele.join(";"),
                na(pk.true_proportion),
                na(pk.relative_quantification),
                na(pk.corrected_relative_quantification),
                na(pt.map(|p| p.observed_proportion)),
                na(pt.and_then(|p| p.log_odds_error)),
                pt.map_or(String::new(), |p| tf(p.exclusion.is_none())),
                pt.and_then(|p| p.exclusion)
                    .map_or(String::new(), exclusion_name),
                format!("{:.4}", if total > 0.0 { pk.height / total } else { 0.0 }),
            ]);
        }
    }
    Ok(TextFile {
        filename: format!("{}_control_peak_data.csv", safe_filename(&d.project.title)),
        content: csv_text(&rows)?,
    })
}
