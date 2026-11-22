/**
 * Queries of the Plates screen. Every key starts with the engine entity, so
 * `changed` events refresh them; keys of one plate carry its id second, so
 * an event for plate 7 leaves plate 3 alone.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiQuery } from '@/api/query'
import type { Ladder } from '@/api/bindings'

export const plateKeys = {
  list: ['plates'] as const,
  detail: (id: number) => ['plates', id] as const,
  well: (plateId: number, wellId: number) => ['plates', plateId, 'well', wellId] as const,
  runTraces: (id: number) => ['plates', id, 'run-traces'] as const,
  quality: (id: number) => ['plates', id, 'quality'] as const,
}

export function usePlates() {
  // The page shows load errors itself.
  return useQuery({ ...apiQuery(plateKeys.list, 'list_plates'), meta: { silent: true } })
}

export function usePlate(id: number | null) {
  return useQuery({
    ...apiQuery(plateKeys.detail(id ?? -1), 'get_plate', { id: id ?? -1 }),
    enabled: id != null,
    // Keep the previous plate on screen while the next one loads.
    placeholderData: keepPreviousData,
    // A deleted plate 404s on its last refetch; the page shows that itself.
    meta: { silent: true },
  })
}

export function wellQuery(plateId: number, wellId: number) {
  return { ...apiQuery(plateKeys.well(plateId, wellId), 'get_well', { id: wellId, traces: true }), meta: { silent: true } }
}

export function useWell(plateId: number | null, wellId: number | null) {
  return useQuery({
    ...wellQuery(plateId ?? -1, wellId ?? -1),
    enabled: plateId != null && wellId != null,
    placeholderData: keepPreviousData,
  })
}

/** A well without traces (ladder peaks and sizing only). */
export function useWellBrief(plateId: number, wellId: number | null) {
  return useQuery({
    ...apiQuery([...plateKeys.well(plateId, wellId ?? -1), 'brief'], 'get_well', { id: wellId ?? -1, traces: false }),
    enabled: wellId != null,
    meta: { silent: true },
  })
}

export function useRunTraces(id: number, enabled: boolean) {
  return useQuery({ ...apiQuery(plateKeys.runTraces(id), 'get_plate_run_traces', { id }), enabled })
}

/** The plate's quality report (null report: imported before quality checks). */
export function usePlateQuality(id: number) {
  return useQuery({
    ...apiQuery(plateKeys.quality(id), 'get_plate_quality', { id }),
    placeholderData: keepPreviousData,
    meta: { silent: true },
  })
}

export function useLadders() {
  return useQuery(apiQuery(['ladders'], 'list_ladders'))
}

export function ladderById(ladders: readonly Ladder[] | undefined, id: number | null | undefined): Ladder | undefined {
  return id == null ? undefined : ladders?.find((l) => l.id === id)
}
