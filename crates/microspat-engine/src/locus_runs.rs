//! Bulk loading of every run of one locus, for locus analysis (bin and
//! artifact estimation, genotyping).
//!
//! One query joins runs to their channel trace and well fit; trace decoding
//! and base-size reconstruction then run in parallel. Optionally the well's
//! other dyes come along (bleedthrough annotation needs them). Crosstalk needs
//! the same dye of neighboring capillaries, which are other wells; load those
//! with [`load_channels`] when a project enables crosstalk filtering.

use crate::api::color_col;
use crate::codec;
use crate::error::{Result, RpcError};
use crate::sizing::{self, SizingState};
use microspat_core::ladder::LadderSpec;
use microspat_core::Color;
use rayon::prelude::*;
use rusqlite::Connection;
use std::collections::{HashMap, HashSet};

/// One run with what analysis needs.
#[derive(Debug, Clone)]
pub struct LocusRun {
    pub run_id: i64,
    pub sample_id: i64,
    pub channel_id: i64,
    pub well_id: i64,
    pub plate_id: i64,
    pub well_label: String,
    /// Content hash of the well's FSA file (stable key for caching scans).
    pub fsa_hash: String,
    /// The run's state: its well's fit, and unusable when the locus range is
    /// outside the well's sized range.
    pub sizing: SizingState,
    pub trace: Vec<i16>,
    /// None when the well is unsized.
    pub base_sizes: Option<Vec<f64>>,
    pub offscale_indices: Vec<usize>,
    /// The well's other dyes (only with `other_dyes`).
    pub other_dyes: Vec<(Color, Vec<i16>)>,
}

/// What [`load_locus_runs`] includes.
#[derive(Debug, Clone, Copy, Default)]
pub struct LoadOptions {
    /// Also load the other dye traces of each well.
    pub other_dyes: bool,
}

fn decode(blob: &[u8], what: i64) -> Result<Vec<i16>> {
    codec::decode(blob).map_err(|e| RpcError::internal(format!("channel {what}: {e}")))
}

/// Every run of `locus_id`, ordered by run id.
pub fn load_locus_runs(c: &Connection, locus_id: i64, opts: LoadOptions) -> Result<Vec<LocusRun>> {
    load_locus_runs_for(c, locus_id, opts, None)
}

/// Runs of `locus_id` belonging to `samples` (all when None), ordered by run id.
pub fn load_locus_runs_for(
    c: &Connection,
    locus_id: i64,
    opts: LoadOptions,
    samples: Option<&HashSet<i64>>,
) -> Result<Vec<LocusRun>> {
    let specs = crate::api::plates::ladder_specs(c)?;
    let (locus_min, locus_max): (f64, f64) = c
        .query_row(
            "SELECT min_base_length, max_base_length FROM locus WHERE id = ?1",
            [locus_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap_or((f64::NEG_INFINITY, f64::INFINITY));
    // Small sample sets filter in SQL so unused trace blobs are never read.
    let only = match samples {
        Some(s) if s.len() <= 2000 => {
            let ids: Vec<i64> = s.iter().copied().collect();
            format!(" AND r.sample_id IN ({})", crate::api::id_list(&ids))
        }
        _ => String::new(),
    };
    let mut st = c.prepare_cached(&format!(
        "SELECT r.id, r.sample_id, ch.id, w.id, w.plate_id, w.label, w.ladder_peak_indices,
                w.ladder_peak_sizes, w.sizing_quality, w.trace_len, w.offscale_indices, t.data, p.ladder_id,
                w.fsa_hash
         FROM run r JOIN channel ch ON ch.id = r.channel_id JOIN well w ON w.id = ch.well_id
         JOIN plate p ON p.id = w.plate_id JOIN trace t ON t.channel_id = ch.id
         WHERE r.locus_id = ?1{only} ORDER BY r.id"
    ))?;
    type Row = (
        i64,
        i64,
        i64,
        i64,
        i64,
        String,
        String,
        String,
        Option<f64>,
        i64,
        String,
        Vec<u8>,
        i64,
        String,
    );
    let rows: Vec<Row> = st
        .query_map([locus_id], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
                r.get(7)?,
                r.get(8)?,
                r.get(9)?,
                r.get(10)?,
                r.get(11)?,
                r.get(12)?,
                r.get(13)?,
            ))
        })?
        .filter(|row| match (samples, row) {
            (Some(set), Ok(r)) => set.contains(&r.1),
            _ => true,
        })
        .collect::<rusqlite::Result<_>>()?;
    let mut others: HashMap<i64, Vec<(Color, Vec<u8>)>> = HashMap::new();
    if opts.other_dyes {
        let mut st = c.prepare_cached(&format!(
            "SELECT o.well_id, o.color, t.data FROM run r JOIN channel ch ON ch.id = r.channel_id
             JOIN channel o ON o.well_id = ch.well_id AND o.id != ch.id JOIN trace t ON t.channel_id = o.id
             WHERE r.locus_id = ?1{only}"
        ))?;
        for row in st.query_map([locus_id], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                color_col(r, 1)?,
                r.get::<_, Vec<u8>>(2)?,
            ))
        })? {
            let (w, color, blob) = row?;
            others.entry(w).or_default().push((color, blob));
        }
    }
    let default_spec = LadderSpec::default();
    rows.into_par_iter()
        .map(
            |(
                run_id,
                sample_id,
                channel_id,
                well_id,
                plate_id,
                well_label,
                idx,
                sizes,
                q,
                len,
                off,
                blob,
                ladder,
                fsa_hash,
            )| {
                let spec = specs.get(&ladder).unwrap_or(&default_spec);
                let idx: Vec<usize> = serde_json::from_str(&idx)?;
                let sizes: Vec<f64> = serde_json::from_str(&sizes)?;
                let other_dyes = others
                    .get(&well_id)
                    .map(|v| {
                        v.iter()
                            .map(|(c, b)| Ok((*c, decode(b, well_id)?)))
                            .collect::<Result<_>>()
                    })
                    .transpose()?
                    .unwrap_or_default();
                Ok(LocusRun {
                    run_id,
                    sample_id,
                    channel_id,
                    well_id,
                    plate_id,
                    well_label,
                    fsa_hash,
                    sizing: sizing::run_state(q, &sizes, spec, locus_min, locus_max),
                    trace: decode(&blob, channel_id)?,
                    base_sizes: q.and_then(|_| {
                        sizing::base_sizes(&idx, &sizes, len as usize, spec.base_size_precision)
                    }),
                    offscale_indices: serde_json::from_str(&off)?,
                    other_dyes,
                })
            },
        )
        .collect()
}

/// Raw traces of arbitrary channels (e.g. neighbors for crosstalk), by channel id.
pub fn load_channels(c: &Connection, channel_ids: &[i64]) -> Result<HashMap<i64, Vec<i16>>> {
    if channel_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let mut st = c.prepare(&format!(
        "SELECT channel_id, data FROM trace WHERE channel_id IN ({})",
        crate::api::id_list(channel_ids)
    ))?;
    let raw: Vec<(i64, Vec<u8>)> = st
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    raw.into_par_iter()
        .map(|(id, b)| Ok((id, decode(&b, id)?)))
        .collect()
}
