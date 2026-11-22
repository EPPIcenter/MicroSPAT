/**
 * PlateGrid: 96/384-well plate map colored by ladder status or signal
 * strength, with mouse and keyboard selection.
 */
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import type { Color } from '@/api/bindings'
import { useElementSize } from '@/plot/canvas'
import { fmtRfu } from '@/lib/format'
import { clickSelect, selectGroup, type SelectionMode, type SelectionState } from '@/lib/selection'
import { allWells, colWells, moveWell, parseWell, PLATE_DIMS, rowLetter, rowWells, wellLabel, wellRect, type PlateFormat } from './layout'
import { DEFAULT_SIGNAL_SCALE, signalColor, STATUS_COLOR, STATUS_LABEL, type SignalScale, type WellStatus } from './colors'

export interface WellDatum {
  /** Ladder sizing result (status mode). */
  status?: WellStatus
  /** Signal in RFU (signal mode, single dye). */
  value?: number | null
  /** Per-dye signal in RFU (signal mode, split well); `undefined` = no data for that dye. */
  dyes?: { color: Color; value: number | null | undefined }[]
  /** Not selectable (e.g. empty well). */
  disabled?: boolean
  /** Shown first in the tooltip, e.g. the sample barcode. */
  label?: string
  /** Extra tooltip lines. */
  detail?: string[]
  /** Fill override (CSS color), e.g. a shade for a state the status palette lacks. */
  color?: string
  /** Glyph override drawn in the well (status mode); `null` hides the default glyph. */
  glyph?: string | null
  /** Corner flag, e.g. a contaminated negative control or a hand-edited ladder. */
  marker?: { color: string; label?: string }
}

export interface PlateGridProps {
  format: PlateFormat
  /** Keyed by 'A01'-style labels. Missing wells render empty. */
  wells: Record<string, WellDatum>
  mode: 'status' | 'signal'
  signalScale?: SignalScale
  selected: readonly string[]
  onSelectionChange: (wells: string[]) => void
  selectionMode?: Exclude<SelectionMode, 'none'>
  /** Double-click or Enter on a well. */
  onWellActivate?: (well: string) => void
  showLegend?: boolean
  /** Wells to point out (outlined), e.g. those an issue names. Independent of the selection. */
  highlighted?: readonly string[]
  /** Read after a highlighted well's name by screen readers. Default "highlighted". */
  highlightLabel?: string
  className?: string
  ariaLabel?: string
}

const HEADER = 18
const LEGEND_H = 26
const GAP = 2

export function PlateGrid({
  format,
  wells,
  mode,
  signalScale = DEFAULT_SIGNAL_SCALE,
  selected,
  onSelectionChange,
  selectionMode = 'multi',
  onWellActivate,
  showLegend = true,
  highlighted,
  highlightLabel = 'highlighted',
  className,
  ariaLabel = 'Plate',
}: PlateGridProps) {
  const { rows, cols } = PLATE_DIMS[format]
  const [boxRef, size] = useElementSize<HTMLDivElement>()
  const [focus, setFocus] = useState<string>(() => selected[0] ?? 'A01')
  const anchor = useRef<string | null>(selected[0] ?? null)
  const [hover, setHover] = useState<{ well: string; x: number; y: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const legendH = showLegend ? LEGEND_H : 0
  const cell = Math.max(
    8,
    Math.floor(Math.min((size.width - HEADER - GAP) / cols - GAP, (size.height - HEADER - legendH - GAP) / rows - GAP)),
  )
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const highlightSet = useMemo(() => new Set(highlighted ?? []), [highlighted])
  const enabled = useCallback((w: string) => !wells[w]?.disabled, [wells])

  const apply = useCallback(
    (next: SelectionState) => {
      anchor.current = next.anchor
      onSelectionChange(next.selected.filter(enabled))
    },
    [onSelectionChange, enabled],
  )
  const state = (): SelectionState => ({ selected, anchor: anchor.current })

  const onCellMouseDown = (well: string, e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    gridRef.current?.focus({ preventScroll: true })
    setFocus(well)
    if (wells[well]?.disabled) return
    apply(clickSelect(state(), well, { shift: e.shiftKey, toggle: e.metaKey || e.ctrlKey }, selectionMode, wellRect))
  }

  const onHeader = (ids: string[], e: React.MouseEvent) => {
    if (selectionMode !== 'multi') return
    gridRef.current?.focus({ preventScroll: true })
    apply(selectGroup(state(), ids.filter(enabled), e.metaKey || e.ctrlKey || e.shiftKey))
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const mv = moves[e.key]
    if (mv) {
      e.preventDefault()
      const next = moveWell(format, focus, mv[0], mv[1])
      setFocus(next)
      if (e.metaKey || e.ctrlKey) return // move focus only
      if (!enabled(next)) return
      apply(clickSelect(state(), next, { shift: e.shiftKey && selectionMode === 'multi' }, selectionMode, wellRect))
      return
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      const p = parseWell(focus) ?? { row: 0, col: 0 }
      setFocus(wellLabel(p.row, e.key === 'Home' ? 0 : cols - 1))
      return
    }
    if (e.key === ' ') {
      e.preventDefault()
      if (enabled(focus)) apply(clickSelect(state(), focus, { toggle: true }, selectionMode, wellRect))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      onWellActivate?.(focus)
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && selectionMode === 'multi') {
      e.preventDefault()
      apply({ selected: allWells(format).filter(enabled), anchor: anchor.current })
      return
    }
    if (e.key === 'Escape') {
      apply({ selected: [], anchor: null })
    }
  }

  const gridW = HEADER + cols * (cell + GAP)
  const hoverDatum = hover ? wells[hover.well] : undefined

  return (
    <div ref={boxRef} className={cn('relative flex min-h-0 min-w-0 flex-col items-center', className)} data-testid="plate-grid">
      <div
        ref={gridRef}
        role="grid"
        aria-label={ariaLabel}
        aria-multiselectable={selectionMode === 'multi'}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHover(null)}
        className="rounded-sm outline-offset-4 select-none"
        style={{
          display: 'grid',
          gridTemplateColumns: `${HEADER}px repeat(${cols}, ${cell}px)`,
          gridTemplateRows: `${HEADER}px repeat(${rows}, ${cell}px)`,
          gap: GAP,
          width: gridW,
        }}
      >
        <div aria-hidden />
        {Array.from({ length: cols }, (_, c) => (
          <button
            key={`c${c}`}
            type="button"
            tabIndex={-1}
            onClick={(e) => onHeader(colWells(format, c), e)}
            className="num text-center text-[10px] leading-[18px] text-faint hover:text-fg"
            title={`Select column ${c + 1}`}
          >
            {c + 1}
          </button>
        ))}
        {Array.from({ length: rows }, (_, r) => (
          <RowFragment
            key={`r${r}`}
            r={r}
            cols={cols}
            cell={cell}
            wells={wells}
            mode={mode}
            scale={signalScale}
            selectedSet={selectedSet}
            highlightSet={highlightSet}
            highlightLabel={highlightLabel}
            focus={focus}
            onHeader={(e) => onHeader(rowWells(format, r), e)}
            onCellMouseDown={onCellMouseDown}
            onCellDoubleClick={(w) => onWellActivate?.(w)}
            onHover={(well, el) => {
              const box = boxRef.current?.getBoundingClientRect()
              const rr = el.getBoundingClientRect()
              if (box) setHover({ well, x: rr.right - box.left, y: rr.top - box.top })
            }}
          />
        ))}
      </div>
      {showLegend && <Legend mode={mode} wells={wells} scale={signalScale} />}
      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 max-w-60 rounded border border-line bg-surface/95 px-2 py-1 text-2xs leading-4 shadow-md"
          style={{
            left: Math.min(hover.x + 6, Math.max(0, size.width - 200)),
            top: Math.max(0, hover.y - 4),
          }}
        >
          <div className="font-semibold text-fg">
            {hover.well}
            {hoverDatum?.label ? ` · ${hoverDatum.label}` : ''}
          </div>
          {!hoverDatum && <div className="text-muted">No data</div>}
          {hoverDatum?.status && mode === 'status' && <div className="text-muted">{STATUS_LABEL[hoverDatum.status]}</div>}
          {mode === 'signal' && hoverDatum?.value !== undefined && <div className="text-muted">signal {fmtRfu(hoverDatum.value)} RFU</div>}
          {mode === 'signal' &&
            hoverDatum?.dyes?.map((d) => (
              <div key={d.color} className="flex items-center gap-1.5 text-muted">
                <span className="size-2 rounded-[2px]" style={{ background: `var(--dye-${d.color})` }} />
                {d.color}{' '}
                <span className="num ml-auto pl-2 text-fg">
                  {d.value === undefined ? 'no data' : d.value === null ? 'none' : fmtRfu(d.value)}
                </span>
              </div>
            ))}
          {hoverDatum?.marker?.label && (
            <div className="flex items-center gap-1.5 text-fg">
              <span className="size-2 rounded-[2px]" style={{ background: hoverDatum.marker.color }} />
              {hoverDatum.marker.label}
            </div>
          )}
          {hoverDatum?.detail?.map((l, i) => (
            <div key={i} className="text-muted">
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface RowProps {
  r: number
  cols: number
  cell: number
  wells: Record<string, WellDatum>
  mode: 'status' | 'signal'
  scale: SignalScale
  selectedSet: Set<string>
  highlightSet: Set<string>
  highlightLabel: string
  focus: string
  onHeader: (e: React.MouseEvent) => void
  onCellMouseDown: (well: string, e: React.MouseEvent) => void
  onCellDoubleClick: (well: string) => void
  onHover: (well: string, el: HTMLElement) => void
}

function RowFragment(p: RowProps) {
  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        onClick={p.onHeader}
        className="text-center text-[10px] font-medium text-faint hover:text-fg"
        style={{ lineHeight: `${p.cell}px` }}
        title={`Select row ${rowLetter(p.r)}`}
      >
        {rowLetter(p.r)}
      </button>
      {Array.from({ length: p.cols }, (_, c) => {
        const w = wellLabel(p.r, c)
        return (
          <Well
            key={w}
            well={w}
            datum={p.wells[w]}
            mode={p.mode}
            scale={p.scale}
            size={p.cell}
            selected={p.selectedSet.has(w)}
            highlighted={p.highlightSet.has(w)}
            highlightLabel={p.highlightLabel}
            focused={p.focus === w}
            onMouseDown={p.onCellMouseDown}
            onDoubleClick={p.onCellDoubleClick}
            onHover={p.onHover}
          />
        )
      })}
    </>
  )
}

const Well = memo(function Well({
  well,
  datum,
  mode,
  scale,
  size,
  selected,
  highlighted,
  highlightLabel,
  focused,
  onMouseDown,
  onDoubleClick,
  onHover,
}: {
  well: string
  datum: WellDatum | undefined
  mode: 'status' | 'signal'
  scale: SignalScale
  size: number
  selected: boolean
  highlighted: boolean
  highlightLabel: string
  focused: boolean
  onMouseDown: (well: string, e: React.MouseEvent) => void
  onDoubleClick: (well: string) => void
  onHover: (well: string, el: HTMLElement) => void
}) {
  const disabled = !datum || datum.disabled
  const radius = size >= 20 ? 4 : 2
  let body: React.ReactNode
  if (mode === 'signal' && datum?.dyes && datum.dyes.length > 0) {
    body = (
      <div className="flex h-full w-full overflow-hidden" style={{ borderRadius: radius - 1 }}>
        {datum.dyes.map((d) => (
          <div key={d.color} className="relative h-full flex-1" style={{ background: signalColor(d.value, scale) }}>
            <div className="absolute inset-x-0 top-0 h-1 border-b border-black/10" style={{ background: `var(--dye-${d.color})` }} />
          </div>
        ))}
      </div>
    )
  } else {
    const bg =
      datum?.color ??
      (mode === 'signal' ? signalColor(datum?.value, scale) : datum?.status ? STATUS_COLOR[datum.status] : 'var(--c-surface-3)')
    const defaultGlyph = datum?.status === 'failed' ? '×' : datum?.status === 'flagged' ? '!' : null
    const glyph = mode === 'status' && size >= 16 ? (datum?.glyph !== undefined ? datum.glyph : defaultGlyph) : null
    body = (
      <div
        className="grid h-full w-full place-items-center text-[11px] leading-none font-bold text-white/90"
        style={{ background: bg, borderRadius: radius - 1 }}
      >
        {glyph}
      </div>
    )
  }
  return (
    <div
      role="gridcell"
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      aria-label={`${well}${datum?.label ? ` ${datum.label}` : ''}${highlighted ? `, ${highlightLabel}` : ''}`}
      data-well={well}
      data-highlighted={highlighted || undefined}
      onMouseDown={(e) => onMouseDown(well, e)}
      onDoubleClick={() => onDoubleClick(well)}
      onMouseEnter={(e) => onHover(well, e.currentTarget)}
      className={cn(
        'relative cursor-pointer p-px',
        disabled && 'cursor-default opacity-40',
        selected && 'ring-2 ring-accent ring-offset-1 ring-offset-[var(--c-surface)]',
        focused && !selected && 'ring-1 ring-fg/50',
      )}
      style={{
        borderRadius: radius,
        ...(highlighted ? { outline: '2px dashed var(--c-fg)', outlineOffset: selected ? 3 : 1 } : null),
      }}
    >
      {body}
      {datum?.marker && (
        <span
          aria-hidden
          data-marker
          className="pointer-events-none absolute top-px right-px"
          style={{
            width: Math.max(5, Math.round(size * 0.38)),
            height: Math.max(5, Math.round(size * 0.38)),
            background: datum.marker.color,
            clipPath: 'polygon(0 0, 100% 0, 100% 100%)',
            borderTopRightRadius: radius - 1,
            boxShadow: '0 0 0 1px var(--c-surface)',
          }}
        />
      )}
    </div>
  )
})

function Legend({ mode, wells, scale }: { mode: 'status' | 'signal'; wells: Record<string, WellDatum>; scale: SignalScale }) {
  if (mode === 'status') {
    const counts: Record<WellStatus, number> = { ok: 0, flagged: 0, failed: 0, empty: 0 }
    for (const w of Object.values(wells)) if (w.status) counts[w.status]++
    return (
      <div className="mt-2 flex h-4 items-center gap-3 text-2xs text-muted">
        {(['ok', 'flagged', 'failed'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="size-2.5 rounded-[2px]" style={{ background: STATUS_COLOR[s] }} />
            {STATUS_LABEL[s]} <span className="num text-fg">{counts[s]}</span>
          </span>
        ))}
      </div>
    )
  }
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => scale.none * Math.pow(scale.offscale / scale.none, t))
  return (
    <div className="mt-2 flex h-4 items-center gap-2 text-2xs text-muted">
      <span>none</span>
      <span
        className="h-2 w-40 rounded-full"
        style={{ background: `linear-gradient(to right, ${stops.map((v) => signalColor(v, scale)).join(', ')})` }}
      />
      <span>off-scale</span>
      <span className="text-faint">
        (good {fmtRfu(scale.good)}–{fmtRfu(scale.strong)} RFU)
      </span>
    </div>
  )
}
