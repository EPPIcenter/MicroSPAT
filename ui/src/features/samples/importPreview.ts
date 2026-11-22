/**
 * Client-side preview of `import_samples_csv`, with the engine's rules
 * (crates/microspat-engine/src/api/samples.rs): a Barcode column, an optional
 * Designation column with the old app's synonyms, barcodes unique in the file.
 * Existing barcodes are skipped by the engine, not errors.
 */
import type { Designation } from '@/api/bindings'
import { headerKey, parseCsv, toCsvText } from '@/features/loci/csv'

export type SampleRowStatus = 'create' | 'existing' | 'invalid'

export interface SamplePreviewRow {
  line: number
  barcode: string
  designation: Designation | null
  status: SampleRowStatus
  problem: string | null
}

export interface SamplesPreview {
  headerError: string | null
  rows: SamplePreviewRow[]
  create: number
  existing: number
  invalid: number
}

/** The engine's accepted designation spellings. */
export function parseDesignation(s: string): Designation | null {
  switch (s.trim().toLowerCase()) {
    case '':
    case 's':
    case 'sample':
      return 'sample'
    case 'neg':
    case 'negative_control':
    case 'negative':
    case 'negative control':
    case '-':
    case 'nc':
    case 'ntc':
      return 'negative_control'
    case 'pos':
    case 'positive_control':
    case 'positive':
    case 'positive control':
    case '+':
    case 'pc':
      return 'positive_control'
    default:
      return null
  }
}

/**
 * Preview a samples CSV. A file without a header row that contains "barcode"
 * is read as one barcode per line (a pasted list).
 */
export function previewSamplesCsv(text: string, existingBarcodes: ReadonlySet<string>): SamplesPreview {
  const all = parseCsv(text)
  const header = (all[0] ?? []).map((h) => headerKey(h.trim()))
  let bi = header.indexOf('barcode')
  const di = header.indexOf('designation')
  let body = all.slice(1)
  let firstLine = 2
  if (bi < 0) {
    // A plain list of barcodes, one per line.
    if (all.length > 0 && all.every((r) => r.length <= 1)) {
      bi = 0
      body = all
      firstLine = 1
    } else return { headerError: 'The CSV needs a Barcode column (and optionally Designation).', rows: [], create: 0, existing: 0, invalid: 0 }
  }
  const seen = new Map<string, number>()
  const rows: SamplePreviewRow[] = []
  body.forEach((r, k) => {
    const line = k + firstLine
    const barcode = (r[bi] ?? '').trim()
    if (barcode === '') return
    const dText = di >= 0 ? (r[di] ?? '') : ''
    const designation = parseDesignation(dText)
    const key = barcode.toLowerCase()
    let status: SampleRowStatus = 'create'
    let problem: string | null = null
    if (designation === null) {
      status = 'invalid'
      problem = `Designation "${dText.trim()}" is not sample, negative or positive`
    } else if (barcode.length > 200) {
      status = 'invalid'
      problem = 'Barcode is too long'
    } else if (seen.has(key)) {
      status = 'invalid'
      problem = `Same barcode as line ${seen.get(key)}`
    } else if (existingBarcodes.has(key)) {
      status = 'existing'
      problem = 'Already in the workspace; left unchanged'
    }
    if (!seen.has(key)) seen.set(key, line)
    rows.push({ line, barcode, designation, status, problem })
  })
  const count = (s: SampleRowStatus) => rows.filter((r) => r.status === s).length
  return {
    headerError: rows.length === 0 ? 'The file has no barcodes.' : null,
    rows,
    create: count('create'),
    existing: count('existing'),
    invalid: count('invalid'),
  }
}

/** CSV of the rows to create, in the engine's format. */
export function rowsToCreateCsv(p: SamplesPreview): string {
  return toCsvText([['Barcode', 'Designation'], ...p.rows.filter((r) => r.status === 'create').map((r) => [r.barcode, r.designation ?? 'sample'])])
}
