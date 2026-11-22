/**
 * Project header: title, links to the upstream estimators, overall status,
 * the analyze action (all loci, selected loci, or only those that need it)
 * with inline task progress, and the edit / duplicate / delete menu. Below
 * it, the engine's upstream warnings (a linked estimator not current, or
 * without an artifact model at some loci), so no project page misses them.
 */
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, ChevronDown, Copy, MoreHorizontal, Pencil, Play, Trash2 } from 'lucide-react'
import { api } from '@/api/client'
import type { AnalyzeProjectParams, AnalyzeProjectResult, ProjectDetail, ProjectKind } from '@/api/bindings'
import { Button } from '@/components/ui/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/Menu'
import { ProgressBar, Spinner } from '@/components/ui/ProgressBar'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'
import { countOf } from '@/lib/format'
import { toast } from '@/stores/toasts'
import { KINDS, projectPath } from './kinds'
import { DeleteDialog, DuplicateDialog } from './ProjectList'
import { ProjectFormDialog } from './ProjectFormDialog'
import { useProjectTask } from './queries'
import { lociNeedingAnalysis, projectOverall } from './status'
import { StatusIcon } from './StatusBits'

/** Analyze mutation with a result toast; shared by the header and stale banners. */
export function useAnalyze(projectId: number) {
  return useMutation({
    mutationFn: (p: Omit<AnalyzeProjectParams, 'id'>) => api.analyze_project({ id: projectId, ...p }),
    meta: { errorTitle: 'Analysis failed' },
    onSuccess: (r) => toast.success(...analysisToast(r)),
  })
}

/** Toast text for an analysis result: what was done and any warnings. */
export function analysisToast(r: AnalyzeProjectResult): [string, string | undefined] {
  if (r.loci.length === 0) return ['Nothing to analyze', 'Every locus is already current.']
  const warnings = r.loci.flatMap((l) => l.warnings.map((w) => `${l.locus_label}: ${w}`))
  const title = r.loci.length === 1 ? `Analyzed ${r.loci[0]!.locus_label}` : `Analyzed ${r.loci.length} loci`
  const lines = r.loci.length <= 3 ? r.loci.map((l) => `${l.locus_label}: ${l.summary}`) : []
  return [title, [...lines, ...warnings].join('\n') || undefined]
}

export interface AnalyzeButtonProps {
  detail: ProjectDetail
  /** Loci selected in the page, for "Analyze selected". */
  selectedLocusIds?: readonly number[]
  size?: 'sm' | 'md'
}

/**
 * Split button: the main action analyzes loci that need it (or all when
 * everything is current); the menu offers all, selected, or one locus.
 * Shows the engine task's progress while it runs; the UI stays usable.
 */
export function AnalyzeButton({ detail, selectedLocusIds = [], size = 'sm' }: AnalyzeButtonProps) {
  const p = detail.project
  const analyze = useAnalyze(p.id)
  const task = useProjectTask('analyze_project', p.title)
  const running = analyze.isPending || task?.status === 'running'
  const needs = lociNeedingAnalysis(detail.loci)
  const sel = selectedLocusIds.filter((id) => detail.loci.some((l) => l.locus_id === id))
  // "Analyze" while some never were; "Re-analyze" when only stale ones (or all, when current) are redone.
  const verb = needs.some((l) => l.status.state === 'not_analyzed') ? 'Analyze' : 'Re-analyze'
  const n = needs.length || detail.loci.length
  const mainLabel = `${verb} ${n === detail.loci.length ? 'all' : n} ${n === 1 && n !== detail.loci.length ? 'locus' : 'loci'}`
  return (
    <div className="flex items-center gap-2">
      {running && (
        <div className="flex w-40 flex-col gap-0.5" aria-live="polite" data-testid="analyze-progress">
          <span className="truncate text-2xs text-muted">{task?.message ?? task?.label ?? 'Analyzing…'}</span>
          <ProgressBar value={task?.status === 'running' ? task.progress : null} label="Analysis progress" />
        </div>
      )}
      <div className="flex">
        <Button
          size={size}
          variant={needs.length ? 'primary' : 'secondary'}
          className="rounded-r-none"
          disabled={running || detail.loci.length === 0}
          onClick={() => analyze.mutate(needs.length ? { only_stale: true } : {})}
          data-testid="analyze-main"
        >
          {running ? <Spinner className="size-3" /> : <Play size={12} />}
          {mainLabel}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size={size}
              variant={needs.length ? 'primary' : 'secondary'}
              className="rounded-l-none border-l border-l-black/15 px-1.5"
              disabled={running}
              aria-label="More analyze options"
            >
              <ChevronDown size={12} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => analyze.mutate({ only_stale: true })} disabled={needs.length === 0}>
              Only loci that need it ({needs.length})
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => analyze.mutate({ locus_ids: sel })} disabled={sel.length === 0}>
              Selected {sel.length === 1 ? 'locus' : 'loci'} ({sel.length})
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => analyze.mutate({})}>All {countOf(detail.loci.length, 'locus', 'loci')}</DropdownMenuItem>
            {p.kind === 'genotyping' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="normal-case tracking-normal font-normal text-muted">
                  Re-analysis discards manual curation of those loci; comments are kept.
                </DropdownMenuLabel>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export interface ProjectHeaderProps {
  detail: ProjectDetail
  selectedLocusIds?: readonly number[]
  /** Extra actions before the analyze button. */
  actions?: ReactNode
  /** Content before the title (e.g. a back link or project switcher). */
  leading?: ReactNode
  /** After duplicate (navigate to the copy). */
  onDuplicated?: (id: number) => void
  /** After delete (navigate away). */
  onDeleted?: () => void
}

export function ProjectHeader({ detail, selectedLocusIds, actions, leading, onDuplicated, onDeleted }: ProjectHeaderProps) {
  const p = detail.project
  const info = KINDS[p.kind]
  const overall = projectOverall(p)
  const [editing, setEditing] = useState(false)
  const [dup, setDup] = useState(false)
  const [del, setDel] = useState(false)
  return (
    <>
      <header
        className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface px-3 py-1.5"
        data-testid="project-header"
      >
        {leading}
        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="truncate text-sm font-semibold" data-testid="project-title">
              {p.title}
            </h1>
            <Tooltip content={overall.sentence}>
              <span
                tabIndex={0}
                data-testid="project-status"
                className={cn(
                  'inline-flex items-center gap-1 text-xs outline-none',
                  overall.tone === 'ok' ? 'text-ok' : overall.tone === 'warn' ? 'text-warn' : 'text-muted',
                )}
              >
                <StatusIcon
                  view={{ state: overall.tone === 'ok' ? 'current' : overall.tone === 'warn' ? 'stale' : 'not_analyzed' }}
                  size={11}
                  className="text-current"
                />
                {overall.label}
              </span>
            </Tooltip>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-2xs text-muted">
            <span>{p.locus_set_label}</span>
            <span aria-hidden>·</span>
            <span>{countOf(p.sample_count, 'sample')}</span>
            {info.links.map((l) => {
              const ref = p[l.prop]
              if (!ref && !l.required) return null
              return (
                <span key={l.field} className="inline-flex items-center gap-1">
                  <span aria-hidden>·</span>
                  <ArrowRight size={10} className="rotate-180 text-faint" aria-hidden />
                  {ref ? (
                    <Link
                      to={projectPath(ref.kind, ref.id)}
                      className="text-accent hover:underline"
                      title={`${KINDS[ref.kind].noun}: ${l.purpose}`}
                    >
                      {ref.title}
                    </Link>
                  ) : (
                    <span className="text-danger">no {KINDS[l.kind].noun.toLowerCase()}</span>
                  )}
                </span>
              )
            })}
            {detail.dependents.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <span aria-hidden>·</span>
                used by{' '}
                {detail.dependents.map((d, i) => (
                  <span key={d.id}>
                    {i > 0 && ', '}
                    <Link to={projectPath(d.kind, d.id)} className="text-accent hover:underline">
                      {d.title}
                    </Link>
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {actions}
          <AnalyzeButton detail={detail} selectedLocusIds={selectedLocusIds} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Project actions">
                <MoreHorizontal size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil size={13} /> Edit title and links…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDup(true)}>
                <Copy size={13} /> Duplicate…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem danger onSelect={() => setDel(true)}>
                <Trash2 size={13} /> Delete…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ProjectFormDialog kind={p.kind as ProjectKind} open={editing} onOpenChange={setEditing} project={p} />
        <DuplicateDialog project={dup ? p : null} onClose={() => setDup(false)} onCreated={(d) => onDuplicated?.(d.project.id)} />
        <DeleteDialog project={del ? p : null} onClose={() => setDel(false)} onDeleted={() => onDeleted?.()} />
      </header>
      {detail.upstream_warnings.length > 0 && (
        <div
          className="flex shrink-0 gap-2 border-b border-warn/30 bg-warn-soft px-3 py-1.5 text-xs"
          role="status"
          data-testid="upstream-warnings"
        >
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" />
          <div className="min-w-0 space-y-0.5">
            {detail.upstream_warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
