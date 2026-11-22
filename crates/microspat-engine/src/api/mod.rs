//! RPC methods, one module per entity. [`register`] lists every module; a new
//! module adds its `register` call here.
//!
//! Naming: `verb_noun` in snake_case (`list_plates`, `get_plate`,
//! `create_locus`, `apply_plate_map`). Reads are `list_*` (summaries) and
//! `get_*` (one item with detail); writes are `create_*`, `update_*`,
//! `delete_*`, `import_*`, or a verb for the action.

pub mod artifacts;
pub mod bins;
pub mod calls;
pub mod controls;
pub mod demo;
pub mod exports;
pub mod import;
pub mod ladders;
pub mod loci;
pub mod plate_map;
pub mod plates;
pub mod projects;
pub mod quality;
pub mod samples;
pub mod settings;
pub mod workspace;

use crate::error::{io_err, Result, RpcError};
use crate::rpc::Registry;
use microspat_core::Color;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// TypeScript-only type `Partial<T>`, for params whose omitted fields take
/// defaults: `#[ts(as = "TsPartial<T>")]` on a field of type `T`. Callers
/// that send a full `T` still type-check.
pub struct TsPartial<T>(std::marker::PhantomData<T>);

impl<T: TS + 'static> TS for TsPartial<T> {
    type WithoutGenerics = Self;
    type OptionInnerType = Self;

    fn name(cfg: &ts_rs::Config) -> String {
        format!("Partial<{}>", T::name(cfg))
    }

    fn inline(cfg: &ts_rs::Config) -> String {
        Self::name(cfg)
    }

    fn visit_dependencies(v: &mut impl ts_rs::TypeVisitor)
    where
        Self: 'static,
    {
        T::visit_dependencies(v);
    }

    fn visit_generics(v: &mut impl ts_rs::TypeVisitor)
    where
        Self: 'static,
    {
        T::visit_generics(v);
        v.visit::<T>();
    }
}

/// TypeScript-only type `{ [K in keyof T]?: Partial<T[K]> }`: every section
/// optional and partial, for parameters merged into stored values.
pub struct TsPartialSections<T>(std::marker::PhantomData<T>);

impl<T: TS + 'static> TS for TsPartialSections<T> {
    type WithoutGenerics = Self;
    type OptionInnerType = Self;

    fn name(cfg: &ts_rs::Config) -> String {
        let t = T::name(cfg);
        format!("{{ [K in keyof {t}]?: Partial<{t}[K]> }}")
    }

    fn inline(cfg: &ts_rs::Config) -> String {
        Self::name(cfg)
    }

    fn visit_dependencies(v: &mut impl ts_rs::TypeVisitor)
    where
        Self: 'static,
    {
        T::visit_dependencies(v);
    }

    fn visit_generics(v: &mut impl ts_rs::TypeVisitor)
    where
        Self: 'static,
    {
        T::visit_generics(v);
        v.visit::<T>();
    }
}

/// Registers every method.
pub fn register(r: &mut Registry) {
    workspace::register(r);
    ladders::register(r);
    loci::register(r);
    samples::register(r);
    plates::register(r);
    import::register(r);
    plate_map::register(r);
    settings::register(r);
    projects::register(r);
    bins::register(r);
    artifacts::register(r);
    controls::register(r);
    calls::register(r);
    exports::register(r);
    quality::register(r);
}

/// Params of methods that take only an id.
#[derive(Debug, Clone, Copy, Deserialize, TS)]
pub struct IdParams {
    pub id: i64,
}

/// CSV input: a file path (from a picker or an upload) or the text itself.
#[derive(Debug, Clone, Default, Deserialize, TS)]
pub struct CsvSource {
    #[serde(default)]
    #[ts(optional)]
    pub path: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub content: Option<String>,
}

impl CsvSource {
    /// The CSV text.
    pub fn read(&self) -> Result<String> {
        match (&self.path, &self.content) {
            (_, Some(c)) => Ok(c.clone()),
            (Some(p), None) => {
                let path = std::path::Path::new(p);
                let bytes = std::fs::read(path).map_err(|e| io_err(path, e))?;
                // Spreadsheets often save CSV with a BOM or in Latin-1.
                let text = match String::from_utf8(bytes) {
                    Ok(s) => s,
                    Err(e) => e.into_bytes().iter().map(|&b| b as char).collect(),
                };
                Ok(text.trim_start_matches('\u{feff}').to_string())
            }
            (None, None) => Err(RpcError::invalid(
                "Give either a CSV file path or its content.",
            )),
        }
    }
}

/// An exported text file for the UI to save.
#[derive(Debug, Clone, Serialize, TS)]
pub struct TextFile {
    pub filename: String,
    pub content: String,
}

/// Trims a label and rejects empty ones.
pub(crate) fn check_label(label: &str, what: &str) -> Result<String> {
    let t = label.trim();
    if t.is_empty() {
        return Err(RpcError::invalid(format!("{what} label cannot be empty.")));
    }
    if t.len() > 200 {
        return Err(RpcError::invalid(format!("{what} label is too long.")));
    }
    Ok(t.to_string())
}

/// Reads a JSON text column.
pub(crate) fn json_col<T: DeserializeOwned>(r: &rusqlite::Row, i: usize) -> rusqlite::Result<T> {
    let s: String = r.get(i)?;
    serde_json::from_str(&s).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(i, rusqlite::types::Type::Text, Box::new(e))
    })
}

/// Database form of a color (`blue`, ...).
pub(crate) fn color_str(c: Color) -> &'static str {
    match c {
        Color::Blue => "blue",
        Color::Green => "green",
        Color::Yellow => "yellow",
        Color::Red => "red",
        Color::Orange => "orange",
    }
}

/// Parses a color name, case-insensitively.
pub(crate) fn parse_color(s: &str) -> Option<Color> {
    match s.trim().to_ascii_lowercase().as_str() {
        "blue" => Some(Color::Blue),
        "green" => Some(Color::Green),
        "yellow" => Some(Color::Yellow),
        "red" => Some(Color::Red),
        "orange" => Some(Color::Orange),
        _ => None,
    }
}

/// Reads a color column.
pub fn color_col(r: &rusqlite::Row, i: usize) -> rusqlite::Result<Color> {
    let s: String = r.get(i)?;
    parse_color(&s).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            i,
            rusqlite::types::Type::Text,
            format!("unknown color {s}").into(),
        )
    })
}

/// Normalizes a CSV header for matching: lowercase alphanumerics only.
pub(crate) fn header_key(h: &str) -> String {
    h.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

/// Lists up to `n` items, with "and N more".
pub(crate) fn some_of<S: AsRef<str>>(items: &[S], n: usize) -> String {
    let shown: Vec<&str> = items.iter().take(n).map(|s| s.as_ref()).collect();
    if items.len() > n {
        format!("{}, and {} more", shown.join(", "), items.len() - n)
    } else {
        shown.join(", ")
    }
}

/// `?1, ?2, …` placeholders are awkward for id lists; this renders a safe literal list.
pub fn id_list(ids: &[i64]) -> String {
    ids.iter()
        .map(|i| i.to_string())
        .collect::<Vec<_>>()
        .join(",")
}

/// Renders rows as CSV text.
pub(crate) fn csv_text(rows: &[Vec<String>]) -> Result<String> {
    let mut out = csv::Writer::from_writer(Vec::new());
    for r in rows {
        out.write_record(r)
            .map_err(|e| RpcError::internal(e.to_string()))?;
    }
    let bytes = out
        .into_inner()
        .map_err(|e| RpcError::internal(e.to_string()))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// A title made safe for a file name.
pub(crate) fn safe_filename(title: &str) -> String {
    title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}
