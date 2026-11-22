//! Compact storage of annotated peaks (the `genotype.peaks` column).
//!
//! A call keeps every filtered peak of its reference run, typically 10–40
//! (most are low-level noise and stutter the genotyping flags reject). As
//! JSON a `Peak` takes ~400 bytes, which for a few thousand samples × loci
//! adds up to tens of megabytes; this fixed layout takes ~80 bytes per peak.
//!
//! Values are stored as `f64`, exactly as computed. Views re-evaluate
//! thresholds on decoded peaks (which control peaks the β fit used, flags,
//! narrow misses), and with `f32` storage (version 1) a value at a limit could
//! fall on the other side of it once decoded: 0.8 came back as 0.8000000119,
//! so an 80/20 control at `min_true_proportion = 0.2` showed as excluded
//! although the fit, computed in `f64`, had used it.
//!
//! ```text
//! u8 version (=5) | u32 count | per peak:
//!   u32 index | u16 presence bits | f64 × 11 (size, height, raw_height,
//!   area, relative_height, bleedthrough_ratio, crosstalk_ratio,
//!   spectral_dip_ratio, fallback_bleedthrough_ratio,
//!   artifact_contribution, artifact_error) | optional fields
//!   in bit order: i64 bin_id + u8 len + label, f64 probability,
//!   f64 relative_quantification, f64 corrected_relative_quantification,
//!   f64 true_proportion, f64 pullup_contribution + f64 pullup_error
//! ```
//!
//! Older blobs are still read. Version 4 has no `pullup_contribution`,
//! `pullup_error` (read as `None`), or `fallback_bleedthrough_ratio` (read
//! as `bleedthrough_ratio`). Version 3 has no `spectral_dip_ratio` (read
//! as 0) and no `spectral` flag; version 2 has no `raw_height` either; version 1 is
//! version 2 with `f32` in place of every `f64` and a ninth, zero, `f32`
//! after `artifact_error`. Their `height` was the raw apex value, so it is
//! read into both `height` and `raw_height`. Those peaks were measured
//! without baseline correction; the results holding them are stale (their
//! parameter fingerprints include the measurement version, see
//! `fingerprint::of_json`) until re-analyzed.

use microspat_core::{Peak, PeakFlags};

const VERSION: u8 = 5;
/// Measurements as `f64`, without measured pull-up expectations.
const VERSION_NO_PULLUP: u8 = 4;
/// Measurements as `f64`, without `spectral_dip_ratio`.
const VERSION_NO_DIP: u8 = 3;
/// Measurements as `f64`, without `raw_height`.
const VERSION_NO_RAW: u8 = 2;
/// The first layout: measurements as `f32`, with one padding value.
const VERSION_F32: u8 = 1;

const BIN: u16 = 1;
const IN_BIN: u16 = 1 << 1;
const F_REL: u16 = 1 << 2;
const F_BLEED: u16 = 1 << 3;
const F_CROSS: u16 = 1 << 4;
const F_ART: u16 = 1 << 5;
const PROB: u16 = 1 << 6;
const RQ: u16 = 1 << 7;
const CRQ: u16 = 1 << 8;
const TP: u16 = 1 << 9;
const F_SPEC: u16 = 1 << 10;
const PU: u16 = 1 << 11;

/// Encodes peaks.
pub fn encode(peaks: &[Peak]) -> Vec<u8> {
    let mut out = Vec::with_capacity(5 + peaks.len() * 96);
    out.push(VERSION);
    out.extend_from_slice(&(peaks.len() as u32).to_le_bytes());
    let f = |out: &mut Vec<u8>, v: f64| out.extend_from_slice(&v.to_le_bytes());
    for p in peaks {
        let mut bits = 0u16;
        let set = |b: &mut u16, on: bool, bit: u16| {
            if on {
                *b |= bit
            }
        };
        let has_pu = p.pullup_contribution.is_some() && p.pullup_error.is_some();
        set(&mut bits, p.bin_id.is_some(), BIN);
        set(&mut bits, p.in_bin, IN_BIN);
        set(&mut bits, p.flags.below_relative_threshold, F_REL);
        set(&mut bits, p.flags.bleedthrough, F_BLEED);
        set(&mut bits, p.flags.crosstalk, F_CROSS);
        set(&mut bits, p.flags.artifact, F_ART);
        set(&mut bits, p.flags.spectral, F_SPEC);
        set(&mut bits, p.probability.is_some(), PROB);
        set(&mut bits, p.relative_quantification.is_some(), RQ);
        set(
            &mut bits,
            p.corrected_relative_quantification.is_some(),
            CRQ,
        );
        set(&mut bits, p.true_proportion.is_some(), TP);
        set(&mut bits, has_pu, PU);
        out.extend_from_slice(&(p.index as u32).to_le_bytes());
        out.extend_from_slice(&bits.to_le_bytes());
        for v in [
            p.size,
            p.height,
            p.raw_height,
            p.area,
            p.relative_height,
            p.bleedthrough_ratio,
            p.crosstalk_ratio,
            p.spectral_dip_ratio,
            p.fallback_bleedthrough_ratio,
            p.artifact_contribution,
            p.artifact_error,
        ] {
            f(&mut out, v);
        }
        if let Some(b) = p.bin_id {
            out.extend_from_slice(&b.to_le_bytes());
            let label = p.bin_label.as_deref().unwrap_or("");
            let n = label.len().min(255);
            // Truncate on a char boundary.
            let mut cut = n;
            while !label.is_char_boundary(cut) {
                cut -= 1;
            }
            out.push(cut as u8);
            out.extend_from_slice(&label.as_bytes()[..cut]);
        }
        for v in [
            p.probability,
            p.relative_quantification,
            p.corrected_relative_quantification,
            p.true_proportion,
        ]
        .into_iter()
        .flatten()
        {
            f(&mut out, v);
        }
        if let (Some(epu), Some(spu)) = (p.pullup_contribution, p.pullup_error) {
            f(&mut out, epu);
            f(&mut out, spu);
        }
    }
    out
}

struct Reader<'a> {
    b: &'a [u8],
    pos: usize,
    /// Version 1: measurements are `f32`.
    f32: bool,
}

impl Reader<'_> {
    fn take(&mut self, n: usize) -> Result<&[u8], String> {
        let s = self
            .b
            .get(self.pos..self.pos + n)
            .ok_or_else(|| "corrupt peak data: truncated".to_string())?;
        self.pos += n;
        Ok(s)
    }
    fn u32(&mut self) -> Result<u32, String> {
        Ok(u32::from_le_bytes(
            self.take(4)?.try_into().unwrap_or([0; 4]),
        ))
    }
    fn u16(&mut self) -> Result<u16, String> {
        Ok(u16::from_le_bytes(
            self.take(2)?.try_into().unwrap_or([0; 2]),
        ))
    }
    fn f(&mut self) -> Result<f64, String> {
        if self.f32 {
            return Ok(f64::from(f32::from_le_bytes(
                self.take(4)?.try_into().unwrap_or([0; 4]),
            )));
        }
        Ok(f64::from_le_bytes(
            self.take(8)?.try_into().unwrap_or([0; 8]),
        ))
    }
    fn i64(&mut self) -> Result<i64, String> {
        Ok(i64::from_le_bytes(
            self.take(8)?.try_into().unwrap_or([0; 8]),
        ))
    }
}

/// Decodes peaks written by [`encode`] (or by an older version).
pub fn decode(b: &[u8]) -> Result<Vec<Peak>, String> {
    let (f32, min_bytes, measures, has_raw, has_pullup) = match b.first() {
        Some(&VERSION) => (false, 94, 11, true, true),
        Some(&VERSION_NO_PULLUP) => (false, 86, 10, true, false),
        Some(&VERSION_NO_DIP) => (false, 78, 9, true, false),
        Some(&VERSION_NO_RAW) => (false, 70, 8, false, false),
        Some(&VERSION_F32) => (true, 42, 9, false, false),
        _ => return Err("corrupt peak data: unknown version".into()),
    };
    let mut r = Reader { b, pos: 1, f32 };
    let n = r.u32()? as usize;
    if n > b.len() / min_bytes {
        return Err("corrupt peak data: bad count".into());
    }
    let mut out = Vec::with_capacity(n);
    for _ in 0..n {
        let index = r.u32()? as usize;
        let bits = r.u16()?;
        let mut v = [0.0; 11];
        for x in v.iter_mut().take(measures) {
            *x = r.f()?;
        }
        // Old layouts: no measured pull-up fields (read fallback as
        // bleedthrough_ratio); before that, no dip ratio (read as 0); before
        // that, (size, height, area, ...) with the raw apex as height.
        let [size, height, raw_height, area, relative_height, bleedthrough_ratio, crosstalk_ratio, spectral_dip_ratio, fallback_bleedthrough_ratio, artifact_contribution, artifact_error] =
            if has_pullup {
                v
            } else if measures == 10 {
                [
                    v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[5], v[8], v[9],
                ]
            } else if has_raw {
                [
                    v[0], v[1], v[2], v[3], v[4], v[5], v[6], 0.0, v[5], v[7], v[8],
                ]
            } else {
                [
                    v[0], v[1], v[1], v[2], v[3], v[4], v[5], 0.0, v[4], v[6], v[7],
                ]
            };
        let (bin_id, bin_label) = if bits & BIN != 0 {
            let id = r.i64()?;
            let len = usize::from(r.take(1)?[0]);
            let label = String::from_utf8_lossy(r.take(len)?).into_owned();
            (Some(id), Some(label))
        } else {
            (None, None)
        };
        let mut opt = |bit: u16| -> Result<Option<f64>, String> {
            if bits & bit != 0 {
                r.f().map(Some)
            } else {
                Ok(None)
            }
        };
        let probability = opt(PROB)?;
        let relative_quantification = opt(RQ)?;
        let corrected_relative_quantification = opt(CRQ)?;
        let true_proportion = opt(TP)?;
        let (pullup_contribution, pullup_error) = if has_pullup && bits & PU != 0 {
            (Some(r.f()?), Some(r.f()?))
        } else {
            (None, None)
        };
        out.push(Peak {
            index,
            size,
            height,
            raw_height,
            area,
            relative_height,
            bleedthrough_ratio,
            crosstalk_ratio,
            spectral_dip_ratio,
            pullup_contribution,
            pullup_error,
            fallback_bleedthrough_ratio,
            artifact_contribution,
            artifact_error,
            bin_id,
            bin_label,
            in_bin: bits & IN_BIN != 0,
            flags: PeakFlags {
                below_relative_threshold: bits & F_REL != 0,
                bleedthrough: bits & F_BLEED != 0,
                crosstalk: bits & F_CROSS != 0,
                artifact: bits & F_ART != 0,
                spectral: bits & F_SPEC != 0,
            },
            probability,
            relative_quantification,
            corrected_relative_quantification,
            true_proportion,
        });
    }
    Ok(out)
}

/// Packs (x, y) pairs as little-endian f32 (bin-estimator scatter).
pub fn encode_pairs(points: &[(f64, f64)]) -> Vec<u8> {
    let mut out = Vec::with_capacity(points.len() * 8);
    for &(x, y) in points {
        out.extend_from_slice(&(x as f32).to_le_bytes());
        out.extend_from_slice(&(y as f32).to_le_bytes());
    }
    out
}

/// Unpacks [`encode_pairs`].
pub fn decode_pairs(b: &[u8]) -> Vec<(f32, f32)> {
    b.chunks_exact(8)
        .map(|c| {
            (
                f32::from_le_bytes([c[0], c[1], c[2], c[3]]),
                f32::from_le_bytes([c[4], c[5], c[6], c[7]]),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let peaks = vec![
            Peak {
                index: 1234,
                size: 150.25,
                height: 3000.0,
                raw_height: 3120.0,
                area: 12000.5,
                relative_height: 1.0,
                bin_id: Some(42),
                bin_label: Some("150".into()),
                in_bin: true,
                probability: Some(0.75),
                corrected_relative_quantification: Some(0.5),
                flags: PeakFlags {
                    crosstalk: true,
                    spectral: true,
                    ..PeakFlags::default()
                },
                spectral_dip_ratio: 0.9,
                pullup_contribution: Some(420.5),
                pullup_error: Some(35.25),
                fallback_bleedthrough_ratio: 0.05,
                ..Peak::default()
            },
            Peak {
                index: 7,
                size: 99.0,
                height: 12.0,
                true_proportion: Some(0.0),
                ..Peak::default()
            },
        ];
        let d = decode(&encode(&peaks)).unwrap();
        assert_eq!(d, peaks);
        assert!(decode(&encode(&[])).unwrap().is_empty());
        assert!(decode(&[9, 0, 0, 0, 0]).is_err());
        // Version 4 has no measured pull-up fields: fallback defaults to bleedthrough_ratio.
        let mut v4 = vec![4u8];
        v4.extend_from_slice(&1u32.to_le_bytes());
        v4.extend_from_slice(&9u32.to_le_bytes());
        v4.extend_from_slice(&IN_BIN.to_le_bytes());
        for v in [
            100.0f64, 500.0, 520.0, 2500.0, 1.0, 0.15, 0.2, 0.05, 30.0, 4.0,
        ] {
            v4.extend_from_slice(&v.to_le_bytes());
        }
        let old4 = decode(&v4).unwrap();
        assert_eq!(
            (
                old4[0].pullup_contribution,
                old4[0].pullup_error,
                old4[0].fallback_bleedthrough_ratio,
                old4[0].spectral_dip_ratio
            ),
            (None, None, 0.15, 0.05)
        );
        // Version 3 has no dip ratio: it reads as 0.
        let mut v3 = vec![3u8];
        v3.extend_from_slice(&1u32.to_le_bytes());
        v3.extend_from_slice(&9u32.to_le_bytes());
        v3.extend_from_slice(&IN_BIN.to_le_bytes());
        for v in [100.0f64, 500.0, 520.0, 2500.0, 1.0, 0.1, 0.2, 30.0, 4.0] {
            v3.extend_from_slice(&v.to_le_bytes());
        }
        let old = decode(&v3).unwrap();
        assert_eq!(
            (
                old[0].index,
                old[0].raw_height,
                old[0].crosstalk_ratio,
                old[0].spectral_dip_ratio
            ),
            (9, 520.0, 0.2, 0.0)
        );
        assert_eq!(
            (old[0].artifact_contribution, old[0].artifact_error),
            (30.0, 4.0)
        );
        let mut e = encode(&peaks);
        e.truncate(e.len() - 3);
        assert!(decode(&e).is_err());
        assert_eq!(
            decode_pairs(&encode_pairs(&[(1.5, 0.25)])),
            vec![(1.5, 0.25)]
        );
    }

    /// Views re-evaluate thresholds on decoded peaks (control points, narrow
    /// misses, flags), so a decoded peak must equal the computed one. With
    /// `f32` storage 0.8 decoded as 0.8000000119 and an 80/20 control at
    /// `min_true_proportion = 0.2` showed as excluded although the fit used it.
    #[test]
    fn decoded_peaks_equal_computed_ones() {
        use microspat_core::quant_bias::{control_points, QuantBiasParams};
        for (major, min) in [(0.8, 0.2), (0.6, 0.4), (0.65, 0.35)] {
            let peaks: Vec<Peak> = [(150.123_456_789, major), (180.987_654_321, 1.0 - major)]
                .iter()
                .enumerate()
                .map(|(i, &(size, t))| Peak {
                    index: i,
                    size,
                    height: 20_000.0 * t + 0.123_456_789,
                    relative_height: t / major,
                    artifact_contribution: 123.456_789_012,
                    artifact_error: 0.1 + 0.2,
                    bin_id: Some(i as i64),
                    bin_label: Some(format!("{}", i)),
                    in_bin: true,
                    probability: Some(0.9 - 1e-12),
                    relative_quantification: Some(t),
                    corrected_relative_quantification: Some(1.0 - t),
                    true_proportion: Some(t),
                    ..Peak::default()
                })
                .collect();
            let decoded = decode(&encode(&peaks)).unwrap();
            let params = QuantBiasParams {
                min_true_proportion: min,
                ..QuantBiasParams::default()
            };
            let used = |p: &[Peak]| {
                control_points(p, &params)
                    .iter()
                    .map(|c| c.exclusion)
                    .collect::<Vec<_>>()
            };
            assert_eq!(used(&peaks), vec![None, None], "{major}/{min}");
            assert_eq!(used(&decoded), vec![None, None], "{major}/{min}");
            assert_eq!(decoded, peaks);
        }
    }

    /// Peaks stored by the first version (`f32` measurements) still decode.
    #[test]
    fn reads_version_1() {
        // u8 1 | u32 1 | u32 index 3 | u16 bits TP | f32 × 9 | f32 true_proportion
        let mut b = vec![1u8];
        b.extend_from_slice(&1u32.to_le_bytes());
        b.extend_from_slice(&3u32.to_le_bytes());
        b.extend_from_slice(&TP.to_le_bytes());
        for v in [150.25f32, 3000.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0] {
            b.extend_from_slice(&v.to_le_bytes());
        }
        b.extend_from_slice(&0.5f32.to_le_bytes());
        let d = decode(&b).unwrap();
        assert_eq!(d.len(), 1);
        assert_eq!((d[0].index, d[0].size, d[0].height), (3, 150.25, 3000.0));
        assert_eq!(d[0].raw_height, 3000.0);
        assert_eq!(d[0].true_proportion, Some(0.5));
    }

    /// Version 2 (no `raw_height`) still decodes, its raw height as both.
    #[test]
    fn reads_version_2() {
        // u8 2 | u32 1 | u32 index 9 | u16 bits PROB | f64 × 8 | f64 probability
        let mut b = vec![2u8];
        b.extend_from_slice(&1u32.to_le_bytes());
        b.extend_from_slice(&9u32.to_le_bytes());
        b.extend_from_slice(&PROB.to_le_bytes());
        for v in [180.5f64, 2500.0, 9000.0, 0.5, 0.1, 0.2, 30.0, 4.0] {
            b.extend_from_slice(&v.to_le_bytes());
        }
        b.extend_from_slice(&0.75f64.to_le_bytes());
        let d = decode(&b).unwrap();
        let p = &d[0];
        assert_eq!(
            (p.index, p.size, p.height, p.raw_height),
            (9, 180.5, 2500.0, 2500.0)
        );
        assert_eq!(
            (p.area, p.relative_height, p.artifact_error),
            (9000.0, 0.5, 4.0)
        );
        assert_eq!((p.bleedthrough_ratio, p.crosstalk_ratio), (0.1, 0.2));
        assert_eq!(p.probability, Some(0.75));
    }
}
