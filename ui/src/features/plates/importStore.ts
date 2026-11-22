/**
 * Import state outside React components, so an import keeps running and its
 * result stays available when the dialog is closed and reopened.
 */
import { create } from 'zustand'
import type { PlateImportOutcome } from '@/api/bindings'
import { api } from '@/api/client'
import { isRpcError, type PickedFile } from '@/api/transport'
import { toast } from '@/stores/toasts'
import { mergeFiles, qualityFindings, summarizeImport } from './model/importSummary'

interface ImportState {
  files: PickedFile[]
  ladderId: number | null
  running: boolean
  /** Outcomes of the last import (null before the first one). */
  outcomes: PlateImportOutcome[] | null
  error: string | null
  addFiles(f: PickedFile[]): void
  removeFiles(paths: string[]): void
  setLadder(id: number): void
  start(): Promise<void>
  reset(): void
}

const LADDER_KEY = 'microspat.plates.importLadder'

function storedLadder(): number | null {
  try {
    const v = Number(localStorage.getItem(LADDER_KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

export const useImportStore = create<ImportState>((set, get) => ({
  files: [],
  ladderId: storedLadder(),
  running: false,
  outcomes: null,
  error: null,
  addFiles: (f) => set((s) => ({ files: mergeFiles(s.files, f), outcomes: s.running ? s.outcomes : null, error: null })),
  removeFiles: (paths) => set((s) => ({ files: s.files.filter((f) => !paths.includes(f.path)) })),
  setLadder: (id) => {
    try {
      localStorage.setItem(LADDER_KEY, String(id))
    } catch {
      // ignore
    }
    set({ ladderId: id })
  },
  async start() {
    const { files, ladderId, running } = get()
    if (running || !files.length || ladderId == null) return
    set({ running: true, outcomes: null, error: null })
    try {
      const res = await api.import_plates({ paths: files.map((f) => f.path), ladder_id: ladderId })
      set({ outcomes: res.plates, files: [] })
      const sum = summarizeImport(res.plates)
      const findings = qualityFindings(res.plates)
      const note = findings.length ? `. ${findings.map((f) => f.text).join('; ')}` : ''
      ;(sum.failed ? toast.error : toast.success)('Import finished', `${sum.headline}${note}`)
    } catch (e) {
      const msg = isRpcError(e) || e instanceof Error ? e.message : String(e)
      set({ error: msg })
      // A failing task already toasts from the event stream; errors before
      // the task starts (bad params) do not.
      if (isRpcError(e) && e.code !== 'internal' && e.code !== 'io') toast.error('Import failed', msg)
    } finally {
      set({ running: false })
    }
  },
  reset: () => set({ files: [], outcomes: null, error: null }),
}))
