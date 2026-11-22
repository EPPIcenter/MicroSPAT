/**
 * The artifact classes of one locus: a list with a thumbnail of every class
 * (a compact overview of the locus), the selected class's plot and segments,
 * and the locus parameters on demand (P). The locus and class are in the URL
 * (`locus`, `class`).
 */
import { shortcutBlocked } from '@/lib/keys'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Info, SlidersHorizontal } from 'lucide-react'
import { api } from '@/api/client'
import type { ArtifactEstimatorView, ErrorEstimator, ProjectDetail, ProjectLocus } from '@/api/bindings'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Kbd } from '@/components/ui/Kbd'
import { Spinner } from '@/components/ui/ProgressBar'
import { SplitView } from '@/components/ui/SplitView'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'
import { countOf } from '@/lib/format'
import { toast } from '@/stores/toasts'
import { LocusStatusList } from '@/features/projects-shared/LocusStatusList'
import { ParamsPanel } from '@/features/projects-shared/ParamsPanel'
import { useAnalyze } from '@/features/projects-shared/ProjectHeader'
import { useLocusParams, useProjectTask } from '@/features/projects-shared/queries'
import { StaleFrame, StaleNotice } from '@/features/projects-shared/StatusBits'
import { ArtifactThumb, thumbYMax } from './ArtifactThumb'
import { EstimatorPanel, type Example } from './EstimatorPanel'
import { className, ERROR_LABEL, GLOBAL_HELP, METHOD_LABEL, sortClasses } from './model/classes'
import { fitWarnings } from './model/expected'
import { artifactKeys, useLocusArtifacts } from './queries'

export interface ArtifactsTabProps {
  detail: ProjectDetail
  locusId: number | null
  classId: number | null
  onSelect: (sel: { locus?: number; cls?: number | null }, replace?: boolean) => void
  active: boolean
}

export const MODEL_HELP =
  'An artifact estimator learns, from runs with a single dominant peak, how tall the secondary peaks at each distance from that peak are, ' +
  'relative to it, as a function of its size. Genotyping uses it to expect stutter at every distance class of every peak, and calls a peak there ' +
  'only when it is clearly taller than the stutter explains, so a real minor allele on a stutter position can still be called.'

export function ArtifactsTab({ detail, locusId, classId, onSelect, active }: ArtifactsTabProps) {
  const pid = detail.project.id
  const locus = detail.loci.find((l) => l.locus_id === locusId) ?? detail.loci[0] ?? null
  const lid = locus?.locus_id ?? null
  const [showParams, setShowParams] = useState(false)
  const [examples, setExamples] = useState<Record<number, Partial<Example>>>({})

  useEffect(() => {
    if (active && locus && locusId !== locus.locus_id) onSelect({ locus: locus.locus_id }, true)
  }, [active, locus, locusId, onSelect])

  const data = useLocusArtifacts(pid, lid)
  const view = data.data && data.data.locus_id === lid ? data.data : undefined
  const classes = useMemo(() => (view && locus ? sortClasses(view.estimators, locus.nucleotide_repeat_length) : []), [view, locus])
  const current = classes.find((c) => c.id === classId) ?? classes[0] ?? null
  useEffect(() => {
    if (!active || !view) return
    if (current && current.id !== classId) onSelect({ cls: current.id }, true)
  }, [active, view, current, classId, onSelect])

  const params = useLocusParams(pid, lid)
  const errorEstimator: ErrorEstimator = params.data?.params.artifact?.error_estimator ?? 'densest_half'
  const analyze = useAnalyze(pid)
  const task = useProjectTask('analyze_project', detail.project.title)
  const analyzing = analyze.isPending || task?.status === 'running'
  // Re-fits every class at the locus in place (breakpoints, methods and
  // deleted classes stay) and sets the locus parameter for later analyses.
  const qc = useQueryClient()
  const setError = useMutation({
    mutationFn: (v: ErrorEstimator) => api.set_artifact_error_estimator({ project_id: pid, locus_id: lid!, error_estimator: v }),
    meta: { errorTitle: 'Could not change the error estimate' },
    onSuccess: (res, v) => {
      qc.setQueryData(artifactKeys.locus(pid, res.locus_id), res)
      const deps = detail.dependents
      toast.success(
        `${locus?.label ?? 'Locus'}: errors estimated by ${ERROR_LABEL[v]}`,
        deps.length ? `${deps.map((d) => d.title).join(', ')} ${deps.length === 1 ? 'is' : 'are'} now stale here until re-analyzed.` : undefined,
      )
    },
  })

  const onKey = (e: KeyboardEvent) => {
    if (!active || shortcutBlocked(e)) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault()
      setShowParams((v) => !v)
    } else if ((e.key === 'j' || e.key === 'k') && classes.length) {
      e.preventDefault()
      const i = classes.findIndex((c) => c.id === current?.id)
      const n = classes[Math.max(0, Math.min(classes.length - 1, i + (e.key === 'j' ? 1 : -1)))]
      if (n) onSelect({ cls: n.id })
    }
  }
  const keyRef = useRef(onKey)
  useLayoutEffect(() => {
    keyRef.current = onKey
  })
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  if (!locus || lid == null) return <EmptyState title="This project has no loci" />
  const status = view?.status ?? locus.status
  const auto = current ? autoExample(current, locus) : { size: Math.round((locus.min_base_length + locus.max_base_length) / 2), height: 10000 }
  const example: Example = { size: examples[lid]?.size ?? auto.size, height: examples[lid]?.height ?? auto.height }
  const dependents = detail.dependents.map((d) => d.title)

  let main: React.ReactNode
  if (locus.status.state === 'not_analyzed')
    main = (
      <EmptyState
        title={`${locus.label} has not been analyzed`}
        action={
          <Button variant="primary" disabled={analyzing} onClick={() => analyze.mutate({ locus_ids: [lid] })} data-testid="analyze-locus">
            {analyzing && <Spinner className="size-3" />} Analyze {locus.label}
          </Button>
        }
      >
        Analyzing bins every run with the linked bin estimator, keeps runs with a single dominant peak in a bin, groups their other peaks by distance from it,
        and fits each frequent distance class against the main peak’s size. It runs in the background.
      </EmptyState>
    )
  else if (data.isLoading && !view) main = <div className="grid flex-1 place-items-center text-muted"><Spinner /></div>
  else if (data.isError && !view)
    main = (
      <EmptyState title="Could not load the artifact classes" action={<Button size="sm" onClick={() => void data.refetch()}>Try again</Button>}>
        {(data.error as Error).message}
      </EmptyState>
    )
  else {
    const list = (
      <ClassList
        locus={locus}
        classes={classes}
        selected={current?.id ?? null}
        onSelect={(id) => onSelect({ cls: id })}
        monoRuns={view?.mono_allelic_runs ?? null}
      />
    )
    const panel = current ? (
      <EstimatorPanel
        key={current.id}
        projectId={pid}
        locus={locus}
        estimator={current}
        example={example}
        onExampleChange={(e) => setExamples((s) => ({ ...s, [lid]: { ...s[lid], ...e } }))}
        errorEstimator={errorEstimator}
        onErrorEstimatorChange={(v) => setError.mutate(v)}
        errorBusy={setError.isPending || analyzing}
        dependents={dependents}
        onDeleted={() => {
          const i = classes.findIndex((c) => c.id === current.id)
          const next = classes[i + 1] ?? classes[i - 1] ?? null
          onSelect({ cls: next?.id ?? null }, true)
        }}
      />
    ) : (
      <EmptyState title={`No artifact classes at ${locus.label}`}>
        No distance class had enough peaks in enough single-clone runs. Lower the minimum artifact peak frequency or run fraction in the parameters, or add
        samples, and re-analyze. Without classes, genotyping expects no stutter at this locus.
      </EmptyState>
    )
    main = (
      <SplitView
        id="artifact-estimators.classes"
        defaultSize={330}
        minSize={240}
        minSecond={520}
        first={<StaleFrame status={status}>{list}</StaleFrame>}
        second={
          showParams ? (
            <SplitView
              id="artifact-estimators.params"
              defaultSize={600}
              minSize={420}
              minSecond={300}
              first={<StaleFrame status={status}>{panel}</StaleFrame>}
              second={<ParamsPanel detail={detail} locusId={lid} onClose={() => setShowParams(false)} />}
            />
          ) : (
            <StaleFrame status={status}>{panel}</StaleFrame>
          )
        }
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="artifacts-tab">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
        <LocusStatusList variant="strip" detail={detail} selected={lid} onSelect={(id) => onSelect({ locus: id, cls: null })} className="min-w-0 flex-1" />
        <Button size="sm" variant={showParams ? 'secondary' : 'ghost'} aria-pressed={showParams} onClick={() => setShowParams((v) => !v)} data-testid="toggle-params" title="Parameters of this locus (P)">
          <SlidersHorizontal size={12} /> Parameters <Kbd>P</Kbd>
        </Button>
      </div>
      <StaleNotice
        status={status}
        what={`${locus.label} artifact classes`}
        action={
          status.state !== 'not_analyzed' && (
            <Button
              size="sm"
              variant="primary"
              disabled={analyzing}
              onClick={() => analyze.mutate({ locus_ids: [lid] })}
              data-testid="reanalyze-locus"
              title="Estimates every class again; breakpoints, method changes and deletions at this locus are replaced"
            >
              {analyzing && <Spinner className="size-3" />} Re-analyze {locus.label}
            </Button>
          )
        }
      />
      {main}
    </div>
  )
}

/** Default example parent: the median parent size of the class, 10,000 RFU. */
function autoExample(e: ArtifactEstimatorView, locus: ProjectLocus): Example {
  const xs = e.points.map((p) => p.parent_size).sort((a, b) => a - b)
  const mid = xs.length ? xs[Math.floor(xs.length / 2)]! : (locus.min_base_length + locus.max_base_length) / 2
  return { size: Math.round(mid), height: 10000 }
}

function ClassList({
  locus,
  classes,
  selected,
  onSelect,
  monoRuns,
}: {
  locus: ProjectLocus
  classes: ArtifactEstimatorView[]
  selected: number | null
  onSelect: (id: number) => void
  monoRuns: number | null
}) {
  // One x range and y scale for every thumbnail of the locus, so they compare.
  const xDomain = [locus.min_base_length, locus.max_base_length] as const
  const yMax = useMemo(() => Math.max(0.02, ...classes.filter((c) => c.artifact_distance != null).map((c) => thumbYMax(c))), [classes])
  const ids = classes.map((c) => c.id)
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="class-list">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-line px-3 text-2xs text-muted">
        <span className="font-semibold tracking-wide uppercase">Classes</span>
        <span>{classes.length}</span>
        <Tooltip content={<p className="max-w-80">{MODEL_HELP}</p>}>
          <span tabIndex={0} className="text-faint outline-none" aria-label={MODEL_HELP}>
            <Info size={11} />
          </span>
        </Tooltip>
        <span className="ml-auto" title="Runs with exactly one peak at or above the max secondary relative height, its main peak in a bin">
          {monoRuns != null ? `from ${countOf(monoRuns, 'single-clone run')}` : ''}
        </span>
      </div>
      <ul role="listbox" aria-label="Artifact classes" className="min-h-0 flex-1 overflow-auto py-1">
        {classes.map((c) => {
          const n = className(c.artifact_distance, locus.nucleotide_repeat_length)
          const warnings = c.equations.flatMap(fitWarnings)
          const active = c.id === selected
          const methods = [...new Set(c.equations.map((q) => METHOD_LABEL[q.segment.method]))].join(', ')
          const meanSd = c.equations.length ? c.equations.reduce((a, q) => a + q.fit.sd * q.n_points, 0) / Math.max(1, c.equations.reduce((a, q) => a + q.n_points, 0)) : 0
          return (
            <li
              key={c.id}
              role="option"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              data-class={n.label}
              data-class-id={c.id}
              onClick={() => onSelect(c.id)}
              onKeyDown={(e) => {
                const i = ids.indexOf(c.id)
                const next = e.key === 'ArrowDown' ? ids[i + 1] : e.key === 'ArrowUp' ? ids[i - 1] : undefined
                if (next != null) {
                  e.preventDefault()
                  onSelect(next)
                  ;(e.currentTarget.parentElement?.querySelector(`[data-class-id="${next}"]`) as HTMLElement | null)?.focus()
                }
              }}
              className={cn(
                'mx-1 flex cursor-default gap-2 rounded-[5px] px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                active ? 'bg-accent-soft' : 'hover:bg-surface-3/60',
              )}
            >
              <ArtifactThumb estimator={c} color={locus.color} xDomain={xDomain} yMax={n.global ? undefined : yMax} warn={warnings.length > 0} className="h-11 w-[76px] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className={cn('truncate text-[13px]', active && 'font-semibold')}>{n.label}</span>
                  {n.global && (
                    <Tooltip content={<p className="max-w-80">{GLOBAL_HELP}</p>}>
                      <span tabIndex={0} className="text-faint outline-none" aria-label="What is the global class?">
                        <Info size={11} />
                      </span>
                    </Tooltip>
                  )}
                  {warnings.length > 0 && (
                    <Tooltip content={<ul className="max-w-72 space-y-0.5">{warnings.map((w) => <li key={w.text}>{w.text}</li>)}</ul>}>
                      <span tabIndex={0} className="text-warn outline-none" aria-label={warnings.map((w) => w.text).join(' ')} data-testid="class-warning">
                        <AlertTriangle size={11} />
                      </span>
                    </Tooltip>
                  )}
                  <span className="num ml-auto text-2xs text-muted" title="Supporting points">
                    {c.points.length}
                  </span>
                </div>
                <p className="truncate text-2xs text-muted">{n.description}</p>
                <p className="truncate text-2xs text-faint">
                  {countOf(c.equations.length, 'segment')} · {methods || 'no fit'} · SD {(meanSd * 100).toFixed(1)} %
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
