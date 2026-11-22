/**
 * The loci of a project with their analysis status. Each locus says whether
 * its results are current, never analyzed, or stale, and shows the engine's
 * reasons, and the engine's warnings about the locus's own result (an
 * artifact estimator with no artifact model there). Upstream warnings are
 * the project header's (`ProjectHeader`).
 *
 * Two layouts: `list` (a vertical pane with reasons inline) and `strip` (a
 * horizontal tab row for screens that need the width, reasons on hover).
 */
import type { ReactNode } from 'react'
import { AlertTriangle, SlidersHorizontal } from 'lucide-react'
import type { ProjectDetail, ProjectLocus } from '@/api/bindings'
import { cn } from '@/lib/cn'
import { Checkbox } from '@/components/form/fields'
import { Tooltip } from '@/components/ui/Tooltip'
import { shortStatus, statusView } from './status'
import { StatusIcon, StatusTooltip } from './StatusBits'

export interface LocusStatusListProps {
  detail: ProjectDetail
  /** The locus whose results are shown. */
  selected: number | null
  onSelect: (locusId: number) => void
  /** Checked loci for "analyze selected" / "apply to selected" (list layout only). */
  checked?: readonly number[]
  onCheckedChange?: (ids: number[]) => void
  variant?: 'list' | 'strip'
  /** Extra content per locus (e.g. a count), right-aligned in the list layout. */
  trailing?: (l: ProjectLocus) => ReactNode
  className?: string
}

export function LocusStatusList({ detail, selected, onSelect, checked, onCheckedChange, variant = 'list', trailing, className }: LocusStatusListProps) {
  if (variant === 'strip') {
    return (
      <div role="tablist" aria-label="Loci" className={cn('flex min-w-0 items-stretch gap-0.5 overflow-x-auto', className)} data-testid="locus-strip">
        {detail.loci.map((l) => {
          const v = statusView(l.status, `${l.label} results`)
          const active = l.locus_id === selected
          return (
            <Tooltip
              key={l.locus_id}
              content={
                <>
                  <StatusTooltip view={v} />
                  {l.warnings?.map((w) => (
                    <p key={w} className="mt-1 max-w-80 text-warn">
                      {w}
                    </p>
                  ))}
                </>
              }
              side="bottom"
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                data-locus={l.label}
                data-state={l.status.state}
                onClick={() => onSelect(l.locus_id)}
                className={cn(
                  'flex h-7 shrink-0 items-center gap-1.5 rounded-[5px] border px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                  active ? 'border-accent bg-accent-soft font-semibold text-fg' : 'border-transparent text-muted hover:bg-surface-3 hover:text-fg',
                  l.status.state === 'stale' && !active && 'border-warn/40 border-dashed',
                )}
              >
                <span aria-hidden className="size-2 rounded-[2px]" style={{ background: `var(--dye-${l.color})` }} />
                {l.label}
                {l.status.state !== 'current' && <StatusIcon view={v} size={11} />}
                {l.warnings?.length ? <AlertTriangle size={11} className="text-warn" aria-label={l.warnings.join(' ')} data-testid="locus-warning" /> : null}
                {l.custom_params && <SlidersHorizontal size={10} className="text-faint" aria-label="custom parameters" />}
                {trailing?.(l)}
              </button>
            </Tooltip>
          )
        })}
      </div>
    )
  }

  const allIds = detail.loci.map((l) => l.locus_id)
  const checkedSet = new Set(checked ?? [])
  return (
    <div className={cn('flex min-h-0 flex-col', className)} data-testid="locus-list">
      {onCheckedChange && (
        <div className="flex h-7 items-center gap-2 border-b border-line px-3 text-2xs text-muted">
          <Checkbox
            aria-label="Select all loci"
            checked={checkedSet.size === 0 ? false : checkedSet.size === allIds.length ? true : 'indeterminate'}
            onChange={(v) => onCheckedChange(v ? allIds : [])}
          />
          {checkedSet.size ? `${checkedSet.size} selected` : 'Select loci to analyze or apply parameters together'}
        </div>
      )}
      <ul role="listbox" aria-label="Loci" className="min-h-0 flex-1 overflow-auto py-1">
        {detail.loci.map((l) => {
          const v = statusView(l.status, `${l.label} results`)
          const active = l.locus_id === selected
          return (
            <li
              key={l.locus_id}
              role="option"
              aria-selected={active}
              data-locus={l.label}
              data-state={l.status.state}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(l.locus_id)}
              onKeyDown={(e) => {
                const i = allIds.indexOf(l.locus_id)
                const next = e.key === 'ArrowDown' ? allIds[i + 1] : e.key === 'ArrowUp' ? allIds[i - 1] : undefined
                if (next != null) {
                  e.preventDefault()
                  onSelect(next)
                  ;(e.currentTarget.parentElement?.querySelector(`[data-locus="${detail.loci.find((x) => x.locus_id === next)?.label}"]`) as HTMLElement | null)?.focus()
                }
              }}
              className={cn(
                'mx-1 flex cursor-default gap-2 rounded-[5px] px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                active ? 'bg-accent-soft' : 'hover:bg-surface-3/60',
              )}
            >
              {onCheckedChange && (
                <span onClick={(e) => e.stopPropagation()} className="pt-0.5">
                  <Checkbox
                    aria-label={`Select ${l.label}`}
                    checked={checkedSet.has(l.locus_id)}
                    onChange={(c) => onCheckedChange(c ? [...checkedSet, l.locus_id] : [...checkedSet].filter((x) => x !== l.locus_id))}
                  />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: `var(--dye-${l.color})` }} />
                  <span className={cn('text-[13px]', active && 'font-semibold')}>{l.label}</span>
                  <span className="num text-2xs text-faint">
                    {l.min_base_length}–{l.max_base_length} bp
                  </span>
                  {l.custom_params && (
                    <span title="Uses custom parameters" className="text-faint">
                      <SlidersHorizontal size={10} />
                    </span>
                  )}
                  <span className="ml-auto">{trailing?.(l)}</span>
                </div>
                <div className={cn('mt-0.5 flex items-start gap-1 text-2xs', v.state === 'stale' ? 'text-warn' : v.state === 'current' ? 'text-muted' : 'text-faint')}>
                  <StatusIcon view={v} size={11} className="mt-px" />
                  <span className="min-w-0">{v.state === 'stale' ? v.reasons.map((r) => r.replace(/\.$/, '')).join('; ') || 'Stale' : shortStatus(l.status)}</span>
                </div>
                {l.warnings?.map((w) => (
                  <div key={w} className="mt-0.5 flex items-start gap-1 text-2xs text-warn" data-testid="locus-warning">
                    <AlertTriangle size={11} className="mt-px shrink-0" />
                    <span className="min-w-0">{w}</span>
                  </div>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
