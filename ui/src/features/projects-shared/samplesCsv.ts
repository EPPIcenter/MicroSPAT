/**
 * Preview of a sample CSV before adding it to a project: which barcodes
 * match workspace samples, which are unknown, duplicated, or already in the
 * project. The engine (`import_project_samples_csv`) adds nothing when any
 * barcode is unknown, so the dialog shows this first and can instead add
 * only the matched samples by id.
 */
import type { Sample } from '@/api/bindings'

export interface SampleCsvPreview {
  /** Header problem (no Barcode column, empty file); nothing else is filled. */
  error: string | null
  /** Rows read (excluding header and blank lines). */
  rows: number
  matched: Sample[]
  /** Matched and already in the project. */
  already: Sample[]
  /** Barcodes with no workspace sample, as written. */
  unknown: string[]
  /** Barcodes listed more than once (counted once). */
  duplicates: string[]
}

/** Split one CSV line, honoring double quotes. */
export function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i] as string
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === sep) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function detectSep(header: string): string {
  if (header.includes('\t')) return '\t'
  if (header.includes(';') && !header.includes(',')) return ';'
  return ','
}

/**
 * Parse `content` (a CSV with a `Barcode` column, case-insensitive; a file
 * with a single column and no such header is read as one barcode per line)
 * and match it against `samples` case-insensitively, like the engine.
 */
export function previewSampleCsv(content: string, samples: readonly Sample[], inProject: ReadonlySet<number>): SampleCsvPreview {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
  const empty: SampleCsvPreview = { error: null, rows: 0, matched: [], already: [], unknown: [], duplicates: [] }
  if (lines.length === 0) return { ...empty, error: 'The file is empty.' }
  const sep = detectSep(lines[0] as string)
  const header = splitCsvLine(lines[0] as string, sep).map((h) => h.toLowerCase())
  let col = header.indexOf('barcode')
  let body = lines.slice(1)
  if (col < 0) {
    if (header.length === 1) {
      // A bare list of barcodes: the first line is data too.
      col = 0
      body = lines
    } else {
      return { ...empty, error: 'No “Barcode” column. The first row must be a header with a column named Barcode.' }
    }
  }
  const byBarcode = new Map(samples.map((s) => [s.barcode.toLowerCase(), s]))
  const seen = new Set<string>()
  const dup = new Set<string>()
  const out: SampleCsvPreview = { ...empty, rows: body.length }
  for (const line of body) {
    const raw = splitCsvLine(line, sep)[col] ?? ''
    if (!raw) continue
    const key = raw.toLowerCase()
    if (seen.has(key)) {
      dup.add(raw)
      continue
    }
    seen.add(key)
    const s = byBarcode.get(key)
    if (!s) out.unknown.push(raw)
    else if (inProject.has(s.id)) out.already.push(s)
    else out.matched.push(s)
  }
  out.duplicates = [...dup]
  return out
}
