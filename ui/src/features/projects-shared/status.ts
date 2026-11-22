/**
 * How analysis status is presented: one vocabulary for chips, banners,
 * tooltips and the project header, so a stale result looks stale wherever
 * it appears.
 */
import type { AnalysisState, AnalysisStatus, ProjectLocus, ProjectSummary } from '@/api/bindings'

export type StatusTone = 'ok' | 'warn' | 'neutral' | 'danger'

export interface StatusView {
  state: AnalysisState
  tone: StatusTone
  /** One or two words: "Current", "Stale", "Not analyzed". */
  label: string
  /** A sentence for tooltips and banners. */
  sentence: string
  /** The engine's reasons, verbatim (empty unless stale). */
  reasons: string[]
  /** Treat displayed results with suspicion (stale or missing). */
  suspect: boolean
}

const LABEL: Record<AnalysisState, string> = {
  current: 'Current',
  stale: 'Stale',
  not_analyzed: 'Not analyzed',
}

/** Presentation of one result's status. */
export function statusView(s: AnalysisStatus | null | undefined, what = 'These results'): StatusView {
  if (!s) {
    return {
      state: 'not_analyzed',
      tone: 'neutral',
      label: LABEL.not_analyzed,
      sentence: `${what} have not been computed.`,
      reasons: [],
      suspect: true,
    }
  }
  switch (s.state) {
    case 'current':
      return {
        state: 'current',
        tone: 'ok',
        label: LABEL.current,
        sentence: s.analyzed_at ? `${what} are up to date (computed ${formatWhen(s.analyzed_at)}).` : `${what} are up to date.`,
        reasons: [],
        suspect: false,
      }
    case 'stale':
      return {
        state: 'stale',
        tone: 'warn',
        label: LABEL.stale,
        sentence: `${what} are out of date${s.reasons.length ? ': ' + joinReasons(s.reasons) : ''}. Re-analyze to update them.`,
        reasons: s.reasons,
        suspect: true,
      }
    case 'not_analyzed':
      return {
        state: 'not_analyzed',
        tone: 'neutral',
        label: LABEL.not_analyzed,
        sentence: `${what} have not been computed yet.`,
        reasons: [],
        suspect: true,
      }
  }
}

function joinReasons(r: string[]): string {
  return r.map((x) => x.replace(/\.$/, '')).join('; ')
}

/** "2026-11-21 06:03" in local time; the raw string if unparsable. */
export function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export interface ProjectOverall {
  tone: StatusTone
  label: string
  sentence: string
  /** Loci that need analysis (stale or never analyzed). */
  needsAnalysis: number
}

/** Overall status of a project from its locus counts (and probabilities, for genotyping). */
export function projectOverall(
  p: Pick<ProjectSummary, 'locus_count' | 'current_loci' | 'stale_loci' | 'unanalyzed_loci' | 'probabilities' | 'kind'>,
): ProjectOverall {
  const needs = p.stale_loci + p.unanalyzed_loci
  if (p.locus_count === 0) return { tone: 'neutral', label: 'No loci', sentence: 'The locus set has no loci.', needsAnalysis: 0 }
  if (p.current_loci === 0 && p.stale_loci === 0) {
    return {
      tone: 'neutral',
      label: 'Not analyzed',
      sentence: `None of the ${p.locus_count} loci has been analyzed.`,
      needsAnalysis: needs,
    }
  }
  const parts: string[] = []
  if (p.stale_loci) parts.push(`${p.stale_loci} stale`)
  if (p.unanalyzed_loci) parts.push(`${p.unanalyzed_loci} not analyzed`)
  if (needs > 0) {
    return {
      tone: 'warn',
      label: `${needs} of ${p.locus_count} loci need analysis`,
      sentence: `${p.current_loci} of ${p.locus_count} loci are current; ${parts.join(', ')}.`,
      needsAnalysis: needs,
    }
  }
  if (p.kind === 'genotyping' && p.probabilities && p.probabilities.state !== 'current') {
    const st = p.probabilities.state === 'stale' ? 'are stale' : 'have not been calculated'
    return {
      tone: 'warn',
      label: p.probabilities.state === 'stale' ? 'Probabilities stale' : 'Probabilities not calculated',
      sentence: `Every locus is current, but peak probabilities ${st}.`,
      needsAnalysis: 0,
    }
  }
  return { tone: 'ok', label: 'Current', sentence: `All ${p.locus_count} loci are current.`, needsAnalysis: 0 }
}

/** Loci whose results are not current, in project order. */
export function lociNeedingAnalysis(loci: readonly ProjectLocus[]): ProjectLocus[] {
  return loci.filter((l) => l.status.state !== 'current')
}

/** Short status text for compact places ("stale: Parameters changed"). */
export function shortStatus(s: AnalysisStatus): string {
  if (s.state === 'stale') return s.reasons[0] ? `Stale: ${s.reasons[0].replace(/\.$/, '')}` : 'Stale'
  return LABEL[s.state]
}
