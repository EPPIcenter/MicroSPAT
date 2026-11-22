/** CSV/TSV serialization for table selections. */

export type CellValue = string | number | boolean | null | undefined

/** Quote a field when needed (RFC 4180). */
export function csvField(v: CellValue, sep = ','): string {
  if (v == null) return ''
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v)
  return s.includes(sep) || s.includes('"') || s.includes('\n') || s.includes('\r') ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: readonly string[], rows: readonly (readonly CellValue[])[], sep = ','): string {
  const lines = [headers.map((h) => csvField(h, sep)).join(sep)]
  for (const r of rows) lines.push(r.map((v) => csvField(v, sep)).join(sep))
  return lines.join('\n') + '\n'
}
