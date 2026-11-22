/** The plate list: sortable, filterable, multi-select with delete. */
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Trash2, TriangleAlert } from 'lucide-react'
import type { PlateSummary } from '@/api/bindings'
import { api } from '@/api/client'
import { DataTable, type DataColumn } from '@/components/DataTable'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Tooltip } from '@/components/ui/Tooltip'
import { toast } from '@/stores/toasts'
import { qualityLabel, qualityRank } from './model/quality'
import { fmtRunDate, problemCount } from './model/status'
import { QualityIndicator } from './QualityPanel'
import { SizingCountsInline } from './parts'
import { plateKeys } from './queries'

export function PlateList({
  plates,
  selected,
  onSelectionChange,
  onOpen,
  onDeleted,
}: {
  plates: readonly PlateSummary[]
  selected: string[]
  onSelectionChange: (ids: string[]) => void
  onOpen: (id: number) => void
  onDeleted: (ids: number[]) => void
}) {
  const [confirm, setConfirm] = useState(false)
  const qc = useQueryClient()
  const columns = useMemo<DataColumn<PlateSummary>[]>(
    () => [
      {
        id: 'label',
        header: 'Plate',
        value: (p) => p.label,
        cell: (p) => <span className="font-medium">{p.label}</span>,
        width: 104,
      },
      {
        id: 'run_date',
        header: 'Run date',
        value: (p) => p.run_date ?? '',
        cell: (p) => <span className="num text-muted">{fmtRunDate(p.run_date).slice(0, 10)}</span>,
        width: 92,
      },
      {
        id: 'sizing',
        header: 'Sizing',
        description: 'Wells per ladder sizing state: good, flagged, unusable, failed. Sorts by wells needing a look.',
        value: (p) => problemCount(p.sizing),
        searchable: false,
        cell: (p) => <SizingCountsInline counts={p.sizing} total={p.well_count} />,
        width: 96,
      },
      {
        id: 'quality',
        header: 'Quality',
        description:
          'Issues the quality check found: problems, warnings and notes. Sorts by the worst; "Not checked" for plates imported before quality checks.',
        value: (p) => qualityLabel(p.quality),
        sortValue: (p) => qualityRank(p.quality),
        cell: (p) => <QualityIndicator summary={p.quality} compact />,
        width: 92,
      },
      {
        id: 'map',
        header: 'Map',
        description: 'Plate map applied (wells assigned to samples and loci)',
        value: (p) => p.has_plate_map,
        searchable: false,
        align: 'center',
        cell: (p) =>
          p.has_plate_map ? (
            <Check size={13} className="inline text-ok" aria-label="Plate map applied" />
          ) : (
            <span className="text-faint" aria-label="No plate map">
              –
            </span>
          ),
        width: 48,
      },
      {
        id: 'qc',
        header: 'QC',
        description: 'Contaminated negative controls',
        value: (p) => p.contaminated_loci.join(' '),
        align: 'center',
        cell: (p) =>
          p.contaminated_loci.length ? (
            <Tooltip content={`Negative controls show signal: ${p.contaminated_loci.join(', ')}`}>
              <span className="inline-flex items-center gap-0.5 text-danger" aria-label={`Contaminated: ${p.contaminated_loci.join(', ')}`}>
                <TriangleAlert size={13} />
                <span className="num text-2xs">{p.contaminated_loci.length}</span>
              </span>
            </Tooltip>
          ) : (
            <span className="sr-only">clean</span>
          ),
        width: 44,
      },
      { id: 'wells', header: 'Wells', value: (p) => p.well_count, align: 'right', width: 56 },
      { id: 'ladder', header: 'Ladder', value: (p) => p.ladder_label, width: 120 },
      { id: 'instrument', header: 'Instrument', value: (p) => p.instrument ?? '', width: 110 },
      {
        id: 'imported',
        header: 'Imported',
        value: (p) => p.imported_at,
        cell: (p) => <span className="num text-muted">{p.imported_at.slice(0, 10)}</span>,
        width: 90,
      },
    ],
    [],
  )

  const byId = useMemo(() => new Map(plates.map((p) => [String(p.id), p])), [plates])
  const toDelete = selected.map((id) => byId.get(id)).filter((p): p is PlateSummary => !!p)

  const remove = async () => {
    const done: number[] = []
    try {
      for (const p of toDelete) {
        await api.delete_plate({ id: p.id })
        qc.removeQueries({ queryKey: plateKeys.detail(p.id) })
        done.push(p.id)
      }
      toast.success(`Deleted ${done.length} plate${done.length === 1 ? '' : 's'}`)
    } catch (e) {
      toast.error('Could not delete plate', (e as Error).message)
    } finally {
      if (done.length) onDeleted(done)
    }
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length && !(e.target instanceof HTMLInputElement)) {
          e.preventDefault()
          setConfirm(true)
        }
      }}
    >
      <DataTable
        data={plates}
        columns={columns}
        getRowId={(p) => String(p.id)}
        selectionMode="multi"
        selected={selected}
        onSelectionChange={onSelectionChange}
        onRowActivate={(p) => onOpen(p.id)}
        filterPlaceholder="Filter plates…"
        ariaLabel="Plates"
        emptyMessage="No plates match the filter"
        toolbar={
          selected.length > 0 && (
            <Button
              size="sm"
              variant="danger-ghost"
              onClick={() => setConfirm(true)}
              title={`Delete ${selected.length === 1 ? 'the selected plate' : `${selected.length} plates`} (Delete key)`}
              aria-label={`Delete ${selected.length === 1 ? 'selected plate' : `${selected.length} plates`}`}
            >
              <Trash2 size={12} />
              {selected.length > 1 && selected.length}
            </Button>
          )
        }
      />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive
        title={toDelete.length === 1 ? `Delete plate ${toDelete[0]?.label}?` : `Delete ${toDelete.length} plates?`}
        description={
          <>
            {toDelete.length > 1 && <span className="mb-1 block text-fg">{toDelete.map((p) => p.label).join(', ')}</span>}
            Their wells, traces and plate-map runs are removed from the workspace. Samples stay. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </div>
  )
}
