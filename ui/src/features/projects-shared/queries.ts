/**
 * Queries shared by every project page. Keys start with `projects` (the
 * entity the engine announces for any project change); keys of one project
 * carry its id second, so a change to project 7 leaves project 3 alone, and
 * upstream changes (announced with no ids) refresh everything.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiQuery } from '@/api/query'
import type { ProjectKind, TaskInfo } from '@/api/bindings'
import { useTaskStore } from '@/stores/tasks'

export const projectKeys = {
  list: (kind?: ProjectKind) => ['projects', 'list', kind ?? 'all'] as const,
  detail: (id: number) => ['projects', id] as const,
  samples: (id: number) => ['projects', id, 'samples'] as const,
  params: (id: number, locusId: number) => ['projects', id, 'params', locusId] as const,
}

export function useProjects(kind?: ProjectKind) {
  return useQuery({ ...apiQuery(projectKeys.list(kind), 'list_projects', kind ? { kind } : {}), meta: { silent: true } })
}

/** Every project (for upstream links and compatibility). */
export function useAllProjects() {
  return useProjects(undefined)
}

export function useProject(id: number | null) {
  return useQuery({
    ...apiQuery(projectKeys.detail(id ?? -1), 'get_project', { id: id ?? -1 }),
    enabled: id != null,
    placeholderData: keepPreviousData,
    meta: { silent: true },
  })
}

export function useProjectSamples(id: number, enabled = true) {
  return useQuery({ ...apiQuery(projectKeys.samples(id), 'list_project_samples', { id }), enabled })
}

export function useLocusParams(projectId: number, locusId: number | null) {
  return useQuery({
    ...apiQuery(projectKeys.params(projectId, locusId ?? -1), 'get_project_locus_params', {
      project_id: projectId,
      locus_id: locusId ?? -1,
    }),
    enabled: locusId != null,
    placeholderData: keepPreviousData,
  })
}

export function useLocusSets() {
  return useQuery(apiQuery(['locus_sets'], 'list_locus_sets'))
}

export function useLoci() {
  return useQuery(apiQuery(['loci'], 'list_loci'))
}

export function useWorkspaceSamples(enabled = true) {
  return useQuery({ ...apiQuery(['samples'], 'list_samples'), enabled })
}

/**
 * The newest engine task of `kind` whose label names `title` (the engine
 * labels project tasks "Analyzing PfY1 in <title>"), for inline progress.
 */
export function useProjectTask(kind: string, title: string | undefined): TaskInfo | null {
  return useTaskStore((s) => {
    if (!title) return null
    let best: (TaskInfo & { startedAt: number }) | null = null
    for (const t of Object.values(s.tasks)) {
      if (t.kind !== kind || !t.label.endsWith(title)) continue
      if (!best || t.startedAt > best.startedAt) best = t
    }
    return best
  })
}
