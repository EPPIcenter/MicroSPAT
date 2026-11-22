/**
 * Loci along the size axis, one track per dye. Loci that overlap on the same
 * dye are stacked in lanes, outlined in red, and the shared range is shaded,
 * because a peak there could belong to either locus.
 */
import { useMemo } from 'react'
import type { Color } from '@/api/bindings'
import { COLORS } from '@/api/helpers'
import { cn } from '@/lib/cn'
import { assignLanes, findOverlaps, niceTicks, overlapIndex, sizeDomain, type RangeItem } from './overlap'

const LANE_H = 18
const LANE_GAP = 3
const LABEL_W = 64

export interface LocusLayoutProps {
  loci: readonly RangeItem[]
  selected?: readonly number[]
  onSelect?: (id: number, e: { toggle: boolean; shift: boolean }) => void
  /** Show tracks for dyes without loci too. */
  allDyes?: boolean
  domain?: [number, number]
  className?: string
  emptyText?: string
}

export function LocusLayout({ loci, selected = [], onSelect, allDyes, domain, className, emptyText = 'No loci' }: LocusLayoutProps) {
  const [lo, hi] = domain ?? sizeDomain(loci)
  const overlaps = useMemo(() => findOverlaps(loci), [loci])
  const flagged = useMemo(() => overlapIndex(overlaps), [overlaps])
  const ticks = niceTicks(lo, hi, 10)
  const pct = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`
  const dyes = COLORS.filter((c) => allDyes || loci.some((l) => l.color === c))
  const sel = new Set(selected)

  if (loci.length === 0 && !allDyes) {
    return <div className={cn('grid h-16 place-items-center text-xs text-muted', className)}>{emptyText}</div>
  }

  return (
    <div className={cn('flex flex-col text-2xs select-none', className)} data-testid="locus-layout">
      {dyes.map((c) => (
        <DyeTrack
          key={c}
          color={c}
          loci={loci.filter((l) => l.color === c)}
          overlaps={overlaps.filter((o) => o.color === c)}
          flagged={flagged}
          selected={sel}
          onSelect={onSelect}
          pct={pct}
          ticks={ticks}
        />
      ))}
      <div className="flex h-4">
        <span className="shrink-0 pt-0.5 text-faint" style={{ width: LABEL_W }}>
          size (bp)
        </span>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <span key={t} className="num absolute top-0.5 -translate-x-1/2 text-faint" style={{ left: pct(t) }}>
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function DyeTrack({
  color,
  loci,
  overlaps,
  flagged,
  selected,
  onSelect,
  pct,
  ticks,
}: {
  color: Color
  loci: readonly RangeItem[]
  overlaps: ReturnType<typeof findOverlaps>
  flagged: Map<number, string[]>
  selected: Set<number>
  onSelect?: LocusLayoutProps['onSelect']
  pct: (v: number) => string
  ticks: number[]
}) {
  const { lane, lanes } = assignLanes(loci)
  const height = lanes * LANE_H + (lanes - 1) * LANE_GAP + 8
  return (
    <div className="flex items-stretch border-b border-line/70 last:border-b-0">
      <div className="flex shrink-0 items-center gap-1.5 text-muted" style={{ width: LABEL_W }}>
        <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: `var(--dye-${color})` }} />
        {color}
      </div>
      <div className="relative min-w-0 flex-1" style={{ height }}>
        {ticks.map((t) => (
          <span key={t} aria-hidden className="absolute top-0 bottom-0 w-px bg-line/60" style={{ left: pct(t) }} />
        ))}
        {overlaps.map((o, i) => (
          <span
            key={i}
            aria-hidden
            title={`${o.a.label} and ${o.b.label} overlap at ${o.from}–${o.to} bp`}
            className="absolute top-0 bottom-0 bg-danger/15"
            style={{
              left: pct(o.from),
              width: `calc(${pct(o.to)} - ${pct(o.from)})`,
              backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, var(--c-danger) 30%, transparent) 4px 6px)',
            }}
          />
        ))}
        {loci.map((l) => {
          const k = lane.get(l.id) ?? 0
          const over = flagged.get(l.id)
          const isSel = selected.has(l.id)
          const title = `${l.label} · ${l.color} · ${l.min_base_length}–${l.max_base_length} bp${over ? ` · overlaps ${over.join(', ')}` : ''}`
          return (
            <button
              key={l.id}
              type="button"
              title={title}
              aria-label={title}
              aria-pressed={onSelect ? isSel : undefined}
              tabIndex={onSelect ? 0 : -1}
              onClick={(e) => onSelect?.(l.id, { toggle: e.metaKey || e.ctrlKey, shift: e.shiftKey })}
              className={cn(
                'absolute flex items-center overflow-hidden rounded-[3px] border px-1 text-left font-medium whitespace-nowrap text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                !onSelect && 'cursor-default',
                over && 'border-danger ring-1 ring-danger',
                isSel && 'ring-2 ring-accent',
              )}
              style={{
                left: pct(l.min_base_length),
                width: `max(3px, calc(${pct(l.max_base_length)} - ${pct(l.min_base_length)}))`,
                top: 4 + k * (LANE_H + LANE_GAP),
                height: LANE_H,
                background: `color-mix(in srgb, var(--dye-${color}) ${isSel ? 38 : 22}%, var(--c-surface))`,
                borderColor: over ? undefined : `var(--dye-${color})`,
              }}
            >
              <span className="truncate">{l.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
