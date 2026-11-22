/**
 * Queries of the quantification-bias screens. Keys of one project start with
 * `['projects', id]`, so the engine's `changed` events refresh them.
 */
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import { apiQuery } from '@/api/query'

export const qbKeys = {
  locus: (pid: number, locusId: number) => ['projects', pid, 'quant-bias', locusId] as const,
}

export function locusQuantBiasQuery(pid: number, locusId: number) {
  return { ...apiQuery(qbKeys.locus(pid, locusId), 'get_locus_quant_bias', { project_id: pid, locus_id: locusId }), meta: { silent: true } }
}

export function useLocusQuantBias(pid: number, locusId: number | null) {
  return useQuery({ ...locusQuantBiasQuery(pid, locusId ?? -1), enabled: locusId != null, placeholderData: keepPreviousData })
}

/** β and points of every locus (overview). */
export function useAllLocusQuantBias(pid: number, locusIds: readonly number[]) {
  return useQueries({ queries: locusIds.map((l) => locusQuantBiasQuery(pid, l)) })
}
