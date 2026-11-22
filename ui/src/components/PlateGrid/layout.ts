/** Plate geometry: well labels, rectangles, keyboard movement. */

export type PlateFormat = 96 | 384

export const PLATE_DIMS: Record<PlateFormat, { rows: number; cols: number }> = {
  96: { rows: 8, cols: 12 },
  384: { rows: 16, cols: 24 },
}

const ROW_LETTERS = 'ABCDEFGHIJKLMNOP'

export function rowLetter(r: number): string {
  return ROW_LETTERS[r] ?? '?'
}

/** 'A01'-style label (zero-padded column, as on ABI plate maps). */
export function wellLabel(row: number, col: number): string {
  return `${rowLetter(row)}${String(col + 1).padStart(2, '0')}`
}

/** Parse 'A1', 'A01', 'p24' into zero-based row/col, or null. */
export function parseWell(label: string): { row: number; col: number } | null {
  const m = /^([A-Pa-p])0*(\d{1,2})$/.exec(label.trim())
  if (!m) return null
  const row = ROW_LETTERS.indexOf((m[1] as string).toUpperCase())
  const col = Number(m[2]) - 1
  if (row < 0 || col < 0 || col > 23) return null
  return { row, col }
}

/** Normalize any accepted spelling to 'A01'. */
export function normalizeWell(label: string): string | null {
  const p = parseWell(label)
  return p ? wellLabel(p.row, p.col) : null
}

/** All wells in row-major order. */
export function allWells(format: PlateFormat): string[] {
  const { rows, cols } = PLATE_DIMS[format]
  const out: string[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(wellLabel(r, c))
  return out
}

/** Wells in the rectangle spanned by a and b, row-major. */
export function wellRect(a: string, b: string): string[] {
  const pa = parseWell(a)
  const pb = parseWell(b)
  if (!pa || !pb) return pb ? [wellLabel(pb.row, pb.col)] : []
  const out: string[] = []
  for (let r = Math.min(pa.row, pb.row); r <= Math.max(pa.row, pb.row); r++)
    for (let c = Math.min(pa.col, pb.col); c <= Math.max(pa.col, pb.col); c++) out.push(wellLabel(r, c))
  return out
}

export function rowWells(format: PlateFormat, row: number): string[] {
  return Array.from({ length: PLATE_DIMS[format].cols }, (_, c) => wellLabel(row, c))
}

export function colWells(format: PlateFormat, col: number): string[] {
  return Array.from({ length: PLATE_DIMS[format].rows }, (_, r) => wellLabel(r, col))
}

/** Move from a well by (dr, dc), clamped to the plate. */
export function moveWell(format: PlateFormat, from: string, dr: number, dc: number): string {
  const p = parseWell(from) ?? { row: 0, col: 0 }
  const { rows, cols } = PLATE_DIMS[format]
  return wellLabel(Math.max(0, Math.min(rows - 1, p.row + dr)), Math.max(0, Math.min(cols - 1, p.col + dc)))
}
