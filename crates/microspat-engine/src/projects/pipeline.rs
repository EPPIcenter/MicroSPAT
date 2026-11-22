//! Runs of one locus to annotated peaks: load, scan (cached), size and filter.
//!
//! [`load`] reads everything from one snapshot: each run's trace, sizing and
//! other dyes (bleedthrough), plus the same dye of neighboring capillaries
//! (crosstalk). [`annotate`] then runs in parallel over runs and touches no
//! database, so callers keep the read short and compute outside it.

use crate::api::loci::Locus;
use crate::error::{Result, RpcError};
use crate::locus_runs::{load_channels, load_locus_runs_for, LoadOptions, LocusRun};
use crate::quality::{load_pull_up_for_plates, PlatePullUpData};
use crate::scan_cache::{params_key, ScanCache};
use crate::Engine;
use microspat_core::peaks::{self, FilterParams, RunSignals, ScanParams};
use microspat_core::plate::{neighbor_wells, PlateSize, Well};
use microspat_core::quality::LeakEstimate;
use microspat_core::{Color, Peak};
use rayon::prelude::*;
use rusqlite::Connection;
use std::collections::{HashMap, HashSet};

/// Capillaries on each side whose signal can leak into a run. On 3730 data
/// leak is about 1.1%, 0.7% and 0.4% of the source at 1, 2 and 3 capillaries
/// away. Three away, even a clipped source leaks about 130 RFU, under the
/// genotyping height limit, while each extra neighbor is one more chance
/// for a true allele to sit beside a much taller one and be flagged.
pub const CROSSTALK_DISTANCE: usize = 2;

/// Controls how [`annotate`] applies plate-measured pull-up.
#[derive(Debug, Clone, Copy, Default)]
pub struct AnnotateOptions {
    /// Use each plate's measured pull-up where available (default true).
    pub use_measured_pullup: bool,
    /// Estimators drop any peak explained by measured pull-up even below
    /// `max_bleedthrough`; calling projects only drop at or above it.
    pub drop_measured_pullup: bool,
}

/// Everything annotation needs for one locus, read from one snapshot.
pub struct LoadedLocus {
    pub locus: Locus,
    pub runs: Vec<LocusRun>,
    /// Neighbor channel ids of each run (same index as `runs`).
    neighbors: Vec<Vec<i64>>,
    /// Traces of neighbor channels that are not themselves runs here.
    extra: HashMap<i64, Vec<i16>>,
    /// Plate quality pull-up data by plate id (only current reports).
    pull_up: HashMap<i64, PlatePullUpData>,
    /// Sorted unique labels of plates with runs here that lack a current
    /// quality report (so they fall back to the fixed bleedthrough limit).
    pub unchecked_plates: Vec<String>,
}

impl LoadedLocus {
    /// Plate-measured pull-up estimates targeting this locus's dye for a run
    /// in `(plate_id, well_label)`, or empty when unchecked or unseparated.
    pub fn plate_pull_up_estimates(&self, plate_id: i64, well_label: &str) -> Vec<LeakEstimate> {
        self.pull_up
            .get(&plate_id)
            .filter(|pq| !pq.unseparated_wells.contains(well_label))
            .and_then(|pq| pq.raw_by_target.get(&self.locus.color))
            .cloned()
            .unwrap_or_default()
    }
}

/// One run with its filtered peaks.
#[derive(Debug, Clone)]
pub struct RunPeaks {
    pub run_id: i64,
    pub sample_id: i64,
    pub channel_id: i64,
    pub well_id: i64,
    pub plate_id: i64,
    pub well_label: String,
    /// Sizing good or flagged; other runs carry no peaks and are never used.
    pub sizing_ok: bool,
    /// Retained peaks, by size.
    pub peaks: Vec<Peak>,
}

/// Loads the runs of `locus` (only `samples` when given) with what annotation needs.
pub fn load(c: &Connection, locus: &Locus, samples: Option<&HashSet<i64>>) -> Result<LoadedLocus> {
    let runs = load_locus_runs_for(c, locus.id, LoadOptions { other_dyes: true }, samples)?;
    let plate_ids: HashSet<i64> = runs.iter().map(|r| r.plate_id).collect();
    if plate_ids.is_empty() {
        return Ok(LoadedLocus {
            locus: locus.clone(),
            runs,
            neighbors: Vec::new(),
            extra: HashMap::new(),
            pull_up: HashMap::new(),
            unchecked_plates: Vec::new(),
        });
    }
    let ids: Vec<i64> = plate_ids.into_iter().collect();
    let list = crate::api::id_list(&ids);
    let mut sizes: HashMap<i64, PlateSize> = HashMap::new();
    let mut plate_labels: HashMap<i64, String> = HashMap::new();
    let mut st = c.prepare(&format!(
        "SELECT id, plate_size, label FROM plate WHERE id IN ({list})"
    ))?;
    for row in st.query_map([], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, u32>(1)?,
            r.get::<_, String>(2)?,
        ))
    })? {
        let (id, n, label) = row?;
        sizes.insert(
            id,
            PlateSize::from_wells(n).map_err(|e| RpcError::internal(e.to_string()))?,
        );
        plate_labels.insert(id, label);
    }
    let pull_up = load_pull_up_for_plates(c, &ids)?;
    let mut unchecked_plates: Vec<String> = ids
        .iter()
        .filter(|id| !pull_up.contains_key(id))
        .filter_map(|id| plate_labels.get(id).cloned())
        .collect();
    unchecked_plates.sort();
    unchecked_plates.dedup();
    // Same-dye channels of these plates, by (plate, normalized well label).
    let mut channel_of: HashMap<(i64, String), i64> = HashMap::new();
    let mut st = c.prepare(&format!(
        "SELECT w.plate_id, w.label, c.id FROM channel c JOIN well w ON w.id = c.well_id
         WHERE c.color = ?1 AND w.plate_id IN ({list})"
    ))?;
    for row in st.query_map([crate::api::color_str(locus.color)], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, i64>(2)?,
        ))
    })? {
        let (p, w, ch) = row?;
        channel_of.insert((p, w), ch);
    }
    let own: HashSet<i64> = runs.iter().map(|r| r.channel_id).collect();
    let neighbors: Vec<Vec<i64>> = runs
        .iter()
        .map(|r| {
            let (Ok(well), Some(&size)) = (Well::parse(&r.well_label), sizes.get(&r.plate_id))
            else {
                return Vec::new();
            };
            neighbor_wells(well, size, CROSSTALK_DISTANCE)
                .unwrap_or_default()
                .into_iter()
                .filter_map(|w| channel_of.get(&(r.plate_id, w.label())).copied())
                .collect()
        })
        .collect();
    let missing: Vec<i64> = neighbors
        .iter()
        .flatten()
        .filter(|ch| !own.contains(ch))
        .copied()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    let extra = load_channels(c, &missing)?;
    Ok(LoadedLocus {
        locus: locus.clone(),
        runs,
        neighbors,
        extra,
        pull_up,
        unchecked_plates,
    })
}

/// Scans (through the cache) and filters every run, in parallel.
pub fn annotate(
    cache: &ScanCache,
    loaded: &LoadedLocus,
    scan: &ScanParams,
    filter: &FilterParams,
    opts: AnnotateOptions,
) -> Result<Vec<RunPeaks>> {
    let key = params_key(scan);
    let traces: HashMap<i64, &[i16]> = loaded
        .runs
        .iter()
        .map(|r| (r.channel_id, r.trace.as_slice()))
        .chain(loaded.extra.iter().map(|(&id, t)| (id, t.as_slice())))
        .collect();
    let range = loaded.locus.min_base_length..=loaded.locus.max_base_length;
    let color = loaded.locus.color;
    loaded
        .runs
        .par_iter()
        .enumerate()
        .map(|(k, r)| {
            let mut out = RunPeaks {
                run_id: r.run_id,
                sample_id: r.sample_id,
                channel_id: r.channel_id,
                well_id: r.well_id,
                plate_id: r.plate_id,
                well_label: r.well_label.clone(),
                sizing_ok: r.sizing.usable() && r.base_sizes.is_some(),
                peaks: Vec::new(),
            };
            let Some(base) = r.base_sizes.as_deref().filter(|_| out.sizing_ok) else {
                return Ok(out);
            };
            let cands = cache
                .get_or_scan(&r.fsa_hash, color, scan, key, &r.trace)
                .map_err(|e| RpcError::invalid(format!("Cannot scan peaks: {e}")))?;
            // Only candidates inside the locus range matter; skip building the rest.
            let in_range: Vec<Peak> = cands
                .iter()
                .filter(|c| {
                    base.get(c.index as usize)
                        .is_some_and(|s| range.contains(s))
                })
                .map(|c| c.to_peak())
                .collect();
            let others: Vec<(Color, &[i16])> = r
                .other_dyes
                .iter()
                .map(|(c, t)| (*c, t.as_slice()))
                .collect();
            let neighbors: Vec<&[i16]> = loaded.neighbors[k]
                .iter()
                .filter_map(|ch| traces.get(ch).copied())
                .collect();
            let pull_up = if opts.use_measured_pullup {
                loaded
                    .pull_up
                    .get(&r.plate_id)
                    .filter(|pq| !pq.unseparated_wells.contains(&r.well_label))
                    .and_then(|pq| pq.by_target.get(&color))
            } else {
                None
            };
            let signals = RunSignals {
                trace: &r.trace,
                base_sizes: base,
                other_dyes: &others,
                neighbor_capillaries: &neighbors,
                pull_up,
                drop_measured_pullup: opts.drop_measured_pullup,
                offscale_indices: &r.offscale_indices,
            };
            out.peaks = peaks::annotate(&in_range, &signals, range.clone(), filter);
            Ok(out)
        })
        .collect()
}

/// Loads and annotates in one go (one snapshot, then compute).
pub fn run_peaks(
    engine: &Engine,
    c: &Connection,
    locus: &Locus,
    samples: Option<&HashSet<i64>>,
    scan: &ScanParams,
    filter: &FilterParams,
    opts: AnnotateOptions,
) -> Result<Vec<RunPeaks>> {
    let loaded = load(c, locus, samples)?;
    annotate(engine.scan_cache(), &loaded, scan, filter, opts)
}
