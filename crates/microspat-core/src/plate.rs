//! Plate geometry: well labels, well order, and capillary order.
//!
//! Labels are normalized to a letter plus a zero-padded column (`A01`). Wells
//! run row-major (`A01, A02, …`).
//!
//! Crosstalk happens between *capillaries*, not between neighboring wells in
//! the plate, so neighbors are found along the capillary order. A 96-capillary
//! instrument (ABI 3730xl) loads a 96-well plate column pair by column pair,
//! bottom row first: `H01, H02, G01, G02, …, A01, A02, H03, H04, …`.
//! A 384-well plate is run as four 96-well injections ("quadrants"): quadrant 1
//! is odd rows/odd columns, 2 odd rows/even columns, 3 even rows/odd columns,
//! 4 even rows/even columns. Each quadrant maps onto the 96 capillaries like a
//! 96-well plate, and only wells of the same injection can cross-talk.

use serde::{Deserialize, Serialize};

/// Errors from well-label handling.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PlateError {
    #[error("'{0}' is not a valid well label")]
    InvalidLabel(String),
    #[error("well {label} does not exist on a {size}-well plate")]
    OutOfPlate { label: String, size: u32 },
    #[error("{0} is not a supported plate size (96 or 384)")]
    UnsupportedSize(u32),
}

/// Supported plate formats.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub enum PlateSize {
    #[serde(rename = "96")]
    W96,
    #[serde(rename = "384")]
    W384,
}

impl PlateSize {
    /// Plate size from its well count.
    pub fn from_wells(n: u32) -> Result<Self, PlateError> {
        match n {
            96 => Ok(PlateSize::W96),
            384 => Ok(PlateSize::W384),
            other => Err(PlateError::UnsupportedSize(other)),
        }
    }

    /// Number of wells.
    pub fn wells(self) -> u32 {
        self.rows() * self.columns()
    }

    /// Number of rows (8 or 16).
    pub fn rows(self) -> u32 {
        match self {
            PlateSize::W96 => 8,
            PlateSize::W384 => 16,
        }
    }

    /// Number of columns (12 or 24).
    pub fn columns(self) -> u32 {
        match self {
            PlateSize::W96 => 12,
            PlateSize::W384 => 24,
        }
    }
}

/// A well position, 0-based row and column.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Well {
    pub row: u32,
    pub column: u32,
}

impl Well {
    /// Parses `A1`, `A01`, or `a01` (letters A–P, columns 1–24).
    pub fn parse(label: &str) -> Result<Self, PlateError> {
        let bad = || PlateError::InvalidLabel(label.to_string());
        let label_t = label.trim();
        let mut chars = label_t.chars();
        let letter = chars.next().ok_or_else(bad)?.to_ascii_uppercase();
        if !('A'..='P').contains(&letter) {
            return Err(bad());
        }
        let digits = chars.as_str();
        if digits.is_empty() || digits.len() > 2 || !digits.bytes().all(|b| b.is_ascii_digit()) {
            return Err(bad());
        }
        let col: u32 = digits.parse().map_err(|_| bad())?;
        if !(1..=24).contains(&col) {
            return Err(bad());
        }
        Ok(Well {
            row: letter as u32 - 'A' as u32,
            column: col - 1,
        })
    }

    /// Parses a label and checks that it exists on a plate of the given size.
    pub fn parse_on(label: &str, size: PlateSize) -> Result<Self, PlateError> {
        let w = Well::parse(label)?;
        if w.row >= size.rows() || w.column >= size.columns() {
            return Err(PlateError::OutOfPlate {
                label: label.to_string(),
                size: size.wells(),
            });
        }
        Ok(w)
    }

    /// Normalized label, e.g. `A01`.
    pub fn label(self) -> String {
        format!(
            "{}{:02}",
            char::from(b'A' + (self.row as u8).min(25)),
            self.column + 1
        )
    }
}

/// Normalizes a well label to the zero-padded form (`a1` → `A01`).
pub fn normalize_label(label: &str) -> Result<String, PlateError> {
    Well::parse(label).map(Well::label)
}

/// All wells of a plate in row-major order (`A01, A02, …`).
pub fn well_order(size: PlateSize) -> Vec<Well> {
    (0..size.rows())
        .flat_map(|row| (0..size.columns()).map(move |column| Well { row, column }))
        .collect()
}

/// The 96 capillary positions, as 96-well positions, in instrument order.
pub fn capillary_order_96() -> Vec<Well> {
    let mut out = Vec::with_capacity(96);
    for pair in 0..6 {
        for row in (0..8).rev() {
            out.push(Well {
                row,
                column: 2 * pair,
            });
            out.push(Well {
                row,
                column: 2 * pair + 1,
            });
        }
    }
    out
}

/// Splits a 384-well position into its injection quadrant (1–4) and 96-well position.
pub fn to_quadrant(well: Well) -> (u8, Well) {
    let quad = 1 + (well.column % 2) as u8 + 2 * (well.row % 2) as u8;
    (
        quad,
        Well {
            row: well.row / 2,
            column: well.column / 2,
        },
    )
}

/// Inverse of [`to_quadrant`].
pub fn from_quadrant(quadrant: u8, well96: Well) -> Well {
    let q = quadrant.clamp(1, 4) - 1;
    Well {
        row: well96.row * 2 + u32::from(q / 2),
        column: well96.column * 2 + u32::from(q % 2),
    }
}

/// Wells within `distance` capillaries of `well` in the same injection, nearest first.
///
/// These are the wells whose same-dye signal can leak into `well` (crosstalk).
pub fn neighbor_wells(
    well: Well,
    size: PlateSize,
    distance: usize,
) -> Result<Vec<Well>, PlateError> {
    if well.row >= size.rows() || well.column >= size.columns() {
        return Err(PlateError::OutOfPlate {
            label: well.label(),
            size: size.wells(),
        });
    }
    let (quad, w96) = match size {
        PlateSize::W96 => (None, well),
        PlateSize::W384 => {
            let (q, w) = to_quadrant(well);
            (Some(q), w)
        }
    };
    let order = capillary_order_96();
    let Some(pos) = order.iter().position(|&w| w == w96) else {
        return Ok(Vec::new());
    };
    let mut out = Vec::new();
    for d in 1..=distance {
        for p in [pos.checked_sub(d), pos.checked_add(d)]
            .into_iter()
            .flatten()
        {
            if let Some(&n) = order.get(p) {
                out.push(match quad {
                    Some(q) => from_quadrant(q, n),
                    None => n,
                });
            }
        }
    }
    Ok(out)
}

/// The capillary (1–96) a well runs in, and its injection (quadrant 1–4 on a
/// 384-well plate, 0 on a 96-well plate). Capillary numbers follow
/// [`capillary_order_96`], which is the lane number 3730 files record.
/// None for a well outside the plate.
pub fn capillary(well: Well, size: PlateSize) -> Option<(u8, u32)> {
    if well.row >= size.rows() || well.column >= size.columns() {
        return None;
    }
    let (quad, w96) = match size {
        PlateSize::W96 => (0, well),
        PlateSize::W384 => to_quadrant(well),
    };
    let pos = capillary_order_96().iter().position(|&w| w == w96)?;
    Some((quad, pos as u32 + 1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capillary_numbers_follow_the_loading_order() {
        assert_eq!(capillary(w("H01"), PlateSize::W96), Some((0, 1)));
        assert_eq!(capillary(w("A02"), PlateSize::W96), Some((0, 16)));
        assert_eq!(capillary(w("H03"), PlateSize::W96), Some((0, 17)));
        assert_eq!(capillary(w("A12"), PlateSize::W96), Some((0, 96)));
        assert_eq!(capillary(w("B02"), PlateSize::W384), Some((4, 15)));
        assert_eq!(capillary(w("I01"), PlateSize::W96), None);
    }

    fn w(label: &str) -> Well {
        Well::parse(label).unwrap()
    }

    #[test]
    fn labels_round_trip() {
        assert_eq!(w("A1"), Well { row: 0, column: 0 });
        assert_eq!(w("h12").label(), "H12");
        assert_eq!(normalize_label("B3").unwrap(), "B03");
        assert_eq!(
            w("P24"),
            Well {
                row: 15,
                column: 23
            }
        );
        for bad in ["", "A", "Z01", "A00", "A25", "A001", "1A", "A1x"] {
            assert!(Well::parse(bad).is_err(), "{bad}");
        }
        assert!(Well::parse_on("I01", PlateSize::W96).is_err());
        assert!(Well::parse_on("I01", PlateSize::W384).is_ok());
    }

    #[test]
    fn well_order_is_row_major() {
        let o = well_order(PlateSize::W96);
        assert_eq!(o.len(), 96);
        assert_eq!(o[0].label(), "A01");
        assert_eq!(o[12].label(), "B01");
        assert_eq!(well_order(PlateSize::W384).len(), 384);
    }

    #[test]
    fn capillary_order_matches_old_table() {
        let labels: Vec<String> = capillary_order_96().into_iter().map(Well::label).collect();
        assert_eq!(&labels[..4], &["H01", "H02", "G01", "G02"]);
        assert_eq!(&labels[14..18], &["A01", "A02", "H03", "H04"]);
        assert_eq!(labels[95], "A12");
        let mut sorted = labels.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), 96);
    }

    #[test]
    fn quadrants_match_old_conversion() {
        // Old convert_to_quad: A01→(1,A01), A02→(2,A01), B01→(3,A01), B02→(4,A01), P24→(4,H12)
        assert_eq!(to_quadrant(w("A01")), (1, w("A01")));
        assert_eq!(to_quadrant(w("A02")), (2, w("A01")));
        assert_eq!(to_quadrant(w("B01")), (3, w("A01")));
        assert_eq!(to_quadrant(w("B02")), (4, w("A01")));
        assert_eq!(to_quadrant(w("P24")), (4, w("H12")));
        assert_eq!(to_quadrant(w("C05")), (1, w("B03")));
        for well in well_order(PlateSize::W384) {
            let (q, w96) = to_quadrant(well);
            assert_eq!(from_quadrant(q, w96), well);
        }
    }

    #[test]
    fn neighbors_follow_capillaries() {
        let n: Vec<String> = neighbor_wells(w("G01"), PlateSize::W96, 2)
            .unwrap()
            .into_iter()
            .map(Well::label)
            .collect();
        assert_eq!(n, vec!["H02", "G02", "H01", "F01"]);
        // Ends of the capillary array have one side only.
        let n = neighbor_wells(w("H01"), PlateSize::W96, 1).unwrap();
        assert_eq!(n, vec![w("H02")]);
        // 384: neighbors stay in the same quadrant.
        let n = neighbor_wells(w("B02"), PlateSize::W384, 1).unwrap();
        assert!(n.iter().all(|&x| to_quadrant(x).0 == 4));
        assert_eq!(n, vec![w("D04"), w("B04")]);
        assert!(neighbor_wells(w("I01"), PlateSize::W96, 1).is_err());
    }
}
