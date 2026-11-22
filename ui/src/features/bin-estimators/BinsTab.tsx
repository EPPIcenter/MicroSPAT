/**
 * The bin workspace of one locus: every peak of the last analysis (size
 * against height relative to its run's tallest peak) with the bins as bands,
 * edited in place, and the bins table beside it. Edits stay local, with
 * undo / redo, until Save sends them as one `update_locus_bins` batch;
 * Discard drops them. Edits are kept per locus, so switching loci or tabs
 * does not lose them; leaving the project asks first.
 *
 * Keys: ⌘Z / ⇧⌘Z (or Ctrl+Y) undo / redo, ⌘S save, P parameters. In the
 * plot: Del deletes, arrows nudge, [ and ] resize, Tab steps through bins.
 */
import { isTypingTarget, overlayOpen } from '@/lib/keys'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Grid3x3, Redo2, Save, SlidersHorizontal, Undo2, X } from 'lucide-react'
import { api } from '@/api/client'
import type { Bin, LocusBins, ProjectDetail, ProjectLocus, UpdateLocusBinsParams } from '@/api/bindings'
import { BinPlot, type BinStyle, type ScatterPoint } from '@/components/BinPlot'
import type { BinChange } from '@/components/BinPlot/binEdit'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Kbd } from '@/components/ui/Kbd'
import { Spinner } from '@/components/ui/ProgressBar'
import { SplitView } from '@/components/ui/SplitView'
import { cn } from '@/lib/cn'
import { countOf } from '@/lib/format'
import { toast } from '@/stores/toasts'
import { KINDS } from '@/features/projects-shared/kinds'
import { LocusStatusList } from '@/features/projects-shared/LocusStatusList'
import { ParamsPanel } from '@/features/projects-shared/ParamsPanel'
import { useAnalyze } from '@/features/projects-shared/ProjectHeader'
import { useLocusParams, useProjectTask } from '@/features/projects-shared/queries'
import { StaleFrame, StaleNotice } from '@/features/projects-shared/StatusBits'
import { BinsTable } from './BinsTable'
import { binIssues, blockingIssues, fitRepeatGrid, gridLines, liveCounts, sortedSizes } from './model/checks'
import {
  applyEdit,
  baseChanged,
  buildBatch,
  describeDiff,
  diffBins,
  discard,
  initEdits,
  isDirty,
  receive,
  redo,
  undo,
  type BinEdits,
} from './model/edits'
import { binKeys, useBinScatter, useLocusBins } from './queries'
import { kbd } from '@/lib/platform'

export type EditsByLocus = Record<number, BinEdits>

export interface BinsTabProps {
  detail: ProjectDetail
  locusId: number | null
  onSelectLocus: (id: number, replace?: boolean) => void
  edits: EditsByLocus
  setEdits: (locusId: number, f: (s: BinEdits | undefined) => BinEdits) => void
  active: boolean
}

export function BinsTab({ detail, locusId, onSelectLocus, edits, setEdits, active }: BinsTabProps) {
  const locus = detail.loci.find((l) => l.locus_id === locusId) ?? detail.loci[0] ?? null
  const lid = locus?.locus_id ?? null
  const [showParams, setShowParams] = useState(false)

  useEffect(() => {
    if (active && locus && locusId !== locus.locus_id) onSelectLocus(locus.locus_id, true)
  }, [active, locus, locusId, onSelectLocus])

  if (!locus || lid == null) return <EmptyState title="This project has no loci" />
  const dirtyLoci = new Set(
    Object.entries(edits)
      .filter(([, s]) => isDirty(s))
      .map(([k]) => Number(k)),
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="bins-tab">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
        <LocusStatusList
          variant="strip"
          detail={detail}
          selected={lid}
          onSelect={(id) => onSelectLocus(id)}
          trailing={(l) =>
            dirtyLoci.has(l.locus_id) ? (
              <span
                className="size-1.5 rounded-full bg-accent"
                title="Unsaved bin edits"
                aria-label="unsaved bin edits"
                data-testid="locus-unsaved"
              />
            ) : null
          }
          className="min-w-0 flex-1"
        />
        <Button
          size="sm"
          variant={showParams ? 'secondary' : 'ghost'}
          aria-pressed={showParams}
          onClick={() => setShowParams((v) => !v)}
          data-testid="toggle-params"
          title="Parameters of this locus (P)"
        >
          <SlidersHorizontal size={12} /> Parameters <Kbd>P</Kbd>
        </Button>
      </div>
      <LocusBinsView
        key={lid}
        detail={detail}
        locus={locus}
        state={edits[lid]}
        setState={(f) => setEdits(lid, f)}
        showParams={showParams}
        setShowParams={setShowParams}
        active={active}
      />
    </div>
  )
}

function LocusBinsView({
  detail,
  locus,
  state,
  setState,
  showParams,
  setShowParams,
  active,
}: {
  detail: ProjectDetail
  locus: ProjectLocus
  state: BinEdits | undefined
  setState: (f: (s: BinEdits | undefined) => BinEdits) => void
  showParams: boolean
  setShowParams: (f: (v: boolean) => boolean) => void
  active: boolean
}) {
  const pid = detail.project.id
  const lid = locus.locus_id
  const qc = useQueryClient()
  const bins = useLocusBins(pid, lid)
  const scatter = useBinScatter(pid, locus)
  const params = useLocusParams(pid, lid)
  const analyze = useAnalyze(pid)
  const task = useProjectTask('analyze_project', detail.project.title)
  const analyzing = analyze.isPending || task?.status === 'running'
  const [selected, setSelected] = useState<number | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [confirmSave, setConfirmSave] = useState(false)

  const saved = bins.data && bins.data.locus_id === lid ? bins.data : undefined
  // Adopt the engine's bins whenever they change and nothing is edited.
  useEffect(() => {
    if (saved) setState((s) => receive(s, saved.bins))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved])
  const edits = state ?? (saved ? initEdits(saved.bins) : null)
  const present = useMemo(() => edits?.present ?? [], [edits])
  const dirty = !!edits && isDirty(edits)
  const diff = useMemo(() => (edits ? diffBins(edits.base, edits.present) : null), [edits])
  const unsaved = useMemo(() => new Set([...(diff?.created ?? []), ...(diff?.changed ?? [])].map((b) => b.id)), [diff])
  const drifted = !!edits && !!saved && dirty && baseChanged(edits, saved.bins)

  const scatterData = scatter.data && scatter.data.locus_id === lid ? scatter.data : undefined
  const points = useMemo<ScatterPoint[]>(() => {
    if (!scatterData) return []
    const n = Math.min(scatterData.sizes.length, scatterData.relative_heights.length)
    const out = new Array<ScatterPoint>(n)
    for (let i = 0; i < n; i++) out[i] = { x: scatterData.sizes[i]!, y: scatterData.relative_heights[i]! }
    return out
  }, [scatterData])
  const sorted = useMemo(() => sortedSizes(scatterData?.sizes ?? []), [scatterData])
  const counts = useMemo(() => liveCounts(sorted, present), [sorted, present])
  // The frequent alleles define the grid: weight by peaks in the window now.
  const grid = useMemo(
    () =>
      fitRepeatGrid(
        present.map((b) => ({ ...b, peak_count: counts.get(b.id) ?? b.peak_count })),
        locus.nucleotide_repeat_length,
      ),
    [present, counts, locus.nucleotide_repeat_length],
  )
  const issues = useMemo(() => binIssues(present, grid), [present, grid])
  const blocking = blockingIssues(issues)
  const guides = useMemo(
    () => (showGrid ? gridLines(grid, locus.min_base_length - 10, locus.max_base_length + 10) : undefined),
    [showGrid, grid, locus],
  )
  const binStyle = useCallback(
    (b: Bin): BinStyle | undefined => {
      const is = issues.get(b.id)
      const tone = is?.some((i) => i.kind === 'invalid' || i.kind === 'duplicate_label') ? 'danger' : is?.length ? 'warn' : undefined
      const dashed = unsaved.has(b.id)
      return tone || dashed ? { tone, dashed } : undefined
    },
    [issues, unsaved],
  )
  const defaultBuffer = params.data?.params.bins?.default_bin_buffer || 0.75

  const edit = useCallback(
    (next: Bin[], key: string | null = null) => setState((s) => applyEdit(s ?? initEdits(saved?.bins ?? []), next, key)),
    [setState, saved],
  )
  const onPlotChange = useCallback(
    (next: Bin[], change: BinChange) =>
      edit(next, change.type === 'add' || change.type === 'delete' ? null : `${change.type}:${change.bin.id}`),
    [edit],
  )

  const save = useMutation({
    mutationFn: (batch: UpdateLocusBinsParams) => api.update_locus_bins(batch),
    meta: { errorTitle: `Could not save the bins of ${locus.label}` },
    onSuccess: (res: LocusBins) => {
      qc.setQueryData(binKeys.bins(pid, res.locus_id), res)
      setState(() => initEdits(res.bins))
      const deps = detail.dependents
      toast.success(
        `Saved the bins of ${locus.label}`,
        deps.length
          ? `${deps.map((d) => d.title).join(', ')} ${deps.length === 1 ? 'is' : 'are'} now stale at ${locus.label} until re-analyzed.`
          : undefined,
      )
    },
  })
  const batch = edits ? buildBatch(pid, lid, edits.base, edits.present, counts) : null
  const doSave = () => {
    if (!batch || save.isPending) return
    if (blocking.length) {
      toast.error('Fix the bins marked in red first', blocking.map((i) => i.message).join('\n'))
      return
    }
    if (detail.dependents.length) setConfirmSave(true)
    else save.mutate(batch)
  }

  const onKey = (e: KeyboardEvent) => {
    if (!active || e.defaultPrevented) return
    if (overlayOpen()) return
    const mod = e.metaKey || e.ctrlKey
    const k = e.key.toLowerCase()
    if (mod && !e.shiftKey && !e.altKey && k === 's') {
      e.preventDefault()
      doSave()
      return
    }
    if (isTypingTarget(e.target)) return
    if (mod && k === 'z') {
      e.preventDefault()
      setState((s) => (s ? (e.shiftKey ? redo(s) : undo(s)) : s!))
    } else if (mod && k === 'y') {
      e.preventDefault()
      setState((s) => (s ? redo(s) : s!))
    } else if (!mod && !e.altKey && k === 'p') {
      e.preventDefault()
      setShowParams((v) => !v)
    } else if (!mod && !e.altKey && k === 'g') {
      e.preventDefault()
      setShowGrid((v) => !v)
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

  const status = saved?.status ?? locus.status
  const reanalyze = (
    <Button
      size="sm"
      variant="primary"
      disabled={analyzing}
      onClick={() => analyze.mutate({ locus_ids: [lid] })}
      data-testid="reanalyze-locus"
      title="Re-estimates the bins from the peaks; hand edits at this locus are replaced"
    >
      {analyzing && <Spinner className="size-3" />} Re-analyze {locus.label}
    </Button>
  )

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
        Analyzing scans every run at this locus, filters the peaks, and clusters their sizes into bins (mean shift, half a repeat wide).
        Clusters with at least the minimum peak frequency become bins. It runs in the background.
      </EmptyState>
    )
  else if ((bins.isLoading && !saved) || (scatter.isLoading && !scatterData))
    main = (
      <div className="grid flex-1 place-items-center text-muted">
        <Spinner />
      </div>
    )
  else if (bins.isError && !saved)
    main = (
      <EmptyState
        title="Could not load the bins"
        action={
          <Button size="sm" onClick={() => void bins.refetch()}>
            Try again
          </Button>
        }
      >
        {(bins.error as Error).message}
      </EmptyState>
    )
  else
    main = (
      <SplitView
        id="bin-estimators.workspace"
        // The plot takes the room; the table needs about 470 px.
        defaultSize={Math.max(520, (typeof window === 'undefined' ? 1280 : window.innerWidth) - 212 - 480)}
        minSize={360}
        minSecond={330}
        first={
          <StaleFrame status={status}>
            <div className="flex min-h-0 flex-1 flex-col" data-testid="bin-workspace" data-dirty={dirty || undefined}>
              <div
                className={cn(
                  'flex h-9 shrink-0 items-center gap-1 border-b px-2',
                  dirty ? 'border-accent/40 bg-accent-soft' : 'border-line bg-surface',
                )}
                data-testid="bin-edit-bar"
              >
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={!edits?.past.length}
                  onClick={() => setState((s) => undo(s!))}
                  aria-label={kbd('Undo (⌘Z)')}
                  title={kbd('Undo (⌘Z)')}
                  data-testid="bins-undo"
                >
                  <Undo2 size={13} />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={!edits?.future.length}
                  onClick={() => setState((s) => redo(s!))}
                  aria-label={kbd('Redo (⇧⌘Z)')}
                  title={kbd('Redo (⇧⌘Z)')}
                  data-testid="bins-redo"
                >
                  <Redo2 size={13} />
                </Button>
                <span className="ml-1 min-w-0 flex-1 truncate text-xs" aria-live="polite" data-testid="bin-edit-status">
                  {dirty && diff ? (
                    <>
                      <b>Unsaved:</b> {describeDiff(diff)}
                      {drifted && <span className="text-warn"> · the saved bins changed meanwhile</span>}
                    </>
                  ) : (
                    <span className="text-muted">
                      {countOf(present.length, 'bin')} · {countOf(points.length, 'peak')}
                      {scatterData && ` from ${locus.label}’s last analysis`}
                    </span>
                  )}
                </span>
                <Button
                  size="icon-sm"
                  variant={showGrid ? 'secondary' : 'ghost'}
                  aria-pressed={showGrid}
                  onClick={() => setShowGrid((v) => !v)}
                  title="Repeat grid (G)"
                  aria-label="Show the repeat grid"
                >
                  <Grid3x3 size={12} />
                </Button>
                {dirty && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setState((s) => discard(s!))}
                      disabled={save.isPending}
                      data-testid="bins-discard"
                      title="Drop every unsaved edit at this locus"
                    >
                      <X size={12} /> Discard
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={doSave}
                      disabled={save.isPending}
                      data-testid="bins-save"
                      title={kbd('Save the bins of this locus (⌘S)')}
                    >
                      {save.isPending ? <Spinner className="size-3" /> : <Save size={12} />} Save
                    </Button>
                  </>
                )}
              </div>
              <div className="relative min-h-0 flex-1 p-1">
                <BinPlot
                  className="h-full w-full"
                  points={points}
                  bins={present}
                  selectedId={selected}
                  onSelect={setSelected}
                  onBinsChange={onPlotChange}
                  color={locus.color}
                  locusRange={[locus.min_base_length, locus.max_base_length]}
                  defaultBuffer={defaultBuffer}
                  guides={guides}
                  binStyle={binStyle}
                  followSelection
                />
                {points.length === 0 && scatterData && (
                  <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-xs text-muted">
                    No peaks passed the filters at this locus.
                  </p>
                )}
              </div>
              <PlotLegend repeat={locus.nucleotide_repeat_length} grid={showGrid && !!grid} dense={points.length > 2500} />
            </div>
          </StaleFrame>
        }
        second={
          showParams ? (
            <ParamsPanel detail={detail} locusId={lid} onClose={() => setShowParams(() => false)} />
          ) : (
            <BinsTable
              bins={present}
              counts={counts}
              issues={issues}
              grid={grid}
              unsaved={unsaved}
              selectedId={selected}
              onSelect={setSelected}
              onChange={(next, key) => edit(next, key ?? null)}
              defaultBuffer={defaultBuffer}
            />
          )
        }
      />
    )

  return (
    <>
      <StaleNotice status={status} what={`${locus.label} bins`} action={status.state !== 'not_analyzed' && reanalyze} />
      {main}
      <ConfirmDialog
        open={confirmSave}
        onOpenChange={setConfirmSave}
        title={`Save the bins of ${locus.label}?`}
        description={
          <span data-testid="save-dependents">
            {diff && `${describeDiff(diff)}. `}
            {countOf(detail.dependents.length, 'project')} {detail.dependents.length === 1 ? 'uses' : 'use'} these bins:{' '}
            {detail.dependents.map((d) => `${d.title} (${KINDS[d.kind].noun.toLowerCase()})`).join(', ')}. Their results at {locus.label}{' '}
            become stale and stay so until they are re-analyzed.
          </span>
        }
        confirmLabel="Save bins"
        onConfirm={() => (batch ? save.mutateAsync(batch) : undefined)}
      />
    </>
  )
}

function PlotLegend({ repeat, grid, dense }: { repeat: number; grid: boolean; dense: boolean }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-line bg-surface px-2 py-1 text-2xs text-muted">
      <span>
        Each dot is a peak in one run: size against height relative to the run’s tallest peak.{dense && ' Darker means more peaks.'}
      </span>
      {grid && <span>Dotted lines: repeat grid ({repeat} bp).</span>}
      <span>Dashed bins are unsaved, amber ones flagged.</span>
      <span className="text-faint">Drag a bin to move it, an edge to resize · double-click to add · Del deletes · {kbd('⌘Z')} undo</span>
    </div>
  )
}
