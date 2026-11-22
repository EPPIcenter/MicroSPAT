/**
 * Every sample's call at the selected locus, for triage. A purpose-built
 * virtual list (rather than DataTable) so the visible order is known to the
 * keyboard model and allele chips can wrap: a sample with seven alleles
 * shows seven.
 */
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, Check, CircleAlert, CircleDashed, Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Tooltip } from '@/components/ui/Tooltip'
import { SelectInput } from '@/components/form/fields'
import {
  FILTER_HELP,
  FILTER_LABEL,
  narrowMissText,
  type AlleleCountFilter,
  type CallFilterKey,
  type CallFilters,
  type CallSort,
  type CallSortKey,
  type CallView,
} from '../model/calls'
import { AlleleChips, CallFlags, NarrowChips } from './parts'

const COLS: { key: CallSortKey | null; label: string; width: string; title?: string; align?: 'right' }[] = [
  {
    key: 'attention',
    label: '',
    width: 'w-6',
    title: 'Review state: ✓ reviewed, ! needs attention, dashed circle: mark dropped because the call changed. Sorts by attention.',
  },
  { key: 'barcode', label: 'Sample', width: 'w-[128px]' },
  {
    key: 'alleles',
    label: 'Alleles',
    width: 'flex-1 min-w-[150px]',
    title:
      'Called alleles in size order, with their share of the called signal (bias-corrected when a quantification-bias estimator is linked); narrow misses after them, dashed. Sorts by count.',
  },
  {
    key: 'moi',
    label: 'MOI',
    width: 'w-9',
    align: 'right',
    title:
      'Model MOI of the sample (probabilistic pass): counts only alleles at or above the bootstrap probability, so it can be below the alleles called here',
  },
  { key: null, label: 'Flags', width: 'w-[58px]' },
  { key: 'well', label: 'Well', width: 'w-11', title: 'Well of the reference run (the run the call is based on)' },
]

const FILTERS: CallFilterKey[] = [
  'attention',
  'unreviewed',
  'failed',
  'low-prob',
  'narrow',
  'curated',
  'commented',
  'offscale',
  'spectral',
  'multi-run',
  'controls',
]

export interface CallsTableProps {
  rows: readonly CallView[]
  total: number
  selectedId: string | null
  onSelect: (id: string) => void
  sort: CallSort
  onSortChange: (s: CallSort) => void
  filters: CallFilters
  onFiltersChange: (f: CallFilters) => void
  stale: boolean
  searchRef?: RefObject<HTMLInputElement | null>
  /** Bulk review action, in the count row. */
  bulk?: ReactNode
}

export function CallsTable({
  rows,
  total,
  selectedId,
  onSelect,
  sort,
  onSortChange,
  filters,
  onFiltersChange,
  stale,
  searchRef,
  bulk,
}: CallsTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is not compiler-safe; this component is not compiled.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 30,
    overscan: 10,
    getItemKey: (i) => rows[i]?.id ?? i,
  })
  const index = useMemo(() => rows.findIndex((r) => r.id === selectedId), [rows, selectedId])
  useEffect(() => {
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' })
  }, [index, virtualizer])
  const attentionCount = useMemo(() => rows.filter((r) => r.needsAttention).length, [rows])
  const reviewedCount = useMemo(() => rows.filter((r) => r.reviewed).length, [rows])

  const toggleFilter = (k: CallFilterKey) =>
    onFiltersChange({ ...filters, flags: filters.flags.includes(k) ? filters.flags.filter((x) => x !== k) : [...filters.flags, k] })

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface" data-testid="calls-table">
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-line px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <label className="relative flex min-w-0 flex-1 items-center">
            <Search size={13} className="pointer-events-none absolute left-2 text-faint" />
            <input
              ref={searchRef}
              value={filters.text}
              onChange={(e) => onFiltersChange({ ...filters, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Escape' || e.key === 'Enter') {
                  e.preventDefault()
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
              placeholder="Sample, allele, well or comment  ( / )"
              aria-label="Search calls"
              className="h-6 w-full rounded-[5px] border border-line bg-surface pr-6 pl-7 text-xs outline-none placeholder:text-faint focus:border-accent"
            />
            {filters.text && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => onFiltersChange({ ...filters, text: '' })}
                className="absolute right-1.5 text-faint hover:text-fg"
              >
                <X size={12} />
              </button>
            )}
          </label>
          <SelectInput
            aria-label="Allele count"
            className="h-6 w-[104px] text-xs"
            value={filters.alleles}
            onChange={(v) => onFiltersChange({ ...filters, alleles: v as AlleleCountFilter })}
            options={[
              { value: 'any', label: 'Any alleles' },
              { value: '0', label: 'No allele' },
              { value: '1', label: '1 allele' },
              { value: '2', label: '2 alleles' },
              { value: '2+', label: '2 or more' },
              { value: '3+', label: '3 or more' },
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filters">
          {FILTERS.map((k) => {
            const on = filters.flags.includes(k)
            return (
              <Tooltip key={k} content={FILTER_HELP[k]}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleFilter(k)}
                  data-filter={k}
                  className={cn(
                    'h-5 rounded-full border px-2 text-2xs whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                    on ? 'border-accent bg-accent-soft text-fg' : 'border-line text-muted hover:border-line-strong hover:text-fg',
                  )}
                >
                  {on && <Check size={10} className="mr-0.5 inline" />}
                  {FILTER_LABEL[k]}
                </button>
              </Tooltip>
            )
          })}
        </div>
        <div className="flex min-h-6 items-center gap-2 text-2xs text-muted">
          <span className="num" data-testid="calls-count">
            {rows.length === total ? `${total} samples` : `${rows.length} of ${total} samples`}
          </span>
          <span>·</span>
          <span className={attentionCount ? 'text-warn' : undefined} data-testid="attention-count">
            {attentionCount} need attention
          </span>
          <span>·</span>
          <span data-testid="reviewed-count">{reviewedCount} reviewed</span>
          {bulk && <span className="ml-auto">{bulk}</span>}
        </div>
      </div>
      <div className="flex h-7 shrink-0 items-center border-b border-line bg-surface-2 pr-2 text-2xs font-semibold tracking-wide text-muted uppercase">
        {COLS.map((c, i) => {
          const active = c.key != null && sort.key === c.key
          return (
            <div
              key={i}
              className={cn('flex h-full shrink-0 items-center px-1.5', c.width, c.align === 'right' && 'justify-end')}
              title={c.title}
            >
              {c.key ? (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => onSortChange({ key: c.key!, desc: active ? !sort.desc : c.key === 'attention' || c.key === 'alleles' })}
                  className={cn('flex items-center gap-0.5 uppercase hover:text-fg', active && 'text-fg')}
                  aria-label={c.label ? `Sort by ${c.label}` : 'Sort by attention'}
                >
                  {c.label || <CircleAlert size={11} />}
                  {active && (sort.desc ? <ArrowDown size={10} className="text-accent" /> : <ArrowUp size={10} className="text-accent" />)}
                </button>
              ) : (
                c.label
              )}
            </div>
          )
        })}
      </div>
      <div
        ref={scrollRef}
        role="grid"
        aria-label="Calls"
        aria-rowcount={rows.length}
        tabIndex={0}
        className="relative min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-inset"
      >
        {rows.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted">
            {total ? 'No sample matches these filters.' : 'No calls at this locus yet.'}
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const v = rows[vi.index]
              if (!v) return null
              const sel = v.id === selectedId
              return (
                <div
                  key={vi.key}
                  ref={virtualizer.measureElement}
                  data-index={vi.index}
                  role="row"
                  aria-selected={sel}
                  data-sample={v.row.barcode}
                  data-alleles={v.row.alleles.map((a) => a.label).join(';')}
                  data-curated={v.curated || undefined}
                  data-reviewed={v.reviewed || undefined}
                  data-narrow={v.narrow.map((m) => m.label).join(';') || undefined}
                  onMouseDown={(e) => {
                    if (e.button === 0) onSelect(v.id)
                  }}
                  className={cn(
                    'absolute left-0 flex w-full cursor-default items-start border-b border-line/60 pr-2 text-[13px]',
                    sel ? 'bg-accent-soft shadow-[inset_3px_0_0_var(--c-accent)]' : 'hover:bg-surface-3/50',
                    v.control && !sel && 'bg-surface-2/50',
                  )}
                  style={{ transform: `translateY(${vi.start}px)` }}
                >
                  <div role="gridcell" className="flex w-6 shrink-0 justify-center py-1.5">
                    <ReviewMark v={v} />
                  </div>
                  <div role="gridcell" className="w-[128px] shrink-0 truncate px-1.5 py-1.5 font-medium" title={v.row.barcode}>
                    {v.row.barcode}
                    {v.control && (
                      <span className="ml-1 text-2xs font-normal text-faint">{v.row.designation === 'negative_control' ? 'NC' : 'PC'}</span>
                    )}
                  </div>
                  <div role="gridcell" className="min-w-[150px] flex-1 px-1.5 py-[5px]">
                    {v.noRun ? (
                      <span className="text-xs text-danger">no usable run</span>
                    ) : v.failed ? (
                      <span className="text-xs text-danger">failed</span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-1">
                        <AlleleChips chips={v.chips} stale={stale} />
                        <NarrowChips misses={v.narrow} />
                      </span>
                    )}
                  </div>
                  <div role="gridcell" className={cn('num w-9 shrink-0 px-1.5 py-1.5 text-right', stale && 'text-muted')}>
                    {v.row.moi ?? <span className="text-faint">–</span>}
                  </div>
                  <div role="gridcell" className="flex w-[58px] shrink-0 px-1.5 py-1.5">
                    <CallFlags v={v} />
                  </div>
                  <div
                    role="gridcell"
                    className="num w-11 shrink-0 px-1.5 py-1.5 text-xs text-muted"
                    title={v.well ? `${v.plate ?? ''} ${v.well}${v.runCount > 1 ? ` · ${v.runCount} runs at this locus` : ''}` : undefined}
                  >
                    {v.well ?? ''}
                    {v.runCount > 1 && <sup className="ml-px text-faint">{v.runCount}</sup>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/** The review cell: reviewed, needs attention, a dropped mark, or nothing (not reviewed, nothing flagged). */
function ReviewMark({ v }: { v: CallView }) {
  const dropped = v.dropped
  const concerns = v.concerns.join(', ')
  const narrow = v.narrow.length ? ` Narrow misses: ${v.narrow.map((m) => `${m.label}, ${narrowMissText(m)}`).join('; ')}.` : ''
  if (v.reviewed)
    return (
      <Tooltip
        content={
          <span>
            Reviewed{concerns ? `, despite: ${concerns}.` : '.'} The mark stays while the alleles, flags and reference run stay the same.
          </span>
        }
      >
        <span tabIndex={-1} role="img" aria-label="Reviewed" className="text-ok" data-testid="reviewed-mark">
          <Check size={12} strokeWidth={2.5} />
        </span>
      </Tooltip>
    )
  if (dropped)
    return (
      <Tooltip
        content={
          <span>
            Review mark dropped. {dropped}
            {concerns ? ` Flags: ${concerns}.` : ''}
          </span>
        }
      >
        <span tabIndex={-1} role="img" aria-label={`Review mark dropped: ${dropped}`} className="text-warn" data-testid="dropped-mark">
          <CircleDashed size={12} />
        </span>
      </Tooltip>
    )
  if (v.needsAttention)
    return (
      <Tooltip
        content={
          <span>
            Needs attention: {concerns}.{narrow}
          </span>
        }
      >
        <span tabIndex={-1} role="img" aria-label={`Needs attention: ${concerns}`} className="text-warn">
          <CircleAlert size={12} />
        </span>
      </Tooltip>
    )
  return null
}
