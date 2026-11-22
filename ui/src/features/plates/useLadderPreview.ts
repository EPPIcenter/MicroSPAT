/**
 * Live preview of a ladder draft: what the engine would make of the proposed
 * peaks (`preview_well_ladder_peaks`, nothing stored), debounced while the
 * user edits. With sizes chosen by the user it previews the fitter's
 * assignment of the same peaks first and fills the other sizes from it (see
 * `explicitRequest`).
 */
import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { LadderPreview, SetWellLadderPeaksParams } from '@/api/bindings'
import { api } from '@/api/client'
import { explicitRequest, fitterRequest, hasChosenSizes, NO_PEAKS_YET, type LadderDraft } from './model/ladderEdit'
import { plateKeys } from './queries'

export const PREVIEW_DEBOUNCE_MS = 250

function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v)
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms)
    return () => clearTimeout(t)
  }, [v, ms])
  return d
}

function previewQuery(plateId: number, request: SetWellLadderPeaksParams | null, enabled: boolean) {
  return {
    queryKey: [...plateKeys.well(plateId, request?.id ?? -1), 'preview', request] as const,
    queryFn: () => api.preview_well_ladder_peaks(request as SetWellLadderPeaksParams),
    enabled: enabled && request != null,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    meta: { silent: true },
  }
}

export interface LadderPreviewState {
  /** The engine's verdict on the current draft (or the previous one while the next loads). */
  preview: LadderPreview | null
  /** What Apply sends; null when the draft cannot be sent (see `problem`). */
  request: SetWellLadderPeaksParams | null
  problem: string | null
  /** True while the shown preview is not yet the current draft's. */
  pending: boolean
  error: string | null
}

export function useLadderPreview(plateId: number, wellId: number, draft: LadderDraft | null): LadderPreviewState {
  const settled = useDebounced(draft, PREVIEW_DEBOUNCE_MS)
  const typing = settled !== draft
  const d = settled ?? []
  const explicit = hasChosenSizes(d)
  const needsFitter = draft != null && d.some((p) => p.size == null)

  const fitter = useQuery(previewQuery(plateId, needsFitter ? fitterRequest(wellId, d) : null, draft != null))
  const fitterCurrent = needsFitter && !fitter.isPlaceholderData && fitter.data != null
  const built = explicit
    ? needsFitter && !fitterCurrent
      ? null
      : explicitRequest(wellId, d, fitterCurrent ? (fitter.data?.peaks ?? null) : null)
    : null
  const chosen = useQuery(previewQuery(plateId, built?.request ?? null, draft != null && explicit))

  if (draft == null) return { preview: null, request: null, problem: null, pending: false, error: null }
  // An empty draft is not sent at all (the engine refuses it); say so instead.
  if (draft.length === 0) return { preview: null, request: null, problem: NO_PEAKS_YET, pending: typing, error: null }
  const active = explicit ? chosen : fitter
  // Without chosen sizes the request is known at once (Apply need not wait for
  // the preview); with them it needs the fitter's sizes for the current peaks.
  const request = hasChosenSizes(draft) ? (typing ? null : (built?.request ?? null)) : fitterRequest(wellId, draft)
  const err = active.error ?? (explicit ? fitter.error : null)
  return {
    preview: built?.problem ? null : (active.data ?? null),
    request,
    problem: built?.problem ?? null,
    pending: typing || active.isFetching || active.isPlaceholderData || (explicit && needsFitter && !fitterCurrent),
    error: err ? (err as Error).message : null,
  }
}
