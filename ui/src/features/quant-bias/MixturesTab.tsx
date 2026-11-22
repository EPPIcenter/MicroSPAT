/**
 * The control mixtures of a quantification-bias estimator: which samples it
 * uses and, for each, the controls mixed into it and their shares. Assign
 * from a CSV (previewed through the engine's dry run) or directly; edit and
 * remove. Changes make the loci stale until re-analyzed.
 */
import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { FileUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '@/api/client'
import type { ProjectDetail, ProjectSampleRow } from '@/api/bindings'
import { DataTable, type DataColumn } from '@/components/DataTable'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { countOf } from '@/lib/format'
import { toast } from '@/stores/toasts'
import { useProjectSamples } from '@/features/projects-shared/queries'
import { useControls } from '@/features/controls/queries'
import { MixtureCsvDialog } from './MixtureCsvDialog'
import { MixtureEditorDialog } from './MixtureEditorDialog'
import { fmtPercentNumber } from './model/mixtures'

const STRAIN_COLORS = ['blue', 'green', 'orange', 'red', 'yellow'] as const

export function MixturesTab({ detail }: { detail: ProjectDetail }) {
  const p = detail.project
  const rows = useProjectSamples(p.id)
  const controls = useControls()
  const [selected, setSelected] = useState<string[]>([])
  const [csv, setCsv] = useState(false)
  const [editing, setEditing] = useState<ProjectSampleRow[] | null | 'new'>(null)
  const [removing, setRemoving] = useState(false)
  const own = useMemo(() => (controls.data ?? []).filter((c) => c.bin_estimator_id === p.bin_estimator?.id), [controls.data, p.bin_estimator])
  const colorOf = useMemo(() => new Map(own.map((c, i) => [c.id, STRAIN_COLORS[i % STRAIN_COLORS.length]!])), [own])
  const data = useMemo(() => rows.data ?? [], [rows.data])
  const sel = data.filter((r) => selected.includes(String(r.sample_id)))

  const remove = useMutation({
    mutationFn: (ids: number[]) => api.remove_project_samples({ id: p.id, sample_ids: ids }),
    meta: { errorTitle: 'Could not remove the mixtures' },
    onSuccess: (n) => {
      toast.success(`Removed ${countOf(n, 'mixture')}`, 'The samples stay in the workspace. Analyze the loci to update β.')
      setSelected([])
    },
  })

  const columns = useMemo<DataColumn<ProjectSampleRow>[]>(
    () => [
      { id: 'barcode', header: 'Sample', value: (r) => r.barcode, cell: (r) => <span className="font-medium">{r.barcode}</span>, width: 190 },
      {
        id: 'mixture',
        header: 'Mixture',
        value: (r) => r.controls.map((c) => `${c.label} ${fmtPercentNumber(c.proportion * 100)}%`).join(' · '),
        cell: (r) =>
          r.controls.length ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex h-2 w-16 shrink-0 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                {r.controls.map((c) => (
                  <span key={c.control_id} style={{ width: `${c.proportion * 100}%`, background: `var(--dye-${colorOf.get(c.control_id) ?? 'blue'})` }} />
                ))}
              </span>
              <span className="truncate">
                {r.controls.map((c, i) => (
                  <span key={c.control_id}>
                    {i > 0 && <span className="text-faint"> · </span>}
                    {c.label} <span className="num text-muted">{fmtPercentNumber(c.proportion * 100)}%</span>
                  </span>
                ))}
              </span>
            </span>
          ) : (
            <span className="text-warn">no controls</span>
          ),
        width: 300,
      },
      { id: 'n', header: 'Strains', value: (r) => r.controls.length, align: 'right', width: 64, searchable: false },
      {
        id: 'runs',
        header: 'Runs',
        description: 'Runs of the sample at the project’s loci',
        value: (r) => r.run_count,
        cell: (r) => (r.run_count ? <span className="num">{r.run_count}</span> : <span className="text-warn">0</span>),
        align: 'right',
        width: 56,
        searchable: false,
      },
    ],
    [colorOf],
  )

  const actions = (
    <>
      <Button size="sm" variant="ghost" disabled={sel.length === 0} onClick={() => setRemoving(true)} data-testid="remove-mixtures">
        <Trash2 size={12} /> Remove{sel.length ? ` ${sel.length}` : ''}
      </Button>
      <Button size="sm" variant="ghost" disabled={sel.length === 0} onClick={() => setEditing(sel)} data-testid="edit-mixtures">
        <Pencil size={12} /> Edit
      </Button>
      <Button size="sm" onClick={() => setCsv(true)} data-testid="import-mixtures">
        <FileUp size={12} /> Import CSV
      </Button>
      <Button size="sm" variant="primary" onClick={() => setEditing('new')} data-testid="add-mixtures">
        <Plus size={13} /> Assign mixtures
      </Button>
    </>
  )

  let body
  if (rows.isPending)
    body = (
      <div className="grid flex-1 place-items-center text-muted">
        <Spinner />
      </div>
    )
  else if (rows.isError) body = <EmptyState title="Could not load the mixtures">{(rows.error as Error).message}</EmptyState>
  else if (data.length === 0)
    body = (
      <EmptyState
        title="No control mixtures yet"
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setCsv(true)}>
              <FileUp size={12} /> Import CSV
            </Button>
            <Button size="sm" variant="primary" onClick={() => setEditing('new')}>
              <Plus size={13} /> Assign mixtures
            </Button>
          </div>
        }
      >
        A control mixture is a sample made by mixing known strains (controls of {p.bin_estimator?.title ?? 'the bin estimator'}) in known proportions, for example 3D7 70% and DD2 30%.
        Mixtures of two strains at several ratios, run on the same plates as your samples, work best.
      </EmptyState>
    )
  else
    body = (
      <DataTable
        data={data}
        columns={columns}
        getRowId={(r) => String(r.sample_id)}
        selectionMode="multi"
        selected={selected}
        onSelectionChange={setSelected}
        onRowActivate={(r) => setEditing([r])}
        ariaLabel="Control mixtures"
        filterPlaceholder="Filter mixtures…"
        initialSort={[{ id: 'barcode', desc: false }]}
        toolbar={actions}
      />
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface" data-testid="mixtures-tab">
      <p className="shrink-0 border-b border-line px-3 py-1.5 text-xs text-muted">
        Each sample here is a mixture of control strains in known proportions. Their peaks at each locus give observed shares to compare with the true ones. Double-click a
        mixture to edit it.
        {data.some((r) => r.run_count === 0) && <span className="text-warn"> Samples with 0 runs have no data at these loci and add nothing.</span>}
      </p>
      {body}
      <MixtureCsvDialog detail={detail} rows={data} controls={controls.data ?? []} open={csv} onOpenChange={setCsv} />
      {editing && (
        <MixtureEditorDialog
          key={editing === 'new' ? 'new' : editing.map((r) => r.sample_id).join(',')}
          detail={detail}
          controls={own}
          rows={data}
          editing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove ${countOf(sel.length, 'mixture')}?`}
        description="The samples leave this estimator with their compositions. They stay in the workspace. Loci become stale until re-analyzed."
        confirmLabel="Remove"
        destructive
        onConfirm={() => remove.mutateAsync(sel.map((r) => r.sample_id))}
      />
    </div>
  )
}
