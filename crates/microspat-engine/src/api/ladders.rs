//! Ladders (size standards): CRUD and the standards seeded into new workspaces.

use super::{check_label, json_col, IdParams};
use crate::error::{OrNotFound, Result, RpcError};
use crate::events::entity::{LADDERS, PLATES};
use crate::rpc::Registry;
use crate::Engine;
use microspat_core::ladder::{LadderSpec, HD400_SIZES};
use microspat_core::Color;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A ladder with its fitting parameters.
#[derive(Debug, Clone, Serialize, TS)]
pub struct Ladder {
    pub id: i64,
    pub label: String,
    /// Sizes, dye color, and every fitting parameter.
    pub spec: LadderSpec,
    /// Plates sized with this ladder.
    pub plate_count: u32,
}

/// Params of `create_ladder`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateLadderParams {
    pub label: String,
    /// Omitted fields take the HD ROX 400 defaults.
    #[ts(as = "super::TsPartial<LadderSpec>")]
    pub spec: LadderSpec,
}

/// Params of `update_ladder`. Omitted fields are unchanged.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateLadderParams {
    pub id: i64,
    #[serde(default)]
    #[ts(optional)]
    pub label: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub spec: Option<LadderSpec>,
}

pub(crate) fn register(r: &mut Registry) {
    r.query("list_ladders", "All ladders.", list);
    r.query("get_ladder", "One ladder.", get);
    r.mutation(
        "create_ladder",
        &[LADDERS],
        "Create a ladder. Labels are unique (case-insensitive).",
        create,
    );
    r.mutation(
        "update_ladder",
        &[LADDERS, PLATES],
        "Change a ladder's label or spec. Sizing limits apply to plates at once; \
         run `size_plate` to refit wells after changing sizes or peak parameters.",
        update,
    );
    r.mutation(
        "delete_ladder",
        &[LADDERS],
        "Delete a ladder no plate uses.",
        delete,
    );
}

/// GeneScan 500 fragment sizes (bp); the same fragments in the ROX and LIZ versions.
const GS500_SIZES: [f64; 16] = [
    35.0, 50.0, 75.0, 100.0, 139.0, 150.0, 160.0, 200.0, 250.0, 300.0, 340.0, 350.0, 400.0, 450.0,
    490.0, 500.0,
];

/// GeneScan 600 LIZ v2.0 fragment sizes (bp).
const GS600_LIZ_SIZES: [f64; 36] = [
    20.0, 40.0, 60.0, 80.0, 100.0, 114.0, 120.0, 140.0, 160.0, 180.0, 200.0, 214.0, 220.0, 240.0,
    250.0, 260.0, 280.0, 300.0, 314.0, 320.0, 340.0, 360.0, 380.0, 400.0, 414.0, 420.0, 440.0,
    460.0, 480.0, 500.0, 514.0, 520.0, 540.0, 560.0, 580.0, 600.0,
];

/// Label of the default ladder (HD ROX 400) in a new workspace.
pub const DEFAULT_LADDER: &str = "HD ROX 400";

/// Standard ladders inserted into every new workspace.
pub fn standard_ladders() -> Vec<(&'static str, LadderSpec)> {
    let with = |sizes: &[f64], color| LadderSpec {
        base_sizes: sizes.to_vec(),
        color,
        ..LadderSpec::default()
    };
    vec![
        (DEFAULT_LADDER, with(&HD400_SIZES, Color::Red)),
        ("GeneScan 500 ROX", with(&GS500_SIZES, Color::Red)),
        ("GeneScan 500 LIZ", with(&GS500_SIZES, Color::Orange)),
        ("GeneScan 600 LIZ", with(&GS600_LIZ_SIZES, Color::Orange)),
    ]
}

pub(crate) fn seed_ladders(conn: &Connection) -> Result<()> {
    for (label, spec) in standard_ladders() {
        conn.execute(
            "INSERT INTO ladder (label, spec) VALUES (?1, ?2)",
            params![label, serde_json::to_string(&spec)?],
        )?;
    }
    Ok(())
}

/// Checks a spec before it is stored.
pub fn validate_spec(spec: &LadderSpec) -> Result<()> {
    let bad = |m: &str| Err(RpcError::invalid(m.to_string()));
    let s = &spec.base_sizes;
    if s.len() < 4 {
        return bad("A ladder needs at least 4 sizes.");
    }
    if s.iter().any(|v| !v.is_finite() || *v < 0.0) || s.windows(2).any(|w| w[1] <= w[0]) {
        return bad("Ladder sizes must be positive numbers in strictly increasing order.");
    }
    if !(spec.sq_flag_limit > 0.0 && spec.sq_unusable_limit >= spec.sq_flag_limit) {
        return bad("Sizing-quality limits must be positive, with the unusable limit at or above the flag limit.");
    }
    if !(spec.min_peak_height >= 0.0 && spec.max_peak_height > spec.min_peak_height) {
        return bad("Maximum peak height must be above minimum peak height.");
    }
    if !(spec.min_relative_height >= 0.0 && spec.min_relative_height < 1.0) {
        return bad("Min relative height must be a fraction from 0 up to 1.");
    }
    if spec.base_size_precision > 6 {
        return bad("Base size precision must be 0 to 6 decimals.");
    }
    if spec.maximum_missing_peak_count >= s.len() {
        return bad("Maximum missing peaks must be fewer than the number of ladder sizes.");
    }
    let sc = &spec.scanning;
    if sc.smoothing_window < 3
        || sc.smoothing_window.is_multiple_of(2)
        || sc.smoothing_order >= sc.smoothing_window
    {
        return bad(
            "Smoothing window must be odd, at least 3, and larger than the smoothing order.",
        );
    }
    if !(sc.tophat_factor > 0.0 && sc.tophat_factor < 1.0) || sc.relmax_window == 0 {
        return bad(
            "Top-hat factor must be between 0 and 1 and the relative-maximum window at least 1.",
        );
    }
    Ok(())
}

fn row_to_ladder(r: &rusqlite::Row) -> rusqlite::Result<Ladder> {
    Ok(Ladder {
        id: r.get(0)?,
        label: r.get(1)?,
        spec: json_col(r, 2)?,
        plate_count: r.get(3)?,
    })
}

const SELECT: &str = "SELECT l.id, l.label, l.spec,
    (SELECT COUNT(*) FROM plate p WHERE p.ladder_id = l.id) FROM ladder l";

/// Loads one ladder.
pub fn load(conn: &Connection, id: i64) -> Result<Ladder> {
    conn.query_row(&format!("{SELECT} WHERE l.id = ?1"), [id], row_to_ladder)
        .optional()?
        .or_not_found(|| format!("Ladder {id} does not exist"))
}

fn list(e: &Engine, _: ()) -> Result<Vec<Ladder>> {
    e.workspace()?.read(|c| {
        let mut st = c.prepare(&format!("{SELECT} ORDER BY l.label"))?;
        let rows = st.query_map([], row_to_ladder)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    })
}

fn get(e: &Engine, p: IdParams) -> Result<Ladder> {
    e.workspace()?.read(|c| load(c, p.id))
}

/// The stored label of another ladder with this label (case-insensitive), if any.
fn label_taken(c: &Connection, label: &str, except: i64) -> Result<Option<String>> {
    Ok(c.query_row(
        "SELECT label FROM ladder WHERE label = ?1 AND id != ?2",
        params![label, except],
        |r| r.get(0),
    )
    .optional()?)
}

fn create(e: &Engine, p: CreateLadderParams) -> Result<Ladder> {
    let label = check_label(&p.label, "Ladder")?;
    validate_spec(&p.spec)?;
    let ladder = e.workspace()?.write(|tx| {
        if let Some(existing) = label_taken(tx, &label, 0)? {
            return Err(RpcError::conflict(format!(
                "A ladder named \"{existing}\" already exists."
            )));
        }
        tx.execute(
            "INSERT INTO ladder (label, spec) VALUES (?1, ?2)",
            params![label, serde_json::to_string(&p.spec)?],
        )?;
        load(tx, tx.last_insert_rowid())
    })?;
    e.changed(LADDERS, Some(vec![ladder.id]));
    Ok(ladder)
}

fn update(e: &Engine, p: UpdateLadderParams) -> Result<Ladder> {
    let label = p
        .label
        .as_deref()
        .map(|l| check_label(l, "Ladder"))
        .transpose()?;
    if let Some(spec) = &p.spec {
        validate_spec(spec)?;
    }
    let ladder = e.workspace()?.write(|tx| {
        let current = load(tx, p.id)?;
        if let Some(label) = &label {
            if let Some(existing) = label_taken(tx, label, p.id)? {
                return Err(RpcError::conflict(format!("A ladder named \"{existing}\" already exists.")));
            }
            tx.execute("UPDATE ladder SET label = ?1 WHERE id = ?2", params![label, p.id])?;
        }
        if let Some(spec) = &p.spec {
            if spec.color != current.spec.color && current.plate_count > 0 {
                return Err(RpcError::in_use(format!(
                    "Ladder \"{}\" sizes {} plate(s); its dye cannot change. Create a new ladder instead.",
                    current.label, current.plate_count
                )));
            }
            tx.execute(
                "UPDATE ladder SET spec = ?1 WHERE id = ?2",
                params![serde_json::to_string(spec)?, p.id],
            )?;
        }
        load(tx, p.id)
    })?;
    e.changed(LADDERS, Some(vec![ladder.id]));
    if ladder.plate_count > 0 {
        e.changed(PLATES, None);
    }
    Ok(ladder)
}

fn delete(e: &Engine, p: IdParams) -> Result<()> {
    e.workspace()?.write(|tx| {
        let l = load(tx, p.id)?;
        if l.plate_count > 0 {
            let mut st = tx.prepare("SELECT label FROM plate WHERE ladder_id = ?1 ORDER BY label LIMIT 5")?;
            let names: Vec<String> = st.query_map([p.id], |r| r.get(0))?.collect::<rusqlite::Result<_>>()?;
            return Err(RpcError::in_use(format!(
                "Ladder \"{}\" is used by {} plate(s) ({}{}). Delete those plates or size them with another ladder first.",
                l.label,
                l.plate_count,
                names.join(", "),
                if l.plate_count as usize > names.len() { ", …" } else { "" }
            )));
        }
        tx.execute("DELETE FROM ladder WHERE id = ?1", [p.id])?;
        Ok(())
    })?;
    e.changed(LADDERS, Some(vec![p.id]));
    Ok(())
}
