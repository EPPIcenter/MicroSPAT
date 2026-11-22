/**
 * One plate: facts and actions on top, then the plate grid and the well
 * inspector side by side (wide windows) or stacked (narrow ones).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { Activity, ChevronDown, Download, Eraser, Map as MapIcon, MoreHorizontal, RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import type { Color, Ladder, PlateDetail } from '@/api/bindings'
import { api } from '@/api/client'
import { saveTextFile } from '@/api/transport'
import { useElementSize } from '@/plot/canvas'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { NotFound } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { SplitView } from '@/components/ui/SplitView'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/Menu'
import { usePreferencesStore } from '@/stores/preferences'
import { useTaskStore } from '@/stores/tasks'
import { toast } from '@/stores/toasts'
import { fmtRunDate, plateHealth, problemWells, stateReasons } from './model/status'
import type { LadderDraft } from './model/ladderEdit'
import { bypassUnsaved, useUnsavedChanges } from '@/lib/unsaved'
import { isTypingTarget, overlayOpen } from '@/lib/keys'
import { Fact, SizingCountsInline } from './parts'
import { PlateMapDialog } from './PlateMapDialog'
import { PlatePanel } from './PlatePanel'
import { ladderById, plateKeys, usePlate, usePlateQuality, wellQuery } from './queries'
import { issueKey, QualityIndicator, QualityPanel, WellQualityBar } from './QualityPanel'
import { RunConditionsDialog } from './RunConditionsDialog'
import { WellInspector, type DraftUpdate, type FitChange, type ViewState } from './WellInspector'

type Confirm = { kind: 'resize'; ladder: Ladder | null } | { kind: 'clear' } | { kind: 'delete' } | null

export function PlateDetailView({ plateId, ladders }: { plateId: number; ladders: readonly Ladder[] }) {
  const q = usePlate(plateId)
  if (q.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-xs text-muted">
        <Spinner /> Loading plate…
      </div>
    )
  }
  if (!q.data) {
    return <NotFound what="plate" error={q.error ?? undefined} />
  }
  return <Loaded detail={q.data} ladders={ladders} />
}

function Loaded({ detail, ladders }: { detail: PlateDetail; ladders: readonly Ladder[] }) {
  const plate = detail.plate
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const mode = usePreferencesStore((s) => s.plateMode)
  const setMode = usePreferencesStore((s) => s.setPlateMode)
  const measure = usePreferencesStore((s) => s.qualityMeasure)
  const setMeasure = usePreferencesStore((s) => s.setQualityMeasure)
  const [prevPlateId, setPrevPlateId] = useState(plate.id)
  const [issueSel, setIssueSel] = useState<{ plateId: number; key: string } | null>(null)
  const [locusId, setLocusId] = useState<number | null>(null)
  const [view, setView] = useState<ViewState>({ bp: null, index: null, yMax: null })
  const [hidden, setHidden] = useState<Set<Color>>(new Set())
  const [hiddenEdit, setHiddenEdit] = useState<Set<Color> | null>(null)
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts] = useState<Record<number, LadderDraft>>({})
  const [lastChange, setLastChange] = useState<FitChange | null>(null)
  const [dialog, setDialog] = useState<'map' | 'run' | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  if (prevPlateId !== plate.id) {
    setPrevPlateId(plate.id)
    setLocusId(null)
    setHiddenEdit(null)
    setEditing(false)
    setDrafts({})
    setLastChange(null)
    setDialog(null)
    setConfirm(null)
  }
  const [bodyRef, bodySize] = useElementSize<HTMLDivElement>()

  const ladder = ladderById(ladders, plate.ladder_id)
  const ladderColor = ladder?.spec.color ?? null
  const problems = useMemo(() => problemWells(detail.wells), [detail.wells])
  const order = useMemo(() => detail.wells.map((w) => w.label), [detail.wells])
  const wellParam = params.get('well')
  const wellLabel = wellParam && order.includes(wellParam) ? wellParam : (problems[0] ?? order[0] ?? null)
  const well = detail.wells.find((w) => w.label === wellLabel) ?? null
  const draftIds = useMemo(() => new Set(Object.keys(drafts).map(Number)), [drafts])
  const draftLabels = detail.wells.filter((w) => draftIds.has(w.id)).map((w) => w.label)
  useUnsavedChanges(
    draftLabels.length > 0,
    `ladder edits on ${draftLabels.length === 1 ? `well ${draftLabels[0]}` : `${draftLabels.length} wells (${draftLabels.slice(0, 4).join(', ')}${draftLabels.length > 4 ? ', …' : ''})`} of ${plate.label}`,
  )
  const reasons = useMemo(() => stateReasons(detail.wells), [detail.wells])
  const health = plateHealth(plate)
  const sizing = useTaskStore((s) =>
    Object.values(s.tasks).some((t) => t.status === 'running' && t.kind === 'size_plate' && t.label.endsWith(plate.label)),
  )
  const manualCount = detail.wells.filter((w) => w.manual_ladder).length

  // Quality report of this plate (the query keeps the previous plate's while the next loads: ignore that).
  const qualityQ = usePlateQuality(plate.id)
  const qualityView = qualityQ.data?.plate_id === plate.id ? qualityQ.data : undefined
  const report = qualityView ? qualityView.report : undefined
  const issueKeyOpen = issueSel?.plateId === plate.id && report?.issues.some((i) => issueKey(i) === issueSel.key) ? issueSel.key : null
  const openIssue = report?.issues.find((i) => issueKey(i) === issueKeyOpen) ?? null
  const highlight = useMemo(() => (openIssue ? { wells: openIssue.wells, title: openIssue.title } : null), [openIssue])
  const tab = params.get('tab') === 'quality' ? 'quality' : 'well'

  const setParam = (key: string, value: string | null) => {
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (value == null) n.delete(key)
        else n.set(key, value)
        return n
      },
      { replace: true },
    )
  }
  const selectWell = (label: string) => setParam('well', label)
  const setTab = (t: string) => setParam('tab', t === 'quality' ? 'quality' : null)
  const showIssue = (key: string | null) => {
    setIssueSel(key ? { plateId: plate.id, key } : null)
    if (key) setTab('quality')
  }
  const openWell = (label: string) => {
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        n.set('well', label)
        n.delete('tab')
        return n
      },
      { replace: true },
    )
  }
  const step = (list: readonly string[], dir: -1 | 1) => {
    if (!list.length) return
    const cur = wellLabel ? order.indexOf(wellLabel) : -1
    // Next item of `list` after the current well in plate order (wrapping).
    const pos = list.map((l) => order.indexOf(l))
    const next = dir > 0 ? (pos.find((p) => p > cur) ?? pos[0]) : ([...pos].reverse().find((p) => p < cur) ?? pos[pos.length - 1])
    if (next != null && order[next]) selectWell(order[next] as string)
  }

  // Prefetch the next well so stepping through a plate feels instant.
  useEffect(() => {
    if (!wellLabel) return
    const i = order.indexOf(wellLabel)
    for (const j of [i + 1, i - 1]) {
      const w = detail.wells[j]
      if (w) void qc.prefetchQuery(wellQuery(plate.id, w.id))
    }
  }, [wellLabel, order, detail.wells, plate.id, qc])

  const effectiveHidden = editing
    ? (hiddenEdit ?? new Set((['blue', 'green', 'yellow', 'red', 'orange'] as Color[]).filter((c) => c !== ladderColor)))
    : hidden

  // Page shortcuts work wherever focus is on the page (grid, plot, body),
  // but not while typing or while a dialog or menu is open.
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
    if (overlayOpen()) return
    const k = e.key
    if (k === ']' || k === '[') step(order, k === ']' ? 1 : -1)
    else if (k === 'n' || k === 'p') step(problems, k === 'n' ? 1 : -1)
    else if (k === 'e') setEditing((v) => !v)
    else if (k === 'l') setMode('ladder')
    else if (k === 's') setMode('signal')
    else if (k === 'q') setMode('quality')
    else return
    e.preventDefault()
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

  const resize = useMutation({
    mutationFn: (ladderId: number | null) => api.size_plate({ id: plate.id, ...(ladderId != null ? { ladder_id: ladderId } : {}) }),
    meta: { errorTitle: `Could not re-size ${plate.label}` },
    onSuccess: (s) => {
      setDrafts({})
      toast.success(
        `${s.label} re-sized with ${s.ladder_label}`,
        `${s.sizing.good} good, ${s.sizing.flagged} flagged, ${s.sizing.unusable} unusable, ${s.sizing.failed} failed`,
      )
    },
  })
  const clear = useMutation({
    mutationFn: () => api.clear_plate_map({ id: plate.id }),
    meta: { errorTitle: 'Could not clear the plate map' },
    onSuccess: () => toast.success(`Plate map of ${plate.label} cleared`),
  })
  const del = useMutation({
    mutationFn: () => api.delete_plate({ id: plate.id }),
    meta: { errorTitle: 'Could not delete plate' },
    onSuccess: () => {
      qc.removeQueries({ queryKey: plateKeys.detail(plate.id) })
      toast.success(`Deleted ${plate.label}`)
      void bypassUnsaved(() => navigate('/plates'))
    },
  })
  const exportMap = async () => {
    try {
      const f = await api.export_plate_map({ id: plate.id })
      await saveTextFile(f.filename, f.content)
    } catch (e) {
      toast.error('Could not export the plate map', (e as Error).message)
    }
  }

  const onDraftChange: DraftUpdate = (id, next) =>
    setDrafts((d) => {
      const { [id]: cur, ...rest } = d
      const proposed = typeof next === 'function' ? next(cur) : next
      return proposed ? { ...rest, [id]: proposed } : rest
    })

  const wide = bodySize.width >= 1000
  const grid = (
    <PlatePanel
      detail={detail}
      ladderColor={ladderColor}
      mode={mode}
      onModeChange={setMode}
      locusId={locusId}
      onLocusChange={setLocusId}
      selected={wellLabel}
      onSelect={selectWell}
      drafts={draftIds}
      onStep={(d) => step(problems, d)}
      quality={report}
      measure={measure}
      onMeasureChange={setMeasure}
      highlight={highlight}
    />
  )
  const inspector = (
    <WellInspector
      plateId={plate.id}
      well={well}
      ladder={ladder}
      view={view}
      onViewChange={setView}
      hidden={effectiveHidden}
      onHiddenChange={editing ? setHiddenEdit : setHidden}
      editing={editing}
      onEditingChange={setEditing}
      draft={well ? (drafts[well.id] ?? null) : null}
      onDraftChange={onDraftChange}
      lastChange={lastChange}
      onFitChange={setLastChange}
      qualityBar={report && wellLabel ? <WellQualityBar report={report} well={wellLabel} onShowIssue={showIssue} /> : null}
    />
  )
  const side = (
    <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      <TabsList className="h-8 px-2" aria-label="Well or plate quality">
        <TabsTrigger value="well" className="h-7 text-xs">
          Well{wellLabel ? ` ${wellLabel}` : ''}
        </TabsTrigger>
        <TabsTrigger value="quality" className="h-7 text-xs" data-testid="quality-tab">
          Plate quality
          {qualityView && <QualityIndicator summary={qualityView.summary} compact className="text-2xs" />}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="well" className="flex min-h-0 min-w-0 flex-col data-[state=active]:flex">
        {inspector}
      </TabsContent>
      <TabsContent value="quality" className="flex min-h-0 min-w-0 flex-col data-[state=active]:flex">
        <QualityPanel
          view={qualityView ?? null}
          hasPlateMap={plate.has_plate_map}
          loading={qualityQ.isLoading || (qualityQ.isFetching && !qualityView)}
          selectedIssue={issueKeyOpen}
          onSelectIssue={showIssue}
          onOpenWell={openWell}
        />
      </TabsContent>
    </Tabs>
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="plate-detail" data-plate={plate.label}>
      <header className="shrink-0 border-b border-line bg-surface px-3 pt-2 pb-1.5">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-[15px] font-semibold">{plate.label}</h2>
          <SizingCountsInline counts={plate.sizing} total={plate.well_count} reasons={reasons} />
          <button
            type="button"
            onClick={() => setTab('quality')}
            className="inline-flex min-w-0 items-center rounded px-1 outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent/40"
            title="Show the plate’s quality report"
            data-testid="header-quality"
          >
            <QualityIndicator summary={plate.quality} short />
          </button>
          {sizing && (
            <span className="inline-flex items-center gap-1 text-2xs text-muted">
              <Spinner className="size-3" /> sizing…
            </span>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant={plate.has_plate_map ? 'secondary' : 'primary'}
              onClick={() => setDialog('map')}
              title="Apply a plate-map CSV"
              data-tour="plate-map"
            >
              <MapIcon size={12} /> {plate.has_plate_map ? 'Plate map' : 'Apply plate map'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" disabled={resize.isPending} aria-label="Re-size plate">
                  {resize.isPending ? <Spinner className="size-3" /> : <RefreshCw size={12} />} Re-size <ChevronDown size={11} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setConfirm({ kind: 'resize', ladder: null })}>
                  <RefreshCw /> Re-size all wells with {plate.ladder_label}
                </DropdownMenuItem>
                {ladders.length > 1 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Change ladder and re-size</DropdownMenuLabel>
                    {ladders
                      .filter((l) => l.id !== plate.ladder_id)
                      .map((l) => (
                        <DropdownMenuItem key={l.id} onSelect={() => setConfirm({ kind: 'resize', ladder: l })}>
                          <span className="inline-block size-2.5 rounded-[3px]" style={{ background: `var(--dye-${l.spec.color})` }} />
                          {l.label}
                          <span className="ml-auto pl-3 text-2xs text-faint">{l.spec.base_sizes.length} sizes</span>
                        </DropdownMenuItem>
                      ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label="More plate actions">
                  <MoreHorizontal size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setDialog('run')}>
                  <Activity /> Run conditions…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDialog('map')}>
                  <MapIcon /> Apply plate map…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void exportMap()}>
                  <Download /> {plate.has_plate_map ? 'Export plate map' : 'Download plate-map template'}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!plate.has_plate_map} onSelect={() => setConfirm({ kind: 'clear' })}>
                  <Eraser /> Clear plate map…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem danger onSelect={() => setConfirm({ kind: 'delete' })}>
                  <Trash2 /> Delete plate…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs" data-testid="plate-facts">
          <Fact label="Run">{fmtRunDate(plate.run_date)}</Fact>
          <Fact label="Instrument">{[plate.instrument, plate.instrument_model].filter(Boolean).join(' · ') || '–'}</Fact>
          <Fact label="Ladder">
            {ladder && (
              <span className="mr-1 inline-block size-2 rounded-[2px]" style={{ background: `var(--dye-${ladder.spec.color})` }} />
            )}
            {plate.ladder_label}
          </Fact>
          <Fact label="Wells">{plate.well_count}</Fact>
          <Fact label="Plate map">
            {plate.has_plate_map ? `${plate.run_count.toLocaleString('en-US')} runs, ${detail.loci.length} loci` : 'none'}
          </Fact>
          <Fact label="Source" title={plate.source ?? undefined}>
            <span className="inline-block max-w-48 truncate align-bottom">{plate.source ?? '–'}</span>
          </Fact>
          {manualCount > 0 && <Fact label="Edited by hand">{manualCount} wells</Fact>}
        </div>
        {plate.contaminated_loci.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5 rounded-[5px] bg-danger-soft px-2 py-1 text-xs text-danger" role="alert">
            <TriangleAlert size={13} />
            Negative controls show signal for {plate.contaminated_loci.join(', ')}. Treat these loci on this plate with suspicion; see
            Signal view.
          </div>
        )}
        {health.tone === 'danger' && plate.contaminated_loci.length === 0 && (
          <div className="mt-1.5 text-xs text-danger">
            Many wells did not size ({health.text}). Check the ladder choice or ladder settings, then re-size.
          </div>
        )}
      </header>

      <div ref={bodyRef} className="flex min-h-0 min-w-0 flex-1">
        {bodySize.width === 0 ? null : wide ? (
          <SplitView
            id="plates.wide"
            defaultSize={Math.round(Math.min(560, bodySize.width * 0.42))}
            minSize={360}
            minSecond={480}
            first={grid}
            second={side}
          />
        ) : (
          <SplitView id="plates.narrow" direction="vertical" defaultSize={300} minSize={200} minSecond={260} first={grid} second={side} />
        )}
      </div>

      <PlateMapDialog plate={plate} open={dialog === 'map'} onOpenChange={(o) => setDialog(o ? 'map' : null)} />
      <RunConditionsDialog plate={plate} open={dialog === 'run'} onOpenChange={(o) => setDialog(o ? 'run' : null)} />
      <ConfirmDialog
        open={confirm?.kind === 'resize'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm?.kind === 'resize' && confirm.ladder
            ? `Re-size ${plate.label} with ${confirm.ladder.label}?`
            : `Re-size every well of ${plate.label}?`
        }
        description={
          <>
            Fits the ladder of all {plate.well_count} wells again
            {confirm?.kind === 'resize' && confirm.ladder
              ? ` using ${confirm.ladder.label} (${confirm.ladder.spec.color})`
              : ` with ${plate.ladder_label}`}
            .
            {manualCount > 0 && (
              <b className="text-fg">
                {' '}
                The {manualCount} hand-edited ladder{manualCount === 1 ? '' : 's'} will be replaced by automatic fits.
              </b>
            )}
          </>
        }
        confirmLabel="Re-size"
        onConfirm={() => {
          if (confirm?.kind === 'resize') resize.mutate(confirm.ladder?.id ?? null)
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === 'clear'}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive
        title={`Clear the plate map of ${plate.label}?`}
        description={`Removes all ${plate.run_count.toLocaleString('en-US')} runs (well × locus × sample assignments) of this plate. Samples stay in the workspace.`}
        confirmLabel="Clear map"
        onConfirm={() => clear.mutateAsync()}
      />
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive
        title={`Delete plate ${plate.label}?`}
        description="Its wells, traces and plate-map runs are removed from the workspace. Samples stay. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => del.mutateAsync()}
      />
    </div>
  )
}
