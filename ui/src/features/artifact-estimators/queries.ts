/**
 * Queries and edits of the artifact estimator screens. Locus results are
 * keyed `['projects', id, 'artifacts', locusId]`, so `changed` events refresh
 * them; every edit also writes the class it returns into the cache, so the
 * plot updates as soon as the response arrives.
 */
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { apiQuery } from '@/api/query'
import type { ArtifactEstimatorView, LocusArtifacts, RegressionMethod } from '@/api/bindings'
import { toast } from '@/stores/toasts'

export const artifactKeys = {
  locus: (pid: number, locusId: number) => ['projects', pid, 'artifacts', locusId] as const,
}

function locusQuery(pid: number, locusId: number) {
  return { ...apiQuery(artifactKeys.locus(pid, locusId), 'get_locus_artifact_estimators', { project_id: pid, locus_id: locusId }), meta: { silent: true } }
}

export function useLocusArtifacts(pid: number, locusId: number | null) {
  return useQuery({ ...locusQuery(pid, locusId ?? -1), enabled: locusId != null, placeholderData: keepPreviousData })
}

export function useAllLocusArtifacts(pid: number, locusIds: readonly number[]) {
  return useQueries({ queries: locusIds.map((id) => locusQuery(pid, id)) })
}

export type ArtifactEdit =
  | { type: 'add_breakpoint'; size: number }
  | { type: 'remove_breakpoint'; size: number }
  | { type: 'clear' }
  | { type: 'method'; index: number; method: RegressionMethod }
  | { type: 'refit' }
  | { type: 'delete' }

const ERROR_TITLE: Record<ArtifactEdit['type'], string> = {
  add_breakpoint: 'Could not add the breakpoint',
  remove_breakpoint: 'Could not remove the breakpoint',
  clear: 'Could not clear the breakpoints',
  method: 'Could not change the method',
  refit: 'Could not re-fit',
  delete: 'Could not delete the class',
}

/** One RPC per edit of one class; the response replaces the class in the locus cache. */
export function useArtifactEdit(pid: number, locusId: number, id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (e: ArtifactEdit): Promise<ArtifactEstimatorView | null> => {
      switch (e.type) {
        case 'add_breakpoint':
          return api.add_artifact_breakpoint({ id, size: e.size })
        case 'remove_breakpoint':
          return api.remove_artifact_breakpoint({ id, size: e.size })
        case 'clear':
          return api.clear_artifact_breakpoints({ id })
        case 'method':
          return api.set_artifact_equation_method({ id, equation_index: e.index, method: e.method })
        case 'refit':
          return api.refit_artifact_estimator({ id })
        case 'delete':
          await api.delete_artifact_estimator({ id })
          return null
      }
    },
    onSuccess: (view) => {
      qc.setQueryData<LocusArtifacts>(artifactKeys.locus(pid, locusId), (old) =>
        old ? { ...old, estimators: view ? old.estimators.map((x) => (x.id === view.id ? view : x)) : old.estimators.filter((x) => x.id !== id) } : old,
      )
    },
    onError: (err: Error, e) => toast.error(ERROR_TITLE[e.type], err.message),
    meta: { silent: true },
  })
}
