//! Loci (markers) and locus sets.

use super::{
    check_label, color_col, color_str, header_key, id_list, parse_color, some_of, CsvSource,
    IdParams,
};
use crate::error::{OrNotFound, Result, RpcError};
use crate::events::entity::{LOCI, LOCUS_SETS, PLATES};
use crate::rpc::Registry;
use crate::Engine;
use microspat_core::{Color, LocusInfo};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use ts_rs::TS;

/// A locus with usage counts.
#[derive(Debug, Clone, Serialize, TS)]
pub struct Locus {
    pub id: i64,
    pub label: String,
    pub color: Color,
    pub min_base_length: f64,
    pub max_base_length: f64,
    pub nucleotide_repeat_length: f64,
    /// Runs assigned to this locus by plate maps.
    pub run_count: u32,
    /// Locus sets containing this locus.
    pub locus_set_ids: Vec<i64>,
}

impl Locus {
    /// The analysis view of this locus.
    pub fn info(&self) -> LocusInfo {
        LocusInfo {
            label: self.label.clone(),
            min_base_length: self.min_base_length,
            max_base_length: self.max_base_length,
            nucleotide_repeat_length: self.nucleotide_repeat_length,
            color: self.color,
        }
    }
}

/// Params of `create_locus`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateLocusParams {
    pub label: String,
    pub color: Color,
    pub min_base_length: f64,
    pub max_base_length: f64,
    pub nucleotide_repeat_length: f64,
}

/// Params of `update_locus`. Omitted fields are unchanged.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateLocusParams {
    pub id: i64,
    #[serde(default)]
    #[ts(optional)]
    pub label: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub color: Option<Color>,
    #[serde(default)]
    #[ts(optional)]
    pub min_base_length: Option<f64>,
    #[serde(default)]
    #[ts(optional)]
    pub max_base_length: Option<f64>,
    #[serde(default)]
    #[ts(optional)]
    pub nucleotide_repeat_length: Option<f64>,
}

/// Result of `import_loci_csv`.
#[derive(Debug, Clone, Serialize, TS)]
pub struct ImportLociResult {
    pub created: Vec<Locus>,
}

/// A locus set (summary).
#[derive(Debug, Clone, Serialize, TS)]
pub struct LocusSet {
    pub id: i64,
    pub label: String,
    pub locus_ids: Vec<i64>,
}

/// A locus set with its loci.
#[derive(Debug, Clone, Serialize, TS)]
pub struct LocusSetDetail {
    pub id: i64,
    pub label: String,
    pub loci: Vec<Locus>,
}

/// Params of `create_locus_set`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateLocusSetParams {
    pub label: String,
    pub locus_ids: Vec<i64>,
}

/// Params of `update_locus_set`. Omitted fields are unchanged.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateLocusSetParams {
    pub id: i64,
    #[serde(default)]
    #[ts(optional)]
    pub label: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub locus_ids: Option<Vec<i64>>,
}

pub(crate) fn register(r: &mut Registry) {
    r.query("list_loci", "All loci with run counts.", list);
    r.query("get_locus", "One locus.", get);
    r.mutation(
        "create_locus",
        &[LOCI],
        "Create a locus. Labels are unique (case-insensitive).",
        create,
    );
    r.mutation(
        "update_locus",
        &[LOCI, PLATES],
        "Change a locus. Changing the size range recomputes the signal of its runs; the dye cannot change while runs use it.",
        update,
    );
    r.mutation(
        "delete_locus",
        &[LOCI],
        "Delete a locus that no run or locus set uses.",
        delete,
    );
    r.mutation(
        "import_loci_csv",
        &[LOCI],
        "Create loci from a CSV with header Label, Min. Base Length, Max. Base Length, Nucleotide Repeat Length, Color. All rows are checked first; nothing is created if any row is invalid.",
        import_csv,
    );
    r.query("list_locus_sets", "All locus sets.", list_sets);
    r.query("get_locus_set", "One locus set with its loci.", get_set);
    r.mutation(
        "create_locus_set",
        &[LOCUS_SETS, LOCI],
        "Create a locus set.",
        create_set,
    );
    r.mutation(
        "update_locus_set",
        &[LOCUS_SETS, LOCI],
        "Rename a locus set or replace its loci.",
        update_set,
    );
    r.mutation(
        "delete_locus_set",
        &[LOCUS_SETS, LOCI],
        "Delete a locus set.",
        delete_set,
    );
}

const SELECT: &str = "SELECT l.id, l.label, l.color, l.min_base_length, l.max_base_length,
    l.nucleotide_repeat_length,
    (SELECT COUNT(*) FROM run r WHERE r.locus_id = l.id),
    (SELECT group_concat(m.locus_set_id) FROM locus_set_member m WHERE m.locus_id = l.id)
    FROM locus l";

fn row_to_locus(r: &rusqlite::Row) -> rusqlite::Result<Locus> {
    let sets: Option<String> = r.get(7)?;
    let mut locus_set_ids: Vec<i64> = sets
        .unwrap_or_default()
        .split(',')
        .filter_map(|s| s.parse().ok())
        .collect();
    locus_set_ids.sort_unstable();
    Ok(Locus {
        id: r.get(0)?,
        label: r.get(1)?,
        color: color_col(r, 2)?,
        min_base_length: r.get(3)?,
        max_base_length: r.get(4)?,
        nucleotide_repeat_length: r.get(5)?,
        run_count: r.get(6)?,
        locus_set_ids,
    })
}

/// Loads one locus.
pub fn load(conn: &Connection, id: i64) -> Result<Locus> {
    conn.query_row(&format!("{SELECT} WHERE l.id = ?1"), [id], row_to_locus)
        .optional()?
        .or_not_found(|| format!("Locus {id} does not exist"))
}

/// All loci, by label.
pub fn load_all(conn: &Connection) -> Result<Vec<Locus>> {
    let mut st = conn.prepare(&format!("{SELECT} ORDER BY l.label"))?;
    let rows = st.query_map([], row_to_locus)?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

fn check_locus(label: &str, min: f64, max: f64, repeat: f64) -> Result<String> {
    let label = check_label(label, "Locus")?;
    if !(min.is_finite() && max.is_finite() && min >= 0.0 && min < max) {
        return Err(RpcError::invalid(format!(
            "Locus {label}: the size range must satisfy 0 ≤ min < max (got {min}–{max})."
        )));
    }
    if !(repeat.is_finite() && repeat > 0.0 && repeat <= 100.0) {
        return Err(RpcError::invalid(format!(
            "Locus {label}: the repeat length must be a positive number of bases."
        )));
    }
    Ok(label)
}

/// The stored label of another locus with this label (case-insensitive), if any.
fn label_taken(c: &Connection, label: &str, except: i64) -> Result<Option<String>> {
    Ok(c.query_row(
        "SELECT label FROM locus WHERE label = ?1 AND id != ?2",
        params![label, except],
        |r| r.get(0),
    )
    .optional()?)
}

fn insert(c: &Connection, p: &CreateLocusParams, label: &str) -> Result<i64> {
    c.execute(
        "INSERT INTO locus (label, color, min_base_length, max_base_length, nucleotide_repeat_length)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![label, color_str(p.color), p.min_base_length, p.max_base_length, p.nucleotide_repeat_length],
    )?;
    Ok(c.last_insert_rowid())
}

fn list(e: &Engine, _: ()) -> Result<Vec<Locus>> {
    e.workspace()?.read(load_all)
}

fn get(e: &Engine, p: IdParams) -> Result<Locus> {
    e.workspace()?.read(|c| load(c, p.id))
}

pub(crate) fn create_inner(c: &Connection, p: &CreateLocusParams) -> Result<Locus> {
    let label = check_locus(
        &p.label,
        p.min_base_length,
        p.max_base_length,
        p.nucleotide_repeat_length,
    )?;
    if let Some(existing) = label_taken(c, &label, 0)? {
        return Err(RpcError::conflict(format!(
            "A locus named \"{existing}\" already exists."
        )));
    }
    let id = insert(c, p, &label)?;
    load(c, id)
}

fn create(e: &Engine, p: CreateLocusParams) -> Result<Locus> {
    let locus = e.workspace()?.write(|tx| create_inner(tx, &p))?;
    e.changed(LOCI, Some(vec![locus.id]));
    Ok(locus)
}

fn update(e: &Engine, p: UpdateLocusParams) -> Result<Locus> {
    let mut range_changed = false;
    let ws = e.workspace()?;
    let locus = ws.write(|tx| {
        let cur = load(tx, p.id)?;
        let label = p.label.clone().unwrap_or(cur.label.clone());
        let min = p.min_base_length.unwrap_or(cur.min_base_length);
        let max = p.max_base_length.unwrap_or(cur.max_base_length);
        let repeat = p.nucleotide_repeat_length.unwrap_or(cur.nucleotide_repeat_length);
        let color = p.color.unwrap_or(cur.color);
        let label = check_locus(&label, min, max, repeat)?;
        if let Some(existing) = label_taken(tx, &label, p.id)? {
            return Err(RpcError::conflict(format!("A locus named \"{existing}\" already exists.")));
        }
        if color != cur.color && cur.run_count > 0 {
            return Err(RpcError::in_use(format!(
                "Locus {} has {} runs on the {} dye; clear those plate maps before changing its dye.",
                cur.label,
                cur.run_count,
                color_str(cur.color)
            )));
        }
        tx.execute(
            "UPDATE locus SET label = ?1, color = ?2, min_base_length = ?3, max_base_length = ?4,
             nucleotide_repeat_length = ?5 WHERE id = ?6",
            params![label, color_str(color), min, max, repeat, p.id],
        )?;
        if (min, max) != (cur.min_base_length, cur.max_base_length) && cur.run_count > 0 {
            range_changed = true;
            super::plate_map::recompute_run_signals(tx, &format!("r.locus_id = {}", p.id))?;
        }
        load(tx, p.id)
    })?;
    e.changed(LOCI, Some(vec![locus.id]));
    if range_changed {
        // Negative controls are checked inside locus ranges.
        let plates = ws.read(|c| crate::quality::plates_of_locus(c, locus.id))?;
        crate::quality::refresh_controls(&ws, &plates)?;
        e.changed(PLATES, None);
    }
    Ok(locus)
}

fn delete(e: &Engine, p: IdParams) -> Result<()> {
    e.workspace()?.write(|tx| {
        let l = load(tx, p.id)?;
        if l.run_count > 0 {
            let mut st = tx.prepare(
                "SELECT DISTINCT pl.label FROM run r JOIN channel c ON c.id = r.channel_id
                 JOIN well w ON w.id = c.well_id JOIN plate pl ON pl.id = w.plate_id
                 WHERE r.locus_id = ?1 ORDER BY pl.label",
            )?;
            let plates: Vec<String> = st
                .query_map([p.id], |r| r.get(0))?
                .collect::<rusqlite::Result<_>>()?;
            return Err(RpcError::in_use(format!(
                "Locus {} has {} runs on plate(s) {}. Clear those plate maps first.",
                l.label,
                l.run_count,
                some_of(&plates, 5)
            )));
        }
        if !l.locus_set_ids.is_empty() {
            let sets = set_labels(tx, &l.locus_set_ids)?;
            return Err(RpcError::in_use(format!(
                "Locus {} is in locus set(s) {}. Remove it from them first.",
                l.label,
                some_of(&sets, 5)
            )));
        }
        tx.execute("DELETE FROM locus WHERE id = ?1", [p.id])?;
        Ok(())
    })?;
    e.changed(LOCI, Some(vec![p.id]));
    Ok(())
}

fn set_labels(c: &Connection, ids: &[i64]) -> Result<Vec<String>> {
    let mut st = c.prepare(&format!(
        "SELECT label FROM locus_set WHERE id IN ({}) ORDER BY label",
        id_list(ids)
    ))?;
    let v = st
        .query_map([], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(v)
}

/// Parses a loci CSV into create params, collecting every problem.
pub fn parse_loci_csv(text: &str) -> Result<Vec<CreateLocusParams>> {
    let mut rdr = csv::ReaderBuilder::new()
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(text.as_bytes());
    let headers: Vec<String> = rdr
        .headers()
        .map_err(|e| RpcError::invalid(format!("Cannot read the CSV header: {e}")))?
        .iter()
        .map(header_key)
        .collect();
    let col = |k: &str| headers.iter().position(|h| h == k);
    let (Some(ci_label), Some(ci_min), Some(ci_max), Some(ci_rep), Some(ci_color)) = (
        col("label"),
        col("minbaselength"),
        col("maxbaselength"),
        col("nucleotiderepeatlength"),
        col("color"),
    ) else {
        return Err(RpcError::invalid(
            "The loci CSV header must contain Label, Min. Base Length, Max. Base Length, Nucleotide Repeat Length, Color.",
        ));
    };
    let mut out = Vec::new();
    let mut problems = Vec::new();
    for (k, rec) in rdr.records().enumerate() {
        let line = k + 2;
        let rec = match rec {
            Ok(r) => r,
            Err(e) => {
                problems.push(format!("line {line}: {e}"));
                continue;
            }
        };
        if rec.iter().all(|f| f.is_empty()) {
            continue;
        }
        let field = |i: usize| rec.get(i).unwrap_or("");
        let num = |i: usize, name: &str, problems: &mut Vec<String>| match field(i).parse::<f64>() {
            Ok(v) => v,
            Err(_) => {
                problems.push(format!(
                    "line {line}: {name} \"{}\" is not a number",
                    field(i)
                ));
                f64::NAN
            }
        };
        let min = num(ci_min, "Min. Base Length", &mut problems);
        let max = num(ci_max, "Max. Base Length", &mut problems);
        let rep = num(ci_rep, "Nucleotide Repeat Length", &mut problems);
        let Some(color) = parse_color(field(ci_color)) else {
            problems.push(format!(
                "line {line}: color \"{}\" must be blue, green, yellow, red or orange",
                field(ci_color)
            ));
            continue;
        };
        out.push((
            line,
            CreateLocusParams {
                label: field(ci_label).to_string(),
                color,
                min_base_length: min,
                max_base_length: max,
                nucleotide_repeat_length: rep,
            },
        ));
    }
    let mut seen = HashSet::new();
    for (line, p) in &out {
        if p.min_base_length.is_nan()
            || p.max_base_length.is_nan()
            || p.nucleotide_repeat_length.is_nan()
        {
            continue;
        }
        match check_locus(
            &p.label,
            p.min_base_length,
            p.max_base_length,
            p.nucleotide_repeat_length,
        ) {
            Err(e) => problems.push(format!("line {line}: {}", e.message)),
            Ok(l) if !seen.insert(l.to_lowercase()) => {
                problems.push(format!("line {line}: {l} appears twice"))
            }
            Ok(_) => {}
        }
    }
    if !problems.is_empty() {
        return Err(RpcError::invalid(format!(
            "The loci CSV has {} problem(s): {}. Nothing was imported.",
            problems.len(),
            some_of(&problems, 8)
        )));
    }
    if out.is_empty() {
        return Err(RpcError::invalid("The loci CSV has no rows."));
    }
    Ok(out.into_iter().map(|(_, p)| p).collect())
}

fn import_csv(e: &Engine, p: CsvSource) -> Result<ImportLociResult> {
    let rows = parse_loci_csv(&p.read()?)?;
    let created = e.workspace()?.write(|tx| {
        let existing: Vec<String> = rows
            .iter()
            .filter_map(|r| label_taken(tx, r.label.trim(), 0).ok().flatten())
            .collect();
        if !existing.is_empty() {
            return Err(RpcError::conflict(format!(
                "These loci already exist: {}. Nothing was imported.",
                some_of(&existing, 8)
            )));
        }
        rows.iter()
            .map(|r| create_inner(tx, r))
            .collect::<Result<Vec<_>>>()
    })?;
    e.changed(LOCI, Some(created.iter().map(|l| l.id).collect()));
    Ok(ImportLociResult { created })
}

// ---------------------------------------------------------------- locus sets

fn load_sets(c: &Connection, filter: &str) -> Result<Vec<LocusSet>> {
    let mut members: BTreeMap<i64, Vec<i64>> = BTreeMap::new();
    let mut st = c.prepare("SELECT m.locus_set_id, m.locus_id FROM locus_set_member m JOIN locus l ON l.id = m.locus_id ORDER BY l.label")?;
    for row in st.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))? {
        let (s, l) = row?;
        members.entry(s).or_default().push(l);
    }
    let mut st = c.prepare(&format!(
        "SELECT id, label FROM locus_set {filter} ORDER BY label"
    ))?;
    let rows = st.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?;
    let mut out = Vec::new();
    for row in rows {
        let (id, label) = row?;
        out.push(LocusSet {
            id,
            label,
            locus_ids: members.remove(&id).unwrap_or_default(),
        });
    }
    Ok(out)
}

/// Loads one locus set with its loci.
pub fn load_set(c: &Connection, id: i64) -> Result<LocusSetDetail> {
    let set = load_sets(c, &format!("WHERE id = {id}"))?
        .pop()
        .or_not_found(|| format!("Locus set {id} does not exist"))?;
    let loci = set
        .locus_ids
        .iter()
        .map(|&l| load(c, l))
        .collect::<Result<_>>()?;
    Ok(LocusSetDetail {
        id: set.id,
        label: set.label,
        loci,
    })
}

fn list_sets(e: &Engine, _: ()) -> Result<Vec<LocusSet>> {
    e.workspace()?.read(|c| load_sets(c, ""))
}

fn get_set(e: &Engine, p: IdParams) -> Result<LocusSetDetail> {
    e.workspace()?.read(|c| load_set(c, p.id))
}

/// The stored label of another locus set with this label (case-insensitive), if any.
fn set_label_taken(c: &Connection, label: &str, except: i64) -> Result<Option<String>> {
    Ok(c.query_row(
        "SELECT label FROM locus_set WHERE label = ?1 AND id != ?2",
        params![label, except],
        |r| r.get(0),
    )
    .optional()?)
}

fn set_members(c: &Connection, set_id: i64, locus_ids: &[i64]) -> Result<()> {
    let ids: HashSet<i64> = locus_ids.iter().copied().collect();
    if ids.is_empty() {
        return Err(RpcError::invalid("A locus set needs at least one locus."));
    }
    for &l in &ids {
        load(c, l)?;
    }
    c.execute(
        "DELETE FROM locus_set_member WHERE locus_set_id = ?1",
        [set_id],
    )?;
    for l in ids {
        c.execute(
            "INSERT INTO locus_set_member (locus_set_id, locus_id) VALUES (?1, ?2)",
            [set_id, l],
        )?;
    }
    Ok(())
}

pub(crate) fn create_set_inner(c: &Connection, p: &CreateLocusSetParams) -> Result<LocusSetDetail> {
    let label = check_label(&p.label, "Locus set")?;
    if let Some(existing) = set_label_taken(c, &label, 0)? {
        return Err(RpcError::conflict(format!(
            "A locus set named \"{existing}\" already exists."
        )));
    }
    c.execute("INSERT INTO locus_set (label) VALUES (?1)", [&label])?;
    let id = c.last_insert_rowid();
    set_members(c, id, &p.locus_ids)?;
    load_set(c, id)
}

fn create_set(e: &Engine, p: CreateLocusSetParams) -> Result<LocusSetDetail> {
    let set = e.workspace()?.write(|tx| create_set_inner(tx, &p))?;
    e.changed(LOCUS_SETS, Some(vec![set.id]));
    e.changed(LOCI, None);
    Ok(set)
}

fn update_set(e: &Engine, p: UpdateLocusSetParams) -> Result<LocusSetDetail> {
    let set = e.workspace()?.write(|tx| {
        load_set(tx, p.id)?;
        if let Some(label) = &p.label {
            let label = check_label(label, "Locus set")?;
            if let Some(existing) = set_label_taken(tx, &label, p.id)? {
                return Err(RpcError::conflict(format!(
                    "A locus set named \"{existing}\" already exists."
                )));
            }
            tx.execute(
                "UPDATE locus_set SET label = ?1 WHERE id = ?2",
                params![label, p.id],
            )?;
        }
        if let Some(ids) = &p.locus_ids {
            set_members(tx, p.id, ids)?;
        }
        load_set(tx, p.id)
    })?;
    e.changed(LOCUS_SETS, Some(vec![set.id]));
    e.changed(LOCI, None);
    Ok(set)
}

fn delete_set(e: &Engine, p: IdParams) -> Result<()> {
    e.workspace()?.write(|tx| {
        let set = load_set(tx, p.id)?;
        let users = super::projects::projects_using_locus_set(tx, p.id)?;
        if !users.is_empty() {
            return Err(RpcError::in_use(format!(
                "Locus set {} is used by {}. Delete those projects first.",
                set.label,
                some_of(&users, 5)
            )));
        }
        tx.execute("DELETE FROM locus_set WHERE id = ?1", [p.id])?;
        Ok(())
    })?;
    e.changed(LOCUS_SETS, Some(vec![p.id]));
    e.changed(LOCI, None);
    Ok(())
}
