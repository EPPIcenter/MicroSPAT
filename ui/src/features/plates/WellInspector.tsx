/**
 * Well inspector: every dye's trace in a TraceViewer with the ladder peaks
 * and their sizes, the sizing result and why, the runs of the well, and
 * manual ladder editing. The x view is owned by the page (per axis mode) so
 * it survives moving between wells.
 *
 * Editing: the fitter's candidate peaks are hollow circles to click (failed
 * wells have them too), any other spot on the ladder trace adds its local
 * maximum, and a proposed peak is selected by clicking it so its ladder size
 * can be chosen. Every change is previewed by the engine (debounced): sizes
 * on the trace, sizing state and quality before and after, and the reason.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Pencil, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import type { Color, Ladder, LadderPeak, LadderPreview, SizingState, WellDetail, WellSummary } from '@/api/bindings'
import { api } from '@/api/client'
import { isRpcError } from '@/api/transport'
import { TraceViewer, type LadderMarker, type TraceClick, type TracePeak, type TraceSeries } from '@/components/TraceViewer'
import type { Domain } from '@/plot/scale'
import { Badge, StatusChip } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Kbd } from '@/components/ui/Kbd'
import { Spinner } from '@/components/ui/ProgressBar'
import { Tooltip } from '@/components/ui/Tooltip'
import { SelectInput } from '@/components/form/fields'
import { cn } from '@/lib/cn'
import { fmtRfu } from '@/lib/format'
import { toast } from '@/stores/toasts'
import {
  addPeak,
  assignedSizes,
  diffDraft,
  draftMarks,
  isClean,
  nearestPeak,
  removePeak,
  setPeakSize,
  shiftOthers,
  startDraft,
  type DraftPeak,
  type LadderDraft,
} from './model/ladderEdit'
import { isTypingTarget, overlayOpen } from '@/lib/keys'
import { fmtQuality, SIZING_LABEL, SIZING_TONE } from './model/status'
import { SizingSwatch } from './parts'
import { useWell } from './queries'
import { useLadderPreview } from './useLadderPreview'
import { kbd } from '@/lib/platform'

export interface ViewState {
  bp: Domain | null
  index: Domain | null
  yMax: number | null
}

interface FitState {
  quality: number | null
  sizing: SizingState
  manual: boolean
  reason: string | null
}

/** Result of the last apply / revert, so the change stays visible. */
export interface FitChange {
  wellId: number
  before: FitState
  after: FitState
}

/** Set (or with a function, update from the latest value) a well's draft; null drops it. */
export type DraftUpdate = (wellId: number, next: LadderDraft | null | ((current: LadderDraft | undefined) => LadderDraft | null)) => void

const STATUS_OF = { good: 'ok', flagged: 'flagged', unusable: 'failed', failed: 'failed' } as const
const TONE_TEXT = { ok: 'text-ok', warn: 'text-warn', danger: 'text-danger', neutral: 'text-muted' } as const

export function WellInspector({
  plateId,
  well,
  ladder,
  view,
  onViewChange,
  hidden,
  onHiddenChange,
  editing,
  onEditingChange,
  draft,
  onDraftChange,
  lastChange,
  onFitChange,
  qualityBar,
}: {
  plateId: number
  well: WellSummary | null
  ladder: Ladder | undefined
  view: ViewState
  onViewChange: (v: ViewState) => void
  hidden: ReadonlySet<Color>
  onHiddenChange: (h: Set<Color>) => void
  editing: boolean
  onEditingChange: (on: boolean) => void
  /** Proposed ladder peaks for this well, if the user changed them. */
  draft: LadderDraft | null
  onDraftChange: DraftUpdate
  lastChange: FitChange | null
  onFitChange: (c: FitChange) => void
  /** The well's quality measures and issues, shown under the well's facts (not while editing). */
  qualityBar?: ReactNode
}) {
  const q = useWell(plateId, well?.id ?? null)
  // The query keeps the previous well while the next one loads, so flipping
  // through wells does not flash an empty plot.
  const data = q.data ?? null
  const stale = !!data && data.id !== well?.id

  if (!well) {
    return (
      <EmptyState title="Select a well" className="bg-surface">
        Click a well on the plate, or move with the arrow keys.
      </EmptyState>
    )
  }
  if (!data) {
    return q.isError ? (
      <EmptyState title={`Could not load ${well.label}`} className="bg-surface">
        {(q.error as Error).message}
      </EmptyState>
    ) : (
      <div className="grid flex-1 place-items-center bg-surface text-muted">
        <Spinner />
      </div>
    )
  }
  return (
    <WellBody
      key={data.id}
      data={data}
      summary={well}
      stale={stale}
      ladder={ladder}
      view={view}
      onViewChange={onViewChange}
      hidden={hidden}
      onHiddenChange={onHiddenChange}
      editing={editing}
      onEditingChange={onEditingChange}
      draft={stale ? null : draft}
      onDraftChange={onDraftChange}
      lastChange={lastChange?.wellId === data.id ? lastChange : null}
      plateId={plateId}
      onFitChange={onFitChange}
      qualityBar={stale ? null : qualityBar}
    />
  )
}

function fitOf(w: Pick<WellDetail, 'sizing' | 'sizing_quality' | 'manual_ladder' | 'sizing_reason' | 'sizing_error'>): FitState {
  return { quality: w.sizing_quality, sizing: w.sizing, manual: w.manual_ladder, reason: w.sizing_reason ?? w.sizing_error ?? null }
}

function WellBody({
  plateId,
  data,
  summary,
  stale,
  ladder,
  view,
  onViewChange,
  hidden,
  onHiddenChange,
  editing,
  onEditingChange,
  draft,
  onDraftChange,
  lastChange,
  onFitChange,
  qualityBar,
}: {
  plateId: number
  data: WellDetail
  summary: WellSummary
  stale: boolean
  ladder: Ladder | undefined
  view: ViewState
  onViewChange: (v: ViewState) => void
  hidden: ReadonlySet<Color>
  onHiddenChange: (h: Set<Color>) => void
  editing: boolean
  onEditingChange: (on: boolean) => void
  draft: LadderDraft | null
  onDraftChange: DraftUpdate
  lastChange: FitChange | null
  onFitChange: (c: FitChange) => void
  qualityBar?: ReactNode
}) {
  const ladderColor = data.ladder.color
  const ladderSizes = useMemo(() => ladder?.spec.base_sizes ?? [], [ladder])
  const saved = data.ladder_peaks
  const d = useMemo(() => draft ?? startDraft(saved), [draft, saved])
  const diff = diffDraft(d, saved)
  const [selected, setSelected] = useState<number | null>(null)
  // Sizes the fitter gave before the user's first correction.
  const fitterSizes = useRef<Map<number, number>>(new Map())
  const selectedPeak = selected != null ? (d.find((p) => p.index === selected) ?? null) : null
  const live = useLadderPreview(plateId, data.id, editing && !stale && diff.dirty ? d : null)
  // Without edits the stored fit is the preview.
  const storedFit = useMemo<LadderPreview>(
    () => ({ sizing: data.sizing, sizing_quality: data.sizing_quality, reason: null, peaks: saved }),
    [data.sizing, data.sizing_quality, saved],
  )
  const shown: LadderPreview | null = diff.dirty ? live.preview : storedFit
  const ladderTrace = data.channels.find((c) => c.color === ladderColor)?.trace ?? null
  const candidates = useMemo(() => data.ladder_candidates ?? [], [data.ladder_candidates])
  // While editing, sizes may change, so work in data points; otherwise bp when sized.
  const xMode: 'bp' | 'index' = !editing && data.base_sizes ? 'bp' : 'index'
  // `hidden` is the page's set for the current mode; editing always shows the ladder.
  const isHidden = (c: Color) => hidden.has(c) && !(editing && c === ladderColor)

  const series = useMemo<TraceSeries[]>(
    () =>
      data.channels
        .filter((c) => c.trace)
        .map((c) => ({
          id: c.color,
          color: c.color,
          data: c.trace as number[],
          baseSizes: data.base_sizes,
          label: `${c.dye_name ?? c.color}${c.color === ladderColor ? ' (ladder)' : ''}`,
          hidden: hidden.has(c.color) && !(editing && c.color === ladderColor),
        })),
    [data, ladderColor, hidden, editing],
  )

  const marks = useMemo<{ ladder: LadderMarker[]; peaks: TracePeak[] }>(() => {
    if (editing && ladderTrace)
      return draftMarks(d, saved, { seriesId: ladderColor, trace: ladderTrace, preview: shown, candidates, selected })
    return {
      ladder: saved.map((p: LadderPeak) => ({ index: p.index, size: p.size, seriesId: ladderColor, status: 'ok' as const })),
      peaks: [],
    }
  }, [editing, d, saved, ladderColor, ladderTrace, shown, candidates, selected])

  const update = (fn: (cur: LadderDraft) => LadderDraft) =>
    onDraftChange(data.id, (cur) => {
      const next = fn(cur ?? startDraft(saved))
      return isClean(next, saved) ? null : next
    })

  const apply = useMutation({
    mutationFn: (auto: boolean) => api.set_well_ladder_peaks(auto || !live.request ? { id: data.id } : live.request),
    meta: { silent: true },
    onSuccess: (res, auto) => {
      onDraftChange(data.id, null)
      setSelected(null)
      onFitChange({ wellId: data.id, before: fitOf(data), after: fitOf(res) })
      if (auto)
        toast.success(
          `${data.label}: automatic ladder fit restored`,
          res.sizing === 'good'
            ? `Good, SQ ${fmtQuality(res.sizing_quality)}`
            : `${SIZING_LABEL[res.sizing]}: ${res.sizing_reason ?? res.sizing_error ?? ''}`,
        )
    },
    onError: (e) => toast.error(`Could not refit ${data.label}`, isRpcError(e) || e instanceof Error ? e.message : String(e)),
  })

  const span = view.index ? view.index[1] - view.index[0] : data.trace_len
  const radius = Math.max(4, Math.round(span / 140))
  const onBackgroundClick = (c: TraceClick) => {
    if (!editing || stale) return
    const near = nearestPeak(d, c.index, radius)
    if (near != null) {
      // Alt: Shift+drag is the plot's box zoom, so Shift-click never arrives as a click.
      if (c.altKey) {
        update((cur) => removePeak(cur, near))
        setSelected(null)
      } else setSelected(near)
      return
    }
    // Near one of the fitter's candidates: take that peak; else the local maximum.
    const cand = nearestPeak(
      candidates.map((x) => ({ index: x.index, size: null })),
      c.index,
      radius,
    )
    const at = cand ?? c.snapIndex
    // Functional update: two quick clicks must not overwrite each other.
    update((cur) => addPeak(cur, at))
    setSelected(at)
  }
  const onPeakClick = (p: TracePeak, c: TraceClick) => {
    if (!editing || stale) return
    const id = String(p.id)
    if (id.startsWith('p-') && c.altKey) {
      update((cur) => removePeak(cur, p.index))
      if (selected === p.index) setSelected(null)
    } else if (id.startsWith('p-')) setSelected(p.index)
    else {
      // A candidate or a removed stored peak: add it.
      update((cur) => addPeak(cur, p.index))
      setSelected(p.index)
    }
  }

  // Apply does not wait for the preview; it is only refused once the preview of these very peaks says they cannot be fitted.
  const knownFailed = !live.pending && (live.problem != null || live.preview?.sizing === 'failed')
  const canApply = diff.dirty && live.request != null && !knownFailed && !apply.isPending
  const discard = () => {
    onDraftChange(data.id, null)
    setSelected(null)
  }

  // Keys work wherever focus is on the page while editing (not only inside
  // this panel), except while typing or while a dialog, menu or list is open.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  useLayoutEffect(() => {
    keyRef.current = (e) => {
      if (!editing || stale) return
      if (overlayOpen()) return
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (canApply) apply.mutate(false)
      } else if (e.key === 'Escape') {
        if (diff.dirty) {
          e.preventDefault()
          discard()
        } else if (selected != null) setSelected(null)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected != null && !isTypingTarget(e.target)) {
        e.preventDefault()
        update((cur) => removePeak(cur, selected))
        setSelected(null)
      }
    }
  })
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const runs = data.channels.flatMap((c) => c.runs.map((r) => ({ ...r, color: c.color })))
  const needsLook = data.sizing !== 'good'
  const reason = data.sizing_reason ?? data.sizing_error ?? null

  return (
    <div
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col bg-surface', stale && 'opacity-80')}
      data-testid="well-inspector"
      data-well={data.label}
    >
      {/* Header: well, sizing, dyes, edit toggle. */}
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-2 py-1">
        <span className="text-sm font-semibold" data-testid="well-label">
          {data.label}
        </span>
        <span className="max-w-40 truncate text-xs text-muted" title={data.sample_name ?? undefined}>
          {runs[0]?.sample_barcode ?? data.sample_name ?? ''}
        </span>
        <Tooltip content={sizingTooltip(data, ladder)}>
          <span data-testid="well-sizing">
            <StatusChip
              status={STATUS_OF[data.sizing]}
              label={`${SIZING_LABEL[data.sizing]}${data.sizing_quality != null ? ` · SQ ${fmtQuality(data.sizing_quality)}` : ''}`}
            />
          </span>
        </Tooltip>
        {data.manual_ladder && (
          <Badge tone="accent" title="The ladder peaks of this well were picked by hand">
            <Pencil size={10} /> edited by hand
          </Badge>
        )}
        {(stale || summary.id !== data.id) && <Spinner className="size-3 text-faint" />}
        <div className="ml-auto flex items-center gap-1">
          <DyeToggles
            channels={data.channels.map((c) => ({ color: c.color, name: c.dye_name ?? c.color }))}
            ladderColor={ladderColor}
            isHidden={isHidden}
            onToggle={(c) => {
              const next = new Set(hidden)
              if (next.has(c)) next.delete(c)
              else next.add(c)
              onHiddenChange(next)
            }}
            editing={editing}
          />
          <Button
            size="sm"
            variant={editing ? 'primary' : needsLook ? 'secondary' : 'ghost'}
            aria-pressed={editing}
            onClick={() => onEditingChange(!editing)}
            disabled={!ladderTrace}
            title="Pick this well's ladder peaks by hand (E)"
          >
            <Pencil size={12} /> {editing ? 'Editing ladder' : 'Edit ladder'}
          </Button>
        </div>
      </div>

      {editing ? (
        <EditBar
          data={data}
          ladder={ladder}
          draft={d}
          diff={diff}
          live={live}
          shown={shown}
          selected={selectedPeak}
          onSize={(index, size) => {
            // Remember what the fitter said before the first correction, for "shift the others".
            if (fitterSizes.current.size === 0 || !d.some((p) => p.size != null)) fitterSizes.current = assignedSizes(d, shown)
            update((cur) => setPeakSize(cur, index, size))
          }}
          onShift={(index) => {
            const next = shiftOthers(d, index, fitterSizes.current, fitterSizes.current.get(index) ?? null, ladderSizes)
            if (next) update(() => next)
          }}
          canShift={(index) => shiftOthers(d, index, fitterSizes.current, fitterSizes.current.get(index) ?? null, ladderSizes) != null}
          onRemove={(index) => {
            update((cur) => removePeak(cur, index))
            setSelected(null)
          }}
          pending={apply.isPending}
          error={apply.isError ? (apply.error as Error).message : null}
          lastChange={lastChange}
          canApply={canApply}
          onApply={() => apply.mutate(false)}
          onDiscard={discard}
          onAuto={() => apply.mutate(true)}
          onDone={() => onEditingChange(false)}
        />
      ) : (
        <>
          <InfoBar data={data} ladder={ladder} runs={runs} lastChange={lastChange} reason={reason} />
          {qualityBar}
        </>
      )}

      <div className="flex min-h-0 flex-1 p-1.5">
        <TraceViewer
          className="h-full w-full"
          ariaLabel={`Traces of well ${data.label}`}
          series={series}
          xMode={xMode}
          ladder={marks.ladder}
          peaks={marks.peaks}
          xDomain={view[xMode] ?? undefined}
          // Without a size axis, start after the primer peaks the ladder fit ignores too.
          // In bp, start on the ladder's range.
          defaultXDomain={
            !ladder
              ? undefined
              : xMode === 'index'
                ? [ladder.spec.min_time, data.trace_len - 1]
                : [Math.max(0, ladderSizes[0]! - 15), ladderSizes[ladderSizes.length - 1]! + 25]
          }
          onXDomainChange={(x) => onViewChange({ ...view, [xMode]: x })}
          yMax={view.yMax}
          onYMaxChange={(y) => onViewChange({ ...view, yMax: y })}
          onBackgroundClick={editing ? onBackgroundClick : undefined}
          onPeakClick={editing ? onPeakClick : undefined}
          clickSeriesId={ladderColor}
          snapRadius={12}
        />
      </div>
    </div>
  )
}

function sizingTooltip(data: WellDetail, ladder: Ladder | undefined): string {
  const limits = `flag above ${ladder?.spec.sq_flag_limit ?? '–'} bp, unusable above ${ladder?.spec.sq_unusable_limit ?? '–'} bp`
  const reason = data.sizing_reason ?? data.sizing_error
  return reason ? `${reason} (${limits})` : `Sizing quality ${fmtQuality(data.sizing_quality)} (${limits})`
}

function DyeToggles({
  channels,
  ladderColor,
  isHidden,
  onToggle,
  editing,
}: {
  channels: { color: Color; name: string }[]
  ladderColor: Color
  isHidden: (c: Color) => boolean
  onToggle: (c: Color) => void
  editing: boolean
}) {
  return (
    <div role="group" aria-label="Dyes" className="flex items-center gap-0.5">
      {channels.map(({ color: c, name }) => {
        const off = isHidden(c)
        const locked = editing && c === ladderColor
        return (
          <button
            key={c}
            type="button"
            aria-pressed={!off}
            disabled={locked}
            onClick={() => onToggle(c)}
            title={
              locked
                ? 'The ladder dye stays visible while editing'
                : `${off ? 'Show' : 'Hide'} ${name} (${c})${c === ladderColor ? ', ladder' : ''}`
            }
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded-[4px] px-1.5 text-2xs text-muted outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default',
              off && 'opacity-45',
            )}
          >
            <span
              className={cn('inline-block size-2.5 rounded-[3px] border', off ? 'bg-transparent' : '')}
              style={{ background: off ? undefined : `var(--dye-${c})`, borderColor: `var(--dye-${c})` }}
            />
            <span className={cn(!off && 'text-fg')}>{name}</span>
            {c === ladderColor && <span className="text-faint">ladder</span>}
          </button>
        )
      })}
    </div>
  )
}

function FitBadge({ fit, strong }: { fit: { sizing: SizingState; quality: number | null }; strong?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1', strong && 'font-medium')}>
      <SizingSwatch state={fit.sizing} />
      <span className="num">{fmtQuality(fit.quality)}</span>
      <span className={strong ? TONE_TEXT[SIZING_TONE[fit.sizing]] : 'text-muted'}>{SIZING_LABEL[fit.sizing].toLowerCase()}</span>
    </span>
  )
}

/** "SQ ■ 0.067 good → ■ 0.048 unusable". */
function FitArrow({
  before,
  after,
  testId,
  pending,
}: {
  before: FitState
  after: { sizing: SizingState; quality: number | null } | null
  testId: string
  pending?: boolean
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs"
      data-testid={testId}
      data-after={after?.sizing}
      data-pending={pending ? 'true' : 'false'}
    >
      <span className="text-faint">SQ</span>
      <FitBadge fit={before} />
      <span className="text-faint">→</span>
      {after ? <FitBadge fit={after} strong /> : <span className="text-faint">…</span>}
      {pending && <Spinner className="size-3 text-faint" />}
    </span>
  )
}

function InfoBar({
  data,
  ladder,
  runs,
  lastChange,
  reason,
}: {
  data: WellDetail
  ladder: Ladder | undefined
  runs: (WellDetail['channels'][number]['runs'][number] & { color: Color })[]
  lastChange: FitChange | null
  reason: string | null
}) {
  return (
    <div className="flex min-h-8 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-2 py-1 text-xs text-muted">
      {data.sizing !== 'failed' && (
        <span>
          {data.ladder_peaks.length}
          {ladder ? ` of ${ladder.spec.base_sizes.length}` : ''} ladder peaks · {data.ladder.label}
        </span>
      )}
      {lastChange && (
        <FitArrow
          before={lastChange.before}
          after={{ sizing: lastChange.after.sizing, quality: lastChange.after.quality }}
          testId="quality-change"
        />
      )}
      {reason && (
        <span className={TONE_TEXT[SIZING_TONE[data.sizing]]} data-testid="sizing-reason">
          {reason}
        </span>
      )}
      {data.offscale_indices.length > 0 && <span className="text-warn">{data.offscale_indices.length} off-scale points</span>}
      {runs.length === 0 ? (
        <span className="text-faint">No runs: apply a plate map to assign samples and loci.</span>
      ) : (
        <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5" aria-label="Runs">
          {runs.map((r) => (
            <span
              key={r.id}
              className={cn('inline-flex items-center gap-1 whitespace-nowrap', r.contaminated && 'text-danger')}
              title={`${r.locus_label} · ${r.sample_barcode} (${r.designation.replace('_', ' ')})${r.contaminated ? ' · contaminated' : r.locus_contaminated ? ' · a negative control of this locus is contaminated' : ''}`}
            >
              <span className="inline-block size-2 rounded-[2px]" style={{ background: `var(--dye-${r.color})` }} />
              <span className="text-fg">{r.locus_label}</span>
              {r.designation !== 'sample' && <span className="text-2xs">{r.designation === 'negative_control' ? 'NTC' : 'pos.'}</span>}
              <span className="num">{r.max_signal == null ? '–' : fmtRfu(r.max_signal)}</span>
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

function EditBar({
  data,
  ladder,
  draft,
  diff,
  live,
  shown,
  selected,
  onSize,
  onShift,
  canShift,
  onRemove,
  pending,
  error,
  lastChange,
  canApply,
  onApply,
  onDiscard,
  onAuto,
  onDone,
}: {
  data: WellDetail
  ladder: Ladder | undefined
  draft: LadderDraft
  diff: ReturnType<typeof diffDraft>
  live: ReturnType<typeof useLadderPreview>
  shown: LadderPreview | null
  selected: DraftPeak | null
  onSize: (index: number, size: number | null) => void
  onShift: (index: number) => void
  canShift: (index: number) => boolean
  onRemove: (index: number) => void
  pending: boolean
  error: string | null
  lastChange: FitChange | null
  canApply: boolean
  onApply: () => void
  onDiscard: () => void
  onAuto: () => void
  onDone: () => void
}) {
  const total = ladder?.spec.base_sizes.length
  const dirty = diff.dirty
  const before = fitOf(data)
  const reason = dirty ? (live.problem ?? live.error ?? shown?.reason ?? null) : (data.sizing_reason ?? data.sizing_error ?? null)
  // An empty draft is not a failed fit: there is nothing to preview yet.
  const empty = dirty && draft.length === 0
  const afterState: SizingState | null = empty
    ? null
    : dirty
      ? live.problem || live.error
        ? 'failed'
        : (shown?.sizing ?? null)
      : data.sizing
  const chosen = draft.filter((p) => p.size != null).length
  return (
    <div className="flex shrink-0 flex-col gap-1 border-b border-line bg-accent-soft/40 px-2 py-1.5 text-xs" data-testid="ladder-editor">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-fg">Ladder peaks</span>
        <span className="num" data-testid="ladder-count">
          {draft.length}
          {total ? ` of ${total}` : ''} used
        </span>
        {dirty ? (
          <span className="inline-flex items-center gap-1.5" data-testid="ladder-unsaved">
            <Badge tone="accent">unsaved</Badge>
            {diff.added.length > 0 && <span className="text-accent">+{diff.added.length} new</span>}
            {diff.removed.length > 0 && <span className="text-danger">−{diff.removed.length} removed</span>}
            {chosen > 0 && (
              <span className="text-fg">
                {chosen} size{chosen === 1 ? '' : 's'} set by hand
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted">{data.manual_ladder ? 'saved, picked by hand' : 'saved, automatic fit'}</span>
        )}
        {dirty ? (
          <FitArrow
            before={before}
            after={
              empty
                ? null
                : live.problem || live.error
                  ? { sizing: 'failed', quality: null }
                  : shown
                    ? { sizing: shown.sizing, quality: shown.sizing_quality }
                    : null
            }
            pending={live.pending}
            testId="ladder-preview"
          />
        ) : lastChange ? (
          <FitArrow
            before={lastChange.before}
            after={{ sizing: lastChange.after.sizing, quality: lastChange.after.quality }}
            testId="quality-change"
          />
        ) : (
          <span className="text-muted">
            {data.sizing_quality == null ? 'no ladder fit' : `current SQ ${fmtQuality(data.sizing_quality)}`}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onDiscard} disabled={!dirty || pending} title="Discard unsaved changes (Esc)">
            <Undo2 size={12} /> Discard
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onAuto}
            disabled={pending || (!data.manual_ladder && !dirty)}
            title="Throw away hand-picked peaks and fit the ladder automatically"
          >
            <RotateCcw size={12} /> Automatic fit
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={onApply}
            disabled={!canApply}
            title={afterState === 'failed' ? 'These peaks cannot be fitted' : kbd('Store this ladder fit (⌘Enter)')}
          >
            {pending ? <Spinner className="size-3" /> : null} Apply
          </Button>
          <Button size="sm" variant="secondary" onClick={onDone} title="Leave ladder editing (E)">
            Done
          </Button>
        </div>
      </div>
      {selected && (
        <PeakControls
          data={data}
          ladder={ladder}
          draft={draft}
          shown={shown}
          peak={selected}
          onSize={onSize}
          onShift={canShift(selected.index) ? onShift : null}
          onRemove={onRemove}
        />
      )}
      {(error || reason || (dirty && shown?.sizing === 'good')) && (
        <div className="text-xs">
          {error ? (
            <span className="text-danger" role="alert">
              {error}
            </span>
          ) : reason ? (
            <span
              className={afterState ? TONE_TEXT[SIZING_TONE[afterState]] : 'text-muted'}
              role={dirty ? 'status' : undefined}
              data-testid="ladder-reason"
            >
              {dirty && afterState === 'failed'
                ? 'Cannot be fitted: '
                : dirty && afterState && afterState !== 'good'
                  ? `Would be ${SIZING_LABEL[afterState].toLowerCase()}: `
                  : ''}
              {reason}
            </span>
          ) : (
            <span className="text-ok" data-testid="ladder-reason">
              Would be good.
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-muted">
        <span title="Hollow circles are the peaks the automatic fit considered. Clicking elsewhere on the ladder trace adds the local maximum there.">
          Click a circle or the trace to add a peak · click a peak to set its size · Alt-click removes
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <Kbd>{kbd('⌘↵')}</Kbd> apply <Kbd>Esc</Kbd> discard <Kbd>Del</Kbd> remove peak <Kbd>]</Kbd> next well
        </span>
      </div>
    </div>
  )
}

const AUTO = 'auto'

/** Size picker and remove button for the selected peak. */
function PeakControls({
  data,
  ladder,
  draft,
  shown,
  peak,
  onSize,
  onShift,
  onRemove,
}: {
  data: WellDetail
  ladder: Ladder | undefined
  draft: LadderDraft
  shown: LadderPreview | null
  peak: DraftPeak
  onSize: (index: number, size: number | null) => void
  /** Move the other peaks by as many ladder steps as this one moved; null when not possible. */
  onShift: ((index: number) => void) | null
  onRemove: (index: number) => void
}) {
  const sizes = assignedSizes(draft, shown)
  const fitted = shown?.peaks.find((p) => p.index === peak.index)?.size ?? null
  const height = data.channels.find((c) => c.color === data.ladder.color)?.trace?.[peak.index]
  const usedBy = new Map<number, number>()
  for (const [i, s] of sizes) if (i !== peak.index) usedBy.set(s, i)
  const options = [
    { value: AUTO, label: peak.size == null && fitted != null ? `Fitter’s choice: ${fitted} bp` : 'Fitter’s choice' },
    ...(ladder?.spec.base_sizes ?? []).map((s) => ({
      value: String(s),
      label: usedBy.has(s) ? `${s} bp (now on #${usedBy.get(s)})` : `${s} bp`,
    })),
  ]
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="peak-controls">
      <span className="text-muted">
        Selected peak <span className="num text-fg">#{peak.index}</span>
        {height != null && <span className="num"> · {fmtRfu(height)} RFU</span>}
      </span>
      <span className="text-muted">is ladder size</span>
      <SelectInput
        aria-label="Ladder size of the selected peak"
        className="h-6 w-48 text-xs"
        value={peak.size == null ? AUTO : String(peak.size)}
        onChange={(v) => onSize(peak.index, v === AUTO ? null : Number(v))}
        options={options}
      />
      {onShift && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onShift(peak.index)}
          title="Assign every other peak the size the same number of ladder steps away from the fitter's choice"
        >
          Shift the rest too
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => onRemove(peak.index)} title="Remove this peak from the ladder (Del)">
        <Trash2 size={12} /> Remove
      </Button>
    </div>
  )
}
