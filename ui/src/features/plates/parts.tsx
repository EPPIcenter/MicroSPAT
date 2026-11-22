/** Small presentational pieces of the Plates screen. */
import type { ReactNode } from 'react'
import type { SizingCounts, SizingState } from '@/api/bindings'
import { cn } from '@/lib/cn'
import { Tooltip } from '@/components/ui/Tooltip'
import { SIZING_FILL, SIZING_HELP, SIZING_LABEL, SIZING_STATES } from './model/status'

/** Two to four mutually exclusive options as a compact segmented control. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; title?: string }[]
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex h-6 items-center rounded-[5px] bg-surface-3 p-0.5', className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-5 items-center gap-1 rounded-[4px] px-2 text-xs text-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40',
              on && 'bg-surface font-medium text-fg shadow-xs',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Sizing counts as colored numbers, e.g. "95 · 1": zero counts are left out. */
export function SizingCountsInline({
  counts,
  total,
  className,
  reasons,
}: {
  counts: SizingCounts
  total?: number
  className?: string
  /** Per state, which wells and why (`stateReasons`), added to the tooltip. */
  reasons?: Partial<Record<SizingState, string>>
}) {
  const items = SIZING_STATES.filter((s) => counts[s] > 0 || (s === 'good' && total != null))
  return (
    <span className={cn('num inline-flex items-center gap-2 text-xs', className)} data-testid="sizing-counts">
      {items.map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1"
          data-state={s}
          title={`${counts[s]} ${SIZING_LABEL[s].toLowerCase()}${reasons?.[s] ? `\n${reasons[s]}` : ''}`}
        >
          <SizingSwatch state={s} />
          <span className={cn(s === 'good' ? 'text-muted' : 'text-fg')}>{counts[s]}</span>
        </span>
      ))}
    </span>
  )
}

export function SizingSwatch({ state, className }: { state: SizingState; className?: string }) {
  return (
    <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-[2px]', className)} style={{ background: SIZING_FILL[state] }} />
  )
}

/** Legend entry with a swatch, label and count. */
export function LegendItem({ swatch, label, count, help }: { swatch: ReactNode; label: string; count?: number; help?: string }) {
  const body = (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {swatch}
      {label}
      {count != null && <span className="num text-fg">{count}</span>}
    </span>
  )
  return help ? (
    <Tooltip content={help}>
      <span tabIndex={-1}>{body}</span>
    </Tooltip>
  ) : (
    body
  )
}

export function SizingLegend({ counts, manual, drafts }: { counts: Record<SizingState, number>; manual: number; drafts: number }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-2xs text-muted">
      {SIZING_STATES.map((s) => (
        <LegendItem
          key={s}
          swatch={<SizingSwatch state={s} className="size-2.5" />}
          label={SIZING_LABEL[s]}
          count={counts[s]}
          help={SIZING_HELP[s]}
        />
      ))}
      {manual > 0 && <LegendItem swatch={<CornerSwatch color="var(--c-accent)" />} label="Edited by hand" count={manual} />}
      {drafts > 0 && <LegendItem swatch={<CornerSwatch color="var(--c-fg)" />} label="Unsaved edit" count={drafts} />}
    </div>
  )
}

export function CornerSwatch({ color }: { color: string }) {
  return (
    <span aria-hidden className="relative inline-block size-2.5 rounded-[2px] bg-surface-3">
      <span className="absolute top-0 right-0 size-1.5" style={{ background: color, clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
    </span>
  )
}

/** Label + value pair for fact lines. */
export function Fact({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1" title={title}>
      <span className="text-faint">{label}</span>
      <span className="truncate text-fg">{children}</span>
    </span>
  )
}
