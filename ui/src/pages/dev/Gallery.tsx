/**
 * /dev/gallery: every reusable component with realistic mock data. Callbacks
 * are logged to the panel at the bottom right and to `window.__galleryEvents`
 * (used by the Playwright checks in e2e/).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, FileText, Inbox, MoreHorizontal, Pencil, Settings2, Trash2 } from 'lucide-react'
import type { Bin, Color } from '@/api/bindings'
import { rpc, saveTextFile } from '@/api/transport'
import { cn } from '@/lib/cn'
import { toast } from '@/stores/toasts'
import { usePlotTheme } from '@/plot/theme'
import { prepareCanvas } from '@/plot/canvas'
import { TraceViewer, drawPeakMarker, PEAK_STATE_LABEL, type LadderMarker, type PeakState, type TraceClick, type TracePeak } from '@/components/TraceViewer'
import { allWells, PlateGrid } from '@/components/PlateGrid'
import { BinPlot } from '@/components/BinPlot'
import { ArtifactPlot } from '@/components/ArtifactPlot'
import { DataTable, type DataColumn } from '@/components/DataTable'
import { ParameterForm } from '@/components/form/ParameterForm'
import { CheckboxField, NumberField, SelectField, TextField, ToggleField } from '@/components/form/fields'
import { genotypingParams, ladderParams, scanningParams } from '@/params/schemas'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Badge, DyeChip, StatusChip } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Dialog } from '@/components/ui/Dialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/Menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { SplitView } from '@/components/ui/SplitView'
import { EmptyState } from '@/components/ui/EmptyState'
import { FileDropZone } from '@/components/ui/FileDropZone'
import { ProgressBar, Spinner } from '@/components/ui/ProgressBar'
import { Kbd } from '@/components/ui/Kbd'
import { ListDetailLayout, Page, PageHeader, Pane, PlotWorkspace, TabbedDetail } from '@/layouts/layouts'
import {
  DEMO_BINS,
  DEMO_LOCI,
  makeArtifactData,
  makeBinPoints,
  makeOverlays,
  makePlate,
  makeSampleRows,
  makeWell,
  rng,
  type MockSampleRow,
} from '@/mock/data'
import { CrosstalkTable, ControlsTable, IssueList, issueKey, LimitsLegend, PullUpMatrix, QualityIndicator } from '@/features/plates/QualityPanel'
import { mockQualityReport } from '@/features/plates/mockQuality'
import { measureScale, qualityWells, QUALITY_MEASURES, type QualityMeasure } from '@/features/plates/model/quality'

// ------------------------------------------------------------------ event log

interface LoggedEvent {
  t: number
  name: string
  detail: unknown
}

declare global {
  interface Window {
    __galleryEvents?: LoggedEvent[]
  }
}

function useEventLog() {
  const [events, setEvents] = useState<LoggedEvent[]>([])
  const log = useCallback((name: string, detail: unknown) => {
    const e = { t: Date.now(), name, detail }
    window.__galleryEvents = [...(window.__galleryEvents ?? []), e]
    setEvents((s) => [e, ...s].slice(0, 30))
  }, [])
  return { events, log }
}

const SECTIONS = [
  ['colors', 'Colors'],
  ['trace', 'TraceViewer'],
  ['ladder', 'Ladder editing'],
  ['plate', 'PlateGrid'],
  ['quality', 'Plate quality'],
  ['bins', 'BinPlot'],
  ['artifact', 'ArtifactPlot'],
  ['table', 'DataTable'],
  ['forms', 'Forms'],
  ['primitives', 'Primitives'],
  ['layouts', 'Layouts'],
] as const

export default function Gallery() {
  const { events, log } = useEventLog()
  return (
    <Page header={<PageHeader title="Component gallery" subtitle="Mock data · callbacks are logged bottom right" />}>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-40 shrink-0 overflow-auto border-r border-line bg-surface py-2 lg:block">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="block px-4 py-1 text-xs text-muted hover:text-fg">
              {label}
            </a>
          ))}
        </aside>
        <div className="min-h-0 flex-1 overflow-auto" id="gallery-scroll">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-5 pb-40">
            <ColorsSection />
            <TraceSection log={log} />
            <LadderSection log={log} />
            <PlateSection log={log} />
            <QualitySection log={log} />
            <BinSection log={log} />
            <ArtifactSection log={log} />
            <TableSection log={log} />
            <FormsSection log={log} />
            <PrimitivesSection log={log} />
            <LayoutsSection />
          </div>
        </div>
      </div>
      <EventLog events={events} />
    </Page>
  )
}

function EventLog({ events }: { events: LoggedEvent[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="fixed right-3 bottom-3 z-30 w-80 rounded-lg border border-line bg-surface/95 shadow-xl backdrop-blur" data-testid="event-log">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex h-8 w-full items-center gap-2 px-3 text-xs font-semibold">
        Callback log <span className="num font-normal text-muted">{events.length}</span>
        <ChevronDown size={13} className={cn('ml-auto transition-transform', !open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="max-h-40 overflow-auto border-t border-line px-3 py-1.5 font-mono text-[10.5px] leading-4">
          {events.length === 0 && <li className="text-faint">Interact with a component…</li>}
          {events.map((e, i) => (
            <li key={e.t + '-' + i} className="truncate">
              <span className="text-accent">{e.name}</span> <span className="text-muted">{summarize(e.detail)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function summarize(d: unknown): string {
  try {
    return JSON.stringify(d, (_k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v))
  } catch {
    return String(d)
  }
}

function Section({ id, title, children, description }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} data-section={id} className="scroll-mt-4 rounded-lg border border-line bg-surface shadow-xs">
      <div className="border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

type Log = (name: string, detail: unknown) => void

// ------------------------------------------------------------------ colors

function ColorsSection() {
  const t = usePlotTheme()
  const states: PeakState[] = ['called', 'manual-on', 'manual-off', 'artifact', 'flagged', 'below', 'candidate']
  return (
    <Section
      id="colors"
      title="Dye colors and peak states"
      description="Dyes are tuned per theme. Red leans crimson and green leans teal so red/green stay apart for deuteranopes; yellow is darkened on light backgrounds. Peak states differ by shape, not only color."
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          {(['blue', 'green', 'yellow', 'red', 'orange'] as Color[]).map((c) => (
            <div key={c} className="flex items-center gap-3 rounded-md bg-[var(--plot-bg)] px-3 py-1.5 ring-1 ring-line">
              <svg width="120" height="18" aria-hidden>
                <path d="M0 14 L18 13 L26 3 L34 14 L60 13 L66 8 L72 14 L120 14" fill="none" stroke={`var(--dye-${c})`} strokeWidth="1.6" />
              </svg>
              <DyeChip color={c} />
              <span className="ml-auto font-mono text-2xs text-muted">{t.dyes[c]}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {states.map((s) => (
            <div key={s} className="flex items-center gap-2 rounded-md bg-[var(--plot-bg)] px-2 py-1.5 text-xs ring-1 ring-line">
              <MarkerSwatch state={s} />
              {PEAK_STATE_LABEL[s]}
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

function MarkerSwatch({ state }: { state: PeakState }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const t = usePlotTheme()
  useEffect(() => {
    if (!ref.current) return
    const ctx = prepareCanvas(ref.current, { width: 22, height: 22, dpr: window.devicePixelRatio || 1 })
    if (ctx) drawPeakMarker(ctx, t, state, 11, 11, t.dyes.blue)
  }, [t, state])
  return <canvas ref={ref} style={{ width: 22, height: 22 }} />
}

// ------------------------------------------------------------------ trace

function TraceSection({ log }: { log: Log }) {
  const well = useMemo(() => makeWell(7), [])
  const overlays = useMemo(() => makeOverlays('blue', 3), [])
  const [mode, setMode] = useState<'bp' | 'index'>('bp')
  const [showOverlays, setShowOverlays] = useState(true)
  const [allDyes, setAllDyes] = useState(false)
  const [yMax, setYMax] = useState<number | null>(null)
  const [manual, setManual] = useState<Record<string, 'on' | 'off'>>({})
  const locus = DEMO_LOCI[0]!

  const series = useMemo(() => {
    const own = allDyes ? well.series.filter((s) => s.id !== 'orange') : well.series.filter((s) => s.id === 'blue')
    return showOverlays && !allDyes ? [...own, ...overlays] : own
  }, [well, overlays, showOverlays, allDyes])
  const peaks = useMemo<TracePeak[]>(
    () =>
      well.peaks
        .filter((p) => allDyes || p.seriesId === 'blue')
        .map((p) => {
          const m = manual[String(p.id)]
          if (!m) return p
          return { ...p, state: m === 'on' ? 'manual-on' : 'manual-off', label: m === 'on' ? (p.label ?? `${Math.round(p.size)}`) : p.label }
        }),
    [well, allDyes, manual],
  )

  return (
    <Section
      id="trace"
      title="TraceViewer — genotyping a mixed sample"
      description={
        <>
          PfPK2 (blue) carries four alleles at unequal heights; 170 sits on the −1 stutter of 174 and is still called. Faded traces are the
          same locus in other wells. Wheel zooms, drag pans, <Kbd>Shift</Kbd>-drag box-zooms, double-click resets, click a peak to toggle its
          call. Keys when focused: <Kbd>←</Kbd> <Kbd>→</Kbd> pan, <Kbd>+</Kbd> <Kbd>−</Kbd> zoom, <Kbd>↑</Kbd> <Kbd>↓</Kbd> y-scale,{' '}
          <Kbd>a</Kbd> auto y, <Kbd>0</Kbd> reset. <Kbd>Alt</Kbd>+wheel scales y.
        </>
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <SegToggle value={mode} onChange={setMode} options={[['bp', 'Base pairs'], ['index', 'Data points']]} />
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={showOverlays} onChange={(e) => setShowOverlays(e.target.checked)} /> Overlays
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={allDyes} onChange={(e) => setAllDyes(e.target.checked)} /> All dyes
        </label>
        <span className="ml-auto text-muted">y: {yMax == null ? 'auto' : `locked at ${Math.round(yMax)} RFU`}</span>
        {yMax != null && (
          <Button size="sm" variant="ghost" onClick={() => setYMax(null)}>
            Auto y
          </Button>
        )}
      </div>
      <TraceViewer
        className="h-[340px] ring-1 ring-line"
        series={series}
        xMode={mode}
        peaks={peaks}
        bins={allDyes ? [] : DEMO_BINS[locus.label]}
        locusRange={allDyes ? null : locus.range}
        threshold={300}
        yMax={yMax}
        onYMaxChange={(y) => {
          setYMax(y)
          log('trace.yMax', y)
        }}
        onXDomainChange={(d) => log('trace.xDomain', d)}
        onPeakClick={(p) => {
          log('trace.peakClick', { id: p.id, size: p.size, height: p.height, state: p.state })
          setManual((m) => {
            const id = String(p.id)
            const cur = m[id]
            const called = p.state === 'called' || p.state === 'manual-on'
            const next = { ...m }
            if (cur) delete next[id]
            else next[id] = called ? 'off' : 'on'
            return next
          })
        }}
        onBackgroundClick={(e: TraceClick) => log('trace.backgroundClick', { x: e.x, bp: e.bp, index: e.index, snapIndex: e.snapIndex })}
      />
    </Section>
  )
}

function LadderSection({ log }: { log: Log }) {
  const well = useMemo(() => makeWell(31), [])
  const orange = well.series.find((s) => s.id === 'orange')!
  const [ladder, setLadder] = useState<LadderMarker[]>(well.ladder)
  const ladderSizes = [35, 50, 75, 100, 139, 150, 160, 200, 250, 300, 340, 350, 400, 450, 490, 500]
  const assigned = ladder.filter((m) => m.size != null).length
  return (
    <Section
      id="ladder"
      title="TraceViewer — manual ladder calling"
      description="Ladder channel on a data-point axis. Click near a peak to add it (snaps to the local maximum); click a marker's peak again to remove it. Amber: outlier, grey: not assigned."
    >
      <div className="mb-2 flex items-center gap-3 text-xs">
        <StatusChip status={assigned === ladderSizes.length ? 'ok' : 'flagged'} label={`${assigned}/${ladderSizes.length} peaks`} />
        <span className="text-muted">SQ 0.42</span>
        <Button size="sm" className="ml-auto" onClick={() => setLadder(well.ladder)}>
          Reset peaks
        </Button>
      </div>
      <TraceViewer
        className="h-[260px] ring-1 ring-line"
        series={[{ ...orange, label: 'LIZ 500' }]}
        xMode="index"
        ladder={ladder}
        defaultXDomain={[1000, 8000]}
        onBackgroundClick={(e) => {
          log('ladder.click', { index: e.index, snapIndex: e.snapIndex, height: e.height })
          setLadder((cur) => {
            const hit = cur.find((m) => Math.abs(m.index - e.snapIndex) <= 3)
            if (hit) return cur.filter((m) => m !== hit)
            return [...cur, { index: e.snapIndex, size: null, seriesId: 'orange', status: 'unassigned' as const }].sort((a, b) => a.index - b.index)
          })
        }}
      />
    </Section>
  )
}

function SegToggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div role="radiogroup" className="flex rounded-md border border-line bg-surface-2 p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn('h-5 rounded-[4px] px-2 text-xs text-muted', value === v && 'bg-surface text-fg shadow-xs')}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ plate

function PlateSection({ log }: { log: Log }) {
  const plate96 = useMemo(() => makePlate(96), [])
  const plate384 = useMemo(() => makePlate(384, 9), [])
  const [sel, setSel] = useState<string[]>(['C04'])
  const [sel2, setSel2] = useState<string[]>([])
  const [sel3, setSel3] = useState<string[]>([])
  const splitWells = useMemo(() => plate96, [plate96])
  const singleDye = useMemo(
    () => Object.fromEntries(Object.entries(plate384).map(([k, v]) => [k, { ...v, dyes: undefined }])),
    [plate384],
  )
  return (
    <Section
      id="plate"
      title="PlateGrid"
      description="Click selects, Cmd/Ctrl-click toggles, Shift-click selects a rectangle, row/column headers select lines. Arrows move (Shift extends), Space toggles, Enter opens, Cmd/Ctrl+A selects all."
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-medium text-muted">Ladder sizing · {sel.join(', ') || 'none selected'}</div>
          <PlateGrid
            className="h-[300px]"
            format={96}
            wells={plate96}
            mode="status"
            selected={sel}
            onSelectionChange={(s) => {
              setSel(s)
              log('plate.select', s)
            }}
            onWellActivate={(w) => log('plate.activate', w)}
            ariaLabel="Ladder status plate"
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted">Signal per dye (blue · green · yellow)</div>
          <PlateGrid
            className="h-[300px]"
            format={96}
            wells={splitWells}
            mode="signal"
            selected={sel2}
            onSelectionChange={(s) => {
              setSel2(s)
              log('plate2.select', s)
            }}
            ariaLabel="Signal plate"
          />
        </div>
        <div className="xl:col-span-2">
          <div className="mb-1 text-xs font-medium text-muted">384 wells, blue signal</div>
          <PlateGrid
            className="h-[330px]"
            format={384}
            wells={singleDye}
            mode="signal"
            selected={sel3}
            onSelectionChange={(s) => {
              setSel3(s)
              log('plate384.select', s.length)
            }}
            ariaLabel="384 plate"
          />
        </div>
      </div>
    </Section>
  )
}

// ------------------------------------------------------------------ quality

function QualitySection({ log }: { log: Log }) {
  const report = useMemo(() => {
    const r = rng(5)
    const wells = allWells(96).map((label) => {
      const failed = r.next() < 0.03
      return { label, sized: !failed, sizingQuality: failed ? null : 0.1, signal: failed ? { blue: 60, green: 50, yellow: 40 } : { blue: 3000 + r.next() * 9000, green: 1500 + r.next() * 4000, yellow: 800 + r.next() * 3000 } }
    })
    return mockQualityReport(wells, {
      seed: 5,
      unseparated: ['F06'],
      pullUp: { 'blue>green': 0.14 },
      controls: [
        { well: 'H12', locus: 'PfPK2', sample: 'NTC-1', color: 'blue', size: 171.4, height: 1800, peaks: 2, explained_by: null },
        { well: 'H11', locus: 'TA81', sample: 'NTC-2', color: 'green', size: 122.1, height: 240, peaks: 1, explained_by: 'crosstalk' },
      ],
    })
  }, [])
  const [selected, setSelected] = useState<string | null>(null)
  const [measure, setMeasure] = useState<QualityMeasure>('separation')
  const scale = useMemo(() => measureScale(measure, report), [measure, report])
  const wells = useMemo(() => qualityWells(report, scale), [report, scale])
  const issue = report.issues.find((i) => issueKey(i) === selected)
  return (
    <Section
      id="quality"
      title="Plate quality"
      description="Issues worst first (select one to outline its wells), the grid colored by a quality measure, pull-up and crosstalk against the default limits, and negative-control peaks."
    >
      <div className="mb-2 flex flex-wrap gap-4">
        {[null, { problems: 0, warnings: 0, infos: 0, worst: null, outdated: false }, { problems: 2, warnings: 1, infos: 1, worst: 'problem' as const, outdated: false }, { problems: 0, warnings: 1, infos: 0, worst: 'warning' as const, outdated: true }].map((q, i) => (
          <QualityIndicator key={i} summary={q} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <IssueList
          issues={report.issues}
          selected={selected}
          onSelect={(k) => {
            setSelected(k)
            log('quality.issue', k)
          }}
          onOpenWell={(w) => log('quality.well', w)}
        />
        <div className="flex flex-col gap-2">
          <select aria-label="Quality measure" className="h-6 w-48 rounded border border-line bg-surface text-xs" value={measure} onChange={(e) => setMeasure(e.target.value as QualityMeasure)}>
            {QUALITY_MEASURES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <PlateGrid className="h-[260px]" format={96} wells={wells} mode="status" selected={[]} onSelectionChange={() => {}} showLegend={false} highlighted={issue?.wells} ariaLabel="Quality plate" />
          <p className="text-2xs text-muted">
            <b className="text-fg">{scale.title}</b> {scale.from} → {scale.to}. {scale.explanation}
          </p>
          <PullUpMatrix report={report} />
          <CrosstalkTable report={report} />
          <LimitsLegend report={report} />
          <ControlsTable report={report} />
        </div>
      </div>
    </Section>
  )
}

// ------------------------------------------------------------------ bins

function BinSection({ log }: { log: Log }) {
  const data = useMemo(() => makeBinPoints(), [])
  const [bins, setBins] = useState<Bin[]>(data.bins)
  const [selected, setSelected] = useState<number | null>(null)
  const sel = bins.find((b) => b.id === selected)
  return (
    <Section
      id="bins"
      title="BinPlot"
      description={
        <>
          PfPK2 across 700 runs. Low points left of each cluster are −1 stutter. Drag a bin to move it, drag its edge to resize, double-click empty
          space or right-click to add, <Kbd>Del</Kbd> deletes, <Kbd>←</Kbd> <Kbd>→</Kbd> nudge, <Kbd>[</Kbd> <Kbd>]</Kbd> width, <Kbd>Tab</Kbd>{' '}
          next bin.
        </>
      }
    >
      <div className="mb-2 flex items-center gap-3 text-xs">
        <span className="text-muted">{bins.length} bins</span>
        {sel ? (
          <span>
            Selected <b>{sel.label}</b> · {sel.base_size.toFixed(2)} ± {sel.bin_buffer.toFixed(2)} bp · {sel.peak_count} peaks
          </span>
        ) : (
          <span className="text-faint">No bin selected</span>
        )}
        <Button size="sm" className="ml-auto" onClick={() => setBins(data.bins)}>
          Revert
        </Button>
      </div>
      <BinPlot
        className="h-[320px] ring-1 ring-line"
        points={data.points}
        bins={bins}
        selectedId={selected}
        onSelect={(id) => {
          setSelected(id)
          log('bins.select', id)
        }}
        onBinsChange={(next, change) => {
          setBins(next)
          log(`bins.${change.type}`, { id: change.bin.id, label: change.bin.label, base: change.bin.base_size, buffer: change.bin.bin_buffer })
        }}
        locusRange={DEMO_LOCI[0]!.range}
        color="blue"
      />
    </Section>
  )
}

function ArtifactSection({ log }: { log: Log }) {
  const data = useMemo(() => makeArtifactData(), [])
  const [bps, setBps] = useState<number[]>(data.breakpoints)
  return (
    <Section
      id="artifact"
      title="ArtifactPlot"
      description="−4 bp stutter height relative to the parent peak, against parent size. Bands are ±1 and ±2 SD. Double-click adds a breakpoint; double-click a breakpoint (or select it and press Del) removes it."
    >
      <ArtifactPlot
        className="h-[280px] ring-1 ring-line"
        title="−4 bp (−1 repeat)"
        points={data.points}
        segments={data.segments}
        breakpoints={bps}
        onBreakpointsChange={(next, change) => {
          setBps(next)
          log(`artifact.${change.type}`, change.x)
        }}
      />
    </Section>
  )
}

// ------------------------------------------------------------------ table

const SAMPLE_COLUMNS: DataColumn<MockSampleRow>[] = [
  { id: 'barcode', header: 'Barcode', value: (r) => r.barcode, width: 130 },
  { id: 'plate', header: 'Plate', value: (r) => r.plate, width: 90 },
  { id: 'well', header: 'Well', value: (r) => r.well, width: 60 },
  { id: 'moi', header: 'MOI', value: (r) => r.moi, width: 60, align: 'right', description: 'Multiplicity of infection: most alleles at any locus' },
  { id: 'loci', header: 'Loci', value: (r) => r.loci, width: 60, align: 'right' },
  {
    id: 'status',
    header: 'Status',
    value: (r) => r.status,
    cell: (r) => <StatusChip status={r.status} />,
    width: 96,
  },
  { id: 'max', header: 'Max height', value: (r) => r.maxHeight, width: 100, align: 'right' },
  { id: 'notes', header: 'Notes', value: (r) => r.notes, width: 200 },
]

function TableSection({ log }: { log: Log }) {
  const rows = useMemo(() => makeSampleRows(), [])
  const [sel, setSel] = useState<string[]>([])
  return (
    <Section
      id="table"
      title="DataTable"
      description="2,500 rows, virtualized. Click headers to sort, drag header edges to resize, type to filter. Click, Shift-click and Cmd/Ctrl-click select; arrows move; Cmd/Ctrl+C copies the selection as CSV."
    >
      <div className="flex h-[340px] flex-col overflow-hidden rounded-md ring-1 ring-line">
        <DataTable
          data={rows}
          columns={SAMPLE_COLUMNS}
          getRowId={(r) => r.id}
          selected={sel}
          onSelectionChange={(s) => {
            setSel(s)
            log('table.select', s.length > 5 ? `${s.length} rows` : s)
          }}
          onRowActivate={(r) => log('table.activate', r.barcode)}
          filterPlaceholder="Filter samples…"
          ariaLabel="Samples"
          toolbar={
            <Button size="sm" variant="ghost" onClick={() => void saveTextFile('samples.csv', 'barcode\n' + rows.map((r) => r.barcode).join('\n'))}>
              <FileText size={12} /> Export
            </Button>
          }
        />
      </div>
    </Section>
  )
}

// ------------------------------------------------------------------ forms

function FormsSection({ log }: { log: Log }) {
  const [saved, setSaved] = useState<Record<string, number | string | boolean | null>>({ relative_peak_height_limit: 0.05 })
  const [scan, setScan] = useState<Record<string, number | string | boolean | null>>({})
  const [n, setN] = useState<number | null>(1.5)
  const [txt, setTxt] = useState('PfPK2')
  const [color, setColor] = useState('blue')
  const [chk, setChk] = useState(true)
  const [sw, setSw] = useState(false)
  return (
    <Section
      id="forms"
      title="Forms"
      description="ParameterForm renders a schema with help tooltips from the manual, units, validation, dirty markers, Save, Revert (Esc) and Defaults. Number inputs step with ↑/↓ (Shift ×10, Alt ×0.1)."
    >
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_300px]">
        <div className="overflow-hidden rounded-md ring-1 ring-line">
          <Tabs defaultValue="genotyping" className="flex flex-col">
            <TabsList>
              <TabsTrigger value="genotyping">Genotyping</TabsTrigger>
              <TabsTrigger value="scanning">Scanning</TabsTrigger>
              <TabsTrigger value="ladder">Ladder</TabsTrigger>
            </TabsList>
            <TabsContent value="genotyping" className="h-[430px]">
              <ParameterForm
                className="h-full"
                schema={genotypingParams}
                values={saved}
                onSave={async (v, changed) => {
                  await new Promise((r) => setTimeout(r, 400))
                  setSaved(v)
                  log('form.save', changed)
                  toast.success('Parameters saved', `${changed.length} changed`)
                }}
              />
            </TabsContent>
            <TabsContent value="scanning" className="h-[430px]">
              <ParameterForm className="h-full" schema={scanningParams} values={scan} onSave={(v) => setScan(v)} />
            </TabsContent>
            <TabsContent value="ladder" className="h-[430px]">
              <ParameterForm className="h-full" schema={ladderParams} values={{ label: 'LIZ500', base_sizes: '35, 50, 75, 100' }} onSave={() => {}} />
            </TabsContent>
          </Tabs>
        </div>
        <div className="flex flex-col gap-3 rounded-md p-3 ring-1 ring-line">
          <div className="text-2xs font-semibold tracking-wide text-faint uppercase">Single fields</div>
          <NumberField label="Default bin buffer" unit="bp" value={n} onChange={setN} min={0.05} step={0.05} help="Half-width of new bins." error={n != null && n < 0.05 ? 'Must be ≥ 0.05' : null} />
          <TextField label="Locus label" value={txt} onChange={setTxt} error={txt.trim() ? null : 'Required'} />
          <SelectField
            label="Dye"
            value={color}
            onChange={setColor}
            options={(['blue', 'green', 'yellow', 'red', 'orange'] as Color[]).map((c) => ({ value: c, label: <DyeChip color={c} /> }))}
          />
          <CheckboxField label="Create missing samples" value={chk} onChange={setChk} help="Samples named in the plate map but not in the workspace are created." />
          <ToggleField label="Probabilistic calling" value={sw} onChange={setSw} />
        </div>
      </div>
    </Section>
  )
}

// ------------------------------------------------------------------ primitives

function PrimitivesSection({ log }: { log: Log }) {
  const [dialog, setDialog] = useState(false)
  const [progress, setProgress] = useState(0.35)
  const [check, setCheck] = useState(true)
  return (
    <Section id="primitives" title="Primitives">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Group title="Buttons">
          <Button variant="primary">Recalculate</Button>
          <Button>Cancel</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete plate</Button>
          <Button size="sm">Small</Button>
          <IconButton label="Edit" shortcut="E">
            <Pencil size={14} />
          </IconButton>
          <Button disabled>Disabled</Button>
        </Group>
        <Group title="Badges and status">
          <StatusChip status="ok" />
          <StatusChip status="flagged" />
          <StatusChip status="failed" />
          <StatusChip status="running" />
          <StatusChip status="stale" />
          <Badge tone="accent">MOI 3</Badge>
          <Badge>12 loci</Badge>
          <Badge tone="outline">draft</Badge>
          <DyeChip color="yellow" label="POLYa" />
        </Group>
        <Group title="Overlays">
          <Tooltip content="Sizing quality: weighted residual of the ladder fit. Lower is better.">
            <Button size="sm">Tooltip</Button>
          </Tooltip>
          <Dialog
            open={dialog}
            onOpenChange={setDialog}
            trigger={<Button size="sm">Dialog</Button>}
            title="Upload plate map"
            description="CSV with a Well column and one column per locus."
            footer={
              <>
                <Button onClick={() => setDialog(false)}>Cancel</Button>
                <Button variant="primary" onClick={() => setDialog(false)}>
                  Apply
                </Button>
              </>
            }
          >
            <FileDropZone extensions={['csv']} onFiles={(f) => log('dialog.files', f)} hint="96_well_plate_map.csv" />
          </Dialog>
          <ConfirmDialog
            trigger={<Button size="sm" variant="danger-ghost">Confirm…</Button>}
            title="Delete plate 2024-03-11?"
            description="All wells, runs and genotypes from this plate are removed. This cannot be undone."
            confirmLabel="Delete"
            destructive
            onConfirm={async () => {
              await new Promise((r) => setTimeout(r, 500))
              log('confirm.delete', true)
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                Menu <MoreHorizontal size={13} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Plate</DropdownMenuLabel>
              <DropdownMenuItem shortcut="⌘R" onSelect={() => log('menu', 'recalc')}>
                <Settings2 /> Recalculate ladder
              </DropdownMenuItem>
              <DropdownMenuCheckboxItem checked={check} onCheckedChange={(v) => setCheck(v === true)}>
                Show failed wells
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem danger onSelect={() => log('menu', 'delete')}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Group>
        <Group title="Toasts and tasks">
          <Button size="sm" onClick={() => toast.success('Saved', '12 bins updated')}>
            Success
          </Button>
          <Button size="sm" onClick={() => rpc('mock_fail').catch((e: Error) => toast.error('Engine error', e.message))}>
            RPC error
          </Button>
          <Button size="sm" onClick={() => toast.error('Ladder fit failed', 'Well D07: 4 peaks missing')}>
            Error toast
          </Button>
          <Button size="sm" onClick={() => rpc('mock_task').catch(() => {})}>
            Run task
          </Button>
          <Button size="sm" onClick={() => rpc('mock_task', { fail: true, label: 'Genotyping 412 samples' }).catch(() => {})}>
            Failing task
          </Button>
        </Group>
        <Group title="Progress">
          <div className="flex w-full flex-col gap-2">
            <ProgressBar value={progress} label="demo" />
            <ProgressBar value={null} label="indeterminate" />
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={1} step={0.01} value={progress} onChange={(e) => setProgress(+e.target.value)} aria-label="progress" />
              <Spinner />
            </div>
          </div>
        </Group>
        <Group title="File drop zone">
          <FileDropZone multiple extensions={['fsa', 'zip']} title="Drop FSA files or a plate zip" hint="Tauri gives paths; the browser uploads to the dev server" onFiles={(f) => log('files', f)} />
        </Group>
        <Group title="Empty state">
          <div className="w-full rounded-md ring-1 ring-line">
            <EmptyState icon={<Inbox />} title="No plates yet" action={<Button size="sm" variant="primary">Import plate</Button>}>
              Import a zip of FSA files from one CE run.
            </EmptyState>
          </div>
        </Group>
        <Group title="Split view">
          <div className="flex h-36 w-full overflow-hidden rounded-md ring-1 ring-line">
            <SplitView
              defaultSize={140}
              minSize={80}
              minSecond={80}
              first={<div className="p-2 text-xs text-muted">Drag the divider, or focus it and use ←/→</div>}
              second={<div className="bg-surface-2 p-2 text-xs text-muted">Second pane</div>}
            />
          </div>
        </Group>
      </div>
    </Section>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-2xs font-semibold tracking-wide text-faint uppercase">{title}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

// ------------------------------------------------------------------ layouts

function LayoutsSection() {
  const well = useMemo(() => makeWell(7), [])
  const blue = well.series.filter((s) => s.id === 'blue')
  const rows = useMemo(() => makeSampleRows(40), [])
  const [sel, setSel] = useState<string[]>(['3'])
  return (
    <Section id="layouts" title="Page layouts" description="ListDetailLayout + TabbedDetail, and PlotWorkspace, as feature pages will use them.">
      <div className="flex h-[360px] overflow-hidden rounded-md ring-1 ring-line">
        <ListDetailLayout
          id="gallery-demo"
          listWidth={260}
          list={
            <Pane title="Samples" fill>
              <DataTable data={rows} columns={SAMPLE_COLUMNS.slice(0, 3)} getRowId={(r) => r.id} selectionMode="single" selected={sel} onSelectionChange={setSel} hideToolbar />
            </Pane>
          }
          detail={
            <TabbedDetail
              title={rows.find((r) => r.id === sel[0])?.barcode ?? 'Select a sample'}
              subtitle="Mixed infection · MOI 3"
              meta={
                <>
                  <span>Plate 01 · C04</span>
                  <StatusChip status="ok" />
                </>
              }
              actions={<Button size="sm">Export</Button>}
              tabs={[
                {
                  value: 'trace',
                  label: 'Trace',
                  content: (
                    <PlotWorkspace
                      toolbar={<span className="text-xs text-muted">PfPK2 · blue</span>}
                      plot={<TraceViewer className="h-full w-full" series={blue} peaks={well.peaks.filter((p) => p.seriesId === 'blue')} bins={DEMO_BINS.PfPK2} locusRange={DEMO_LOCI[0]!.range} showControls={false} />}
                      side={<div className="p-3 text-xs text-muted">Side panel: selected peak details, parameters…</div>}
                      sideWidth={180}
                    />
                  ),
                },
                { value: 'genotypes', label: 'Genotypes', badge: 4, content: <EmptyState title="Genotypes tab" /> },
              ]}
            />
          }
        />
      </div>
    </Section>
  )
}
