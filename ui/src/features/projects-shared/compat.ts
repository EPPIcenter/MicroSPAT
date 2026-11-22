/**
 * Which existing projects can be linked as an upstream estimator, and why
 * not when they cannot. Mirrors the engine's rule: the linked project must
 * be of the right kind and cover every locus of the new project's locus set.
 */
import type { LocusSet, ProjectSummary } from '@/api/bindings'
import type { UpstreamLink } from './kinds'

export interface Candidate {
  project: ProjectSummary
  ok: boolean
  /** Why it cannot be used, or a warning when it can (e.g. stale loci). */
  note: string | null
}

/** Loci of `need` missing from `have`, as labels when known. */
function missingLoci(need: readonly number[], have: readonly number[], labels: ReadonlyMap<number, string>): string[] {
  const h = new Set(have)
  return need.filter((id) => !h.has(id)).map((id) => labels.get(id) ?? `#${id}`)
}

/**
 * Projects that could fill `link` for a project on `locusSetId`, compatible
 * ones first. `lociLabels` maps locus ids to labels for messages.
 */
export function linkCandidates(
  link: UpstreamLink,
  projects: readonly ProjectSummary[],
  locusSets: readonly LocusSet[],
  locusSetId: number | null,
  lociLabels: ReadonlyMap<number, string> = new Map(),
  /** Exclude this project (editing a project never links to itself). */
  selfId?: number,
): Candidate[] {
  const sets = new Map(locusSets.map((s) => [s.id, s]))
  const need = locusSetId != null ? (sets.get(locusSetId)?.locus_ids ?? []) : []
  const out = projects
    .filter((p) => p.kind === link.kind && p.id !== selfId)
    .map((p): Candidate => {
      if (locusSetId == null) return { project: p, ok: true, note: null }
      const have = sets.get(p.locus_set_id)?.locus_ids ?? []
      const missing = missingLoci(need, have, lociLabels)
      if (missing.length) {
        const list = missing.length > 4 ? `${missing.slice(0, 4).join(', ')} and ${missing.length - 4} more` : missing.join(', ')
        return { project: p, ok: false, note: `Does not cover ${list} (uses locus set “${p.locus_set_label}”).` }
      }
      const notCurrent = p.stale_loci + p.unanalyzed_loci
      return {
        project: p,
        ok: true,
        note: notCurrent ? `${notCurrent} of its loci ${notCurrent === 1 ? 'is' : 'are'} not current; results built on it will be flagged.` : null,
      }
    })
  return out.sort((a, b) => Number(b.ok) - Number(a.ok) || a.project.title.localeCompare(b.project.title))
}
