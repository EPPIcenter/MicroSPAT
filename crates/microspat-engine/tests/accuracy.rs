//! Genotyping accuracy against synthetic ground truth.
//!
//! A polyclonal study from `SynthSpec::study` (1–4 clones per sample, minor
//! clones down to 5% of the major; per-locus stutter of 3.5–20% at −1
//! repeat, 1–7% at −2, 1–5% at +1 and a −3 repeat peak at heavy-stutter loci,
//! varying 20% between runs; per-locus amplification bias β of 0.05 to 0.19
//! per bp; alleles under ladder fragments and under other dyes' alleles;
//! traces typical of raw 3730 data: baselines of −80 to +60 RFU with drift,
//! noise SD up to 12.5 RFU, signed spectral pull-up and dips at every ladder
//! peak, blue into green at 14%, crosstalk from capillaries 1, 2 and 3 away,
//! two capillaries whose dyes are not separated, failed wells, saturation)
//! plus two- and three-strain control mixtures is genotyped end to end
//! through `dispatch`: bin estimator, artifact estimator, controls,
//! quantification-bias estimator, genotyping with and without the artifact
//! model, before and after the probabilistic pass. Called alleles are scored
//! against the planted truth; calls from the faulty capillaries are scored
//! only on whether they carry the spectral flag. Run with `--nocapture` to
//! see the table. Besides the defaults it scores each default against the
//! value it replaced (MAD class error, run fraction 0.2, fixed bleedthrough
//! flag 5 and 10 without measured plate pull-up, crosstalk flag 50, height limit
//! 300 with probability 0.9, all of them together), the artifact estimator filtering crosstalk at 100× like
//! calling projects, the artifact estimator filtered at 0 RFU instead of its
//! 100 RFU default, and the bleedthrough rule off (to count the true alleles
//! it rejects). Set `ACC_CROSSTALK_GRID=1` or `ACC_BLEED_GRID=1` to also
//! score grids of crosstalk or bleedthrough limits (several more analyses;
//! use `--release`), `ACC_DEBUG=1` to print the artifact classes.

mod common;

use common::*;
use microspat_core::synth::{WellKind, WellTruth};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

/// Planted alleles below this height (RFU) cannot pass the default 200 RFU
/// genotyping height limit after stutter is subtracted; they are scored
/// separately.
const CALLABLE_RFU: f64 = 300.0;

#[derive(Default, Debug, Clone)]
struct Score {
    truth: [u32; 7],
    found: [u32; 7],
    calls: u32,
    false_calls: u32,
    /// (corrected, uncorrected) absolute proportion errors on exactly-called sample × loci.
    prop_err: Vec<(f64, f64)>,
    moi_exact: u32,
    moi_total: u32,
    moi_abs_err: f64,
    /// Against the MOI observable in the planted data (see `observable_moi`).
    moi_obs_exact: u32,
    /// Calls flagged `spectral`: (in capillaries with a spectral fault, elsewhere).
    spectral_flagged: (u32, u32),
    /// Sample × locus calls in capillaries with a spectral fault.
    fault_calls: u32,
}

// Categories: all, major, minor (< 10% of the major), minor on a stutter
// position, minor and callable (planted height ≥ CALLABLE_RFU).
const CATS: [&str; 7] = [
    "all planted",
    "major (≥10% of top)",
    "major ≥300 RFU",
    "minor (<10% of top)",
    "minor on stutter",
    "minor ≥300 RFU",
    "minor ≥300 on stutter",
];
const ALL: usize = 0;
const MAJOR: usize = 1;
const MAJOR_CALLABLE: usize = 2;
const MINOR: usize = 3;
const MINOR_STUTTER: usize = 4;
const MINOR_CALLABLE: usize = 5;
const MINOR_CALLABLE_STUTTER: usize = 6;

impl Score {
    fn recall(&self, k: usize) -> f64 {
        f64::from(self.found[k]) / f64::from(self.truth[k].max(1))
    }
    fn precision(&self) -> f64 {
        1.0 - f64::from(self.false_calls) / f64::from(self.calls.max(1))
    }
    fn mae(&self, corrected: bool) -> f64 {
        let n = self.prop_err.len().max(1) as f64;
        self.prop_err
            .iter()
            .map(|(c, u)| if corrected { *c } else { *u })
            .sum::<f64>()
            / n
    }
}

struct Ctx<'a> {
    h: &'a Harness,
    study: &'a Study,
    loci: &'a HashMap<String, i64>,
    ids: HashMap<i64, String>,
}

fn on_stutter(a: f64, others: &[f64], repeat: f64) -> bool {
    others.iter().any(|&b| {
        [-1.0, -2.0, 1.0]
            .iter()
            .any(|k| (b + k * repeat - a).abs() < 0.05)
    })
}

fn score(cx: &Ctx, gt: i64) -> Score {
    let mut s = Score::default();
    let repeat: HashMap<String, f64> = cx.study.specs[0]
        .loci
        .iter()
        .map(|l| (l.label.clone(), l.repeat_length))
        .collect();
    let rows = cx.h.call("list_project_samples", json!({ "id": gt }));
    let moi: HashMap<i64, Option<u64>> = rows
        .as_array()
        .unwrap()
        .iter()
        .map(|r| (r["sample_id"].as_i64().unwrap(), r["moi"].as_u64()))
        .collect();
    for (label, &lid) in cx.loci {
        let lc = cx.h.call(
            "get_locus_calls",
            json!({ "project_id": gt, "locus_id": lid }),
        );
        let bins: HashMap<i64, f64> = lc["bins"]
            .as_array()
            .unwrap()
            .iter()
            .map(|b| (id(b), b["base_size"].as_f64().unwrap()))
            .collect();
        for row in lc["rows"].as_array().unwrap() {
            let sid = row["sample_id"].as_i64().unwrap();
            let barcode = &cx.ids[&sid];
            let t: &WellTruth = &cx.study.truth[barcode];
            if t.kind != WellKind::Sample || cx.study.mixtures.contains_key(barcode) {
                continue;
            }
            let spectral = row["flags"]["spectral"] == true;
            // A capillary whose dyes are not separated gives wrong calls by
            // design; it is scored on whether its calls are flagged.
            if t.spectral_fault {
                s.fault_calls += 1;
                s.spectral_flagged.0 += u32::from(spectral);
                continue;
            }
            s.spectral_flagged.1 += u32::from(spectral);
            let Some(lt) = t.loci.iter().find(|l| &l.locus == label) else {
                continue;
            };
            let rep = repeat[label];
            let called: Vec<(i64, f64)> = row["alleles"]
                .as_array()
                .unwrap()
                .iter()
                .map(|a| {
                    let b = a["bin_id"].as_i64().unwrap();
                    (b, bins.get(&b).copied().unwrap_or(f64::NAN))
                })
                .collect();
            let max_h = lt.alleles.iter().map(|a| a.height).fold(0.0, f64::max);
            let sizes: Vec<f64> = lt.alleles.iter().map(|a| a.size).collect();
            let mut matched: HashSet<i64> = HashSet::new();
            let mut all_found = true;
            let mut pairs = Vec::new();
            for a in &lt.alleles {
                let minor = a.height < 0.1 * max_h;
                let larger: Vec<f64> = lt
                    .alleles
                    .iter()
                    .filter(|b| b.height > a.height)
                    .map(|b| b.size)
                    .collect();
                let stutter = on_stutter(a.size, &larger, rep);
                let callable = a.height >= CALLABLE_RFU;
                let mut cats = vec![ALL];
                if minor {
                    cats.push(MINOR);
                    if stutter {
                        cats.push(MINOR_STUTTER);
                    }
                    if callable {
                        cats.push(MINOR_CALLABLE);
                        if stutter {
                            cats.push(MINOR_CALLABLE_STUTTER);
                        }
                    }
                } else {
                    cats.push(MAJOR);
                    if callable {
                        cats.push(MAJOR_CALLABLE);
                    }
                }
                let hit = called
                    .iter()
                    .filter(|(b, size)| !matched.contains(b) && (size - a.size).abs() < rep / 2.0)
                    .min_by(|x, y| (x.1 - a.size).abs().total_cmp(&(y.1 - a.size).abs()));
                for &c in &cats {
                    s.truth[c] += 1;
                }
                match hit {
                    Some(&(b, _)) => {
                        matched.insert(b);
                        for &c in &cats {
                            s.found[c] += 1;
                        }
                        pairs.push((b, a.proportion));
                    }
                    None => all_found = false,
                }
            }
            let _ = &sizes;
            s.calls += called.len() as u32;
            let extra = called.iter().filter(|(b, _)| !matched.contains(b)).count() as u32;
            s.false_calls += extra;
            if all_found
                && extra == 0
                && lt.alleles.len() >= 2
                && !lt.alleles.iter().any(|a| a.saturated)
            {
                let call = cx.h.call(
                    "get_project_sample_calls",
                    json!({ "project_id": gt, "sample_id": sid }),
                );
                let locus = call["loci"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|l| l["locus_id"] == lid)
                    .unwrap()
                    .clone();
                for (b, truth) in pairs {
                    let pk = locus["called"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|c| c["bin_id"] == b)
                        .cloned()
                        .unwrap_or(Value::Null);
                    if let (Some(c), Some(u)) = (
                        pk["corrected_relative_quantification"].as_f64(),
                        pk["relative_quantification"].as_f64(),
                    ) {
                        s.prop_err.push(((c - truth).abs(), (u - truth).abs()));
                    }
                }
            }
        }
        // True alleles flagged as crosstalk in the stored peaks (sampled below).
    }
    for (barcode, t) in &cx.study.truth {
        if t.kind != WellKind::Sample || cx.study.mixtures.contains_key(barcode) {
            continue;
        }
        let Some(sid) = cx.ids.iter().find(|(_, b)| *b == barcode).map(|(i, _)| *i) else {
            continue;
        };
        if let Some(Some(m)) = moi.get(&sid) {
            let truth = t.clone_proportions.len() as f64;
            s.moi_total += 1;
            s.moi_exact += u32::from((*m as f64 - truth).abs() < 0.5);
            s.moi_abs_err += (*m as f64 - truth).abs();
            s.moi_obs_exact += u32::from(*m == observable_moi(t));
        }
    }
    s
}

/// MOI the planted data allows one to see: the second-highest count, over
/// loci, of distinct alleles planted at or above 200 RFU (the genotyping
/// height limit); the same estimator the pass applies to calls.
fn observable_moi(t: &WellTruth) -> u64 {
    let mut counts: Vec<u64> = t
        .loci
        .iter()
        .map(|l| l.alleles.iter().filter(|a| a.height >= 200.0).count() as u64)
        .collect();
    counts.sort_unstable();
    if counts.len() >= 2 {
        counts[counts.len() - 2]
    } else {
        0
    }
}

/// What could leak into a planted allele's channel at its size: a ladder
/// fragment, or an allele planted in another dye of the same well.
fn bleed_source(cx: &Ctx, t: &WellTruth, locus: &str, size: f64) -> &'static str {
    let spec = &cx.study.specs[0];
    let near = |a: f64| (a - size).abs() < 1.5;
    let color = spec.loci.iter().find(|l| l.label == locus).map(|l| l.color);
    let other_dye = t.loci.iter().any(|lt| {
        spec.loci
            .iter()
            .find(|l| l.label == lt.locus)
            .is_some_and(|l| Some(l.color) != color)
            && lt.alleles.iter().any(|a| near(a.size))
    });
    if spec.ladder_sizes.iter().any(|&f| near(f)) {
        "under a ladder fragment"
    } else if other_dye {
        "under another dye's allele"
    } else {
        "neither"
    }
}

/// Bleedthrough counts per source: [planted, flagged bleedthrough, no peak].
type BleedCounts = BTreeMap<&'static str, [u32; 3]>;

/// Why planted alleles were not called (reference-run peaks from the peak
/// export), and how the bleedthrough rule treated callable alleles by
/// [`bleed_source`].
fn miss_reasons(cx: &Ctx, gt: i64) -> (BTreeMap<String, (u32, u32)>, BleedCounts) {
    let csv =
        cx.h.call("export_peak_data", json!({ "id": gt, "allow_stale": true }))["content"]
            .as_str()
            .unwrap()
            .to_string();
    let mut rdr = csv::Reader::from_reader(csv.as_bytes());
    let head: Vec<String> = rdr
        .headers()
        .unwrap()
        .iter()
        .map(|s| s.to_string())
        .collect();
    let col = |n: &str| head.iter().position(|h| h == n).unwrap();
    let (cs, cl, csz, ch, cin, ccall, cart, crel, cble, ccro) = (
        col("Sample"),
        col("Locus"),
        col("Peak Size"),
        col("Peak Height"),
        col("In Bin"),
        col("Called Allele"),
        col("Artifact Flag"),
        col("Below Relative Threshold Flag"),
        col("Bleedthrough Flag"),
        col("Crosstalk Flag"),
    );
    let mut peaks: HashMap<(String, String), Vec<csv::StringRecord>> = HashMap::new();
    for r in rdr.records() {
        let r = r.unwrap();
        peaks
            .entry((r[cs].to_string(), r[cl].to_string()))
            .or_default()
            .push(r);
    }
    let mut failed: HashSet<(String, String)> = HashSet::new();
    for (label, &lid) in cx.loci {
        let lc = cx.h.call(
            "get_locus_calls",
            json!({ "project_id": gt, "locus_id": lid }),
        );
        for row in lc["rows"].as_array().unwrap() {
            if row["flags"]["failure"] == true || row["reference_run_id"].is_null() {
                failed.insert((row["barcode"].as_str().unwrap().to_string(), label.clone()));
            }
        }
    }
    // (major misses, callable minor misses) by reason.
    let mut out: BTreeMap<String, (u32, u32)> = BTreeMap::new();
    let mut bleed: BleedCounts = BTreeMap::new();
    for (barcode, t) in &cx.study.truth {
        if t.kind != WellKind::Sample || cx.study.mixtures.contains_key(barcode) || t.spectral_fault
        {
            continue;
        }
        for lt in &t.loci {
            let key = (barcode.clone(), lt.locus.clone());
            let max_h = lt.alleles.iter().map(|a| a.height).fold(0.0, f64::max);
            for a in &lt.alleles {
                let minor = a.height < 0.1 * max_h;
                if a.height < CALLABLE_RFU {
                    continue;
                }
                let src = bleed_source(cx, t, &lt.locus, a.size);
                if !failed.contains(&key) {
                    let pk = peaks.get(&key).and_then(|v| {
                        v.iter()
                            .filter(|r| (r[csz].parse::<f64>().unwrap() - a.size).abs() < 0.8)
                            .max_by(|x, y| {
                                x[ch]
                                    .parse::<f64>()
                                    .unwrap()
                                    .total_cmp(&y[ch].parse::<f64>().unwrap())
                            })
                    });
                    let e = bleed.entry(src).or_default();
                    e[0] += 1;
                    match pk {
                        Some(r) if &r[cble] == "True" => e[1] += 1,
                        None => e[2] += 1,
                        _ => {}
                    }
                }
                let reason = if failed.contains(&key) {
                    "run failed or unusable".to_string()
                } else {
                    match peaks.get(&key).and_then(|v| {
                        v.iter()
                            .filter(|r| (r[csz].parse::<f64>().unwrap() - a.size).abs() < 0.8)
                            .max_by(|x, y| {
                                x[ch]
                                    .parse::<f64>()
                                    .unwrap()
                                    .total_cmp(&y[ch].parse::<f64>().unwrap())
                            })
                    }) {
                        None => format!("no peak (filtered or not found; {src})"),
                        Some(r) if &r[ccall] == "True" => continue,
                        Some(r) => {
                            let mut f = Vec::new();
                            for (c, n) in [
                                (cart, "artifact"),
                                (crel, "relative height"),
                                (cble, "bleedthrough"),
                                (ccro, "crosstalk"),
                            ] {
                                if &r[c] == "True" {
                                    f.push(n);
                                }
                            }
                            if &r[cin] != "True" {
                                f.push("not in bin");
                            }
                            if f.is_empty() {
                                "unflagged, not called (probability)".into()
                            } else if f.contains(&"bleedthrough") {
                                format!("flagged: {} ({src})", f.join("+"))
                            } else {
                                format!("flagged: {}", f.join("+"))
                            }
                        }
                    }
                };
                let e = out.entry(reason).or_default();
                if minor {
                    e.1 += 1;
                } else {
                    e.0 += 1;
                }
            }
        }
    }
    (out, bleed)
}

fn crosstalk_losses(cx: &Ctx, gt: i64, limit: usize) -> (u32, u32) {
    // Of true alleles sitting in a bin, how many were flagged as crosstalk.
    let (mut flagged, mut checked) = (0, 0);
    let rows = cx.h.call("list_project_samples", json!({ "id": gt }));
    for r in rows.as_array().unwrap().iter().take(limit) {
        let sid = r["sample_id"].as_i64().unwrap();
        let barcode = &cx.ids[&sid];
        let t = &cx.study.truth[barcode];
        if t.kind != WellKind::Sample || cx.study.mixtures.contains_key(barcode) || t.spectral_fault
        {
            continue;
        }
        let v = cx.h.call(
            "get_project_sample_calls",
            json!({ "project_id": gt, "sample_id": sid }),
        );
        let _ = v;
        for (label, &lid) in cx.loci {
            let Some(lt) = t.loci.iter().find(|l| &l.locus == label) else {
                continue;
            };
            let d = cx.h.call(
                "get_sample_locus_call",
                json!({ "project_id": gt, "sample_id": sid, "locus_id": lid }),
            );
            for a in &lt.alleles {
                if a.height < CALLABLE_RFU {
                    continue;
                }
                if let Some(pk) = d["peaks"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter(|p| (p["size"].as_f64().unwrap() - a.size).abs() < 0.8)
                    .max_by(|x, y| {
                        x["height"]
                            .as_f64()
                            .unwrap()
                            .total_cmp(&y["height"].as_f64().unwrap())
                    })
                {
                    checked += 1;
                    flagged += u32::from(pk["flags"]["crosstalk"] == true);
                }
            }
        }
    }
    (flagged, checked)
}

/// Planted prevalence per locus and pool allele (size rounded to 0.1 bp):
/// share of typed samples carrying it.
fn planted_prevalence(cx: &Ctx) -> HashMap<String, HashMap<i64, f64>> {
    let mut count: HashMap<String, HashMap<i64, f64>> = HashMap::new();
    let mut typed: HashMap<String, f64> = HashMap::new();
    for (barcode, t) in &cx.study.truth {
        if t.kind != WellKind::Sample || cx.study.mixtures.contains_key(barcode) || t.spectral_fault
        {
            continue;
        }
        for lt in &t.loci {
            if lt.alleles.is_empty() {
                continue;
            }
            *typed.entry(lt.locus.clone()).or_default() += 1.0;
            for a in &lt.alleles {
                *count
                    .entry(lt.locus.clone())
                    .or_default()
                    .entry((a.size * 10.0).round() as i64)
                    .or_default() += 1.0;
            }
        }
    }
    for (l, m) in count.iter_mut() {
        for v in m.values_mut() {
            *v /= typed[l];
        }
    }
    count
}

fn prevalence_near(prev: &HashMap<i64, f64>, size: f64) -> f64 {
    prev.iter()
        .filter(|(k, _)| (**k as f64 / 10.0 - size).abs() < 0.8)
        .map(|(_, v)| *v)
        .fold(0.0, f64::max)
}

/// False calls after the probabilistic pass, by the sample's model MOI,
/// planted clone count, whether the call sits on a stutter position of a
/// planted allele, which rule called it, and whether it is the "common
/// stutter in a low-MOI sample" case (model MOI 1, on stutter, its bin more
/// prevalent than every planted allele of the sample at the locus).
fn false_breakdown(cx: &Ctx, gt: i64, soft_sd: f64, threshold: f64) -> BTreeMap<String, u32> {
    let prev = planted_prevalence(cx);
    let rows = cx.h.call("list_project_samples", json!({ "id": gt }));
    let moi: HashMap<i64, Option<u64>> = rows
        .as_array()
        .unwrap()
        .iter()
        .map(|r| (r["sample_id"].as_i64().unwrap(), r["moi"].as_u64()))
        .collect();
    let repeat: HashMap<String, f64> = cx.study.specs[0]
        .loci
        .iter()
        .map(|l| (l.label.clone(), l.repeat_length))
        .collect();
    let mut out: BTreeMap<String, u32> = BTreeMap::new();
    for (label, &lid) in cx.loci {
        let lc = cx.h.call(
            "get_locus_calls",
            json!({ "project_id": gt, "locus_id": lid }),
        );
        let bins: HashMap<i64, f64> = lc["bins"]
            .as_array()
            .unwrap()
            .iter()
            .map(|b| (id(b), b["base_size"].as_f64().unwrap()))
            .collect();
        for row in lc["rows"].as_array().unwrap() {
            let sid = row["sample_id"].as_i64().unwrap();
            let barcode = &cx.ids[&sid];
            let t: &WellTruth = &cx.study.truth[barcode];
            if t.kind != WellKind::Sample
                || cx.study.mixtures.contains_key(barcode)
                || t.spectral_fault
            {
                continue;
            }
            let Some(lt) = t.loci.iter().find(|l| &l.locus == label) else {
                continue;
            };
            let rep = repeat[label];
            let called: Vec<(i64, f64)> = row["alleles"]
                .as_array()
                .unwrap()
                .iter()
                .map(|a| {
                    let b = a["bin_id"].as_i64().unwrap();
                    (b, bins.get(&b).copied().unwrap_or(f64::NAN))
                })
                .collect();
            let false_bins: Vec<(i64, f64)> = called
                .iter()
                .filter(|(_, size)| !lt.alleles.iter().any(|a| (size - a.size).abs() < rep / 2.0))
                .copied()
                .collect();
            if false_bins.is_empty() {
                continue;
            }
            let d = cx.h.call(
                "get_sample_locus_call",
                json!({ "project_id": gt, "sample_id": sid, "locus_id": lid }),
            );
            let planted: Vec<f64> = lt.alleles.iter().map(|a| a.size).collect();
            let max_real_prev = planted
                .iter()
                .map(|&a| prevalence_near(&prev[label], a))
                .fold(0.0, f64::max);
            for (b, size) in false_bins {
                let pk = d["peaks"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter(|p| p["bin_id"].as_i64() == Some(b) && p["in_bin"] == true)
                    .max_by(|x, y| {
                        x["height"]
                            .as_f64()
                            .unwrap()
                            .total_cmp(&y["height"].as_f64().unwrap())
                    });
                let rule = match pk {
                    Some(p) => {
                        let prob = p["probability"].as_f64().unwrap_or(0.0);
                        let z = (p["height"].as_f64().unwrap()
                            - p["artifact_contribution"].as_f64().unwrap())
                            / p["artifact_error"].as_f64().unwrap().max(1.0);
                        if prob >= threshold {
                            if z > soft_sd {
                                "both"
                            } else {
                                "probability"
                            }
                        } else {
                            "soft SD"
                        }
                    }
                    None => "no peak",
                };
                let stutter = on_stutter(size, &planted, rep);
                let m = moi.get(&sid).copied().flatten();
                let common = prevalence_near(&prev[label], size) > max_real_prev;
                let mech = m == Some(1) && stutter && common;
                *out.entry(format!(
                    "model MOI {} | clones {} | {} | {} | common-stutter-in-MOI-1 {}",
                    m.map_or("-".into(), |v| v.to_string()),
                    t.clone_proportions.len(),
                    if stutter { "on stutter" } else { "off stutter" },
                    rule,
                    if mech { "yes" } else { "no" }
                ))
                .or_default() += 1;
            }
        }
    }
    out
}

fn main_found(results: &BTreeMap<String, Score>) -> u32 {
    let m = &results["defaults: after probabilities"];
    m.found[MAJOR_CALLABLE] + m.found[MINOR_CALLABLE]
}

fn print(name: &str, s: &Score) {
    let mut line = format!("{name:<44}");
    for k in 0..7 {
        line.push_str(&format!(
            " {:>5.1}% ({:>4}/{:<4})",
            100.0 * s.recall(k),
            s.found[k],
            s.truth[k]
        ));
    }
    line.push_str(&format!(
        " | precision {:>5.1}% ({} false of {})",
        100.0 * s.precision(),
        s.false_calls,
        s.calls
    ));
    println!("{line}");
}

fn analyze(h: &Harness, id: i64) {
    let r = h.call("analyze_project", json!({ "id": id }));
    for l in r["loci"].as_array().unwrap() {
        for w in l["warnings"].as_array().unwrap() {
            println!("  warning: {}", w.as_str().unwrap());
        }
    }
}

#[test]
fn genotyping_recovers_planted_alleles() {
    let dir = tempfile::tempdir().unwrap();
    let h = Harness::new(&dir.path().join("state"));
    let study = study_with(dir.path(), 6, 4100, true);
    h.call(
        "new_workspace",
        json!({ "path": dir.path().join("acc").to_str() }),
    );
    let (set_id, loci) = load_study(&h, &study);
    let by_barcode = samples(&h);
    let ids: HashMap<i64, String> = by_barcode.iter().map(|(b, i)| (*i, b.clone())).collect();
    let cx = Ctx {
        h: &h,
        study: &study,
        loci: &loci,
        ids,
    };

    // Estimators over every sample.
    let be = id(&h.call(
        "create_project",
        json!({ "kind": "bin_estimator", "title": "Bins", "locus_set_id": set_id }),
    ));
    analyze(&h, be);
    let ae = id(&h.call(
        "create_project",
        json!({ "kind": "artifact_estimator", "title": "Artifacts", "locus_set_id": set_id, "bin_estimator_id": be }),
    ));
    analyze(&h, ae);
    // The estimator as it was before the densest-half fit and the majority
    // rule: MAD error, classes in a fifth of mono-allelic runs.
    let ae_prev = id(&h.call(
        "duplicate_project",
        json!({ "id": ae, "title": "Artifacts (MAD error, run fraction 0.2)" }),
    ));
    h.call(
        "update_project_locus_params",
        json!({ "project_id": ae_prev, "params": { "artifact": { "error_estimator": "mad", "min_artifact_run_fraction": 0.2 } } }),
    );
    analyze(&h, ae_prev);
    let ae_mad = id(&h.call(
        "duplicate_project",
        json!({ "id": ae, "title": "Artifacts (MAD error)" }),
    ));
    h.call(
        "update_project_locus_params",
        json!({ "project_id": ae_mad, "params": { "artifact": { "error_estimator": "mad" } } }),
    );
    analyze(&h, ae_mad);
    // The artifact estimator without the 100 RFU estimator floor (the old
    // application's default): every noise maximum reaches the model.
    let ae0 = id(&h.call(
        "duplicate_project",
        json!({ "id": ae, "title": "Artifacts (0 RFU floor)" }),
    ));
    h.call(
        "update_project_locus_params",
        json!({ "project_id": ae0, "params": { "filter": { "min_peak_height": 0.0 } } }),
    );
    analyze(&h, ae0);
    // The artifact estimator filtering crosstalk at 100× like calling
    // projects, instead of its 10× default.
    let ae_x100 = id(&h.call(
        "duplicate_project",
        json!({ "id": ae, "title": "Artifacts (crosstalk filter 100)" }),
    ));
    h.call(
        "update_project_locus_params",
        json!({ "project_id": ae_x100, "params": { "filter": { "max_crosstalk": 100.0 } } }),
    );
    analyze(&h, ae_x100);
    if std::env::var("ACC_DEBUG").is_ok() {
        for (l, est) in study.specs[0].loci.iter().flat_map(|l| [(l, ae), (l, ae0)]) {
            let v = h.call(
                "get_locus_artifact_estimators",
                json!({ "project_id": est, "locus_id": loci[&l.label] }),
            );
            println!(
                "{} (estimator {est}) mono-allelic runs {}",
                l.label, v["mono_allelic_runs"]
            );
            for e in v["estimators"].as_array().unwrap() {
                let eq: Vec<String> = e["equations"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|q| {
                        format!(
                            "[{:.0}-{:.0} {} slope {:.5} int {:.3} sd {:.3} n {}]",
                            q["segment"]["start_size"].as_f64().unwrap(),
                            q["segment"]["end_size"].as_f64().unwrap(),
                            q["segment"]["method"],
                            q["fit"]["slope"].as_f64().unwrap(),
                            q["fit"]["intercept"].as_f64().unwrap(),
                            q["fit"]["sd"].as_f64().unwrap(),
                            q["n_points"]
                        )
                    })
                    .collect();
                println!(
                    "   {:>16} buf {:?} points {:>4} {}",
                    e["label"].as_str().unwrap(),
                    e["artifact_distance_buffer"].as_f64(),
                    e["points"].as_array().unwrap().len(),
                    eq.join(" ")
                );
            }
        }
    }

    // Bin quality: every pool allele has a bin within 0.5 bp.
    let mut bin_offsets = Vec::new();
    for l in &study.specs[0].loci {
        let bins = h.call(
            "get_locus_bins",
            json!({ "project_id": be, "locus_id": loci[&l.label] }),
        )["bins"]
            .clone();
        for &a in &l.alleles {
            let d = bins
                .as_array()
                .unwrap()
                .iter()
                .map(|b| (b["base_size"].as_f64().unwrap() - a).abs())
                .fold(f64::INFINITY, f64::min);
            bin_offsets.push(d);
            assert!(
                d < 0.5,
                "{}: no bin near allele {a} (nearest {d:.2} bp)",
                l.label
            );
        }
    }

    // Controls: the three strains, alleles at the nearest bins.
    let mut control_ids = Vec::new();
    for (s, name) in STRAINS.iter().enumerate() {
        let mut alleles = Vec::new();
        for l in &study.specs[0].loci {
            let size = l.alleles[STRAIN_ALLELE_INDEX[s]];
            let bins = h.call(
                "get_locus_bins",
                json!({ "project_id": be, "locus_id": loci[&l.label] }),
            )["bins"]
                .clone();
            let b = bins
                .as_array()
                .unwrap()
                .iter()
                .min_by(|x, y| {
                    (x["base_size"].as_f64().unwrap() - size)
                        .abs()
                        .total_cmp(&(y["base_size"].as_f64().unwrap() - size).abs())
                })
                .unwrap();
            alleles.push(json!({ "locus_id": loci[&l.label], "bin_id": id(b) }));
        }
        control_ids.push(id(&h.call(
            "create_control",
            json!({ "bin_estimator_id": be, "label": name, "alleles": alleles }),
        )));
    }
    let qb = id(&h.call(
        "create_project",
        json!({ "kind": "quant_bias_estimator", "title": "Bias", "locus_set_id": set_id,
                "bin_estimator_id": be, "artifact_estimator_id": ae }),
    ));
    let r = h.call(
        "import_control_mixtures_csv",
        json!({ "id": qb, "content": mixtures_csv(&study) }),
    );
    assert_eq!(r["added"], 17);
    analyze(&h, qb);
    println!("\nβ per locus (planted: 2γ of each locus's profile):");
    let mut betas = Vec::new();
    let mut used3_total = 0;
    for l in &study.specs[0].loci {
        let v = h.call(
            "get_locus_quant_bias",
            json!({ "project_id": qb, "locus_id": loci[&l.label] }),
        );
        let e = &v["estimate"];
        let planted = -2.0 * l.profile().bias * study.specs[0].amp_bias;
        println!(
            "  {:<5} β = {:>8.5} (planted {planted:.5})  SD {:.3}  R² {:.2}  runs {}",
            l.label,
            e["beta"].as_f64().unwrap_or(f64::NAN),
            e["sd"].as_f64().unwrap_or(f64::NAN),
            e["r_squared"].as_f64().unwrap_or(f64::NAN),
            e["n_sets"]
        );
        betas.push((e["beta"].as_f64().unwrap(), planted));
        // Three-strain controls enter the fit.
        let used3 = v["mixtures"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|m| m["used"] == true && m["components"].as_array().unwrap().len() == 3)
            .count();
        println!("        three-strain mixtures used: {used3}");
        if std::env::var("ACC_DEBUG_QB").is_ok() {
            for m in v["mixtures"].as_array().unwrap() {
                if m["components"].as_array().unwrap().len() == 3 {
                    println!("        {m}");
                }
            }
        }
        assert!(used3 >= 1, "{}: no three-strain mixture used", l.label);
        used3_total += used3;
    }
    // Long alleles amplify less, so a minor long allele can fall under the
    // fit's 1,000 RFU minimum; most three-strain mixtures still enter.
    assert!(used3_total >= 15, "{used3_total} of 30 three-strain fits");

    // Genotyping: every sample of the study (NTCs come in as negative controls).
    let sample_ids: Vec<i64> = by_barcode
        .iter()
        .filter(|(b, _)| !study.mixtures.contains_key(*b))
        .map(|(_, i)| *i)
        .collect();
    let gt = id(&h.call(
        "create_project",
        json!({ "kind": "genotyping", "title": "With artifacts", "locus_set_id": set_id,
                "bin_estimator_id": be, "artifact_estimator_id": ae, "quant_bias_estimator_id": qb }),
    ));
    h.call(
        "add_project_samples",
        json!({ "id": gt, "sample_ids": sample_ids }),
    );
    let plain = id(&h.call(
        "duplicate_project",
        json!({ "id": gt, "title": "Without artifacts" }),
    ));
    h.call(
        "update_project",
        json!({ "id": plain, "artifact_estimator_id": null }),
    );
    // Comparison rows: each default against the value it replaced, alone and
    // all together.
    let variant = |title: &str, artifact: Option<i64>, params: Value| {
        let p = id(&h.call("duplicate_project", json!({ "id": gt, "title": title })));
        if let Some(a) = artifact {
            h.call(
                "update_project",
                json!({ "id": p, "artifact_estimator_id": a }),
            );
        }
        if params != json!({}) {
            h.call(
                "update_project_locus_params",
                json!({ "project_id": p, "params": params }),
            );
        }
        p
    };
    let prev_limits = json!({ "genotyping": { "measured_pullup": false, "bleedthrough_filter_limit": 10.0, "crosstalk_filter_limit": 50.0,
        "absolute_peak_height_limit": 300.0, "probability_threshold": 0.9 } });
    let mut configs: Vec<(String, i64)> = vec![
        ("defaults".into(), gt),
        ("no artifact model".into(), plain),
        (
            "MAD class error".into(),
            variant("MAD class error", Some(ae_mad), json!({})),
        ),
        (
            "MAD error, run fraction 0.2".into(),
            variant("MAD error, run fraction 0.2", Some(ae_prev), json!({})),
        ),
        (
            "fixed bleedthrough 5".into(),
            variant(
                "Fixed bleedthrough 5",
                None,
                json!({ "genotyping": { "measured_pullup": false, "bleedthrough_filter_limit": 5.0 } }),
            ),
        ),
        (
            "bleedthrough flag 10".into(),
            variant(
                "Bleedthrough 10",
                None,
                json!({ "genotyping": { "measured_pullup": false, "bleedthrough_filter_limit": 10.0 } }),
            ),
        ),
        (
            "crosstalk flag 50".into(),
            variant(
                "Crosstalk 50",
                None,
                json!({ "genotyping": { "crosstalk_filter_limit": 50.0 } }),
            ),
        ),
        (
            "height 300, probability 0.9".into(),
            variant(
                "Height 300, probability 0.9",
                None,
                json!({ "genotyping": { "absolute_peak_height_limit": 300.0, "probability_threshold": 0.9 } }),
            ),
        ),
        (
            "previous defaults together".into(),
            variant("Previous defaults", Some(ae_prev), prev_limits),
        ),
        // Bleedthrough rule off (filter and flag), to count what it costs
        // now that true alleles can sit under ladder peaks and other dyes'
        // alleles.
        (
            "bleedthrough off".into(),
            variant(
                "Bleedthrough off",
                None,
                json!({ "filter": { "max_bleedthrough": 1e9 }, "genotyping": { "measured_pullup": false, "bleedthrough_filter_limit": 1e9 } }),
            ),
        ),
        (
            "artifact estimator crosstalk filter 100".into(),
            variant("Artifact estimator crosstalk 100", Some(ae_x100), json!({})),
        ),
        (
            "estimator floor 0 RFU".into(),
            variant("Artifact estimator floor 0 RFU", Some(ae0), json!({})),
        ),
    ];
    // Crosstalk grid: (genotyping crosstalk_filter_limit, filter
    // max_crosstalk). The filter drops peaks before the flag is checked, so a
    // flag limit above the filter limit has no effect.
    if std::env::var("ACC_CROSSTALK_GRID").is_ok() {
        for (flag, filter) in [(5.0, 10.0), (10.0, 100.0), (250.0, 1000.0), (1e9, 1e9)] {
            let title = if filter >= 1e9 {
                "crosstalk off".to_string()
            } else {
                format!("crosstalk {flag} / {filter}")
            };
            let p = variant(
                &title,
                None,
                json!({ "filter": { "max_crosstalk": filter }, "genotyping": { "crosstalk_filter_limit": flag } }),
            );
            configs.push((title, p));
        }
    }
    // Bleedthrough grid: (genotyping bleedthrough_filter_limit, filter
    // max_bleedthrough).
    if std::env::var("ACC_BLEED_GRID").is_ok() {
        for (flag, filter) in [(5.0, 10.0), (10.0, 30.0), (20.0, 30.0)] {
            let title = format!("bleedthrough {flag} / {filter}");
            let p = variant(
                &title,
                None,
                json!({ "filter": { "max_bleedthrough": filter }, "genotyping": { "bleedthrough_filter_limit": flag } }),
            );
            configs.push((title, p));
        }
    }

    let mut results: BTreeMap<String, Score> = BTreeMap::new();
    for (name, p) in configs.iter().map(|(n, p)| (n.as_str(), *p)) {
        analyze(&h, p);
        results.insert(format!("{name}: per-locus calls"), score(&cx, p));
        h.call("calculate_peak_probabilities", json!({ "id": p }));
        results.insert(format!("{name}: after probabilities"), score(&cx, p));
    }
    let false_calls = false_breakdown(&cx, gt, 6.0, 0.8);
    let (xf, xc) = crosstalk_losses(&cx, gt, 200);
    let (reasons, bleed) = miss_reasons(&cx, gt);

    println!("\nRecall by category (found/planted), precision of calls:");
    let mut head = format!("{:<44}", "configuration");
    for c in CATS {
        head.push_str(&format!(" {c:>21}"));
    }
    println!("{head}");
    for (k, s) in &results {
        print(k, s);
    }
    println!("\nSummary: recall of callable (≥300 RFU) alleles and precision, per-locus calls → after probabilities");
    println!(
        "{:<52} {:>17} {:>17} {:>17} {:>17}",
        "configuration", "major", "minor", "minor on stutter", "precision"
    );
    let names: BTreeSet<&str> = results
        .keys()
        .filter_map(|k| k.strip_suffix(": per-locus calls"))
        .collect();
    for n in names {
        let (a, b) = (
            &results[&format!("{n}: per-locus calls")],
            &results[&format!("{n}: after probabilities")],
        );
        let pair = |x: f64, y: f64| format!("{:>6.1} → {:>5.1}%", 100.0 * x, 100.0 * y);
        println!(
            "{n:<52} {:>17} {:>17} {:>17} {:>17}",
            pair(a.recall(MAJOR_CALLABLE), b.recall(MAJOR_CALLABLE)),
            pair(a.recall(MINOR_CALLABLE), b.recall(MINOR_CALLABLE)),
            pair(
                a.recall(MINOR_CALLABLE_STUTTER),
                b.recall(MINOR_CALLABLE_STUTTER)
            ),
            pair(a.precision(), b.precision()),
        );
    }
    let main = &results["defaults: after probabilities"];
    println!(
        "\nProportions on exactly-called mixed sample × loci ({}): MAE corrected {:.4}, uncorrected {:.4}",
        main.prop_err.len(),
        main.mae(true),
        main.mae(false)
    );
    for (k, s) in &results {
        if k.ends_with("after probabilities") {
            println!(
                "MOI ({k}): equals planted clone count {:.1}%, observable MOI {:.1}% (of {}); mean abs error vs clone count {:.2}",
                100.0 * f64::from(s.moi_exact) / f64::from(s.moi_total.max(1)),
                100.0 * f64::from(s.moi_obs_exact) / f64::from(s.moi_total.max(1)),
                s.moi_total,
                s.moi_abs_err / f64::from(s.moi_total.max(1))
            );
        }
    }
    println!(
        "Crosstalk flag on true callable alleles (first 200 samples, default limits): {xf} of {xc}"
    );
    println!(
        "Spectral fault: {} of {} sample × locus calls in faulty capillaries flagged; {} flagged elsewhere",
        main.spectral_flagged.0, main.fault_calls, main.spectral_flagged.1
    );
    println!(
        "\nWhy planted alleles ≥300 RFU were missed (defaults, after probabilities): major / minor"
    );
    for (r, (a, b)) in &reasons {
        println!("  {r:<40} {a:>5} / {b}");
    }
    println!("\nBleedthrough rule on true alleles ≥300 RFU by what sits under them (defaults, after probabilities):");
    println!(
        "  {:<34} {:>8} {:>18} {:>22}",
        "source", "planted", "flagged", "filtered out (no peak)"
    );
    for (src, b) in &bleed {
        println!("  {src:<34} {:>8} {:>18} {:>22}", b[0], b[1], b[2]);
    }
    let off = &results["bleedthrough off: after probabilities"];
    println!(
        "  bleedthrough off: callable alleles found {} vs {} (major {} vs {}, minor {} vs {}), false calls {} vs {}",
        off.found[MAJOR_CALLABLE] + off.found[MINOR_CALLABLE],
        main_found(&results),
        off.found[MAJOR_CALLABLE],
        main.found[MAJOR_CALLABLE],
        off.found[MINOR_CALLABLE],
        main.found[MINOR_CALLABLE],
        off.false_calls,
        main.false_calls,
    );
    println!("\nFalse calls after the pass (defaults): sample MOI | planted clones | position | rule that called it | common stutter in an MOI 1 sample");
    for (k, n) in &false_calls {
        println!("  {n:>4}  {k}");
    }
    println!(
        "Bins: every pool allele binned; max offset {:.2} bp",
        bin_offsets.iter().cloned().fold(0.0, f64::max)
    );

    // Floors (defaults, after probabilities). Regressions below these fail
    // the test.
    let pre = &results["defaults: per-locus calls"];
    let noart = &results["no artifact model: per-locus calls"];
    let after = |n: &str| &results[&format!("{n}: after probabilities")];
    let floor = |s: &Score, k: usize, min: f64| {
        assert!(
            s.recall(k) > min,
            "{}: recall {:.3} ≤ {min}",
            CATS[k],
            s.recall(k)
        );
    };
    floor(main, MAJOR_CALLABLE, 0.97);
    floor(main, MINOR_CALLABLE, 0.87);
    floor(main, MINOR_CALLABLE_STUTTER, 0.93);
    floor(pre, MINOR_CALLABLE_STUTTER, 0.93);
    assert!(
        main.precision() > 0.994,
        "precision {:.4}",
        main.precision()
    );
    assert!(
        pre.precision() > 0.978,
        "precision before probabilities {:.4}",
        pre.precision()
    );
    // Without the artifact model stutter is called as alleles.
    assert!(noart.precision() < 0.8 && pre.precision() > noart.precision() + 0.15);
    // Why the defaults are what they are. The densest-half fit keeps
    // stutter classes on the stutter, where the MAD fit is raised by minor
    // alleles hidden in runs that passed as mono-allelic; with a fifth of
    // runs enough to make a class, minor clones' spacings become classes.
    let mad = after("MAD class error");
    assert!(
        main.found[MINOR_CALLABLE] >= mad.found[MINOR_CALLABLE],
        "densest half {} vs MAD {}",
        main.found[MINOR_CALLABLE],
        mad.found[MINOR_CALLABLE]
    );
    let prev = after("MAD error, run fraction 0.2");
    assert!(main.found[MINOR_CALLABLE] >= prev.found[MINOR_CALLABLE]);
    // Pull-up reaches 14% of the source on the study's instrument (ratio
    // 7): a fixed flag at 10 lets it through, whereas measured pull-up and
    // fixed 5 catch it.
    let bl10 = after("bleedthrough flag 10");
    assert!(
        bl10.false_calls >= main.false_calls + 10,
        "bleedthrough 10: {} false calls, defaults {}",
        bl10.false_calls,
        main.false_calls
    );
    let fx5 = after("fixed bleedthrough 5");
    assert!(
        main.found[MINOR_CALLABLE] >= fx5.found[MINOR_CALLABLE]
            && main.false_calls <= fx5.false_calls + 2,
        "measured pull-up vs fixed 5: found minor {} vs {}, false {} vs {}",
        main.found[MINOR_CALLABLE],
        fx5.found[MINOR_CALLABLE],
        main.false_calls,
        fx5.false_calls
    );
    // The previous height limit and probability threshold cost minor alleles.
    let old = after("height 300, probability 0.9");
    assert!(main.found[MINOR_CALLABLE] >= old.found[MINOR_CALLABLE] + 10);
    let all_prev = after("previous defaults together");
    assert!(main.found[MINOR_CALLABLE] >= all_prev.found[MINOR_CALLABLE] + 10);
    assert!(main.found[MAJOR_CALLABLE] > all_prev.found[MAJOR_CALLABLE]);
    // Leaked neighbor alleles in the artifact estimator hide true minor
    // alleles.
    let ax = after("artifact estimator crosstalk filter 100");
    assert!(main.recall(MINOR_CALLABLE) > ax.recall(MINOR_CALLABLE) + 0.5);
    // Faulty capillaries are flagged and healthy ones are not.
    assert!(
        main.fault_calls >= 30,
        "{} calls in faulty capillaries",
        main.fault_calls
    );
    assert!(
        main.spectral_flagged.0 * 3 >= main.fault_calls,
        "{} of {} faulty-capillary calls flagged",
        main.spectral_flagged.0,
        main.fault_calls
    );
    assert_eq!(
        main.spectral_flagged.1, 0,
        "spectral flags in healthy capillaries"
    );
    // Bias correction recovers proportions.
    assert!(
        main.mae(true) < 0.6 * main.mae(false),
        "bias correction should improve proportions"
    );
    assert!(
        main.mae(true) < 0.009,
        "corrected MAE {:.4}",
        main.mae(true)
    );
    // MOI matches what the data can show.
    assert!(
        f64::from(main.moi_obs_exact) / f64::from(main.moi_total.max(1)) > 0.92,
        "observable MOI exact rate"
    );
    // The study exercises bleedthrough against true alleles, and the rule
    // only ever removes calls.
    for src in ["under a ladder fragment", "under another dye's allele"] {
        assert!(bleed.get(src).is_some_and(|b| b[0] >= 100), "{src}");
    }
    let off = after("bleedthrough off");
    assert!(off.found[MAJOR_CALLABLE] >= main.found[MAJOR_CALLABLE]);
    // β per locus: close to the planted value where the controls' alleles
    // are clear; PfG1's sit under a ladder fragment and another dye's allele.
    for &(b, planted) in &betas {
        assert!(
            (b - planted).abs() < 0.4 * planted.abs(),
            "β {b} (planted {planted})"
        );
    }
    let close = betas
        .iter()
        .filter(|(b, p)| (b - p).abs() < 0.05 * p.abs())
        .count();
    assert!(
        close >= 5,
        "{close} of {} loci with β within 5%",
        betas.len()
    );
}

#[test]
fn measured_pullup_handles_clean_high_leak_and_unmeasured_plates() {
    use microspat_core::synth::{generate_plate, FixedWell, SynthClone, SynthSpec};
    use microspat_engine::api::demo::write_zip;

    let dir = tempfile::tempdir().unwrap();
    let h = Harness::new(&dir.path().join("state"));
    let ws_path = dir.path().join("pu.microspat");
    h.call("new_workspace", json!({ "path": ws_path.to_str() }));
    let ladder = h
        .call("list_ladders", Value::Null)
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["label"] == "HD ROX 400")
        .unwrap()["id"]
        .as_i64()
        .unwrap();

    let base_spec = SynthSpec::study(2029);
    let mut loci = HashMap::new();
    for l in &base_spec.loci {
        let v = h.call(
            "create_locus",
            json!({
                "label": l.label, "color": l.color,
                "min_base_length": l.min_size, "max_base_length": l.max_size,
                "nucleotide_repeat_length": l.repeat_length
            }),
        );
        loci.insert(l.label.clone(), id(&v));
    }
    let set_id = id(&h.call(
        "create_locus_set",
        json!({ "label": "Panel", "locus_ids": loci.values().collect::<Vec<_>>() }),
    ));

    // Clean plate (0.2% B->G): A01 and A02 have ~90% PfB1=126.3 and ~10% PfG1=126.3
    // (true minor allele right under a ~6.5-8.5x taller blue peak: passes max_bleedthrough 10, fails fixed 5).
    let mut clean_spec = SynthSpec {
        plate_name: "CLEAN".into(),
        failed_fraction: 0.0,
        saturated_fraction: 0.0,
        amp_bias: 0.0,
        spectral_fault_wells: Vec::new(),
        ..SynthSpec::study(2029)
    };
    clean_spec.baseline.as_mut().unwrap().blue_into_green = Some(0.002);
    for (k, (well, major)) in [("A01", 0.91), ("A02", 0.875)].into_iter().enumerate() {
        clean_spec.fixed_wells.push(FixedWell {
            well: well.into(),
            sample_name: format!("CLEAN-M{}", k + 1),
            clones: vec![
                SynthClone {
                    proportion: major,
                    alleles: vec![126.3, 234.6, 141.7, 305.2, 203.4, 384.4],
                },
                SynthClone {
                    proportion: 1.0 - major,
                    alleles: vec![78.3, 246.6, 126.3, 313.2, 206.4, 393.4],
                },
            ],
        });
    }

    // Leaky foreign plate (25% B->G): B01 and B02 have 100% PfB1=126.3 and NO
    // PfG1=126.7, producing pure 25% pull-up peaks in PfG1 at ratio ~4 (< fixed 5).
    let mut leaky_spec = SynthSpec {
        plate_name: "LEAKY".into(),
        failed_fraction: 0.0,
        saturated_fraction: 0.0,
        amp_bias: 0.0,
        spectral_fault_wells: Vec::new(),
        ..SynthSpec::study(2030)
    };
    leaky_spec.baseline.as_mut().unwrap().blue_into_green = Some(0.25);
    for (k, well) in ["B01", "B02"].into_iter().enumerate() {
        leaky_spec.fixed_wells.push(FixedWell {
            well: well.into(),
            sample_name: format!("LEAKY-P{}", k + 1),
            clones: vec![SynthClone {
                proportion: 1.0,
                alleles: vec![126.3, 234.6, 141.7, 305.2, 203.4, 384.4],
            }],
        });
    }

    let clean_wells = generate_plate(&clean_spec).unwrap();
    let leaky_wells = generate_plate(&leaky_spec).unwrap();
    let clean_zip = dir.path().join("clean.zip");
    let leaky_zip = dir.path().join("leaky.zip");
    write_zip(&clean_zip, &clean_wells).unwrap();
    write_zip(&leaky_zip, &leaky_wells).unwrap();

    let imp = h.call(
        "import_plates",
        json!({ "paths": [clean_zip.to_str(), leaky_zip.to_str()], "ladder_id": ladder }),
    );
    let plates = imp["plates"].as_array().unwrap();
    let clean_id = plates.iter().find(|p| p["label"] == "CLEAN").unwrap()["plate_id"]
        .as_i64()
        .unwrap();
    let leaky_id = plates.iter().find(|p| p["label"] == "LEAKY").unwrap()["plate_id"]
        .as_i64()
        .unwrap();

    let map_for = |prefix: &str, spec: &SynthSpec, wells: &[microspat_core::synth::SynthWell]| {
        let mut s = format!(
            "Well,{}\n",
            spec.loci
                .iter()
                .map(|l| l.label.as_str())
                .collect::<Vec<_>>()
                .join(",")
        );
        for w in wells {
            s.push_str(&w.well);
            for _ in &spec.loci {
                s.push(',');
                s.push_str(&format!("{prefix}-{}", w.truth.sample_name));
            }
            s.push('\n');
        }
        s
    };
    h.call(
        "apply_plate_map",
        json!({ "plate_id": clean_id, "content": map_for("C", &clean_spec, &clean_wells), "create_samples": true }),
    );
    h.call(
        "apply_plate_map",
        json!({ "plate_id": leaky_id, "content": map_for("L", &leaky_spec, &leaky_wells), "create_samples": true }),
    );

    let be = id(&h.call(
        "create_project",
        json!({ "kind": "bin_estimator", "title": "Bins", "locus_set_id": set_id, "all_samples": true }),
    ));
    analyze(&h, be);

    let sample_ids: Vec<i64> = h
        .call("list_samples", Value::Null)
        .as_array()
        .unwrap()
        .iter()
        .filter(|s| s["designation"] == "sample")
        .map(id)
        .collect();
    let by_barcode: HashMap<String, i64> = h
        .call("list_samples", Value::Null)
        .as_array()
        .unwrap()
        .iter()
        .map(|s| (s["barcode"].as_str().unwrap().to_string(), id(s)))
        .collect();

    let gt = id(&h.call(
        "create_project",
        json!({ "kind": "genotyping", "title": "Measured", "locus_set_id": set_id, "bin_estimator_id": be }),
    ));
    h.call(
        "add_project_samples",
        json!({ "id": gt, "sample_ids": sample_ids }),
    );
    analyze(&h, gt);

    let fixed5 = id(&h.call("duplicate_project", json!({ "id": gt, "title": "Fixed 5" })));
    h.call(
        "update_project_locus_params",
        json!({ "project_id": fixed5, "params": { "genotyping": { "measured_pullup": false, "bleedthrough_filter_limit": 5.0 } } }),
    );
    analyze(&h, fixed5);

    let pfg1 = loci["PfG1"];
    let bins = h.call(
        "get_locus_bins",
        json!({ "project_id": be, "locus_id": pfg1 }),
    )["bins"]
        .as_array()
        .unwrap()
        .clone();
    let b127 = id(bins
        .iter()
        .find(|b| (b["base_size"].as_f64().unwrap() - 126.7).abs() < 0.6)
        .expect("PfG1 bin near 126.7"));
    let b142 = id(bins
        .iter()
        .find(|b| (b["base_size"].as_f64().unwrap() - 141.7).abs() < 0.6)
        .expect("PfG1 bin near 141.7"));

    let called_bins = |proj: i64, sample: &str| -> BTreeSet<i64> {
        let lc = h.call(
            "get_locus_calls",
            json!({ "project_id": proj, "locus_id": pfg1 }),
        );
        let sid = by_barcode[sample];
        lc["rows"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["sample_id"] == sid)
            .unwrap()["alleles"]
            .as_array()
            .unwrap()
            .iter()
            .map(|a| a["bin_id"].as_i64().unwrap())
            .collect()
    };

    // 1. Measured pull-up calls clean-plate minor 126.3 (bin 126.7) under tall blue 126.3 AND rejects
    //    25% pull-up at 126.7 on the leaky plate; fixed limit 5 fails both!
    for s in ["C-CLEAN-M1", "C-CLEAN-M2"] {
        assert!(
            called_bins(gt, s).contains(&b127),
            "{s} missed clean minor under measured pull-up"
        );
        assert!(
            !called_bins(fixed5, s).contains(&b127),
            "{s} unexpectedly passed fixed 5"
        );
    }
    for s in ["L-LEAKY-P1", "L-LEAKY-P2"] {
        let called = called_bins(gt, s);
        assert!(called.contains(&b142), "{s} missed planted allele 141.7");
        assert!(
            !called.contains(&b127),
            "{s} false pull-up under measured pull-up: {called:?}"
        );
        assert!(
            called_bins(fixed5, s).contains(&b127),
            "{s} expected fixed 5 to miss 25% pull-up"
        );
    }

    // `get_sample_locus_call` exposes plate pull-up on checked wells.
    let sl = h.call(
        "get_sample_locus_call",
        json!({ "project_id": gt, "sample_id": by_barcode["L-LEAKY-P1"], "locus_id": pfg1 }),
    );
    let pu = sl["runs"][0]["plate_pull_up"].as_array().unwrap();
    let bg = pu.iter().find(|e| e["source"] == "blue").unwrap();
    assert!(
        (bg["fraction"].as_f64().unwrap() - 0.25).abs() < 0.02,
        "{bg}"
    );

    // 2. Unchecked plate: delete plate_quality for LEAKY -> gt becomes stale with
    //    PlateQuality reason, get_project & analyze_project warn about LEAKY, and LEAKY falls
    //    back to fixed limit 5 while checked CLEAN still uses measured pull-up.
    h.engine.close_workspace();
    {
        let c = rusqlite::Connection::open(&ws_path).unwrap();
        c.execute("DELETE FROM plate_quality WHERE plate_id = ?1", [leaky_id])
            .unwrap();
    }
    h.call("open_workspace", json!({ "path": ws_path.to_str() }));
    let det = h.call("get_project", json!({ "id": gt }));
    assert!(
        det["upstream_warnings"]
            .as_array()
            .unwrap()
            .iter()
            .any(|w| w.as_str().unwrap().contains("LEAKY")),
        "{}",
        det["upstream_warnings"]
    );
    let g1_status = det["loci"]
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["locus_id"] == pfg1)
        .unwrap()["status"]
        .clone();
    assert_eq!(g1_status["state"], "stale");
    assert!(g1_status["reasons"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r.as_str().unwrap().contains("Plate quality")));

    let an = h.call("analyze_project", json!({ "id": gt, "locus_ids": [pfg1] }));
    assert!(an["loci"][0]["warnings"]
        .as_array()
        .unwrap()
        .iter()
        .any(|w| w.as_str().unwrap().contains("LEAKY")));
    assert!(called_bins(gt, "L-LEAKY-P1").contains(&b127));
    assert!(called_bins(gt, "C-CLEAN-M1").contains(&b127));

    // 3. Unmeasured dye pair on a checked plate: clear Blue->Green fraction on CLEAN's
    //    plate_quality while leaving other dye pairs intact -> A01 falls back to fixed limit 5.
    h.engine.close_workspace();
    {
        let c = rusqlite::Connection::open(&ws_path).unwrap();
        let raw: String = c
            .query_row(
                "SELECT report FROM plate_quality WHERE plate_id = ?1",
                [clean_id],
                |r| r.get(0),
            )
            .unwrap();
        let mut v: Value = serde_json::from_str(&raw).unwrap();
        for entry in v["pull_up"].as_array_mut().unwrap() {
            if entry["source"] == "blue" && entry["target"] == "green" {
                entry["fraction"] = Value::Null;
                entry["spread"] = Value::Null;
            }
        }
        c.execute(
            "UPDATE plate_quality SET report = ?1 WHERE plate_id = ?2",
            rusqlite::params![serde_json::to_string(&v).unwrap(), clean_id],
        )
        .unwrap();
    }
    h.call("open_workspace", json!({ "path": ws_path.to_str() }));
    analyze(&h, gt);
    assert!(!called_bins(gt, "C-CLEAN-M1").contains(&b127));

    // 4. Computing plate quality restores both plates and removes the unchecked warning.
    h.call(
        "compute_plate_quality",
        json!({ "ids": [clean_id, leaky_id] }),
    );
    let det = h.call("get_project", json!({ "id": gt }));
    assert!(
        !det["upstream_warnings"]
            .to_string()
            .contains("Plate quality has not been checked"),
        "{}",
        det["upstream_warnings"]
    );
    let g1_status = det["loci"]
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["locus_id"] == pfg1)
        .unwrap()["status"]
        .clone();
    assert_eq!(g1_status["state"], "stale");
    analyze(&h, gt);
    assert!(called_bins(gt, "C-CLEAN-M1").contains(&b127));
    let leaky_called = called_bins(gt, "L-LEAKY-P1");
    assert!(
        leaky_called.contains(&b142),
        "L-LEAKY-P1 missed planted allele 141.7"
    );
    assert!(
        !leaky_called.contains(&b127),
        "L-LEAKY-P1 false pull-up after restoring plate quality: {leaky_called:?}"
    );
}
