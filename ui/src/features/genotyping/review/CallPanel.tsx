/**
 * One sample × locus: the trace of the reference run zoomed to the locus,
 * bins with labels, every peak drawn by state with its expected artifact
 * height, the peak readout and table, the comment, and the sample's other
 * runs (as overlays or shown instead) and the well's other dyes.
 */
import { fmtProbability } from '@/lib/format'
import { useEffect, useMemo, useState, type ReactNode, type RefObject } from 'react'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { Check, CircleDashed, Hand, Layers, Palette, Undo2 } from 'lucide-react'
import { api } from '@/api/client'
import { apiQuery } from '@/api/query'
import type { GenotypingParams, Peak, ProjectLocus, SampleLocusCallView } from '@/api/bindings'
import { TraceViewer, type TraceBin, type TracePeak, type TraceSeries } from '@/components/TraceViewer'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/ProgressBar'
import { SplitView } from '@/components/ui/SplitView'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'
import { useUnsavedChanges } from '@/lib/unsaved'
import type { Domain } from '@/plot/scale'
import { AnalysisBadge } from '@/features/projects-shared/StatusBits'
import { toast } from '@/stores/toasts'
import { fmtShare, narrowMissText } from '../model/calls'
import { callContext, numberedPeaks, peaksInRange, peakReasons } from '../model/peaks'
import { patchCallRow, useChannelTrace, useSampleCalls, useWellTraces } from '../queries'
import { MoiLine, PeakLegend } from './parts'
import { PeakReadout, PeakTable, peakRows, type PeakRowModel } from './PeakTable'

export interface CallPanelProps {
  projectId: number
  locus: ProjectLocus
  view: SampleLocusCallView | undefined
  loading: boolean
  /** The view on screen belongs to another sample (next one loading). */
  placeholder: boolean
  params: GenotypingParams | null
  xDomain: Domain | undefined
  onXDomainChange: (d: Domain) => void
  cursor: number
  onCursor: (i: number) => void
  onToggle: (p: Peak) => void
  onToggleBin: (binId: number, label: string) => void
  canUndo: boolean
  onUndo: () => void
  showRuns: boolean
  onShowRuns: (v: boolean) => void
  showDyes: boolean
  onShowDyes: (v: boolean) => void
  commentRef: RefObject<HTMLTextAreaElement | null>
  /** Rows and peaks of the current call, for the parent's keyboard model. */
  onRows?: (rows: PeakRowModel[]) => void
  /** Review mark of the call (null while unknown). */
  reviewed: boolean | null
  /** Why the call's review mark was dropped (the call changed since it was reviewed). */
  droppedReason: string | null
  onReviewed: (reviewed: boolean) => void
  reviewPending?: boolean
}

export function CallPanel(props: CallPanelProps) {
  const { view, locus, params, cursor } = props
  const range: [number, number] = [locus.min_base_length, locus.max_base_length]
  const [mainRun, setMainRun] = useState<number | null>(null)
  // A new sample shows its reference run again.
  const sampleKey = view ? `${view.sample_id}:${view.locus_id}` : ''
  const [prevKey, setPrevKey] = useState(sampleKey)
  if (prevKey !== sampleKey) {
    setPrevKey(sampleKey)
    setMainRun(null)
  }
  const refRun = view?.runs.find((r) => r.is_reference) ?? null
  const shown = (mainRun != null ? view?.runs.find((r) => r.run_id === mainRun) : null) ?? refRun
  const isReference = !shown || shown.is_reference
  const altTrace = useChannelTrace(!isReference && shown ? shown.channel_id : null)

  const ctx = useMemo(
    () =>
      view
        ? callContext(view.row, params, shown?.plate_pull_up)
        : callContext({ alleles: [], flags: { failure: false, offscale: false, spectral: false, manual_curation: false } }, params),
    [view, params, shown],
  )
  const sampleCalls = useSampleCalls(props.projectId, view?.sample_id ?? null)
  const sc = sampleCalls.data && sampleCalls.data.sample_id === view?.sample_id ? sampleCalls.data : undefined
  const peaks = useMemo<Peak[]>(() => {
    if (!view) return []
    if (isReference) return view.peaks
    return shown?.peaks ?? []
  }, [view, isReference, shown])
  const inRange = useMemo(() => peaksInRange(peaks, range), [peaks, range[0], range[1]]) // eslint-disable-line react-hooks/exhaustive-deps
  const numbered = useMemo(() => numberedPeaks(inRange, range), [inRange, range[0], range[1]]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => peakRows(inRange, ctx, numbered), [inRange, ctx, numbered])
  const { onRows } = props
  useEffect(() => onRows?.(rows), [rows, onRows])

  // Other runs as faded overlays.
  const others = useMemo(
    () => (props.showRuns && view ? view.runs.filter((r) => r.run_id !== shown?.run_id) : []),
    [props.showRuns, view, shown],
  )
  const otherTraces = useQueries({
    queries: others.map((r) => ({
      ...apiQuery(['plates', 'channel', r.channel_id], 'get_channel_trace', { id: r.channel_id }),
      meta: { silent: true },
    })),
  })
  const well = useWellTraces(props.showDyes && shown ? shown.plate_id : null, props.showDyes && shown ? shown.well_id : null)

  const mainTrace = isReference ? view?.reference : altTrace.data
  const series = useMemo<TraceSeries[]>(() => {
    if (!view || !mainTrace) return []
    const out: TraceSeries[] = [
      {
        id: 'main',
        color: view.color,
        data: mainTrace.trace,
        baseSizes: mainTrace.base_sizes,
        label: `${view.barcode} · ${shown?.plate_label ?? ''} ${shown?.well_label ?? ''}`,
      },
    ]
    others.forEach((r, i) => {
      const t = otherTraces[i]?.data
      if (t)
        out.push({
          id: `run-${r.run_id}`,
          color: view.color,
          data: t.trace,
          baseSizes: t.base_sizes,
          label: `${r.plate_label} ${r.well_label}`,
          overlay: true,
        })
    })
    if (props.showDyes && well.data?.base_sizes) {
      for (const ch of well.data.channels) {
        if (ch.color === view.color || !ch.trace) continue
        out.push({
          id: `dye-${ch.color}`,
          color: ch.color,
          data: ch.trace,
          baseSizes: well.data.base_sizes,
          label: ch.dye_name ?? ch.color,
          overlay: true,
        })
      }
    }
    return out
  }, [view, mainTrace, shown, others, otherTraces, props.showDyes, well.data])

  const tracePeaks = useMemo<TracePeak[]>(
    () =>
      rows.map((r, i) => ({
        highlight: r.narrow ? ('warn' as const) : undefined,
        id: `${r.peak.index}`,
        seriesId: 'main',
        index: r.peak.index,
        size: r.peak.size,
        height: r.peak.height,
        state: r.state,
        label: r.peak.bin_label,
        tag: r.n != null ? String(r.n) : undefined,
        selected: i === cursor,
        expected:
          r.peak.artifact_contribution > 0 || r.peak.artifact_error > 0
            ? { height: r.peak.artifact_contribution, error: r.peak.artifact_error }
            : null,
        detail: [
          r.peak.bin_label ? `bin ${r.peak.bin_label}${r.peak.in_bin ? '' : ' (outside window)'}` : 'no bin',
          `rel. height ${fmtShare(r.peak.relative_height)}`,
          ...(r.peak.probability != null ? [`P(allele) ${fmtProbability(r.peak.probability)}`] : []),
          ...(r.narrow ? [`narrow miss: ${narrowMissText(r.narrow)}`] : []),
          ...peakReasons(r.peak, ctx)
            .filter((x) => !x.startsWith('Narrow miss'))
            .slice(0, 2),
          ...(r.n != null ? [`press ${r.n} or click to toggle`] : []),
        ],
      })),
    [rows, cursor, ctx],
  )
  const bins = useMemo<TraceBin[]>(
    () =>
      (view?.bins ?? []).map((b) => ({
        id: b.id,
        label: b.label,
        center: b.base_size,
        halfWidth: b.bin_buffer,
        highlighted: ctx.alleles.has(b.id),
      })),
    [view?.bins, ctx],
  )

  if (!view) {
    return (
      <div className="grid flex-1 place-items-center bg-surface text-sm text-muted">
        {props.loading ? <Spinner /> : 'Select a sample to see its trace.'}
      </div>
    )
  }
  const row = view.row
  const narrow = row.narrow_misses ?? []
  const cursorRow = cursor >= 0 ? (rows[cursor] ?? null) : null
  const stale = view.status.state !== 'current'

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface"
      data-testid="call-panel"
      data-sample={view.barcode}
      data-locus={view.locus_label}
    >
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-2 py-1">
        <span className="text-sm font-semibold" data-testid="call-sample">
          {view.barcode}
        </span>
        <span className="text-xs text-muted">at {view.locus_label}</span>
        {view.designation !== 'sample' && (
          <span className="rounded bg-surface-3 px-1 text-2xs text-muted">
            {view.designation === 'negative_control' ? 'negative control' : 'positive control'}
          </span>
        )}
        <span className="text-xs text-muted" data-testid="call-alleles" data-alleles={row.alleles.map((a) => a.label).join(';')}>
          {row.flags.failure ? (
            <span className="text-danger">failed</span>
          ) : row.reference_run_id == null ? (
            <span className="text-danger">no usable run</span>
          ) : (
            <>
              <b className="text-fg">{row.alleles.length}</b> {row.alleles.length === 1 ? 'allele' : 'alleles'}
              {row.alleles.length > 0 && `: ${row.alleles.map((a) => a.label).join(', ')}`}
            </>
          )}
        </span>
        <MoiLine
          moi={sc ? sc.moi : row.moi}
          maxAlleles={sc?.max_alleles}
          maxLoci={sc?.max_alleles_loci}
          bootstrapThreshold={params?.bootstrap_probability_threshold}
        />
        {narrow.length > 0 && (
          <Tooltip
            content={
              <div className="space-y-0.5">
                {narrow.map((m) => (
                  <p key={m.bin_id}>
                    {m.label} ({m.size.toFixed(2)} bp, {Math.round(m.height).toLocaleString('en-US')} RFU): {narrowMissText(m)}
                  </p>
                ))}
              </div>
            }
          >
            <span
              tabIndex={-1}
              className="text-xs text-warn"
              data-testid="narrow-misses"
              data-narrow={narrow.map((m) => m.label).join(';')}
            >
              narrow miss{narrow.length > 1 ? 'es' : ''}: {narrow.map((m) => m.label).join(', ')}
            </span>
          </Tooltip>
        )}
        {row.flags.offscale && <span className="text-xs text-warn">off-scale</span>}
        {row.flags.spectral && <span className="text-xs text-warn">spectral breakdown</span>}
        {row.flags.manual_curation && (
          <span
            className="inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 text-2xs font-medium text-accent"
            data-testid="curated-marker"
          >
            <Hand size={11} /> curated by hand
          </span>
        )}
        {stale && <AnalysisBadge status={view.status} what={`${view.locus_label} calls`} />}
        {props.placeholder && <Spinner className="size-3" />}
        <div className="ml-auto flex items-center gap-1">
          <ReviewButton
            reviewed={props.reviewed}
            dropped={props.droppedReason}
            pending={!!props.reviewPending}
            onChange={props.onReviewed}
          />
          <Button size="sm" variant="ghost" onClick={props.onUndo} disabled={!props.canUndo} title="Undo the last toggle (Z)">
            <Undo2 size={12} /> Undo
          </Button>
          <ToggleChip
            on={props.showRuns}
            onChange={props.onShowRuns}
            disabled={view.runs.length < 2}
            label={`Other runs (${Math.max(0, view.runs.length - 1)})`}
            hint="R"
          >
            <Layers size={12} />
          </ToggleChip>
          <ToggleChip on={props.showDyes} onChange={props.onShowDyes} label="Other dyes" hint="D">
            <Palette size={12} />
          </ToggleChip>
        </div>
      </div>
      <SplitView
        id="genotyping.review.trace"
        direction="vertical"
        defaultSize={330}
        minSize={160}
        minSecond={120}
        first={
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 p-1">
              <TraceViewer
                className="h-full w-full"
                series={series}
                peaks={tracePeaks}
                bins={bins}
                locusRange={range}
                threshold={params?.absolute_peak_height_limit ?? null}
                xDomain={props.xDomain}
                defaultXDomain={[range[0] - 3, range[1] + 3]}
                onXDomainChange={props.onXDomainChange}
                onPeakClick={(tp) => {
                  const i = rows.findIndex((r) => String(r.peak.index) === String(tp.id))
                  if (i < 0) return
                  props.onCursor(i)
                  const p = rows[i]!.peak
                  if (p.bin_id != null) props.onToggle(p)
                  else
                    toast.info(
                      'This peak is outside every bin',
                      'Only bins can be called as alleles. Edit the bins in the bin estimator to add one.',
                    )
                }}
                onBackgroundClick={(c) => {
                  if (c.bp == null) return
                  const b = view.bins.find((x) => Math.abs(x.base_size - c.bp!) <= x.bin_buffer)
                  if (b) props.onToggleBin(b.id, b.label)
                }}
                showLegend={false}
                ariaLabel={`Trace of ${view.barcode} at ${view.locus_label}`}
              />
            </div>
            <div className="flex shrink-0 items-center gap-2 border-t border-line px-2 py-0.5">
              <PeakLegend />
              {series.length > 1 && (
                <span className="flex items-center gap-1.5 border-l border-line pl-2 text-2xs text-muted" data-testid="overlay-legend">
                  Overlays:
                  {series.slice(1).map((x) => (
                    <span key={x.id} className="inline-flex items-center gap-1 whitespace-nowrap">
                      <span
                        aria-hidden
                        className="h-0.5 w-3 rounded"
                        style={{ background: x.id.startsWith('dye-') ? `var(--dye-${x.color})` : 'var(--c-faint)' }}
                      />
                      {x.label}
                    </span>
                  ))}
                </span>
              )}
              {params && (
                <span
                  className="ml-auto text-2xs whitespace-nowrap text-faint"
                  title="Dashed line: the minimum height above expected artifact"
                >
                  - - {params.absolute_peak_height_limit} RFU limit
                </span>
              )}
            </div>
          </div>
        }
        second={
          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <PeakReadout row={cursorRow} ctx={ctx} isReference={isReference} />
              <div className="min-h-0 flex-1 overflow-auto border-t border-line" data-tour="peaks">
                <PeakTable rows={rows} cursor={cursor} onCursor={props.onCursor} onToggle={props.onToggle} ctx={ctx} />
              </div>
            </div>
            <div className="flex w-[200px] shrink-0 flex-col gap-2 overflow-auto border-l border-line p-2">
              <CommentBox key={sampleKey} projectId={props.projectId} view={view} inputRef={props.commentRef} />
              <RunsList view={view} shownId={shown?.run_id ?? null} onShow={(id) => setMainRun(id)} />
            </div>
          </div>
        }
      />
    </div>
  )
}

function ToggleChip({
  on,
  onChange,
  disabled,
  label,
  hint,
  children,
}: {
  on: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label: string
  hint: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      title={`${label} (${hint})`}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-[5px] border px-1.5 text-xs disabled:opacity-40',
        on ? 'border-accent bg-accent-soft text-fg' : 'border-line text-muted hover:text-fg',
      )}
    >
      {children}
      {label}
    </button>
  )
}

function CommentBox({
  projectId,
  view,
  inputRef,
}: {
  projectId: number
  view: SampleLocusCallView
  inputRef: RefObject<HTMLTextAreaElement | null>
}) {
  const saved = view.row.comment ?? ''
  const [text, setText] = useState(saved)
  const [prevSaved, setPrevSaved] = useState(saved)
  if (prevSaved !== saved) {
    setPrevSaved(saved)
    setText(saved)
  }
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: (c: string) =>
      api.set_call_comment({ project_id: projectId, sample_id: view.sample_id, locus_id: view.locus_id, comment: c.trim() || null }),
    meta: { errorTitle: 'Could not save the comment' },
    onSuccess: (row) => patchCallRow(qc, projectId, view.sample_id, view.locus_id, () => row),
  })
  const dirty = text.trim() !== saved.trim()
  // Being saved (blur saves) is not unsaved: leaving then must not ask.
  const saving = save.isPending && (save.variables ?? '').trim() === text.trim()
  useUnsavedChanges(dirty && !saving, `a comment on ${view.barcode} at ${view.locus_label}`)
  const commit = () => {
    if (dirty) save.mutate(text)
  }
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="call-comment" className="flex items-center gap-1 text-2xs font-semibold tracking-wide text-muted uppercase">
        Comment
        {save.isPending && <Spinner className="size-2.5" />}
        {!save.isPending && dirty && <span className="font-normal normal-case text-accent">unsaved</span>}
        <span className="ml-auto font-normal normal-case text-faint">C</span>
      </label>
      <textarea
        id="call-comment"
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
            e.preventDefault()
            commit()
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setText(saved)
            e.currentTarget.blur()
          }
        }}
        placeholder="Note for this sample at this locus"
        rows={3}
        data-testid="call-comment"
        className="w-full resize-none rounded-[5px] border border-line-strong bg-surface p-1.5 text-xs outline-none placeholder:text-faint focus:border-accent"
      />
      <p className="text-2xs text-faint">Enter saves, Shift+Enter adds a line, Esc reverts. Kept when the locus is re-analyzed.</p>
    </div>
  )
}

function RunsList({ view, shownId, onShow }: { view: SampleLocusCallView; shownId: number | null; onShow: (id: number) => void }) {
  return (
    <div className="flex flex-col gap-1" data-testid="runs-list">
      <span className="text-2xs font-semibold tracking-wide text-muted uppercase">Runs of this sample</span>
      {view.runs.length === 0 && <span className="text-xs text-faint">No runs at this locus.</span>}
      {view.runs.map((r) => (
        <button
          key={r.run_id}
          type="button"
          onClick={() => onShow(r.run_id)}
          className={cn(
            'flex items-center gap-1.5 rounded-[4px] border px-1.5 py-1 text-left text-xs',
            r.run_id === shownId ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2',
          )}
          title={
            r.is_reference ? 'The run the call is based on' : 'Show this run instead (its peaks are annotated with the current parameters)'
          }
        >
          <span className="font-medium">
            {r.plate_label} {r.well_label}
          </span>
          {r.is_reference && <span className="rounded bg-surface-3 px-1 text-2xs text-muted">reference</span>}
          <span
            className={cn('ml-auto text-2xs', r.sizing === 'good' ? 'text-muted' : r.sizing === 'flagged' ? 'text-warn' : 'text-danger')}
          >
            {r.sizing}
          </span>
          <span className="num text-2xs text-faint">{r.max_signal != null ? `${Math.round(r.max_signal)}` : ''}</span>
        </button>
      ))}
    </div>
  )
}

/** Review mark of the call: a button that marks it reviewed or clears the mark; says why a mark was dropped. */
function ReviewButton({
  reviewed,
  dropped,
  pending,
  onChange,
}: {
  reviewed: boolean | null
  dropped: string | null
  pending: boolean
  onChange: (v: boolean) => void
}) {
  if (reviewed == null) return null
  if (reviewed)
    return (
      <Tooltip content="Reviewed: the mark stays while the alleles, flags and reference run stay the same. Click or press M to clear it.">
        <Button
          size="sm"
          variant="ghost"
          className="text-ok"
          onClick={() => onChange(false)}
          disabled={pending}
          data-testid="review-state"
          data-reviewed="true"
          aria-pressed
        >
          <Check size={12} strokeWidth={2.5} /> Reviewed
        </Button>
      </Tooltip>
    )
  return (
    <span className="flex items-center gap-1">
      {dropped && (
        <Tooltip content={dropped}>
          <span tabIndex={-1} className="inline-flex items-center gap-1 text-2xs text-warn" data-testid="review-dropped">
            <CircleDashed size={11} /> mark dropped
          </span>
        </Tooltip>
      )}
      <Tooltip content="Mark this call reviewed (M; Enter also moves to the next sample). The mark is dropped by itself if the call later changes.">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onChange(true)}
          disabled={pending}
          data-testid="review-state"
          data-reviewed="false"
          aria-pressed={false}
        >
          <Check size={12} /> Mark reviewed
        </Button>
      </Tooltip>
    </span>
  )
}
