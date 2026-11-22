//! ABIF (`.fsa`) reading and writing.
//!
//! An ABIF file is a 128-byte header holding the root directory entry
//! (`tdir`), a directory of 28-byte entries `(tag, number, element type,
//! element size, element count, data size, data offset, handle)`, and the
//! data blocks they point to. All integers are big-endian. Data of four bytes
//! or fewer is stored inline in the entry's offset field.
//!
//! Tags used (Applied Biosystems "ABIF File Format Specification", 2009):
//! - `DATA 1..4` raw signal for dyes 1–4, `DATA 105` raw signal for dye 5
//!   (`DATA 9..12`/`205` are the instrument's processed signal and are not used);
//!   `DATA 5..8` voltage, current, power, temperature run traces.
//! - `Dye#` dye count, `DyeN n` dye names, `DyeW n` emission wavelengths.
//! - `SpNm` (or `SMPL`) sample name, `TUBE` well, `CTID`/`CTNM` container (plate) id/name,
//!   `RUND 1`/`RUNT 1` run start, `MCHN` instrument name, `MODL` model,
//!   `PSZE` plate size, `OfSc`/`Satd` off-scale (saturated) scans.
//!
//! Dye `n` maps to a color by position, as in every ABI dye set
//! (DS-30 FAM/HEX/NED/ROX, G5 FAM/VIC/NED/PET/LIZ): 1 blue, 2 green,
//! 3 yellow, 4 red, 5 orange.

use crate::types::Color;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

const HEADER_LEN: usize = 128;
const ENTRY_LEN: usize = 28;
/// Upper bound on directory size; real files have a few hundred entries.
const MAX_ENTRIES: usize = 100_000;

/// Errors from ABIF parsing.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum AbifError {
    #[error("not an ABIF file (missing 'ABIF' signature)")]
    NotAbif,
    #[error("file is truncated: {0}")]
    Truncated(String),
    #[error("malformed directory: {0}")]
    BadDirectory(String),
    #[error("required entry {0} is missing")]
    Missing(String),
    #[error("entry {tag} {number} is malformed: {reason}")]
    BadEntry {
        tag: String,
        number: i32,
        reason: String,
    },
    #[error("{0} dyes are not supported (expected 1 to 5)")]
    UnsupportedDyeCount(usize),
}

/// One dye channel of a well.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DyeChannel {
    /// 1-based dye number in the file.
    pub dye_number: u8,
    pub color: Color,
    /// Dye name (`DyeN`), e.g. `6-FAM`.
    pub dye_name: Option<String>,
    /// Emission wavelength in nm (`DyeW`).
    pub wavelength: Option<u16>,
    /// Raw signal, one value per scan.
    pub data: Vec<i16>,
}

/// Electrophoresis run traces (`DATA 5..8`), sampled more coarsely than the signal.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct RunTraces {
    pub voltage: Vec<i16>,
    pub current: Vec<i16>,
    pub power: Vec<i16>,
    pub temperature: Vec<i16>,
}

/// Run start as recorded by the instrument (local time, no zone).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct RunDateTime {
    pub year: i16,
    pub month: u8,
    pub day: u8,
    pub hour: u8,
    pub minute: u8,
    pub second: u8,
}

impl RunDateTime {
    /// ISO-8601 form without zone, e.g. `2004-11-22T11:58:35`.
    pub fn iso8601(&self) -> String {
        format!(
            "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}",
            self.year, self.month, self.day, self.hour, self.minute, self.second
        )
    }
}

/// The parts of an FSA file MicroSPAT uses.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Fsa {
    /// Dye channels in dye order.
    pub channels: Vec<DyeChannel>,
    pub sample_name: Option<String>,
    /// Container (plate) barcode, `CTID`.
    pub container_id: Option<String>,
    /// Container (plate) name, `CTNM`.
    pub container_name: Option<String>,
    /// Well label, normalized to `A01` form when it parses.
    pub well: Option<String>,
    pub run_start: Option<RunDateTime>,
    /// Instrument name, `MCHN`.
    pub instrument_name: Option<String>,
    /// Instrument model, `MODL` (e.g. `3730`).
    pub instrument_model: Option<String>,
    /// Plate size in wells (`PSZE`), when recorded.
    pub plate_size: Option<u32>,
    /// Scan indices the instrument marked as saturated, sorted and unique.
    pub offscale_indices: Vec<usize>,
    pub run_traces: RunTraces,
    /// SHA-256 of the file bytes, lowercase hex. Empty for an unwritten `Fsa`.
    pub content_hash: String,
}

impl Fsa {
    /// The plate label: container name, falling back to container id.
    pub fn plate_label(&self) -> Option<&str> {
        self.container_name
            .as_deref()
            .filter(|s| !s.is_empty())
            .or(self.container_id.as_deref())
    }

    /// The channel with the given color, if present.
    pub fn channel(&self, color: Color) -> Option<&DyeChannel> {
        self.channels.iter().find(|c| c.color == color)
    }

    /// Serializes to a structurally valid ABIF file (ignores `content_hash`).
    pub fn to_bytes(&self) -> Vec<u8> {
        write_fsa(self)
    }
}

/// SHA-256 of `bytes` as lowercase hex.
pub fn content_hash(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Color of the 1-based dye number.
pub fn dye_color(dye_number: u8) -> Option<Color> {
    match dye_number {
        1 => Some(Color::Blue),
        2 => Some(Color::Green),
        3 => Some(Color::Yellow),
        4 => Some(Color::Red),
        5 => Some(Color::Orange),
        _ => None,
    }
}

/// `DATA` entry number holding the raw signal of a 1-based dye.
fn raw_data_number(dye_number: u8) -> i32 {
    if dye_number <= 4 {
        i32::from(dye_number)
    } else {
        100 + i32::from(dye_number)
    }
}

// ---------------------------------------------------------------- reading

#[derive(Debug, Clone, Copy)]
struct Entry<'a> {
    elem_type: i16,
    elem_size: i16,
    count: usize,
    data: &'a [u8],
}

struct Directory<'a> {
    entries: HashMap<([u8; 4], i32), Entry<'a>>,
}

fn be_u16(b: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_be_bytes(b.get(at..at + 2)?.try_into().ok()?))
}
fn be_i16(b: &[u8], at: usize) -> Option<i16> {
    be_u16(b, at).map(|v| v as i16)
}
fn be_i32(b: &[u8], at: usize) -> Option<i32> {
    Some(i32::from_be_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

fn tag_str(tag: &[u8; 4]) -> String {
    String::from_utf8_lossy(tag).into_owned()
}

fn read_entry(bytes: &[u8], at: usize) -> Result<([u8; 4], i32, Entry<'_>), AbifError> {
    let raw = bytes
        .get(at..at + ENTRY_LEN)
        .ok_or_else(|| AbifError::Truncated("directory entry past end of file".into()))?;
    let mut tag = [0u8; 4];
    tag.copy_from_slice(&raw[..4]);
    let field = |o: usize| be_i32(raw, o).unwrap_or(0);
    let number = field(4);
    let elem_type = be_i16(raw, 8).unwrap_or(0);
    let elem_size = be_i16(raw, 10).unwrap_or(0);
    let count = field(12);
    let size = field(16);
    let offset = field(20);
    let bad = |reason: &str| AbifError::BadEntry {
        tag: tag_str(&tag),
        number,
        reason: reason.to_string(),
    };
    if count < 0 || size < 0 {
        return Err(bad("negative element count or data size"));
    }
    let size = size as usize;
    let data = if size <= 4 {
        &raw[20..20 + size]
    } else {
        if offset < 0 {
            return Err(bad("negative data offset"));
        }
        let start = offset as usize;
        let end = start
            .checked_add(size)
            .ok_or_else(|| bad("data range overflows"))?;
        bytes.get(start..end).ok_or_else(|| {
            AbifError::Truncated(format!(
                "data of {} {} past end of file",
                tag_str(&tag),
                number
            ))
        })?
    };
    Ok((
        tag,
        number,
        Entry {
            elem_type,
            elem_size,
            count: count as usize,
            data,
        },
    ))
}

fn read_directory(bytes: &[u8]) -> Result<Directory<'_>, AbifError> {
    if bytes.len() < 4 || &bytes[..4] != b"ABIF" {
        return Err(AbifError::NotAbif);
    }
    if bytes.len() < 6 + ENTRY_LEN {
        return Err(AbifError::Truncated("header".into()));
    }
    let (tag, _, root) = read_entry(bytes, 6)?;
    if &tag != b"tdir" {
        return Err(AbifError::BadDirectory("root entry is not 'tdir'".into()));
    }
    if root.count > MAX_ENTRIES {
        return Err(AbifError::BadDirectory(format!("{} entries", root.count)));
    }
    let offset = be_i32(bytes, 6 + 20).unwrap_or(-1);
    if offset < 0 {
        return Err(AbifError::BadDirectory("negative directory offset".into()));
    }
    let offset = offset as usize;
    let needed = root
        .count
        .checked_mul(ENTRY_LEN)
        .and_then(|n| n.checked_add(offset))
        .ok_or_else(|| AbifError::BadDirectory("directory size overflows".into()))?;
    if needed > bytes.len() {
        return Err(AbifError::Truncated("directory past end of file".into()));
    }
    let mut entries = HashMap::with_capacity(root.count);
    for i in 0..root.count {
        let (tag, number, e) = read_entry(bytes, offset + i * ENTRY_LEN)?;
        entries.entry((tag, number)).or_insert(e);
    }
    Ok(Directory { entries })
}

impl<'a> Directory<'a> {
    fn get(&self, tag: &[u8; 4], number: i32) -> Option<Entry<'a>> {
        self.entries.get(&(*tag, number)).copied()
    }

    fn has_tag(&self, tag: &[u8; 4]) -> bool {
        self.entries.keys().any(|(t, _)| t == tag)
    }

    fn string(&self, tag: &[u8; 4], number: i32) -> Option<String> {
        let e = self.get(tag, number)?;
        let bytes = match e.elem_type {
            // pString: length byte, then text.
            18 => {
                let len = usize::from(*e.data.first()?);
                e.data.get(1..1 + len.min(e.data.len().saturating_sub(1)))?
            }
            _ => e.data,
        };
        let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
        let s = String::from_utf8_lossy(&bytes[..end]).trim().to_string();
        Some(s)
    }

    /// Integer array of any integer element type.
    fn ints(&self, tag: &[u8; 4], number: i32) -> Result<Option<Vec<i64>>, AbifError> {
        let Some(e) = self.get(tag, number) else {
            return Ok(None);
        };
        let bad = |reason: String| AbifError::BadEntry {
            tag: tag_str(tag),
            number,
            reason,
        };
        let width = match e.elem_type {
            1 | 2 => 1,
            3 | 4 => 2,
            5 => 4,
            t => return Err(bad(format!("element type {t} is not an integer type"))),
        };
        if e.elem_size > 0 && e.elem_size as usize != width {
            return Err(bad(format!(
                "element size {} for type {}",
                e.elem_size, e.elem_type
            )));
        }
        let n = e.count.min(e.data.len() / width);
        if n < e.count {
            return Err(bad(format!(
                "{} elements declared, {} bytes of data",
                e.count,
                e.data.len()
            )));
        }
        let d = e.data;
        let out = (0..n)
            .map(|i| match e.elem_type {
                1 => i64::from(d[i]),
                2 => i64::from(d[i] as i8),
                3 => i64::from(u16::from_be_bytes([d[2 * i], d[2 * i + 1]])),
                4 => i64::from(i16::from_be_bytes([d[2 * i], d[2 * i + 1]])),
                _ => i64::from(i32::from_be_bytes([
                    d[4 * i],
                    d[4 * i + 1],
                    d[4 * i + 2],
                    d[4 * i + 3],
                ])),
            })
            .collect();
        Ok(Some(out))
    }

    fn first_int(&self, tag: &[u8; 4], number: i32) -> Option<i64> {
        self.ints(tag, number).ok().flatten()?.first().copied()
    }

    fn shorts(&self, tag: &[u8; 4], number: i32) -> Result<Option<Vec<i16>>, AbifError> {
        Ok(self.ints(tag, number)?.map(|v| {
            v.into_iter()
                .map(|x| x.clamp(i16::MIN as i64, i16::MAX as i64) as i16)
                .collect()
        }))
    }

    fn run_start(&self) -> Option<RunDateTime> {
        let d = self
            .get(b"RUND", 1)
            .filter(|e| e.elem_type == 10 && e.data.len() >= 4)?;
        let t = self
            .get(b"RUNT", 1)
            .filter(|e| e.elem_type == 11 && e.data.len() >= 4);
        let (hour, minute, second) = t.map_or((0, 0, 0), |t| (t.data[0], t.data[1], t.data[2]));
        Some(RunDateTime {
            year: i16::from_be_bytes([d.data[0], d.data[1]]),
            month: d.data[2],
            day: d.data[3],
            hour,
            minute,
            second,
        })
    }

    fn dye_count(&self) -> usize {
        if let Some(n) = self.first_int(b"Dye#", 1) {
            if n > 0 {
                return n as usize;
            }
        }
        let named = (1..=8)
            .take_while(|&k| self.get(b"DyeN", k).is_some() || self.get(b"DyeW", k).is_some())
            .count();
        if named > 0 {
            return named;
        }
        (1u8..=8)
            .take_while(|&k| self.get(b"DATA", raw_data_number(k)).is_some())
            .count()
    }
}

/// Parses an ABIF/FSA file.
pub fn parse_fsa(bytes: &[u8]) -> Result<Fsa, AbifError> {
    let dir = read_directory(bytes)?;
    if !dir.has_tag(b"DATA") {
        return Err(AbifError::Missing("DATA".into()));
    }
    let n_dyes = dir.dye_count();
    if !(1..=5).contains(&n_dyes) {
        return Err(AbifError::UnsupportedDyeCount(n_dyes));
    }
    let mut channels = Vec::with_capacity(n_dyes);
    for k in 1..=n_dyes as u8 {
        let num = raw_data_number(k);
        let data = dir
            .shorts(b"DATA", num)?
            .ok_or_else(|| AbifError::Missing(format!("DATA {num}")))?;
        let color = dye_color(k).ok_or(AbifError::UnsupportedDyeCount(n_dyes))?;
        channels.push(DyeChannel {
            dye_number: k,
            color,
            dye_name: dir.string(b"DyeN", i32::from(k)).filter(|s| !s.is_empty()),
            wavelength: dir
                .first_int(b"DyeW", i32::from(k))
                .and_then(|w| u16::try_from(w).ok()),
            data,
        });
    }
    let mut offscale: Vec<usize> = Vec::new();
    for tag in [b"OfSc", b"Satd"] {
        if let Some(v) = dir.ints(tag, 1)? {
            offscale.extend(v.into_iter().filter_map(|x| usize::try_from(x).ok()));
        }
    }
    offscale.sort_unstable();
    offscale.dedup();
    let trace =
        |n: i32| -> Result<Vec<i16>, AbifError> { Ok(dir.shorts(b"DATA", n)?.unwrap_or_default()) };
    let well = dir
        .string(b"TUBE", 1)
        .filter(|s| !s.is_empty())
        .map(|w| crate::plate::normalize_label(&w).unwrap_or(w));
    let nonempty = |s: Option<String>| s.filter(|s| !s.is_empty());
    Ok(Fsa {
        channels,
        // Fragment-analysis files use SpNm; sequencing files only have SMPL.
        sample_name: nonempty(dir.string(b"SpNm", 1)).or_else(|| nonempty(dir.string(b"SMPL", 1))),
        container_id: nonempty(dir.string(b"CTID", 1)),
        container_name: nonempty(dir.string(b"CTNM", 1)),
        well,
        run_start: dir.run_start(),
        instrument_name: nonempty(dir.string(b"MCHN", 1)),
        instrument_model: nonempty(dir.string(b"MODL", 1)),
        plate_size: dir
            .first_int(b"PSZE", 1)
            .and_then(|v| u32::try_from(v).ok())
            .filter(|&v| v > 0),
        offscale_indices: offscale,
        run_traces: RunTraces {
            voltage: trace(5)?,
            current: trace(6)?,
            power: trace(7)?,
            temperature: trace(8)?,
        },
        content_hash: content_hash(bytes),
    })
}

// ---------------------------------------------------------------- writing

struct OutEntry {
    tag: [u8; 4],
    number: i32,
    elem_type: i16,
    elem_size: i16,
    count: i32,
    data: Vec<u8>,
}

impl OutEntry {
    fn shorts(tag: &[u8; 4], number: i32, v: &[i16]) -> Self {
        OutEntry {
            tag: *tag,
            number,
            elem_type: 4,
            elem_size: 2,
            count: v.len() as i32,
            data: v.iter().flat_map(|x| x.to_be_bytes()).collect(),
        }
    }
    fn longs(tag: &[u8; 4], number: i32, v: &[i32]) -> Self {
        OutEntry {
            tag: *tag,
            number,
            elem_type: 5,
            elem_size: 4,
            count: v.len() as i32,
            data: v.iter().flat_map(|x| x.to_be_bytes()).collect(),
        }
    }
    fn pstring(tag: &[u8; 4], number: i32, s: &str) -> Self {
        let b = &s.as_bytes()[..s.len().min(255)];
        let mut data = vec![b.len() as u8];
        data.extend_from_slice(b);
        OutEntry {
            tag: *tag,
            number,
            elem_type: 18,
            elem_size: 1,
            count: data.len() as i32,
            data,
        }
    }
    fn cstring(tag: &[u8; 4], number: i32, s: &str) -> Self {
        let mut data = s.as_bytes().to_vec();
        data.push(0);
        OutEntry {
            tag: *tag,
            number,
            elem_type: 19,
            elem_size: 1,
            count: data.len() as i32,
            data,
        }
    }
    fn chars(tag: &[u8; 4], number: i32, s: &str) -> Self {
        OutEntry {
            tag: *tag,
            number,
            elem_type: 2,
            elem_size: 1,
            count: s.len() as i32,
            data: s.as_bytes().to_vec(),
        }
    }
    fn raw(tag: &[u8; 4], number: i32, elem_type: i16, data: Vec<u8>) -> Self {
        OutEntry {
            tag: *tag,
            number,
            elem_type,
            elem_size: data.len() as i16,
            count: 1,
            data,
        }
    }
}

fn write_fsa(fsa: &Fsa) -> Vec<u8> {
    let mut e: Vec<OutEntry> = Vec::new();
    for ch in &fsa.channels {
        let k = i32::from(ch.dye_number);
        e.push(OutEntry::shorts(
            b"DATA",
            raw_data_number(ch.dye_number),
            &ch.data,
        ));
        if let Some(name) = &ch.dye_name {
            e.push(OutEntry::pstring(b"DyeN", k, name));
        }
        if let Some(w) = ch.wavelength {
            e.push(OutEntry::shorts(b"DyeW", k, &[w as i16]));
        }
    }
    e.push(OutEntry::shorts(b"Dye#", 1, &[fsa.channels.len() as i16]));
    let traces = [
        (5, &fsa.run_traces.voltage),
        (6, &fsa.run_traces.current),
        (7, &fsa.run_traces.power),
        (8, &fsa.run_traces.temperature),
    ];
    for (n, t) in traces {
        if !t.is_empty() {
            e.push(OutEntry::shorts(b"DATA", n, t));
        }
    }
    if let Some(s) = &fsa.sample_name {
        e.push(OutEntry::pstring(b"SpNm", 1, s));
    }
    if let Some(s) = &fsa.container_id {
        e.push(OutEntry::cstring(b"CTID", 1, s));
    }
    if let Some(s) = &fsa.container_name {
        e.push(OutEntry::cstring(b"CTNM", 1, s));
    }
    if let Some(s) = &fsa.well {
        e.push(OutEntry::pstring(b"TUBE", 1, s));
    }
    if let Some(s) = &fsa.instrument_name {
        e.push(OutEntry::pstring(b"MCHN", 1, s));
    }
    if let Some(s) = &fsa.instrument_model {
        e.push(OutEntry::chars(b"MODL", 1, s));
    }
    if let Some(p) = fsa.plate_size {
        e.push(OutEntry::longs(b"PSZE", 1, &[p as i32]));
    }
    if let Some(d) = fsa.run_start {
        let mut date = d.year.to_be_bytes().to_vec();
        date.extend([d.month, d.day]);
        e.push(OutEntry::raw(b"RUND", 1, 10, date));
        e.push(OutEntry::raw(
            b"RUNT",
            1,
            11,
            vec![d.hour, d.minute, d.second, 0],
        ));
    }
    if !fsa.offscale_indices.is_empty() {
        let v: Vec<i32> = fsa.offscale_indices.iter().map(|&i| i as i32).collect();
        e.push(OutEntry::longs(b"OfSc", 1, &v));
    }
    e.sort_by(|a, b| (a.tag, a.number).cmp(&(b.tag, b.number)));

    let mut out = vec![0u8; HEADER_LEN];
    let mut offsets = Vec::with_capacity(e.len());
    for entry in &e {
        if entry.data.len() > 4 {
            offsets.push(out.len() as i32);
            out.extend_from_slice(&entry.data);
        } else {
            offsets.push(0);
        }
    }
    let dir_offset = out.len() as i32;
    for (entry, &off) in e.iter().zip(&offsets) {
        out.extend_from_slice(&entry.tag);
        out.extend_from_slice(&entry.number.to_be_bytes());
        out.extend_from_slice(&entry.elem_type.to_be_bytes());
        out.extend_from_slice(&entry.elem_size.to_be_bytes());
        out.extend_from_slice(&entry.count.to_be_bytes());
        out.extend_from_slice(&(entry.data.len() as i32).to_be_bytes());
        if entry.data.len() > 4 {
            out.extend_from_slice(&off.to_be_bytes());
        } else {
            let mut inline = [0u8; 4];
            inline[..entry.data.len()].copy_from_slice(&entry.data);
            out.extend_from_slice(&inline);
        }
        out.extend_from_slice(&0i32.to_be_bytes());
    }
    out[..4].copy_from_slice(b"ABIF");
    out[4..6].copy_from_slice(&101u16.to_be_bytes());
    let mut root = Vec::with_capacity(ENTRY_LEN);
    root.extend_from_slice(b"tdir");
    root.extend_from_slice(&1i32.to_be_bytes());
    root.extend_from_slice(&1023i16.to_be_bytes());
    root.extend_from_slice(&(ENTRY_LEN as i16).to_be_bytes());
    root.extend_from_slice(&(e.len() as i32).to_be_bytes());
    root.extend_from_slice(&((e.len() * ENTRY_LEN) as i32).to_be_bytes());
    root.extend_from_slice(&dir_offset.to_be_bytes());
    root.extend_from_slice(&0i32.to_be_bytes());
    out[6..6 + ENTRY_LEN].copy_from_slice(&root);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::{RngExt, SeedableRng};

    fn sample(n_dyes: u8) -> Fsa {
        let channels = (1..=n_dyes)
            .map(|k| DyeChannel {
                dye_number: k,
                color: dye_color(k).unwrap(),
                dye_name: Some(format!("DYE{k}")),
                wavelength: Some(500 + 20 * u16::from(k)),
                data: (0..300)
                    .map(|i| ((i * 37 + i32::from(k) * 11) % 2000 - 300) as i16)
                    .collect(),
            })
            .collect();
        Fsa {
            channels,
            sample_name: Some("S-001".into()),
            container_id: Some("PLATE_ID".into()),
            container_name: Some("Plate 1".into()),
            well: Some("B07".into()),
            run_start: Some(RunDateTime {
                year: 2024,
                month: 3,
                day: 9,
                hour: 14,
                minute: 5,
                second: 59,
            }),
            instrument_name: Some("3730xl-01".into()),
            instrument_model: Some("3730".into()),
            plate_size: Some(96),
            offscale_indices: vec![3, 4, 120],
            run_traces: RunTraces {
                voltage: vec![150, 151, 152],
                current: vec![10, 11],
                power: vec![1],
                temperature: vec![60, 60, 61],
            },
            content_hash: String::new(),
        }
    }

    #[test]
    fn round_trips_four_and_five_dyes() {
        for n in [4, 5] {
            let fsa = sample(n);
            let bytes = fsa.to_bytes();
            let parsed = parse_fsa(&bytes).unwrap();
            assert_eq!(parsed.content_hash, content_hash(&bytes));
            assert_eq!(parsed.content_hash.len(), 64);
            let mut expect = fsa.clone();
            expect.content_hash = parsed.content_hash.clone();
            assert_eq!(parsed, expect);
            assert_eq!(parsed.plate_label(), Some("Plate 1"));
            assert_eq!(
                parsed.channels.last().unwrap().color,
                if n == 4 { Color::Red } else { Color::Orange }
            );
        }
    }

    #[test]
    fn hash_is_stable_and_content_sensitive() {
        let a = sample(4).to_bytes();
        let mut b = a.clone();
        assert_eq!(content_hash(&a), content_hash(&b));
        let last = b.len() - 1;
        b[last] ^= 1;
        assert_ne!(content_hash(&a), content_hash(&b));
        assert_eq!(
            content_hash(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn short_well_labels_are_normalized() {
        let mut fsa = sample(4);
        fsa.well = Some("E1".into());
        let parsed = parse_fsa(&fsa.to_bytes()).unwrap();
        assert_eq!(parsed.well.as_deref(), Some("E01"));
    }

    #[test]
    fn rejects_non_abif_and_missing_data() {
        assert_eq!(parse_fsa(b""), Err(AbifError::NotAbif));
        assert_eq!(parse_fsa(b"GIF89a....."), Err(AbifError::NotAbif));
        let mut fsa = sample(4);
        fsa.channels.clear();
        assert!(parse_fsa(&fsa.to_bytes()).is_err());
    }

    #[test]
    fn truncated_files_error_without_panicking() {
        let bytes = sample(5).to_bytes();
        for cut in (0..bytes.len()).step_by(7) {
            assert!(parse_fsa(&bytes[..cut]).is_err(), "cut at {cut}");
        }
    }

    #[test]
    fn garbled_files_never_panic() {
        let bytes = sample(5).to_bytes();
        let mut rng = rand_chacha::ChaCha8Rng::seed_from_u64(7);
        for _ in 0..3000 {
            let mut b = bytes.clone();
            let flips = rng.random_range(1..20);
            for _ in 0..flips {
                // Bias toward the header and directory, where structure lives.
                let i = if rng.random_bool(0.5) {
                    rng.random_range(0..HEADER_LEN)
                } else {
                    rng.random_range(b.len() - 30 * ENTRY_LEN..b.len())
                };
                b[i] = rng.random();
            }
            let _ = parse_fsa(&b);
        }
        for len in 0..200 {
            let junk: Vec<u8> = (0..len).map(|_| rng.random()).collect();
            let mut with_sig = b"ABIF".to_vec();
            with_sig.extend(&junk);
            let _ = parse_fsa(&junk);
            let _ = parse_fsa(&with_sig);
        }
    }

    /// Parses real ABIF files when `MICROSPAT_ABIF_SAMPLES` points at a
    /// directory of them (e.g. Biopython's `Tests/Abi`). Never committed.
    #[test]
    fn parses_external_samples_if_present() {
        let Ok(dir) = std::env::var("MICROSPAT_ABIF_SAMPLES") else {
            return;
        };
        let Ok(rd) = std::fs::read_dir(&dir) else {
            return;
        };
        for entry in rd.flatten() {
            let Ok(bytes) = std::fs::read(entry.path()) else {
                continue;
            };
            match parse_fsa(&bytes) {
                Ok(f) => eprintln!(
                    "{:?}: {} dyes {:?} n={} sample={:?} well={:?} plate={:?} run={:?} model={:?} machine={:?} psze={:?} offscale={} v={}",
                    entry.file_name(),
                    f.channels.len(),
                    f.channels.iter().map(|c| (c.dye_name.clone(), c.wavelength, c.color)).collect::<Vec<_>>(),
                    f.channels.first().map_or(0, |c| c.data.len()),
                    f.sample_name,
                    f.well,
                    f.plate_label(),
                    f.run_start.map(|d| d.iso8601()),
                    f.instrument_model,
                    f.instrument_name,
                    f.plate_size,
                    f.offscale_indices.len(),
                    f.run_traces.voltage.len()
                ),
                Err(e) => eprintln!("{:?}: error {e}", entry.file_name()),
            }
        }
    }
}
