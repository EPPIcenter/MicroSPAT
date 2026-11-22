/** The plate grid with its Ladder / Signal / Quality mode switch and legend. */
import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, Info, ShieldCheck } from 'lucide-react'
import { Tooltip } from '@/components/ui/Tooltip'
import type { Color, PlateDetail, PlateQuality } from '@/api/bindings'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/ProgressBar'
import { PlateGrid, DEFAULT_SIGNAL_SCALE, signalColor } from '@/components/PlateGrid'
import { IconButton } from '@/components/ui/IconButton'
import { SelectInput } from '@/components/form/fields'
import { fmtRfu } from '@/lib/format'
import { useElementSize } from '@/plot/canvas'
import { cn } from '@/lib/cn'
import { countSizing, ladderWells, locusStats, MARKER, signalDyes, signalWells } from './model/status'
import { measureScale, QUALITY_MEASURES, qualityWells, type MeasureScale, type QualityMeasure } from './model/quality'
import { CornerSwatch, LegendItem, Segmented, SizingLegend } from './parts'
import type { PlateMode } from '@/stores/preferences'
import { useCheckQuality } from './useCheckQuality'

export type { PlateMode } from '@/stores/preferences'

export function PlatePanel({
  detail,
  ladderColor,
  mode,
  onModeChange,
  locusId,
  onLocusChange,
  selected,
  onSelect,
  drafts,
  onStep,
  quality,
  measure,
  onMeasureChange,
  highlight,
}: {
  detail: PlateDetail
  ladderColor: Color | null
  mode: PlateMode
  onModeChange: (m: PlateMode) => void
  locusId: number | null
  onLocusChange: (id: number | null) => void
  selected: string | null
  onSelect: (well: string) => void
  drafts: ReadonlySet<number>
  /** Step to the previous / next well that needs a look. */
  onStep: (dir: -1 | 1) => void
  /** The plate's quality report; null when it has none (not checked), undefined while loading. */
  quality: PlateQuality | null | undefined
  measure: QualityMeasure
  onMeasureChange: (m: QualityMeasure) => void
  /** Wells outlined on the grid: those of the selected quality issue, and its title. */
  highlight: { wells: readonly string[]; title: string } | null
}) {
  const highlighted = highlight?.wells ?? NONE
  const scale = useMemo(() => (quality ? measureScale(measure, quality) : null), [quality, measure])
  const wells = useMemo(
    () =>
      mode === 'ladder'
        ? ladderWells(detail.wells, { drafts })
        : mode === 'signal'
          ? signalWells(detail, { ladderColor, locusId })
          : quality && scale
            ? qualityWells(quality, scale)
            : {},
    [mode, detail, drafts, ladderColor, locusId, quality, scale],
  )
  const counts = useMemo(() => countSizing(detail.wells), [detail.wells])
  const manual = detail.wells.filter((w) => w.manual_ladder).length
  const format = detail.plate.plate_size === 384 ? 384 : 96
  const problems = counts.flagged + counts.unusable + counts.failed
  const sel = useMemo(() => (selected ? [selected] : []), [selected])
  const [bodyRef, body] = useElementSize<HTMLDivElement>()
  const rows = format === 384 ? 16 : 8
  const cols = format === 384 ? 24 : 12
  // Height the grid needs at this width (PlateGrid: 18 px headers, 2 px gaps),
  // capped at a comfortable cell size; leftover height goes to the locus table.
  const cell = Math.min(42, (body.width - 18 - 2) / cols - 2)
  const legendH = (mode === 'quality' ? 48 : 40) + (highlight?.wells.length ? 18 : 0)
  const gridH = Math.max(120, Math.min(body.height - legendH, 18 + 2 + rows * (cell + 2)))
  const spare = body.height - gridH - legendH
  const stats = useMemo(() => locusStats(detail), [detail])

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface" aria-label="Plate">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-2">
        <Segmented
          label="Plate view"
          value={mode}
          onChange={onModeChange}
          options={[
            { value: 'ladder', label: 'Ladder', title: 'Sizing status and quality per well (L)' },
            { value: 'signal', label: 'Signal', title: 'Signal strength per dye in the loci’s size ranges (S)' },
            { value: 'quality', label: 'Quality', title: 'Color wells by a quality measure: ladder height, signal, noise or spectral separation (Q)' },
          ]}
        />
        {mode === 'quality' && (
          <SelectInput
            aria-label="Quality measure"
            className="h-6 w-40 text-xs"
            value={measure}
            onChange={(v) => onMeasureChange(v as QualityMeasure)}
            options={QUALITY_MEASURES.map((m) => ({ value: m.value, label: m.label }))}
          />
        )}
        {mode === 'signal' && detail.loci.length > 0 && (
          <SelectInput
            aria-label="Locus"
            className="h-6 w-40 text-xs"
            value={locusId == null ? 'all' : String(locusId)}
            onChange={(v) => onLocusChange(v === 'all' ? null : Number(v))}
            options={[
              { value: 'all', label: 'All loci, per dye' },
              ...detail.loci.map((l) => ({ value: String(l.locus_id), label: `${l.label} (${l.color})${l.contaminated ? ' · contaminated' : ''}` })),
            ]}
          />
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <span className="mr-1 text-2xs text-muted">{problems ? `${problems} to check` : 'all wells sized'}</span>
          <IconButton label="Previous well to check" shortcut="P" size="icon-sm" disabled={!problems} onClick={() => onStep(-1)}>
            <ChevronLeft size={14} />
          </IconButton>
          <IconButton label="Next well to check" shortcut="N" size="icon-sm" disabled={!problems} onClick={() => onStep(1)}>
            <ChevronRight size={14} />
          </IconButton>
        </div>
      </div>
      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-1.5 px-3 pt-2 pb-2">
        <div className="flex shrink-0 flex-col" style={{ height: gridH }}>
        <PlateGrid
          className="min-h-0 flex-1"
          format={format}
          wells={wells}
          mode={mode === 'signal' ? 'signal' : 'status'}
          selected={sel}
          selectionMode="single"
          onSelectionChange={(w) => w[0] && onSelect(w[0])}
          showLegend={false}
          highlighted={highlighted}
          highlightLabel="named by the selected quality issue"
          ariaLabel={`Plate ${detail.plate.label}, ${mode} view`}
        />
        </div>
        {mode === 'ladder' ? (
          <SizingLegend counts={counts} manual={manual} drafts={drafts.size} />
        ) : mode === 'signal' ? (
          <SignalLegend detail={detail} ladderColor={ladderColor} locusId={locusId} />
        ) : (
          <QualityLegend plateId={detail.plate.id} scale={scale} loading={quality === undefined} />
        )}
        {highlight && highlight.wells.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 text-2xs text-muted" data-testid="highlight-note">
            <span aria-hidden className="inline-block size-2.5 rounded-[2px] outline-2 outline-offset-0 outline-fg outline-dashed" />
            Outlined: {highlight.wells.join(', ')} ({highlight.title})
          </div>
        )}
        {spare > 90 && stats.length > 0 && (
          <LocusTable
            stats={stats}
            selected={mode === 'signal' ? locusId : null}
            onSelect={(id) => {
              onModeChange('signal')
              onLocusChange(id === locusId && mode === 'signal' ? null : id)
            }}
          />
        )}
      </div>
    </section>
  )
}

const NONE: readonly string[] = []

function QualityLegend({ plateId, scale, loading }: { plateId: number; scale: MeasureScale | null; loading: boolean }) {
  const { check, busy } = useCheckQuality()
  if (!scale) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2 text-2xs text-muted" data-testid="quality-legend" data-measure="none">
        {loading ? (
          <Spinner className="size-3" />
        ) : (
          <>
            This plate’s quality was not checked yet.
            <Button size="sm" onClick={() => check([plateId])} disabled={busy}>
              {busy ? <Spinner className="size-3" /> : <ShieldCheck size={12} />} Check quality
            </Button>
          </>
        )}
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-0.5 text-2xs text-muted" data-testid="quality-legend" data-measure={scale.measure}>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5">
        <span className="inline-flex items-center gap-1 font-medium text-fg">
          {scale.title}
          <Tooltip content={<span className="block max-w-72">{scale.explanation}</span>}>
            <button type="button" className="rounded text-faint outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40" aria-label={`About this measure: ${scale.explanation}`}>
              <Info size={11} />
            </button>
          </Tooltip>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="num">{scale.from}</span>
          <span aria-hidden className="h-2 w-24 rounded-full" style={{ background: `linear-gradient(to right, ${scale.gradient.join(', ')})` }} />
          <span className="num">{scale.to}</span>
        </span>
        <LegendItem swatch={<span className="grid size-2.5 place-items-center rounded-[2px] bg-[var(--scale-none)] text-[8px] leading-none font-bold text-white">!</span>} label="flagged by the quality check" />
        <LegendItem swatch={<span className="inline-block size-2.5 rounded-[2px] bg-surface-3" />} label="no data" />
      </div>
      <p className="max-w-full truncate text-center" data-testid="quality-legend-note">
        {scale.short}
      </p>
    </div>
  )
}

function SignalLegend({ detail, ladderColor, locusId }: { detail: PlateDetail; ladderColor: Color | null; locusId: number | null }) {
  const s = DEFAULT_SIGNAL_SCALE
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => s.none * Math.pow(s.offscale / s.none, t))
  const dyes = locusId == null ? signalDyes(detail, ladderColor) : []
  const contaminated = detail.loci.filter((l) => l.contaminated)
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-2xs text-muted">
      <span className="inline-flex items-center gap-1.5">
        none
        <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(to right, ${stops.map((v) => signalColor(v, s)).join(', ')})` }} />
        off-scale
        <span className="text-faint">
          (good {fmtRfu(s.good)}–{fmtRfu(s.strong)} RFU)
        </span>
      </span>
      <LegendItem swatch={<span className="inline-block size-2.5 rounded-[2px] bg-surface-3" />} label="no data" />
      {dyes.length > 1 && (
        <span className="inline-flex items-center gap-1" title="Each well is split into one stripe per dye, in this order">
          stripes
          {dyes.map((d) => (
            <span key={d} className="inline-block h-2.5 w-1.5 rounded-[1px]" style={{ background: `var(--dye-${d})` }} title={d} />
          ))}
        </span>
      )}
      <LegendItem swatch={<CornerSwatch color={MARKER.control} />} label="negative control" />
      <LegendItem
        swatch={<CornerSwatch color={MARKER.contaminated} />}
        label={contaminated.length ? `contaminated: ${contaminated.map((l) => l.label).join(', ')}` : 'contaminated'}
      />
      {!detail.plate.has_plate_map && <span className="text-warn">No plate map: showing each dye’s whole sized range</span>}
    </div>
  )
}

function LocusTable({ stats, selected, onSelect }: { stats: ReturnType<typeof locusStats>; selected: number | null; onSelect: (id: number) => void }) {
  return (
    <div className="mt-2 min-h-0 flex-1 overflow-auto border-t border-line pt-2">
      <table className="w-full text-xs" aria-label="Signal per locus">
        <thead className="text-2xs font-semibold tracking-wide text-faint uppercase">
          <tr>
            <th className="px-1.5 py-1 text-left font-semibold">Locus</th>
            <th className="px-1.5 py-1 text-right font-semibold" title="Median of the highest signal in the locus range, sized wells">Median RFU</th>
            <th className="px-1.5 py-1 text-right font-semibold" title="Runs with no signal (under 100 RFU)">No signal</th>
            <th className="px-1.5 py-1 text-right font-semibold" title="Runs at or above 30,000 RFU">Off-scale</th>
            <th className="px-1.5 py-1 text-right font-semibold" title="Runs in wells whose ladder failed">Unsized</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((l) => (
            <tr
              key={l.locusId}
              onClick={() => onSelect(l.locusId)}
              className={cn('cursor-pointer border-t border-line/60 hover:bg-surface-2', selected === l.locusId && 'bg-accent-soft')}
              title="Show this locus in the Signal view"
            >
              <td className="px-1.5 py-1">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-[2px]" style={{ background: `var(--dye-${l.color})` }} />
                  <span className="font-medium">{l.label}</span>
                  {l.contaminated && <span className="text-2xs text-danger">contaminated</span>}
                </span>
              </td>
              <td className="num px-1.5 py-1 text-right">
                <span className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: signalColor(l.median) }} />
                {l.median == null ? '–' : fmtRfu(l.median)}
              </td>
              <td className={cn('num px-1.5 py-1 text-right', l.none ? 'text-danger' : 'text-faint')}>{l.none}</td>
              <td className={cn('num px-1.5 py-1 text-right', l.offscale ? 'text-warn' : 'text-faint')}>{l.offscale}</td>
              <td className={cn('num px-1.5 py-1 text-right', l.unsized ? 'text-fg' : 'text-faint')}>{l.unsized}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
