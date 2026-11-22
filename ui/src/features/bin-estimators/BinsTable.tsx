/**
 * The bins of one locus as an editable table beside the plot: label,
 * center, buffer, peaks in the window now, and distance from the repeat
 * grid, with flags (overlapping windows, off the grid, duplicate labels)
 * and unsaved markers. Selection follows the plot both ways. Cells commit
 * on Enter or blur; Esc reverts the cell.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { AlertTriangle, CircleDot, Filter, Plus, Trash2, Wand2 } from 'lucide-react'
import type { Bin } from '@/api/bindings'
import { moveBin, newBin, removeBin, replaceBin, setBuffer } from '@/components/BinPlot/binEdit'
import { NumberInput, TextInput } from '@/components/form/fields'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/Menu'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'
import { countOf } from '@/lib/format'
import { binsBelow, gridPosition, gridTolerance, setAllBuffers, snapToGrid, type BinIssue, type RepeatGrid } from './model/checks'

export interface BinsTableProps {
  bins: readonly Bin[]
  /** Peaks in each bin's window now (by id). */
  counts: ReadonlyMap<number, number>
  issues: ReadonlyMap<number, BinIssue[]>
  grid: RepeatGrid | null
  /** Ids of bins that are new or changed since the last save. */
  unsaved: ReadonlySet<number>
  selectedId: number | null
  onSelect: (id: number | null) => void
  /** An edit; `key` merges repeated edits of one cell into one undo step. */
  onChange: (bins: Bin[], key?: string) => void
  defaultBuffer: number
  readOnly?: boolean
}

const BLOCKING = new Set(['invalid', 'duplicate_label'])

export function BinsTable({ bins, counts, issues, grid, unsaved, selectedId, onSelect, onChange, defaultBuffer, readOnly }: BinsTableProps) {
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [dialog, setDialog] = useState<'buffers' | 'below' | 'add' | null>(null)
  const sorted = useMemo(() => [...bins].sort((a, b) => a.base_size - b.base_size), [bins])
  const shown = flaggedOnly ? sorted.filter((b) => issues.has(b.id) || b.id === selectedId) : sorted
  const nOverlap = sorted.filter((b) => issues.get(b.id)?.some((i) => i.kind === 'overlap')).length
  const nOff = sorted.filter((b) => issues.get(b.id)?.some((i) => i.kind === 'off_grid')).length
  const nBlocking = sorted.filter((b) => issues.get(b.id)?.some((i) => BLOCKING.has(i.kind))).length
  const onGrid = grid ? sorted.filter((b) => !issues.get(b.id)?.some((i) => i.kind === 'off_grid')) : []
  const toSnap = grid ? onGrid.filter((b) => Math.abs(gridPosition(grid, b.base_size).offset) >= 0.0005) : []
  const selected = sorted.find((b) => b.id === selectedId) ?? null
  const bodyRef = useRef<HTMLTableSectionElement>(null)

  useEffect(() => {
    if (selectedId == null) return
    bodyRef.current?.querySelector(`[data-bin-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const flaggedIds = sorted.filter((b) => issues.has(b.id)).map((b) => b.id)
  const nextFlagged = () => {
    if (!flaggedIds.length) return
    const i = flaggedIds.indexOf(selectedId ?? NaN)
    onSelect(flaggedIds[(i + 1) % flaggedIds.length]!)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface" data-testid="bins-table">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-line px-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-2xs text-muted" aria-live="polite">
          <span className="font-medium text-fg">{countOf(sorted.length, 'bin')}</span>
          {nOverlap > 0 && (
            <button type="button" className="inline-flex items-center gap-0.5 text-warn hover:underline" onClick={nextFlagged} data-testid="overlap-count">
              <AlertTriangle size={10} /> {nOverlap} overlapping
            </button>
          )}
          {nOff > 0 && (
            <button type="button" className="inline-flex items-center gap-0.5 text-warn hover:underline" onClick={nextFlagged} data-testid="offgrid-count">
              <AlertTriangle size={10} /> {nOff} off the grid
            </button>
          )}
          {nBlocking > 0 && <span className="text-danger">{nBlocking} cannot be saved</span>}
        </div>
        <Button
          size="icon-sm"
          variant={flaggedOnly ? 'secondary' : 'ghost'}
          aria-pressed={flaggedOnly}
          onClick={() => setFlaggedOnly((v) => !v)}
          title="Show flagged bins only"
          aria-label="Show flagged bins only"
        >
          <Filter size={12} />
        </Button>
        {!readOnly && (
          <>
            <Button size="sm" variant="ghost" onClick={() => setDialog('add')} title="Add a bin at a size you type (or double-click the plot)" data-testid="add-bin">
              <Plus size={12} /> Add
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" data-testid="bin-tools">
                  <Wand2 size={12} /> Tools
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="normal-case tracking-normal">
                  Repeat grid{grid ? `: ${grid.step.toFixed(3)} bp per repeat` : ' unavailable'}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={!grid || !selected}
                  onSelect={() => grid && selected && onChange(snapToGrid(bins, grid, new Set([selected.id])))}
                  data-testid="snap-selected"
                >
                  Snap {selected ? `bin ${selected.label}` : 'the selected bin'} to the grid
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!grid || toSnap.length === 0} onSelect={() => grid && onChange(snapToGrid(bins, grid, new Set(toSnap.map((b) => b.id))))} data-testid="snap-all">
                  Snap {countOf(toSnap.length, 'bin')} on the grid to exact positions
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDialog('buffers')} data-testid="set-buffers">
                  Set every buffer to…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog('below')} data-testid="delete-below">
                  Delete bins with few peaks…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!flaggedIds.length} onSelect={nextFlagged}>
                  Select the next flagged bin
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs" aria-label="Bins">
          <thead className="sticky top-0 z-[1] bg-surface-2 text-2xs text-muted">
            <tr className="[&>th]:h-7 [&>th]:border-b [&>th]:border-line [&>th]:px-1.5 [&>th]:font-medium">
              <th className="w-6" aria-label="Flags" />
              <th className="text-left">Label</th>
              <th className="text-right" title="Bin center (bp)">
                Center bp
              </th>
              <th className="text-right" title="Half-width (bp): peaks within center ± buffer are in the bin">
                ± Buffer
              </th>
              <th className="text-right" title="Peaks inside the window now, from the scatter">
                Peaks
              </th>
              <th className="text-right" title="Distance from the nearest repeat-grid position (bp)">
                Grid Δ
              </th>
              <th className="w-7" aria-label="Delete" />
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {shown.map((b) => (
              <BinRow
                key={b.id}
                bin={b}
                count={counts.get(b.id) ?? 0}
                issues={issues.get(b.id) ?? []}
                gridOffset={grid ? gridPosition(grid, b.base_size).offset : null}
                tol={grid ? gridTolerance(grid.repeat) : 0}
                unsaved={unsaved.has(b.id)}
                selected={b.id === selectedId}
                readOnly={readOnly}
                onSelect={() => onSelect(b.id)}
                onChange={(nb, key) => onChange(replaceBin(bins, nb), key)}
                onDelete={() => {
                  onChange(removeBin(bins, b.id))
                  onSelect(null)
                }}
              />
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="p-4 text-center text-xs text-muted">{flaggedOnly ? 'No flagged bins.' : 'No bins. Double-click the plot to add one.'}</p>
        )}
      </div>
      <BuffersDialog open={dialog === 'buffers'} onClose={() => setDialog(null)} initial={defaultBuffer} onApply={(v) => onChange(setAllBuffers(bins, v))} n={bins.length} />
      <BelowDialog open={dialog === 'below'} onClose={() => setDialog(null)} bins={bins} counts={counts} onApply={(ids) => onChange(bins.filter((b) => !ids.has(b.id)))} />
      <AddDialog
        open={dialog === 'add'}
        onClose={() => setDialog(null)}
        suggest={selected && grid ? gridPosition(grid, selected.base_size).expected + grid.step : sorted.length && grid ? gridPosition(grid, sorted[sorted.length - 1]!.base_size).expected + grid.step : 100}
        buffer={defaultBuffer}
        onApply={(center, buffer) => {
          const nb = newBin(bins, center, buffer)
          onChange([...bins, nb])
          onSelect(nb.id)
        }}
      />
    </div>
  )
}

function BinRow({
  bin,
  count,
  issues,
  gridOffset,
  tol,
  unsaved,
  selected,
  readOnly,
  onSelect,
  onChange,
  onDelete,
}: {
  bin: Bin
  count: number
  issues: BinIssue[]
  gridOffset: number | null
  tol: number
  unsaved: boolean
  selected: boolean
  readOnly?: boolean
  onSelect: () => void
  onChange: (b: Bin, key?: string) => void
  onDelete: () => void
}) {
  const blocking = issues.some((i) => BLOCKING.has(i.kind))
  const flag: ReactNode = issues.length ? (
    <Tooltip
      content={
        <ul className="max-w-72 space-y-0.5">
          {issues.map((i) => (
            <li key={i.kind + i.message}>{i.message}</li>
          ))}
        </ul>
      }
    >
      <span tabIndex={-1} className={cn('inline-flex', blocking ? 'text-danger' : 'text-warn')} aria-label={issues.map((i) => i.message).join(' ')} data-flags={issues.map((i) => i.kind).join(' ')}>
        <AlertTriangle size={12} />
      </span>
    </Tooltip>
  ) : null
  return (
    <tr
      data-bin-id={bin.id}
      data-bin-label={bin.label}
      aria-selected={selected}
      onClick={onSelect}
      onFocus={onSelect}
      className={cn('group h-7 border-b border-line/60 [&>td]:px-1.5', selected ? 'bg-accent-soft' : 'hover:bg-surface-2')}
    >
      <td className="text-center">
        <span className="inline-flex items-center gap-0.5">
          {flag}
          {unsaved && (
            <span title={bin.id <= 0 ? 'New, not saved' : 'Changed, not saved'} aria-label={bin.id <= 0 ? 'new, unsaved' : 'changed, unsaved'} className="text-accent">
              <CircleDot size={10} />
            </span>
          )}
        </span>
      </td>
      <td className="w-[38%]">
        <CellText value={bin.label} disabled={readOnly} invalid={blocking} onCommit={(v) => onChange({ ...bin, label: v })} ariaLabel={`Label of bin ${bin.label}`} />
      </td>
      <td className="w-[92px]">
        <CellNumber value={bin.base_size} step={0.05} disabled={readOnly} onCommit={(v) => onChange(moveBin(bin, v), `center:${bin.id}`)} ariaLabel={`Center of bin ${bin.label}`} />
      </td>
      <td className="w-[78px]">
        <CellNumber value={bin.bin_buffer} step={0.05} min={0.05} max={49.9} disabled={readOnly} onCommit={(v) => onChange(setBuffer(bin, v), `buffer:${bin.id}`)} ariaLabel={`Buffer of bin ${bin.label}`} />
      </td>
      <td className="num text-right" title={`${count} peaks in the window now${bin.id > 0 ? `; ${bin.peak_count} when estimated` : ''}`}>
        {count.toLocaleString('en-US')}
      </td>
      <td className={cn('num text-right', gridOffset != null && Math.abs(gridOffset) > tol ? 'font-medium text-warn' : 'text-faint')}>
        {gridOffset == null ? '–' : `${gridOffset >= 0 ? '+' : '−'}${Math.abs(gridOffset).toFixed(2)}`}
      </td>
      <td className="text-right">
        {!readOnly && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className={cn('grid size-5 place-items-center rounded text-faint hover:bg-danger-soft hover:text-danger', !selected && 'opacity-0 group-hover:opacity-100 focus:opacity-100')}
            aria-label={`Delete bin ${bin.label}`}
            title="Delete bin (Del in the plot)"
          >
            <Trash2 size={12} />
          </button>
        )}
      </td>
    </tr>
  )
}

const cellCls = 'h-6 rounded-[4px] border-transparent bg-transparent px-1 text-xs hover:border-line focus:border-accent focus:bg-surface'

function CellText({ value, onCommit, disabled, invalid, ariaLabel }: { value: string; onCommit: (v: string) => void; disabled?: boolean; invalid?: boolean; ariaLabel: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft != null && draft !== value) onCommit(draft)
    setDraft(null)
  }
  return (
    <TextInput
      value={draft ?? value}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      className={cn(cellCls, 'w-full min-w-12 font-medium', invalid && 'text-danger')}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          commit()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          e.stopPropagation()
          setDraft(null)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function CellNumber({
  value,
  onCommit,
  step,
  min,
  max,
  unit,
  disabled,
  ariaLabel,
}: {
  value: number
  onCommit: (v: number) => void
  step: number
  min?: number
  max?: number
  unit?: string
  disabled?: boolean
  ariaLabel: string
}) {
  const [draft, setDraft] = useState<number | null | undefined>(undefined)
  const commit = (v = draft) => {
    if (v != null && Number.isFinite(v) && v !== value && (min == null || v >= min) && (max == null || v <= max)) onCommit(+v.toFixed(3))
    setDraft(undefined)
  }
  return (
    <NumberInput
      value={draft === undefined ? +value.toFixed(3) : draft}
      onChange={(v) => setDraft(v)}
      step={step}
      min={min}
      max={max}
      unit={unit}
      disabled={disabled}
      aria-label={ariaLabel}
      className="[&>input]:h-6 [&>input]:rounded-[4px] [&>input]:border-transparent [&>input]:bg-transparent [&>input]:px-1 [&>input]:text-xs [&>input]:hover:border-line [&>input]:focus:border-accent [&>input]:focus:bg-surface"
      onBlur={() => commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          e.stopPropagation()
          setDraft(undefined)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function BuffersDialog({ open, onClose, initial, onApply, n }: { open: boolean; onClose: () => void; initial: number; onApply: (v: number) => void; n: number }) {
  const [v, setV] = useState<number | null>(initial)
  const ok = v != null && v >= 0.05 && v < 50
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Set every buffer"
      description={`Gives all ${countOf(n, 'bin')} of this locus the same half-width. Peaks within center ± buffer are in the bin; within twice that they are shown as near it.`}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() => {
              if (ok) onApply(v)
              onClose()
            }}
            data-testid="set-buffers-apply"
          >
            Set buffers
          </Button>
        </>
      }
    >
      <label className="flex items-center gap-2 text-xs">
        Buffer
        <NumberInput value={v} onChange={setV} step={0.05} min={0.05} max={49.9} unit="bp" className="w-28" aria-label="Buffer for every bin" autoFocus />
      </label>
    </Dialog>
  )
}

function BelowDialog({
  open,
  onClose,
  bins,
  counts,
  onApply,
}: {
  open: boolean
  onClose: () => void
  bins: readonly Bin[]
  counts: ReadonlyMap<number, number>
  onApply: (ids: Set<number>) => void
}) {
  const [min, setMin] = useState<number | null>(10)
  const doomed = min != null ? binsBelow(bins, counts, min) : []
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Delete bins with few peaks"
      description="Counts are the peaks inside each bin’s window now. Rare bins are often noise or a stutter position that happened to cluster; a rare true allele also looks like this, so check the list."
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={doomed.length === 0}
            onClick={() => {
              onApply(new Set(doomed.map((b) => b.id)))
              onClose()
            }}
            data-testid="delete-below-apply"
          >
            Delete {countOf(doomed.length, 'bin')}
          </Button>
        </>
      }
    >
      <label className="flex items-center gap-2 text-xs">
        Fewer than
        <NumberInput value={min} onChange={setMin} step={1} min={1} unit="peaks" className="w-28" aria-label="Minimum peaks" autoFocus />
      </label>
      <p className="mt-2 min-h-8 text-xs text-muted">
        {doomed.length ? `Deletes ${doomed.map((b) => `${b.label} (${counts.get(b.id) ?? 0})`).join(', ')}. You can undo this.` : 'No bin has fewer peaks than that.'}
      </p>
    </Dialog>
  )
}

function AddDialog({ open, onClose, suggest, buffer, onApply }: { open: boolean; onClose: () => void; suggest: number; buffer: number; onApply: (center: number, buffer: number) => void }) {
  const [center, setCenter] = useState<number | null>(null)
  const [buf, setBuf] = useState<number | null>(null)
  const c = center ?? +suggest.toFixed(2)
  const w = buf ?? buffer
  const ok = c > 0 && w >= 0.05 && w < 50
  const close = () => {
    setCenter(null)
    setBuf(null)
    onClose()
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title="Add a bin"
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() => {
              onApply(c, w)
              close()
            }}
            data-testid="add-bin-apply"
          >
            Add bin
          </Button>
        </>
      }
    >
      <div className="flex gap-3 text-xs">
        <label className="flex items-center gap-2">
          Center
          <NumberInput value={c} onChange={setCenter} step={0.05} unit="bp" className="w-28" aria-label="Center of the new bin" autoFocus />
        </label>
        <label className="flex items-center gap-2">
          Buffer
          <NumberInput value={w} onChange={setBuf} step={0.05} min={0.05} unit="bp" className="w-24" aria-label="Buffer of the new bin" />
        </label>
      </div>
    </Dialog>
  )
}
