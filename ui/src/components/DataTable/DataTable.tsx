/**
 * DataTable: virtualized, sortable, filterable table with row selection.
 * TanStack Table v9 handles sorting, the text filter and column sizing;
 * selection follows the shared rules in lib/selection.
 *
 * Keys (table focused): Up/Down move, Shift extends, Cmd/Ctrl+A selects all,
 * Space toggles, Enter activates, Cmd/Ctrl+C copies the selection as CSV.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  columnFilteringFeature,
  columnResizingFeature,
  columnSizingFeature,
  createFilteredRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ClipboardCopy, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { countOf } from '@/lib/format'
import { clickSelect, orderSelection, rangeBetween, type SelectionMode, type SelectionState } from '@/lib/selection'
import { toast } from '@/stores/toasts'
import { Button } from '@/components/ui/Button'
import { toCsv, type CellValue } from './csv'
import { kbd } from '@/lib/platform'

export interface DataColumn<T> {
  id: string
  header: string
  /** Value for sorting, filtering and CSV. */
  value: (row: T) => CellValue
  /** Sort by this instead of `value` (e.g. a severity rank behind a text label). */
  sortValue?: (row: T) => CellValue
  /** Custom cell content; defaults to the value. */
  cell?: (row: T) => ReactNode
  width?: number
  minWidth?: number
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
  /** Include in the text filter. Default true. */
  searchable?: boolean
  /** Header tooltip. */
  description?: string
}

export interface DataTableProps<T> {
  data: readonly T[]
  columns: readonly DataColumn<T>[]
  getRowId: (row: T) => string
  selectionMode?: SelectionMode
  selected?: readonly string[]
  onSelectionChange?: (ids: string[]) => void
  /** Double-click or Enter. */
  onRowActivate?: (row: T) => void
  /** Show the filter box. Default true. */
  filterable?: boolean
  filterPlaceholder?: string
  /** Extra controls at the right of the toolbar. */
  toolbar?: ReactNode
  /** Hide the toolbar entirely. */
  hideToolbar?: boolean
  initialSort?: SortingState
  rowHeight?: number
  /**
   * Checklist behavior: a plain click toggles the row instead of replacing the
   * selection, and arrow keys move without selecting (Space toggles).
   */
  clickToggles?: boolean
  emptyMessage?: ReactNode
  className?: string
  ariaLabel?: string
  /**
   * Scroll this row into view (centered) once it is in the table, e.g. the
   * item a deep link opened. Scrolls again only when the id changes.
   */
  scrollToId?: string | null
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  columnSizingFeature,
  columnResizingFeature,
})

const EMPTY_IDS: string[] = []

export function DataTable<T extends RowData>({
  data,
  columns,
  getRowId,
  selectionMode = 'multi',
  selected = EMPTY_IDS,
  onSelectionChange,
  onRowActivate,
  filterable = true,
  filterPlaceholder = 'Filter…',
  toolbar,
  hideToolbar,
  initialSort,
  rowHeight = 26,
  clickToggles = false,
  emptyMessage = 'No rows',
  className,
  ariaLabel,
  scrollToId,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ?? [])
  const [globalFilter, setGlobalFilter] = useState('')
  const anchor = useRef<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const defs = useMemo<ColumnDef<typeof features, T>[]>(
    () =>
      columns.map((c) => ({
        id: c.id,
        header: c.header,
        accessorFn: (row: T) => c.value(row),
        size: c.width ?? 120,
        minSize: c.minWidth ?? 48,
        enableSorting: c.sortable ?? true,
        enableGlobalFilter: c.searchable ?? true,
        sortUndefined: 'last' as const,
        sortDescFirst: false,
        sortFn: c.sortValue
          ? (a, b) => compareValues(c.sortValue!(a.original), c.sortValue!(b.original))
          : (a, b, id) => compareValues(a.getValue(id) as CellValue, b.getValue(id) as CellValue),
      })),
    [columns],
  )
  const colById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns])
  const rows = data as T[]

  const table = useTable({
    features,
    columns: defs,
    data: rows,
    getRowId: (r: T) => getRowId(r),
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, id, value) =>
      String(row.getValue(id) ?? '')
        .toLowerCase()
        .includes(String(value).toLowerCase()),
    getColumnCanGlobalFilter: (col) => colById.get(col.id)?.searchable ?? true,
    columnResizeMode: 'onChange',
    enableSortingRemoval: true,
  })

  const modelRows = table.getRowModel().rows
  const order = useMemo(() => modelRows.map((r) => r.id), [modelRows])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  // Ids the data does not hold (a deep link to a deleted item) are not counted as selected rows.
  const selectedCount = useMemo(() => modelRows.reduce((n, r) => n + (selectedSet.has(r.id) ? 1 : 0), 0), [modelRows, selectedSet])

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is not compiler-safe; this component is not compiled.
  const virtualizer = useVirtualizer({
    count: modelRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  })

  const apply = useCallback(
    (next: SelectionState) => {
      anchor.current = next.anchor
      onSelectionChange?.(orderSelection(order, next.selected))
    },
    [onSelectionChange, order],
  )
  const state = (): SelectionState => ({ selected, anchor: anchor.current })
  const range = (a: string, b: string) => rangeBetween(order, a, b)

  const copySelection = useCallback(async () => {
    const ids = selected.length ? selectedSet : new Set(order)
    const sel = modelRows.filter((r) => ids.has(r.id))
    const text = toCsv(
      columns.map((c) => c.header),
      sel.map((r) => columns.map((c) => c.value(r.original))),
    )
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`Copied ${sel.length} row${sel.length === 1 ? '' : 's'} as CSV`)
    } catch {
      toast.error('Clipboard unavailable')
    }
  }, [selected, selectedSet, order, modelRows, columns])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 'c') {
      e.preventDefault()
      void copySelection()
      return
    }
    if (mod && e.key.toLowerCase() === 'a' && selectionMode === 'multi') {
      e.preventDefault()
      apply({ selected: order, anchor: anchor.current })
      return
    }
    const cur = focusId ?? selected[selected.length - 1] ?? null
    const idx = cur ? order.indexOf(cur) : -1
    const go = (i: number) => {
      const id = order[Math.max(0, Math.min(order.length - 1, i))]
      if (!id) return
      e.preventDefault()
      setFocusId(id)
      virtualizer.scrollToIndex(order.indexOf(id), { align: 'auto' })
      if (selectionMode !== 'none' && !(clickToggles && !e.shiftKey))
        apply(clickSelect(state(), id, { shift: e.shiftKey }, selectionMode, range))
    }
    switch (e.key) {
      case 'ArrowDown':
        go(idx + 1)
        break
      case 'ArrowUp':
        go(idx < 0 ? 0 : idx - 1)
        break
      case 'PageDown':
        go(idx + Math.floor((scrollRef.current?.clientHeight ?? 400) / rowHeight) - 1)
        break
      case 'PageUp':
        go(idx - Math.floor((scrollRef.current?.clientHeight ?? 400) / rowHeight) + 1)
        break
      case 'Home':
        go(0)
        break
      case 'End':
        go(order.length - 1)
        break
      case ' ':
        if (cur && selectionMode !== 'none') {
          e.preventDefault()
          apply(clickSelect(state(), cur, { toggle: true }, selectionMode, range))
        }
        break
      case 'Enter': {
        const row = modelRows.find((r) => r.id === cur)
        if (row) {
          e.preventDefault()
          onRowActivate?.(row.original)
        }
        break
      }
      case 'Escape':
        if (selected.length && !clickToggles) apply({ selected: [], anchor: null })
        break
    }
  }

  // Bring a deep-linked row into view once it has loaded.
  const scrolledTo = useRef<string | null>(null)
  useEffect(() => {
    if (!scrollToId) {
      scrolledTo.current = null
      return
    }
    if (scrolledTo.current === scrollToId) return
    const i = order.indexOf(scrollToId)
    if (i < 0) return
    scrolledTo.current = scrollToId
    virtualizer.scrollToIndex(i, { align: 'center' })
  }, [scrollToId, order, virtualizer])

  // Keep focus on an existing row after filtering.
  useEffect(() => {
    if (focusId && !order.includes(focusId)) setFocusId(null)
  }, [order, focusId])

  const headers = table.getHeaderGroups()[0]?.headers ?? []
  const fillAfter = colById.get(headers[headers.length - 1]?.column.id ?? '')?.align === 'right'
  const totalWidth = table.getTotalSize()

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)} data-testid="data-table">
      {!hideToolbar && (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-2">
          {filterable && (
            <label className="relative flex items-center">
              <Search size={13} className="pointer-events-none absolute left-2 text-faint" />
              <input
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder={filterPlaceholder}
                aria-label="Filter rows"
                className="h-6 w-52 rounded-[5px] border border-line bg-surface pr-2 pl-7 text-xs outline-none placeholder:text-faint focus:border-accent"
              />
            </label>
          )}
          <span className="num text-2xs text-muted">
            {selectedCount > 0 && `${selectedCount.toLocaleString('en-US')} selected · `}
            {modelRows.length === data.length
              ? countOf(data.length, 'row')
              : `${modelRows.length.toLocaleString('en-US')} of ${countOf(data.length, 'row')}`}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {toolbar}
            <Button size="sm" variant="ghost" onClick={() => void copySelection()} title={kbd('Copy selected rows as CSV (⌘C)')}>
              <ClipboardCopy size={12} /> Copy
            </Button>
          </div>
        </div>
      )}
      <div
        ref={scrollRef}
        tabIndex={0}
        role="grid"
        aria-label={ariaLabel}
        aria-rowcount={modelRows.length}
        aria-multiselectable={selectionMode === 'multi'}
        onKeyDown={onKeyDown}
        className="relative min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-inset"
      >
        <div style={{ minWidth: totalWidth }} className="min-w-full">
          {/* The last column takes the spare width, unless it is right-aligned (a number): then a filler does, so the number stays by its neighbours. */}
          <div role="row" className="sticky top-0 z-10 flex border-b border-line bg-surface-2 text-2xs font-semibold text-muted">
            {headers.map((h, i) => {
              const col = colById.get(h.column.id)
              const sorted = h.column.getIsSorted()
              const last = i === headers.length - 1 && !fillAfter
              return (
                <div
                  key={h.id}
                  role="columnheader"
                  aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                  title={col?.description}
                  className={cn('group relative flex h-7 shrink-0 items-center px-2 select-none', last && 'flex-1')}
                  style={{ width: h.getSize() }}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    disabled={!h.column.getCanSort()}
                    onClick={h.column.getToggleSortingHandler()}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-1 truncate uppercase tracking-wide hover:text-fg disabled:hover:text-muted',
                      col?.align === 'right' && 'flex-row-reverse text-right',
                    )}
                  >
                    <span className="truncate">{col?.header}</span>
                    {sorted === 'asc' && <ArrowUp size={11} className="shrink-0 text-accent" />}
                    {sorted === 'desc' && <ArrowDown size={11} className="shrink-0 text-accent" />}
                  </button>
                  <div
                    onMouseDown={h.getResizeHandler()}
                    onTouchStart={h.getResizeHandler()}
                    onDoubleClick={() => h.column.resetSize()}
                    className={cn(
                      'absolute top-1 right-0 bottom-1 w-1 cursor-col-resize rounded-full group-hover:bg-line-strong',
                      h.column.getIsResizing() && 'bg-accent',
                    )}
                  />
                </div>
              )
            })}
            {fillAfter && <div aria-hidden className="flex-1" />}
          </div>
          {modelRows.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted">{emptyMessage}</div>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((v) => {
                const row = modelRows[v.index]
                if (!row) return null
                const isSel = selectedSet.has(row.id)
                const isFocus = focusId === row.id
                const cells = row.getAllCells()
                return (
                  <div
                    key={row.id}
                    role="row"
                    aria-selected={isSel}
                    aria-rowindex={v.index + 1}
                    data-row-id={row.id}
                    onMouseDown={(e) => {
                      if (e.button !== 0) return
                      if (e.shiftKey) e.preventDefault() // no text selection on range click
                      setFocusId(row.id)
                      if (selectionMode !== 'none')
                        apply(
                          clickSelect(
                            state(),
                            row.id,
                            { shift: e.shiftKey, toggle: clickToggles || e.metaKey || e.ctrlKey },
                            selectionMode,
                            range,
                          ),
                        )
                    }}
                    onDoubleClick={() => onRowActivate?.(row.original)}
                    className={cn(
                      'absolute left-0 flex w-full items-center border-b border-line/60 text-[13px]',
                      selectionMode !== 'none' && 'cursor-default',
                      isSel ? 'bg-accent-soft' : v.index % 2 ? 'bg-surface-2/40' : 'bg-surface',
                      !isSel && 'hover:bg-surface-3/60',
                      isFocus && 'shadow-[inset_2px_0_0_var(--c-accent)]',
                    )}
                    style={{ height: rowHeight, transform: `translateY(${v.start}px)` }}
                  >
                    {cells.map((cell, i) => {
                      const col = colById.get(cell.column.id)
                      const v2 = cell.getValue() as CellValue
                      return (
                        <div
                          key={cell.id}
                          role="gridcell"
                          className={cn(
                            'shrink-0 truncate px-2',
                            i === cells.length - 1 && !fillAfter && 'flex-1',
                            col?.align === 'right' && 'num text-right',
                            col?.align === 'center' && 'text-center',
                          )}
                          style={{ width: cell.column.getSize() }}
                        >
                          {col?.cell ? col.cell(row.original) : formatCell(v2)}
                        </div>
                      )
                    })}
                    {fillAfter && <div aria-hidden className="flex-1" />}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatCell(v: CellValue): ReactNode {
  if (v == null || v === '') return <span className="text-faint">–</span>
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(2)
  return v
}

/** Ascending comparison: numbers numerically, strings naturally, nullish last. */
export function compareValues(a: CellValue, b: CellValue): number {
  if (a == null || a === '') return b == null || b === '' ? 0 : 1
  if (b == null || b === '') return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}
