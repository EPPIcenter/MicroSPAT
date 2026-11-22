/** Import outcome summary and the file-selection bookkeeping of the import dialog. */
import type { PlateImportOutcome } from '@/api/bindings'
import type { PickedFile } from '@/api/transport'
import { issueCount, qualityLabel } from './quality'

export interface ImportSummary {
  imported: number
  duplicate: number
  failed: number
  wells: number
  /** Wells that did not size (failed or unusable) across imported plates. */
  unsized: number
  headline: string
  tone: 'ok' | 'warn' | 'danger'
}

export function summarizeImport(outcomes: readonly PlateImportOutcome[]): ImportSummary {
  let imported = 0
  let duplicate = 0
  let failed = 0
  let wells = 0
  let unsized = 0
  for (const o of outcomes) {
    if (o.status === 'imported') {
      imported++
      wells += o.well_count
      unsized += (o.sizing?.failed ?? 0) + (o.sizing?.unusable ?? 0)
    } else if (o.status === 'duplicate') duplicate++
    else failed++
  }
  const parts = [`${imported} plate${imported === 1 ? '' : 's'} imported`]
  if (duplicate) parts.push(`${duplicate} already in the workspace`)
  if (failed) parts.push(`${failed} failed`)
  // Unsized wells are normal on import (fixed in the plate view), so they do not color the headline.
  const tone = failed ? 'danger' : duplicate ? 'warn' : 'ok'
  return { imported, duplicate, failed, wells, unsized, headline: parts.join(', '), tone }
}

/** Imported plates whose quality check found something, worst first: "DEMO-2: 1 problem, 1 note in the quality check". */
export function qualityFindings(outcomes: readonly PlateImportOutcome[]): { label: string; plateId: number; worst: 'problem' | 'warning' | 'info'; text: string }[] {
  const rank = { problem: 0, warning: 1, info: 2 } as const
  return outcomes
    .filter((o) => o.status === 'imported' && o.plate_id != null && o.quality && issueCount(o.quality) > 0 && o.quality.worst)
    .map((o) => ({ label: o.label, plateId: o.plate_id as number, worst: o.quality!.worst!, text: `${o.label}: ${qualityLabel(o.quality)} in the quality check` }))
    .sort((a, b) => rank[a.worst] - rank[b.worst] || a.label.localeCompare(b.label, undefined, { numeric: true }))
}

/** Outcomes sorted for display: failures first, then duplicates, then imported, each by label. */
export function sortOutcomes(outcomes: readonly PlateImportOutcome[]): PlateImportOutcome[] {
  const rank = { failed: 0, duplicate: 1, imported: 2 } as const
  return [...outcomes].sort((a, b) => rank[a.status] - rank[b.status] || a.label.localeCompare(b.label, undefined, { numeric: true }))
}

/** Add newly chosen files, skipping paths already chosen. */
export function mergeFiles(current: readonly PickedFile[], added: readonly PickedFile[]): PickedFile[] {
  const seen = new Set(current.map((f) => f.path))
  return [...current, ...added.filter((f) => !seen.has(f.path) && seen.add(f.path))]
}

/**
 * Group chosen files for the list: zips and folders stand alone, loose
 * `.fsa` files are counted together (a browser folder upload arrives as many
 * files whose names carry the folder, e.g. `PLATE-1/A01.fsa`).
 */
export function describeFiles(files: readonly PickedFile[]): { key: string; label: string; detail: string; paths: string[] }[] {
  const out: { key: string; label: string; detail: string; paths: string[] }[] = []
  const groups = new Map<string, PickedFile[]>()
  for (const f of files) {
    const lower = f.name.toLowerCase()
    if (lower.endsWith('.zip')) out.push({ key: f.path, label: f.name, detail: 'zip archive', paths: [f.path] })
    else if (lower.endsWith('.fsa')) {
      const dir = f.name.includes('/') ? f.name.slice(0, f.name.lastIndexOf('/')) : ''
      const g = groups.get(dir) ?? []
      g.push(f)
      groups.set(dir, g)
    } else out.push({ key: f.path, label: f.name, detail: 'folder', paths: [f.path] })
  }
  for (const [dir, g] of groups) {
    out.push({
      key: `fsa:${dir}`,
      label: dir || (g.length === 1 ? (g[0] as PickedFile).name : 'Loose FSA files'),
      detail: `${g.length} FSA file${g.length === 1 ? '' : 's'}`,
      paths: g.map((f) => f.path),
    })
  }
  return out
}
