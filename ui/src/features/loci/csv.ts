/**
 * Minimal RFC 4180 CSV reading for import previews, plus the header
 * normalization the engine uses (letters and digits only, lower case), so the
 * preview accepts exactly the headers the engine accepts.
 */

/** Rows of fields. Handles quotes, doubled quotes, CRLF, and a BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const s = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** The engine's header key: "Min. Base Length" → "minbaselength". */
export function headerKey(h: string): string {
  return h.replace(/[^A-Za-z0-9]/g, '').toLowerCase()
}

export function csvEscape(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function toCsvText(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n') + '\n'
}

/** Read a File chosen in the browser (or the Tauri webview) as text. */
export function readFileText(file: File): Promise<string> {
  return file.text()
}
