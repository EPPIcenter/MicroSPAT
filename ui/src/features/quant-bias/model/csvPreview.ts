/**
 * Preview of a control-mixtures CSV (the old MicroSPAT format):
 *
 *   Barcode,Control 1,Control 2
 *   MIX-01,3D7;0.7,DD2;0.3
 *
 * Column names after Barcode do not matter; each cell is CONTROL;PROPORTION
 * and a row's proportions sum to 1. The engine's dry run
 * (`import_control_mixtures_csv` with `dry_run`) decides what can be applied;
 * its problems come back as sentences. This module parses the file the same
 * way so every row can be shown with its own problems, adds what the engine
 * cannot say (a control that exists, but in another bin estimator), and keeps
 * engine problems it cannot attribute to a row as general problems.
 */
import type { Control, MixturesReport, Sample } from '@/api/bindings'
import { headerKey, parseCsv } from '@/features/loci/csv'

export interface PreviewComponent {
  raw: string
  label: string
  proportion: number | null
}

export interface PreviewRow {
  line: number
  barcode: string
  components: PreviewComponent[]
  /** Sum of the parsed proportions. */
  sum: number
  sampleId: number | null
  /** new to the project, replacing an existing mixture, or unknown sample. */
  change: 'new' | 'replace' | null
  problems: string[]
}

export interface MixtureCsvPreview {
  /** A problem that stops reading the file at all (no Barcode column). */
  fatal: string | null
  rows: PreviewRow[]
  /** Problems not tied to one row (engine messages the rows do not cover). */
  general: string[]
  okRows: number
  badRows: number
  /** True when the engine's dry run reported nothing wrong. */
  canApply: boolean
}

export interface CsvContext {
  samples: readonly Pick<Sample, 'id' | 'barcode'>[]
  projectSampleIds: ReadonlySet<number>
  /** Every control in the workspace (to explain controls of another bin estimator). */
  controls: readonly Pick<Control, 'id' | 'label' | 'bin_estimator_id' | 'bin_estimator_title'>[]
  binEstimatorId: number
  binEstimatorTitle: string
}

const SUM_EPS = 0.01

function fmt(v: number): string {
  return String(+v.toFixed(3))
}

export function previewMixtureCsv(text: string, report: MixturesReport | null, ctx: CsvContext): MixtureCsvPreview {
  const empty: MixtureCsvPreview = { fatal: null, rows: [], general: [], okRows: 0, badRows: 0, canApply: false }
  const table = parseCsv(text)
  const blank = (r: string[]) => r.every((c) => c.trim() === '')
  const h = table.findIndex((r) => !blank(r))
  if (h < 0) return { ...empty, fatal: 'The file is empty.' }
  const header = table[h]!.map(headerKey)
  const bi = header.indexOf('barcode')
  if (bi < 0) return { ...empty, fatal: 'The first row must be a header with a Barcode column, then one column per control (any names).' }

  const sampleBy = new Map(ctx.samples.map((s) => [s.barcode.toLowerCase(), s]))
  const own = new Map<string, number>()
  const elsewhere = new Map<string, string[]>()
  for (const c of ctx.controls) {
    const k = c.label.toLowerCase()
    if (c.bin_estimator_id === ctx.binEstimatorId) own.set(k, c.id)
    else elsewhere.set(k, [...(elsewhere.get(k) ?? []), c.bin_estimator_title])
  }

  const rows: PreviewRow[] = []
  const seen = new Map<string, number>()
  table.forEach((cells, i) => {
    if (i <= h || blank(cells)) return
    // One record per line (cells with embedded newlines are not expected here).
    const line = i + 1
    const barcode = (cells[bi] ?? '').trim()
    const problems: string[] = []
    const components: PreviewComponent[] = []
    let cellBad = false
    cells.forEach((cell, ci) => {
      if (ci === bi || cell.trim() === '') return
      const parts = cell.split(';').map((s) => s.trim())
      if (parts.length !== 2 || !parts[0]) {
        cellBad = true
        problems.push(`“${cell.trim()}” should read CONTROL;PROPORTION`)
        return
      }
      const v = Number(parts[1])
      const ok = parts[1] !== '' && Number.isFinite(v)
      if (!ok || v <= 0 || v > 1) cellBad = true
      if (!ok) problems.push(`“${cell.trim()}”: proportion “${parts[1]}” is not a number`)
      else if (v <= 0 || v > 1)
        problems.push(`${parts[0]}: proportion ${parts[1]} must be above 0 and at most 1${v > 1 && v <= 100 ? ' (write 0.7, not 70)' : ''}`)
      components.push({ raw: cell.trim(), label: parts[0], proportion: ok ? v : null })
      const k = parts[0].toLowerCase()
      if (!own.has(k)) {
        const other = elsewhere.get(k)
        problems.push(
          other
            ? `${parts[0]} is a control of ${other.map((t) => `“${t}”`).join(', ')}, not of this project's bin estimator “${ctx.binEstimatorTitle}”`
            : `no control named ${parts[0]} in “${ctx.binEstimatorTitle}”`,
        )
      }
    })
    if (!barcode) {
      if (components.length) problems.push('no barcode')
    }
    const sample = barcode ? sampleBy.get(barcode.toLowerCase()) : undefined
    if (barcode && !sample) problems.push(`unknown barcode: no sample ${barcode} in the workspace`)
    const labels = components.map((c) => c.label.toLowerCase())
    if (new Set(labels).size !== labels.length) problems.push('a control is listed twice')
    if (barcode && components.length === 0) problems.push('no controls listed')
    const sum = components.reduce((s, c) => s + (c.proportion ?? 0), 0)
    // A bad cell already explains a wrong sum.
    if (components.length && !cellBad && Math.abs(sum - 1) > SUM_EPS) problems.push(`proportions sum to ${fmt(sum)}, not 1`)
    const k = barcode.toLowerCase()
    if (barcode && seen.has(k)) problems.push(`listed twice (also line ${seen.get(k)})`)
    else if (barcode) seen.set(k, line)
    rows.push({
      line,
      barcode,
      components,
      sum,
      sampleId: sample?.id ?? null,
      change: sample ? (ctx.projectSampleIds.has(sample.id) ? 'replace' : 'new') : null,
      problems,
    })
  })

  // Engine problems: attach to rows by barcode; rows that already explain
  // themselves keep the local wording. Anything else is general.
  const general: string[] = []
  const byBarcode = new Map(rows.map((r) => [r.barcode.toLowerCase(), r]))
  for (const prob of report?.problems ?? []) {
    if (/^Unknown barcodes \(/.test(prob) && rows.some((r) => r.barcode && r.sampleId == null)) continue
    if (/^line \d+:/.test(prob) && rows.some((r) => r.problems.length)) continue
    const m = /^(.+?)(?::| appears twice| has no controls)/.exec(prob)
    const row = m ? byBarcode.get(m[1]!.toLowerCase()) : undefined
    if (row) {
      if (row.problems.length === 0) row.problems.push(prob.slice(m![1]!.length).replace(/^:\s*/, '').trim())
      continue
    }
    general.push(prob)
  }
  if (rows.length === 0) general.push('The file has a header but no rows.')
  const badRows = rows.filter((r) => r.problems.length).length
  return {
    fatal: null,
    rows,
    general,
    okRows: rows.length - badRows,
    badRows,
    canApply: !!report && report.problems.length === 0 && badRows === 0 && rows.length > 0,
  }
}

/**
 * A CSV to start from: the project's current mixtures when it has some (so
 * the file round-trips), otherwise an example with two of its controls.
 */
export function mixtureTemplate(
  current: readonly { barcode: string; controls: readonly { label?: string; proportion: number }[] }[],
  controlLabels: readonly string[],
): string {
  const withMix = current.filter((r) => r.controls.length > 0)
  const width = Math.max(2, ...withMix.map((r) => r.controls.length))
  const head = ['Barcode', ...Array.from({ length: width }, (_, i) => `Control ${i + 1}`)]
  const lines = [head.join(',')]
  if (withMix.length) {
    for (const r of withMix) lines.push([r.barcode, ...r.controls.map((c) => `${c.label ?? '?'};${fmt(c.proportion)}`)].join(','))
  } else {
    const a = controlLabels[0] ?? 'STRAIN_A'
    const b = controlLabels[1] ?? 'STRAIN_B'
    lines.push(`MIX-01,${a};0.7,${b};0.3`, `MIX-02,${a};0.5,${b};0.5`, `MIX-03,${a};0.3,${b};0.7`)
  }
  return lines.join('\n') + '\n'
}
