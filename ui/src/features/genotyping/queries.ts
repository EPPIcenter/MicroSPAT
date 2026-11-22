/**
 * Queries of the genotyping screens. Keys of one project start with
 * `['projects', id]`, so the engine's `changed` events refresh them. The
 * call table reads `get_locus_calls` only (one request per locus, rows of
 * about 500 bytes); no screen parses exports for display.
 */
import { keepPreviousData, queryOptions, useQueries, useQuery, type QueryClient } from '@tanstack/react-query'
import { apiQuery } from '@/api/query'
import type { CallRow, LocusCalls, SampleCalls, SampleLocusCallView } from '@/api/bindings'

export const genoKeys = {
  calls: (pid: number, locusId: number) => ['projects', pid, 'calls', locusId] as const,
  call: (pid: number, sampleId: number, locusId: number) => ['projects', pid, 'call', sampleId, locusId] as const,
  sample: (pid: number, sampleId: number) => ['projects', pid, 'sample', sampleId] as const,
  summary: (pid: number) => ['projects', pid, 'summary'] as const,
}

export function locusCallsQuery(pid: number, locusId: number) {
  return { ...apiQuery(genoKeys.calls(pid, locusId), 'get_locus_calls', { project_id: pid, locus_id: locusId }), meta: { silent: true } }
}

export function useLocusCalls(pid: number, locusId: number | null) {
  return useQuery({ ...locusCallsQuery(pid, locusId ?? -1), enabled: locusId != null, placeholderData: keepPreviousData })
}

/** Calls of every locus (summary counts, per-sample allele counts). */
export function useAllLocusCalls(pid: number, locusIds: readonly number[]) {
  return useQueries({ queries: locusIdsQueries(pid, locusIds) })
}

function locusIdsQueries(pid: number, ids: readonly number[]) {
  return ids.map((id) => locusCallsQuery(pid, id))
}

export function sampleLocusQuery(pid: number, sampleId: number, locusId: number) {
  return queryOptions({
    ...apiQuery(genoKeys.call(pid, sampleId, locusId), 'get_sample_locus_call', { project_id: pid, sample_id: sampleId, locus_id: locusId }),
    meta: { silent: true },
    // Traces are big; keep a window of recent ones only.
    gcTime: 60_000,
  })
}

export function useSampleLocus(pid: number, sampleId: number | null, locusId: number | null) {
  return useQuery({
    ...sampleLocusQuery(pid, sampleId ?? -1, locusId ?? -1),
    enabled: sampleId != null && locusId != null,
    placeholderData: keepPreviousData,
  })
}

export function useSampleCalls(pid: number, sampleId: number | null) {
  return useQuery({
    ...apiQuery(genoKeys.sample(pid, sampleId ?? -1), 'get_project_sample_calls', { project_id: pid, sample_id: sampleId ?? -1 }),
    enabled: sampleId != null,
    placeholderData: keepPreviousData,
  })
}

export function useSummary(pid: number) {
  return useQuery(apiQuery(genoKeys.summary(pid), 'get_genotyping_summary', { id: pid }))
}

/**
 * Put a call row the engine returned (toggle, comment, review) into every
 * cached view that shows it, so shares and marks never lag behind the
 * mutation. `f` may also build an optimistic row from the cached one.
 */
export function patchCallRow(qc: QueryClient, pid: number, sampleId: number, locusId: number, f: (r: CallRow) => CallRow) {
  qc.setQueryData<LocusCalls>(genoKeys.calls(pid, locusId), (old) => (old ? { ...old, rows: old.rows.map((r) => (r.sample_id === sampleId ? f(r) : r)) } : old))
  qc.setQueryData<SampleLocusCallView>(genoKeys.call(pid, sampleId, locusId), (old) => (old ? { ...old, row: f(old.row) } : old))
  qc.setQueryData<SampleCalls>(genoKeys.sample(pid, sampleId), (old) =>
    old ? { ...old, loci: old.loci.map((l) => (l.locus_id === locusId && l.row ? { ...l, row: f(l.row) } : l)) } : old,
  )
}

export function useChannelTrace(channelId: number | null) {
  return useQuery({
    ...apiQuery(['plates', 'channel', channelId ?? -1], 'get_channel_trace', { id: channelId ?? -1 }),
    enabled: channelId != null,
    meta: { silent: true },
  })
}

export function useWellTraces(plateId: number | null, wellId: number | null) {
  return useQuery({
    ...apiQuery(['plates', plateId ?? -1, 'well', wellId ?? -1], 'get_well', { id: wellId ?? -1, traces: true }),
    enabled: plateId != null && wellId != null,
    meta: { silent: true },
  })
}
