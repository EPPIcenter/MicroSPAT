//! In-memory cache of scanned peak candidates.
//!
//! Scanning (`microspat_core::peaks::scan`) depends only on a channel's raw
//! trace and the scanning parameters, and costs ~200 µs per 9,000-point trace;
//! everything after it (sizing, filtering, binning, calling) is cheap. Locus
//! analysis therefore looks scans up here first, so changing a filter,
//! genotyping or bin parameter and re-analyzing skips the scan entirely.
//!
//! **Keyed by content**, not by row id: the key is the well's FSA content
//! hash, the dye, and a fingerprint of the scanning parameters. Traces never
//! change after import and SQLite may reuse the id of a deleted channel, so a
//! content key can never return a stale scan and needs no invalidation. The
//! cache is per process and shared by every workspace opened in it.
//!
//! Candidates are kept compact (12 bytes each, ~600 per trace, ~7 KB per
//! channel) and the cache is bounded; when full, the oldest entries go first.
//! It is not persisted: a fresh process re-scans once per channel (see the
//! README for measurements).

use microspat_core::peaks::{scan, ScanParams};
use microspat_core::{Color, Peak};
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use crate::fingerprint::Fingerprint;

/// Default capacity in bytes.
pub const DEFAULT_CAPACITY: usize = 128 << 20;

/// A scanned candidate: apex index, raw apex height, area above baseline.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Candidate {
    pub index: u32,
    pub height: f32,
    pub area: f32,
}

impl Candidate {
    /// As a core peak, as `scan` returned it (the fields `annotate` reads).
    pub fn to_peak(self) -> Peak {
        Peak {
            index: self.index as usize,
            height: f64::from(self.height),
            raw_height: f64::from(self.height),
            area: f64::from(self.area),
            ..Peak::default()
        }
    }
}

type Key = (u64, u64);

#[derive(Default)]
struct Inner {
    map: HashMap<Key, Arc<[Candidate]>>,
    order: VecDeque<Key>,
    bytes: usize,
}

/// Bounded scan cache with hit counters.
pub struct ScanCache {
    inner: Mutex<Inner>,
    capacity: AtomicUsize,
    hits: AtomicU64,
    misses: AtomicU64,
}

impl Default for ScanCache {
    fn default() -> Self {
        ScanCache {
            inner: Mutex::default(),
            capacity: AtomicUsize::new(DEFAULT_CAPACITY),
            hits: AtomicU64::new(0),
            misses: AtomicU64::new(0),
        }
    }
}

/// Fingerprint of scanning parameters, for the cache key.
pub fn params_key(p: &ScanParams) -> u64 {
    let mut f = Fingerprint::new();
    f.u64(p.maxima_window as u64)
        .u64(p.relmax_window as u64)
        .u64(p.smoothing_window as u64)
        .u64(p.smoothing_order as u64)
        .f64(p.tophat_factor);
    f.finish()
}

fn trace_key(fsa_hash: &str, color: Color) -> u64 {
    Fingerprint::new()
        .str(fsa_hash)
        .str(crate::api::color_str(color))
        .finish()
}

impl ScanCache {
    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// Candidates of a trace, scanning (and caching) on a miss. An invalid
    /// parameter set scans to an error, which is returned and not cached.
    pub fn get_or_scan(
        &self,
        fsa_hash: &str,
        color: Color,
        params: &ScanParams,
        params_key: u64,
        trace: &[i16],
    ) -> Result<Arc<[Candidate]>, String> {
        let key = (trace_key(fsa_hash, color), params_key);
        if let Some(c) = self.lock().map.get(&key) {
            self.hits.fetch_add(1, Ordering::Relaxed);
            return Ok(c.clone());
        }
        self.misses.fetch_add(1, Ordering::Relaxed);
        let peaks = scan(trace, params).map_err(|e| e.to_string())?;
        let cands: Arc<[Candidate]> = peaks
            .iter()
            .map(|p| Candidate {
                index: p.index as u32,
                height: p.height as f32,
                area: p.area as f32,
            })
            .collect();
        let capacity = self.capacity.load(Ordering::Relaxed);
        let size = cands.len() * std::mem::size_of::<Candidate>() + 64;
        if size <= capacity {
            let mut g = self.lock();
            if g.map.insert(key, cands.clone()).is_none() {
                g.order.push_back(key);
                g.bytes += size;
            }
            while g.bytes > capacity {
                let Some(old) = g.order.pop_front() else {
                    break;
                };
                if let Some(v) = g.map.remove(&old) {
                    g.bytes -= v.len() * std::mem::size_of::<Candidate>() + 64;
                }
            }
        }
        Ok(cands)
    }

    /// Sets the capacity in bytes (0 disables caching) and empties the cache.
    pub fn set_capacity(&self, bytes: usize) {
        self.capacity.store(bytes, Ordering::Relaxed);
        let mut g = self.lock();
        g.map.clear();
        g.order.clear();
        g.bytes = 0;
    }

    /// (hits, misses, entries, bytes) since the process started.
    pub fn stats(&self) -> (u64, u64, usize, usize) {
        let g = self.lock();
        (
            self.hits.load(Ordering::Relaxed),
            self.misses.load(Ordering::Relaxed),
            g.map.len(),
            g.bytes,
        )
    }
}
