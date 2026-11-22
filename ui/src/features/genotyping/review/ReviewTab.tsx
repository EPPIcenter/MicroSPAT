/**
 * The review workspace: a locus strip with review progress, the call table
 * for the selected locus, and the selected sample's trace with its peaks;
 * parameters slide in from the right (P). Everything is reachable from the
 * keyboard (see model/navigation.ts). The selection lives in the URL
 * (`locus`, `sample`).
 *
 * Review marks live on the engine (`set_call_reviewed`): Enter marks the
 * call and moves on, M toggles the mark, "Mark shown reviewed" marks every
 * call the filter shows. The engine drops a mark by itself when the call
 * changes; a dropped mark (`review_dropped`) is shown with the reason.
 */
import { shortcutBlocked } from '@/lib/keys'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, SlidersHorizontal } from 'lucide-react'
import { api } from '@/api/client'
import type { LocusCalls, Peak, ProjectDetail, ProjectLocus } from '@/api/bindings'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Tooltip } from '@/components/ui/Tooltip'
import { countOf } from '@/lib/format'
import { EmptyState } from '@/components/ui/EmptyState'
import { Kbd } from '@/components/ui/Kbd'
import { Spinner } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/cn'
import { SplitView } from '@/components/ui/SplitView'
import type { Domain } from '@/plot/scale'
import { toast } from '@/stores/toasts'
import { LocusStatusList } from '@/features/projects-shared/LocusStatusList'
import { ParamsPanel } from '@/features/projects-shared/ParamsPanel'
import { useAnalyze } from '@/features/projects-shared/ProjectHeader'
import { useLocusParams, useProjectTask } from '@/features/projects-shared/queries'
import { StaleFrame, StaleNotice } from '@/features/projects-shared/StatusBits'
import {
  buildCallView,
  describeFilters,
  filterCalls,
  NO_FILTERS,
  sortCalls,
  type CallFilters,
  type CallSort,
  type CallView,
  type ReviewProgress,
} from '../model/calls'
import { moveCursor, nextMatching, pushUndo, reviewKeyAction, stepId, type ToggleRecord } from '../model/navigation'
import { genoKeys, patchCallRow, sampleLocusQuery, useLocusCalls, useSampleLocus, useSummary } from '../queries'
import { CallPanel } from './CallPanel'
import { CallsTable } from './CallsTable'
import { openShortcuts } from '@/app/shortcuts'
import { ReviewProgressBar, ShortcutHints } from './parts'
import type { PeakRowModel } from './PeakTable'

export interface ReviewTabProps {
  detail: ProjectDetail
  locusId: number | null
  sampleId: number | null
  /** Change the URL selection (replace for automatic picks). */
  onSelect: (sel: { locus?: number; sample?: number | null }, replace?: boolean) => void
  active: boolean
}

export function ReviewTab({ detail, locusId, sampleId, onSelect, active }: ReviewTabProps) {
  const pid = detail.project.id
  const qc = useQueryClient()
  const loci = detail.loci
  const locus = loci.find((l) => l.locus_id === locusId) ?? loci[0] ?? null
  const lid = locus?.locus_id ?? null

  const calls = useLocusCalls(pid, lid)
  const paramsView = useLocusParams(pid, lid)
  const params = paramsView.data?.params.genotyping ?? null
  const summary = useSummary(pid)
  const view = useSampleLocus(pid, sampleId, lid)
  const viewMatches = !!view.data && view.data.sample_id === sampleId && view.data.locus_id === lid

  const [filters, setFilters] = useState<CallFilters>(NO_FILTERS)
  const [sort, setSort] = useState<CallSort>({ key: 'barcode', desc: false })
  const [undo, setUndo] = useState<ToggleRecord[]>([])
  const [cursor, setCursor] = useState(-1)
  const [showParams, setShowParams] = useState(false)
  const [paramsDirty, setParamsDirty] = useState(false)
  const [discard, setDiscard] = useState<null | (() => void)>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [showRuns, setShowRuns] = useState(false)
  const [showDyes, setShowDyes] = useState(false)
  const [xDomains, setXDomains] = useState<Record<number, Domain>>({})
  const rowsRef = useRef<PeakRowModel[]>([])
  const commentRef = useRef<HTMLTextAreaElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const onRows = useCallback((r: PeakRowModel[]) => {
    rowsRef.current = r
  }, [])

  // Cursor resets per sample × locus.
  const callId = `${sampleId}:${lid}`
  const [prevCall, setPrevCall] = useState(callId)
  if (prevCall !== callId) {
    setPrevCall(callId)
    setCursor(-1)
  }

  const data = calls.data && calls.data.locus_id === lid ? calls.data : undefined
  const bootstrapThreshold = params?.bootstrap_probability_threshold
  const biasCorrected = detail.project.quant_bias_estimator != null
  const views = useMemo<CallView[]>(
    () => (data ? data.rows.map((r) => buildCallView(r, { bootstrapThreshold, biasCorrected })) : []),
    [data, bootstrapThreshold, biasCorrected],
  )

  const shown = useMemo(() => sortCalls(filterCalls(views, filters), sort), [views, filters, sort])
  const order = useMemo(() => shown.map((v) => v.row.sample_id), [shown])
  const byId = useMemo(() => new Map(views.map((v) => [v.row.sample_id, v])), [views])

  // Pick a locus and a sample when none (or a vanished one) is selected.
  useEffect(() => {
    if (!active || !locus) return
    if (locusId !== locus.locus_id) onSelect({ locus: locus.locus_id }, true)
  }, [active, locus, locusId, onSelect])
  useEffect(() => {
    if (!active || !data) return
    if (sampleId != null && byId.has(sampleId)) return
    const first = order[0] ?? data.rows[0]?.sample_id
    if (first != null && first !== sampleId) onSelect({ sample: first }, true)
  }, [active, data, sampleId, byId, order, onSelect])

  // Prefetch neighbors so stepping is instant.
  useEffect(() => {
    if (!active || lid == null || sampleId == null) return
    for (const d of [1, -1, 2]) {
      const n: number | null = stepId(order, sampleId, d)
      if (n != null && n !== sampleId) void qc.prefetchQuery(sampleLocusQuery(pid, n, lid))
    }
  }, [active, order, sampleId, lid, pid, qc])

  // ------------------------------------------------------------- unsaved parameters

  // Closing the panel or switching locus would drop parameter edits silently (the form is per locus); ask first.
  const guardParams = useCallback(
    (go: () => void) => {
      if (showParams && paramsDirty) setDiscard(() => go)
      else go()
    },
    [showParams, paramsDirty],
  )
  const selectLocus = useCallback((id: number) => guardParams(() => onSelect({ locus: id })), [guardParams, onSelect])
  const toggleParams = useCallback(() => {
    if (showParams) guardParams(() => setShowParams(false))
    else setShowParams(true)
  }, [showParams, guardParams])

  // ------------------------------------------------------------- toggling

  const cachedRow = useCallback(
    (sid: number, l: number) => qc.getQueryData<LocusCalls>(genoKeys.calls(pid, l))?.rows.find((r) => r.sample_id === sid),
    [qc, pid],
  )
  const toggle = useMutation({
    mutationFn: (r: ToggleRecord) => api.toggle_allele({ project_id: pid, sample_id: r.sampleId, locus_id: r.locusId, bin_id: r.binId }),
    meta: { errorTitle: 'Could not change the call' },
    onMutate: (r) => {
      const before = cachedRow(r.sampleId, r.locusId)
      const bins = data?.bins ?? []
      const size = (id: number) => bins.find((b) => b.id === id)?.base_size ?? Infinity
      // Optimistic: the alleles change now; shares wait for the engine's row (a stale share would mislead).
      patchCallRow(qc, pid, r.sampleId, r.locusId, (row) => {
        const has = row.alleles.some((a) => a.bin_id === r.binId)
        const alleles = (has ? row.alleles.filter((a) => a.bin_id !== r.binId) : [...row.alleles, { bin_id: r.binId, label: r.label }])
          .map((a) => ({ bin_id: a.bin_id, label: a.label, size: a.size }))
          .sort((a, b) => size(a.bin_id) - size(b.bin_id))
        return {
          ...row,
          alleles,
          flags: { ...row.flags, manual_curation: true },
          reviewed: false,
          review_dropped: !!(before?.reviewed || before?.review_dropped),
        }
      })
    },
    onSuccess: (row, r) => patchCallRow(qc, pid, r.sampleId, r.locusId, () => row),
    onError: (_e, r) => {
      void qc.invalidateQueries({ queryKey: genoKeys.calls(pid, r.locusId) })
      void qc.invalidateQueries({ queryKey: genoKeys.call(pid, r.sampleId, r.locusId) })
    },
  })
  const review = useMutation({
    mutationFn: (r: { sampleId: number; locusId: number; reviewed: boolean }) =>
      api.set_call_reviewed({ project_id: pid, sample_id: r.sampleId, locus_id: r.locusId, reviewed: r.reviewed }),
    meta: { errorTitle: 'Could not change the review mark' },
    onMutate: (r) => {
      patchCallRow(qc, pid, r.sampleId, r.locusId, (row) => ({ ...row, reviewed: r.reviewed, review_dropped: false }))
    },
    onSuccess: (row, r) => patchCallRow(qc, pid, r.sampleId, r.locusId, () => row),
    onError: (_e, r) => void qc.invalidateQueries({ queryKey: genoKeys.calls(pid, r.locusId) }),
  })
  const setMark = useCallback(
    (reviewed: boolean) => {
      if (sampleId == null || lid == null || !byId.has(sampleId)) return
      review.mutate({ sampleId, locusId: lid, reviewed })
    },
    [sampleId, lid, byId, review],
  )
  const bulk = useMutation({
    mutationFn: (r: { locusId: number; sampleIds: number[] }) =>
      api.set_calls_reviewed({ project_id: pid, locus_id: r.locusId, sample_ids: r.sampleIds, reviewed: true }),
    meta: { errorTitle: 'Could not mark the calls reviewed' },
    onSuccess: (res, r) => {
      const done = new Set(r.sampleIds.filter((id) => !res.missing.includes(id)))
      qc.setQueryData<LocusCalls>(genoKeys.calls(pid, r.locusId), (old) =>
        old ? { ...old, rows: old.rows.map((x) => (done.has(x.sample_id) ? { ...x, reviewed: true, review_dropped: false } : x)) } : old,
      )
      toast.success(
        `Marked ${countOf(res.updated, 'call')} reviewed`,
        res.missing.length ? `${countOf(res.missing.length, 'sample')} had no call and were skipped.` : undefined,
      )
    },
  })
  const doToggle = useCallback(
    (binId: number, label: string, record = true) => {
      // Never toggle on a trace that still shows the previous sample.
      if (sampleId == null || lid == null || !viewMatches) return
      const rec = { sampleId, locusId: lid, binId, label }
      toggle.mutate(rec)
      if (record) setUndo((s) => pushUndo(s, rec))
    },
    [sampleId, lid, toggle, viewMatches],
  )
  const togglePeak = useCallback((p: Peak) => p.bin_id != null && doToggle(p.bin_id, p.bin_label ?? '?'), [doToggle])
  const undoLast = useCallback(() => {
    const last = undo[undo.length - 1]
    if (!last) return
    setUndo((s) => s.slice(0, -1))
    toggle.mutate(last)
    if (last.sampleId !== sampleId || last.locusId !== lid) guardParams(() => onSelect({ locus: last.locusId, sample: last.sampleId }))
    toast.info(`Undid ${last.label}`)
  }, [undo, toggle, sampleId, lid, onSelect, guardParams])

  // ------------------------------------------------------------- keyboard

  const analyze = useAnalyze(pid)
  const task = useProjectTask('analyze_project', detail.project.title)
  const locusIds = useMemo(() => loci.map((l) => l.locus_id), [loci])
  const onKey = (e: KeyboardEvent) => {
    if (!active || shortcutBlocked(e)) return
    // Keys the focused trace or a button handles itself.
    const t = e.target as HTMLElement | null
    if (
      t?.closest('[data-testid=trace-viewer]') &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '0', 'a', '+', '-', '='].includes(e.key)
    )
      return
    if (
      (e.key === ' ' || e.key === 'Enter') &&
      t &&
      (t.tagName === 'BUTTON' || t.getAttribute('role') === 'tab' || t.getAttribute('role') === 'option')
    )
      return
    const a = reviewKeyAction(e)
    if (!a) return
    e.preventDefault()
    switch (a.type) {
      case 'sample': {
        const n = stepId(order, sampleId, a.delta)
        if (n != null) onSelect({ sample: n })
        break
      }
      case 'locus': {
        const n = stepId(locusIds, lid, a.delta)
        if (n != null && n !== lid) selectLocus(n)
        break
      }
      case 'attention': {
        const n: number | null = nextMatching(order, sampleId, (id) => !!byId.get(id)?.needsAttention, a.delta)
        if (n != null) onSelect({ sample: n })
        else
          toast.info(
            `Nothing else needs attention at ${locus?.label ?? 'this locus'}`,
            'Every flagged call the table shows is reviewed. U goes to calls not reviewed yet.',
          )
        break
      }
      case 'unreviewed': {
        const n: number | null = nextMatching(order, sampleId, (id) => byId.get(id)?.reviewed === false, a.delta)
        if (n != null) onSelect({ sample: n })
        else toast.info(`Every call the table shows at ${locus?.label ?? 'this locus'} is reviewed`)
        break
      }
      case 'accept': {
        if (sampleId != null && byId.get(sampleId)?.reviewed === false) setMark(true)
        const n = stepId(order, sampleId, 1)
        if (n != null && n !== sampleId) onSelect({ sample: n })
        break
      }
      case 'review-toggle': {
        const v = sampleId != null ? byId.get(sampleId) : undefined
        if (v) setMark(!v.reviewed)
        break
      }
      case 'cursor':
        setCursor((c) => moveCursor(rowsRef.current.length, c, a.delta))
        break
      case 'toggle-cursor': {
        const r = rowsRef.current[cursor]
        if (r?.peak.bin_id != null) togglePeak(r.peak)
        break
      }
      case 'toggle-number': {
        const i = rowsRef.current.findIndex((r) => r.n === a.n)
        const r = rowsRef.current[i]
        if (r) {
          setCursor(i)
          togglePeak(r.peak)
        }
        break
      }
      case 'undo':
        undoLast()
        break
      case 'comment': {
        const el = commentRef.current
        el?.focus()
        el?.setSelectionRange(el.value.length, el.value.length)
        break
      }
      case 'params':
        toggleParams()
        break
      case 'runs':
        setShowRuns((v) => !v)
        break
      case 'dyes':
        setShowDyes((v) => !v)
        break
      case 'help':
        openShortcuts()
        break
      case 'filter':
        searchRef.current?.focus()
        searchRef.current?.select()
        break
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

  if (!locus) return <EmptyState title="This project has no loci" />
  const progress = new Map<number, ReviewProgress>(
    (summary.data?.loci ?? []).map((l) => [l.locus_id, { calls: l.calls ?? 0, reviewed: l.reviewed ?? 0 }]),
  )
  // The open locus counts from its rows, which follow every mark at once.
  if (data) progress.set(data.locus_id, { calls: views.length, reviewed: views.filter((v) => v.reviewed).length })
  const projectProgress = [...progress.values()].reduce((a, b) => ({ calls: a.calls + b.calls, reviewed: a.reviewed + b.reviewed }), {
    calls: 0,
    reviewed: 0,
  })
  const toMark = shown.filter((v) => !v.reviewed)
  const filterWords = describeFilters(filters)
  const current = sampleId != null ? byId.get(sampleId) : undefined
  const status = data?.status ?? locus.status
  const analyzing = analyze.isPending || task?.status === 'running'

  let main: React.ReactNode
  if (calls.isLoading && !data)
    main = (
      <div className="grid flex-1 place-items-center text-muted">
        <Spinner />
      </div>
    )
  else if (calls.isError && !data)
    main = (
      <EmptyState
        title="Could not load calls"
        action={
          <Button size="sm" onClick={() => void calls.refetch()}>
            Try again
          </Button>
        }
      >
        {(calls.error as Error).message}
      </EmptyState>
    )
  else if (locus.status.state === 'not_analyzed' || (data && data.rows.length === 0 && locus.status.state !== 'current'))
    main = (
      <EmptyState
        title={`${locus.label} has not been analyzed`}
        action={
          <Button variant="primary" disabled={analyzing} onClick={() => analyze.mutate({ locus_ids: [locus.locus_id] })}>
            {analyzing && <Spinner className="size-3" />} Analyze {locus.label}
          </Button>
        }
      >
        Analyzing scans every run of the project’s samples at this locus, filters peaks, bins them and calls alleles. It runs in the
        background.
      </EmptyState>
    )
  else
    main = (
      <SplitView
        id="genotyping.review"
        defaultSize={470}
        minSize={340}
        minSecond={420}
        first={
          showParams ? (
            <ParamsPanel detail={detail} locusId={locus.locus_id} onClose={toggleParams} onDirtyChange={setParamsDirty} />
          ) : (
            <StaleFrame status={status}>
              <CallsTable
                rows={shown}
                total={views.length}
                selectedId={sampleId != null ? String(sampleId) : null}
                onSelect={(id) => onSelect({ sample: Number(id) })}
                sort={sort}
                onSortChange={setSort}
                filters={filters}
                onFiltersChange={setFilters}
                stale={status.state === 'stale'}
                searchRef={searchRef}
                bulk={
                  <Tooltip
                    content={
                      toMark.length
                        ? `Mark the ${countOf(toMark.length, 'call')} the filter shows that are not reviewed yet`
                        : 'Every call the filter shows is reviewed'
                    }
                  >
                    <span tabIndex={-1}>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={toMark.length === 0 || bulk.isPending}
                        onClick={() => setBulkOpen(true)}
                        data-testid="bulk-review"
                      >
                        {bulk.isPending ? <Spinner className="size-3" /> : <CheckCheck size={12} />} Mark {toMark.length} reviewed
                      </Button>
                    </span>
                  </Tooltip>
                }
              />
            </StaleFrame>
          )
        }
        second={
          <div className="flex min-h-0 min-w-0 flex-1">
            <StaleFrame status={status}>
              <CallPanel
                projectId={pid}
                locus={locus}
                view={viewMatches || view.isPlaceholderData ? view.data : undefined}
                loading={view.isLoading}
                placeholder={!viewMatches && view.isFetching}
                params={params}
                xDomain={xDomains[locus.locus_id]}
                onXDomainChange={(d) => setXDomains((s) => ({ ...s, [locus.locus_id]: d }))}
                cursor={cursor}
                onCursor={setCursor}
                onToggle={togglePeak}
                onToggleBin={(id, label) => doToggle(id, label)}
                canUndo={undo.length > 0}
                onUndo={undoLast}
                showRuns={showRuns}
                onShowRuns={setShowRuns}
                showDyes={showDyes}
                onShowDyes={setShowDyes}
                commentRef={commentRef}
                onRows={onRows}
                reviewed={current?.reviewed ?? null}
                droppedReason={current?.dropped ?? null}
                onReviewed={setMark}
                reviewPending={review.isPending}
              />
            </StaleFrame>
          </div>
        }
      />
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="review-tab">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
        <LocusStatusList
          variant="strip"
          detail={detail}
          selected={locus.locus_id}
          onSelect={selectLocus}
          className="min-w-0 flex-1"
          trailing={(l: ProjectLocus) => <LocusProgress p={progress.get(l.locus_id)} />}
        />
        {projectProgress.calls > 0 && <ReviewProgressBar p={projectProgress} label="Project" testId="project-review-progress" />}
        <Button
          size="sm"
          variant={showParams ? 'secondary' : 'ghost'}
          aria-pressed={showParams}
          onClick={toggleParams}
          data-testid="toggle-params"
          title="Parameters of this locus (P)"
        >
          <SlidersHorizontal size={12} /> Parameters <Kbd>P</Kbd>
        </Button>
      </div>
      <StaleNotice
        status={status}
        what={`${locus.label} calls`}
        action={
          status.state !== 'not_analyzed' && (
            <Button
              size="sm"
              variant="primary"
              disabled={analyzing}
              onClick={() => analyze.mutate({ locus_ids: [locus.locus_id] })}
              data-testid="reanalyze-locus"
            >
              {analyzing && <Spinner className="size-3" />} Re-analyze {locus.label}
            </Button>
          )
        }
      />
      {data?.probabilities && data.probabilities.state === 'stale' && status.state === 'current' && (
        <div className="border-b border-line bg-surface-2 px-3 py-1 text-xs text-muted" role="status">
          Peak probabilities and MOI are out of date ({data.probabilities.reasons.join('; ') || 'a locus was re-analyzed'}). Recalculate
          them on the Probabilities tab.
        </div>
      )}
      {main}
      <div className="flex h-6 shrink-0 items-center border-t border-line bg-surface px-2">
        <ShortcutHints onMore={openShortcuts} />
      </div>
      <ConfirmDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title={`Mark ${countOf(toMark.length, 'call')} at ${locus.label} reviewed?`}
        description={
          <>
            {filterWords
              ? `The table shows ${countOf(shown.length, 'call')} (${filterWords}). ${toMark.length === shown.length ? 'None of them is reviewed yet' : `${toMark.length} of them are not reviewed yet`}`
              : `These are all the calls at ${locus.label} not reviewed yet`}
            {toMark.length > 0 &&
              `: ${toMark
                .slice(0, 6)
                .map((v) => v.row.barcode)
                .join(', ')}${toMark.length > 6 ? ` and ${toMark.length - 6} more` : ''}`}
            . Each stays reviewed until its alleles, flags or reference run change.{' '}
            {views.length - shown.length > 0 &&
              `${countOf(views.length - shown.length, 'call')} hidden by the filter are left as they are.`}
          </>
        }
        confirmLabel={`Mark ${toMark.length} reviewed`}
        onConfirm={() => bulk.mutateAsync({ locusId: locus.locus_id, sampleIds: toMark.map((v) => v.row.sample_id) })}
      />
      <ConfirmDialog
        open={discard != null}
        onOpenChange={(o) => !o && setDiscard(null)}
        title={`Discard parameter changes for ${locus.label}?`}
        description="The edits in the parameters panel have not been saved."
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          const go = discard
          setDiscard(null)
          setParamsDirty(false)
          go?.()
        }}
      />
    </div>
  )
}

/** "34/276" after a locus name in the strip; a check when every call is reviewed. */
function LocusProgress({ p }: { p: ReviewProgress | undefined }) {
  if (!p || p.calls === 0) return null
  const done = p.reviewed >= p.calls
  return (
    <span
      className={cn(
        'num ml-0.5 rounded-[3px] px-1 text-2xs font-normal',
        done ? 'bg-ok-soft text-ok' : p.reviewed ? 'bg-surface-3 text-muted' : 'text-faint',
      )}
      data-testid="locus-review-progress"
      data-reviewed={p.reviewed}
      data-calls={p.calls}
      aria-label={`${p.reviewed} of ${p.calls} calls reviewed`}
    >
      {done ? '✓ all' : `${p.reviewed}/${p.calls}`}
    </span>
  )
}
