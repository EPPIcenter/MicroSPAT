/**
 * Client-side preview of `import_loci_csv`: the same header and row rules as
 * the engine (crates/microspat-engine/src/api/loci.rs), so the user sees what
 * will be created or rejected before sending. The engine imports all or
 * nothing, so the dialog can send only the valid rows.
 */
import type { Color, CreateLocusParams } from '@/api/bindings'
import { headerKey, parseCsv, toCsvText } from './csv'

export const LOCI_CSV_HEADER = ['Label', 'Min. Base Length', 'Max. Base Length', 'Nucleotide Repeat Length', 'Color'] as const

const KEYS = ['label', 'minbaselength', 'maxbaselength', 'nucleotiderepeatlength', 'color'] as const
const COLORS: readonly Color[] = ['blue', 'green', 'yellow', 'red', 'orange']

export interface LocusPreviewRow {
  /** 1-based line in the file (the header is line 1). */
  line: number
  /** Label as written (also for rejected rows). */
  label: string
  fields: string[]
  locus: CreateLocusParams | null
  problems: string[]
}

export interface LociPreview {
  /** Header problem: nothing can be imported. */
  headerError: string | null
  rows: LocusPreviewRow[]
  valid: number
  rejected: number
}

function num(s: string): number {
  // Rust's f64 parse: plain decimal or exponent; no thousands separators, no empty.
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s) || /^[+-]?(inf|infinity|nan)$/i.test(s) ? Number(s) : NaN
}

/** Preview a loci CSV against the labels already in the workspace. */
export function previewLociCsv(text: string, existingLabels: readonly string[]): LociPreview {
  const all = parseCsv(text)
  const header = (all[0] ?? []).map((h) => headerKey(h.trim()))
  const idx = KEYS.map((k) => header.indexOf(k))
  if (all.length === 0 || idx.some((i) => i < 0)) {
    return {
      headerError: `The header must contain ${LOCI_CSV_HEADER.join(', ')}.`,
      rows: [],
      valid: 0,
      rejected: 0,
    }
  }
  const existing = new Set(existingLabels.map((l) => l.trim().toLowerCase()))
  const seen = new Map<string, number>()
  const rows: LocusPreviewRow[] = []
  all.slice(1).forEach((raw, k) => {
    const fields = raw.map((f) => f.trim())
    if (fields.every((f) => f === '')) return
    const line = k + 2
    const get = (j: number) => fields[idx[j]!] ?? ''
    const problems: string[] = []
    const label = get(0)
    const min = num(get(1))
    const max = num(get(2))
    const repeat = num(get(3))
    const colorText = get(4).toLowerCase()
    if (label === '') problems.push('Label is empty')
    else if (label.length > 200) problems.push('Label is too long')
    if (Number.isNaN(min)) problems.push(`Min. Base Length "${get(1)}" is not a number`)
    if (Number.isNaN(max)) problems.push(`Max. Base Length "${get(2)}" is not a number`)
    if (Number.isNaN(repeat)) problems.push(`Nucleotide Repeat Length "${get(3)}" is not a number`)
    if (!COLORS.includes(colorText as Color)) problems.push(`Color "${get(4)}" must be blue, green, yellow, red or orange`)
    if (!Number.isNaN(min) && !Number.isNaN(max) && !(Number.isFinite(min) && Number.isFinite(max) && min >= 0 && min < max))
      problems.push(`Size range must satisfy 0 ≤ min < max (got ${get(1)}–${get(2)})`)
    if (!Number.isNaN(repeat) && !(Number.isFinite(repeat) && repeat > 0 && repeat <= 100)) problems.push('Repeat length must be a positive number of bases (at most 100)')
    const key = label.toLowerCase()
    if (label !== '') {
      if (existing.has(key)) problems.push(`A locus named "${label}" already exists`)
      const first = seen.get(key)
      if (first !== undefined) problems.push(`Same label as line ${first}`)
      else seen.set(key, line)
    }
    rows.push({
      line,
      label,
      fields,
      locus: problems.length
        ? null
        : { label, color: colorText as Color, min_base_length: min, max_base_length: max, nucleotide_repeat_length: repeat },
      problems,
    })
  })
  const valid = rows.filter((r) => r.locus).length
  return { headerError: rows.length === 0 ? 'The file has no rows.' : null, rows, valid, rejected: rows.length - valid }
}

/** A CSV with only the rows that will be created, in the engine's header format. */
export function validRowsCsv(p: LociPreview): string {
  return toCsvText([
    [...LOCI_CSV_HEADER],
    ...p.rows
      .filter((r) => r.locus)
      .map((r) => {
        const l = r.locus!
        return [l.label, String(l.min_base_length), String(l.max_base_length), String(l.nucleotide_repeat_length), l.color]
      }),
  ])
}
