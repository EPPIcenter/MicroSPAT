/**
 * Queries of the controls page. Controls are keyed under `controls` (the
 * engine announces control changes there); bins and mixtures live under
 * `projects` with the project id second, so bin edits and mixture changes
 * refresh them.
 */
import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { apiQuery } from '@/api/query'
import type { Bin, LocusBins } from '@/api/bindings'

export const controlKeys = {
  list: ['controls', 'list'] as const,
}

export function useControls() {
  return useQuery({ ...apiQuery(controlKeys.list, 'list_controls', {}), meta: { silent: true } })
}

export function locusBinsQuery(projectId: number, locusId: number) {
  return {
    ...apiQuery(['projects', projectId, 'bins', locusId], 'get_locus_bins', { project_id: projectId, locus_id: locusId }),
    meta: { silent: true },
  }
}

/** Bins of a bin estimator at each locus, keyed by locus id (missing while loading). */
export function useBinsByLocus(binEstimatorId: number | null, locusIds: readonly number[]) {
  const qs = useQueries({ queries: locusIds.map((l) => ({ ...locusBinsQuery(binEstimatorId ?? -1, l), enabled: binEstimatorId != null })) })
  const data = qs.map((q) => q.data)
  const key = data.map((d) => (d ? `${d.locus_id}:${d.bins.length}:${d.status.analyzed_at}` : '-')).join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const byLocus = useMemo(() => new Map((data.filter(Boolean) as LocusBins[]).map((d) => [d.locus_id, d.bins as readonly Bin[]])), [key])
  return { byLocus, loading: qs.some((q) => q.isPending && binEstimatorId != null), error: qs.find((q) => q.error)?.error ?? null }
}
