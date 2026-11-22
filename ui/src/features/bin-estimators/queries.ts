/**
 * Queries of the bin estimator screens. Bins are keyed under
 * `['projects', id, …]` so `changed` events refresh them. The peak scatter
 * (tens of thousands of points) is keyed by the locus's analysis time
 * instead: it only changes when the locus is re-analyzed, so bin saves and
 * other project events do not re-download it.
 */
import { useQuery } from '@tanstack/react-query'
import { apiQuery } from '@/api/query'
import type { ProjectLocus } from '@/api/bindings'

export const binKeys = {
  bins: (pid: number, locusId: number) => ['projects', pid, 'bins', locusId] as const,
  scatter: (pid: number, locusId: number, analyzedAt: string | null) => ['bin-scatter', pid, locusId, analyzedAt ?? '-'] as const,
}

export function useLocusBins(pid: number, locusId: number | null) {
  return useQuery({
    ...apiQuery(binKeys.bins(pid, locusId ?? -1), 'get_locus_bins', { project_id: pid, locus_id: locusId ?? -1 }),
    enabled: locusId != null,
    meta: { silent: true },
  })
}

export function useBinScatter(pid: number, locus: ProjectLocus | null) {
  const lid = locus?.locus_id ?? -1
  return useQuery({
    ...apiQuery(binKeys.scatter(pid, lid, locus?.status.analyzed_at ?? null), 'get_bin_estimator_peaks', { project_id: pid, locus_id: lid }),
    enabled: !!locus && locus.status.state !== 'not_analyzed',
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => (prev && prev.locus_id === lid ? prev : undefined),
    meta: { silent: true },
  })
}
