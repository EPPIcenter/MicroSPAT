/**
 * Export a project's (or a plate's quality) CSV and save it (a save dialog in the desktop app, a
 * download in the browser), with one success toast for every page:
 * "Exported <file>" and its row count.
 */
import { useCallback, useState } from 'react'
import { api } from '@/api/client'
import type { TextFile } from '@/api/bindings'
import { saveTextFile } from '@/api/transport'
import { toast } from '@/stores/toasts'

/**
 * What each page exports. `peaks` is `export_peak_data` (genotyping and
 * quantification-bias estimators); `plate_quality` is a plate's quality
 * report (`export_plate_quality`, the id is the plate's).
 */
export type ExportKind = 'bins' | 'artifacts' | 'peaks' | 'plate_quality'

const FAILED: Record<ExportKind, string> = {
  bins: 'Could not export bins',
  artifacts: 'Could not export equations',
  peaks: 'Could not export peak data',
  plate_quality: 'Could not export the quality report',
}

function fetchExport(kind: ExportKind, id: number, allowStale: boolean): Promise<TextFile> {
  if (kind === 'bins') return api.export_bins({ id })
  if (kind === 'artifacts') return api.export_artifact_equations({ id })
  if (kind === 'plate_quality') return api.export_plate_quality({ id })
  return api.export_peak_data({ id, ...(allowStale ? { allow_stale: true } : {}) })
}

/** Toast for a saved export: the file name and how many data rows it holds. */
export function toastExported(f: TextFile): void {
  const rows = f.content.split('\n').filter(Boolean).length - 1
  toast.success(`Exported ${f.filename}`, `${rows.toLocaleString('en-US')} ${rows === 1 ? 'row' : 'rows'}`)
}

/** Export of the project (or, for `plate_quality`, the plate) with this id. */
export function useExport(kind: ExportKind, id: number) {
  const [busy, setBusy] = useState(false)
  const run = useCallback(
    async (opts: { allowStale?: boolean } = {}) => {
      setBusy(true)
      try {
        const f = await fetchExport(kind, id, !!opts.allowStale)
        if (await saveTextFile(f.filename, f.content)) toastExported(f)
      } catch (e) {
        toast.error(FAILED[kind], (e as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [kind, id],
  )
  return { run, busy }
}
