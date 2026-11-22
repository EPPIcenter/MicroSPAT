/**
 * Plate-map dry-run presentation. The engine validates a map and reports
 * counts, problems and every assignment it would make, keep or remove
 * (`PlateMapReport`); this turns that into the dialog's summary and a
 * well × locus grid. The CSV parser is for the mock backend.
 */
import type { CreatedSample, Designation, PlateMapAssignment, PlateMapReport } from '@/api/bindings'
import { normalizeWell } from '@/components/PlateGrid'

export interface ParsedMap {
  /** Locus column headers (everything after Well), in file order. */
  loci: string[]
  rows: { well: string; cells: string[] }[]
  /** Set when the text is not a plate map at all. */
  error: string | null
}

/** Minimal RFC 4180 CSV: quoted fields, doubled quotes, CRLF. Cells are trimmed. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field.trim())
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field.trim())
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field.trim())
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f !== ''))
}

export function parsePlateMap(text: string): ParsedMap {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''))
  const header = rows[0]
  if (!header) return { loci: [], rows: [], error: 'The file is empty.' }
  const wellCol = header.findIndex((h) => h.toLowerCase() === 'well')
  if (wellCol < 0) return { loci: [], rows: [], error: 'The first row needs a Well column, then one column per locus.' }
  const cols = header.map((h, i) => ({ h, i })).filter((c) => c.i !== wellCol && c.h !== '')
  return {
    loci: cols.map((c) => c.h),
    rows: rows.slice(1).map((r) => ({
      well: normalizeWell(r[wellCol] ?? '') ?? r[wellCol] ?? '',
      cells: cols.map((c) => r[c.i] ?? ''),
    })),
    error: null,
  }
}

/**
 * One cell (well × locus) of the preview. `state` describes the run the map
 * makes there; `removed` is the barcode of the current map's run that it
 * replaces (or drops, with `state: 'removed'`).
 */
export interface PreviewCell {
  barcode: string
  state: 'unchanged' | 'new' | 'create' | 'unknown' | 'removed'
  removed: string | null
}

export interface PreviewRow {
  well: string
  cells: (PreviewCell | null)[]
  /** Any cell of the well differs from the current map. */
  changed: boolean
}

export interface MapPreview {
  /** ready: can be applied. samples: only unknown samples stand in the way. invalid: problems. */
  status: 'ready' | 'samples' | 'invalid'
  headline: string
  facts: { label: string; value: string; tone?: 'warn' | 'danger' }[]
  /** Problems other than unknown samples (shown as a list). */
  problems: string[]
  unknownLoci: string[]
  /** Unknown barcodes that will NOT be created. */
  unknownSamples: string[]
  created: CreatedSample[]
  /** The engine's assignments as a well × locus grid; null for engines that do not report them. */
  table: { loci: string[]; rows: PreviewRow[]; changedRows: number } | null
}

export const DESIGNATION_LABEL: Record<Designation, string> = {
  sample: 'sample',
  negative_control: 'negative control',
  positive_control: 'positive control',
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

/** The engine's assignments (well order, then locus label) as one row per well. */
export function assignmentTable(assignments: readonly PlateMapAssignment[]): NonNullable<MapPreview['table']> {
  const loci: string[] = []
  for (const a of assignments) if (!loci.includes(a.locus_label)) loci.push(a.locus_label)
  loci.sort((a, b) => a.localeCompare(b))
  const col = new Map(loci.map((l, i) => [l, i]))
  const rows: PreviewRow[] = []
  let row = null as PreviewRow | null
  for (const a of assignments) {
    if (row?.well !== a.well) {
      row = { well: a.well, cells: loci.map(() => null), changed: false }
      rows.push(row)
    }
    const i = col.get(a.locus_label) as number
    const cur = row.cells[i]
    if (a.change === 'removed') {
      row.cells[i] = cur ? { ...cur, removed: a.barcode } : { barcode: '', state: 'removed', removed: a.barcode }
      row.changed = true
      continue
    }
    const state: PreviewCell['state'] =
      a.change === 'unchanged' ? 'unchanged' : a.creates_sample ? 'create' : a.sample_id == null ? 'unknown' : 'new'
    row.cells[i] = { barcode: a.barcode, state, removed: cur?.removed ?? null }
    if (state !== 'unchanged') row.changed = true
  }
  return { loci, rows, changedRows: rows.filter((r) => r.changed).length }
}

/** Turn a dry-run report into what the dialog shows. */
export function presentPlateMap(report: PlateMapReport): MapPreview {
  const created = new Set(report.created_samples.map((s) => s.barcode.toLowerCase()))
  const notCreated = report.unknown_samples.filter((s) => !created.has(s.toLowerCase()))
  // The engine phrases unknown samples and unknown loci as problems too; the
  // dialog shows those as their own sections.
  const problems = report.problems.filter((p) => !/^Unknown samples \(/.test(p) && !/^Unknown loci in the header/.test(p))
  const status: MapPreview['status'] =
    report.problems.length === 0 ? 'ready' : problems.length === 0 && report.unknown_loci.length === 0 ? 'samples' : 'invalid'
  const table = report.assignments ? assignmentTable(report.assignments) : null

  const facts: MapPreview['facts'] = [{ label: 'Runs in the new map', value: report.run_count.toLocaleString('en-US') }]
  if (report.runs_kept || report.runs_removed) {
    facts.push({ label: 'Unchanged from the current map', value: report.runs_kept.toLocaleString('en-US') })
    facts.push({
      label: 'Removed or reassigned',
      value: report.runs_removed.toLocaleString('en-US'),
      tone: report.runs_removed ? 'warn' : undefined,
    })
  }
  if (report.created_samples.length)
    facts.push({ label: 'Samples to create', value: report.created_samples.length.toLocaleString('en-US') })
  if (notCreated.length) facts.push({ label: 'Unknown samples', value: notCreated.length.toLocaleString('en-US'), tone: 'danger' })
  if (report.unknown_loci.length)
    facts.push({ label: 'Unknown loci', value: report.unknown_loci.length.toLocaleString('en-US'), tone: 'danger' })

  let headline: string
  if (status === 'ready') {
    const wells = table ? table.rows.filter((r) => r.cells.some((c) => c && c.state !== 'removed')).length : null
    headline = `Ready to assign ${plural(report.run_count, 'run')}${wells != null ? ` in ${plural(wells, 'well')}` : ''}${report.created_samples.length ? `, creating ${plural(report.created_samples.length, 'sample')}` : ''}.`
  } else if (status === 'samples') {
    headline = `${plural(notCreated.length, 'sample')} ${notCreated.length === 1 ? 'is' : 'are'} not in the workspace. Turn on “Create missing samples” or fix the barcodes.`
  } else {
    const n = problems.length + (report.unknown_loci.length ? 1 : 0) + (notCreated.length ? 1 : 0)
    headline = `${plural(n, 'problem')} must be fixed before this map can be applied.`
  }

  return {
    status,
    headline,
    facts,
    problems,
    unknownLoci: report.unknown_loci,
    unknownSamples: notCreated,
    created: report.created_samples,
    table,
  }
}

/** The format explanation and example shown in the dialog. */
export const PLATE_MAP_EXAMPLE = `Well,PfB1,PfG1
A01,P1-S001,P1-S001
A02,P1-S002,
H12,NTC-1,NTC-1`
