/**
 * Controls: known lab strains with one allele (a bin of a bin estimator) per
 * locus. Quantification-bias estimators mix them in known proportions to
 * measure amplification bias. The list shows each control's bin estimator,
 * how many loci have an allele, and how many control mixtures use it; the
 * editor on the right sets its alleles. `/controls/new` starts a new one.
 * Leaving with unsaved edits asks first (the editor registers them with
 * `lib/unsaved`).
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, Plus, ShieldCheck } from 'lucide-react'
import { api } from '@/api/client'
import type { Control } from '@/api/bindings'
import { isRpcError } from '@/api/transport'
import { DataTable, type DataColumn } from '@/components/DataTable'
import { SelectInput } from '@/components/form/fields'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState, NotFound } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { ListDetailLayout, Page, PageHeader } from '@/layouts/layouts'
import { countOf } from '@/lib/format'
import { bypassUnsaved } from '@/lib/unsaved'
import { toast } from '@/stores/toasts'
import { KINDS } from '@/features/projects-shared/kinds'
import { useProjects } from '@/features/projects-shared/queries'
import { ControlEditor } from './ControlEditor'
import { allelesSet, copyLabel } from './model'
import { useControls } from './queries'

export default function ControlsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const controls = useControls()
  const bes = useProjects('bin_estimator')
  const isNew = id === 'new'
  const selectedId = id && /^\d+$/.test(id) ? Number(id) : null
  const [beFilter, setBeFilter] = useState('all')
  const [deleting, setDeleting] = useState<Control | null>(null)

  const all = useMemo(() => controls.data ?? [], [controls.data])
  const shown = useMemo(() => (beFilter === 'all' ? all : all.filter((c) => String(c.bin_estimator_id) === beFilter)), [all, beFilter])
  const selected = all.find((c) => c.id === selectedId) ?? null
  const binEstimators = useMemo(() => bes.data ?? [], [bes.data])

  const go = (path: string) => navigate(path, { replace: !isNew })

  const duplicate = useMutation({
    mutationFn: (c: Control) =>
      api.create_control({
        bin_estimator_id: c.bin_estimator_id,
        label: copyLabel(
          c.label,
          all.filter((x) => x.bin_estimator_id === c.bin_estimator_id).map((x) => x.label),
        ),
        alleles: c.alleles.filter((a) => a.bin_id != null).map((a) => ({ locus_id: a.locus_id, bin_id: a.bin_id })),
      }),
    meta: { errorTitle: 'Could not duplicate the control' },
    onSuccess: (c) => {
      toast.success(`Created ${c.label}`, 'A copy with the same alleles. Rename it and change what differs.')
      navigate(`/controls/${c.id}`)
    },
  })

  const columns = useMemo<DataColumn<Control>[]>(
    () => [
      { id: 'label', header: 'Name', value: (c) => c.label, cell: (c) => <span className="font-medium">{c.label}</span>, width: 130 },
      { id: 'be', header: 'Bin estimator', value: (c) => c.bin_estimator_title, width: 140 },
      {
        id: 'alleles',
        header: 'Alleles',
        description: 'Loci with an allele set, of the loci in the bin estimator’s locus set',
        value: (c) => allelesSet(c).set,
        searchable: false,
        align: 'right',
        width: 74,
        cell: (c) => {
          const { set, total } = allelesSet(c)
          return (
            <span className={set < total ? 'flex items-center justify-end gap-1 text-warn' : 'num'} title={set < total ? `No allele at ${c.alleles.filter((a) => a.bin_id == null).map((a) => a.locus_label).join(', ')}` : undefined}>
              {set < total && <AlertTriangle size={11} />}
              <span className="num">
                {set}/{total}
              </span>
            </span>
          )
        },
      },
      {
        id: 'used',
        header: 'Mixtures',
        description: 'Control mixtures of quantification-bias estimators that include it',
        value: (c) => c.mixture_count,
        cell: (c) => (c.mixture_count ? <span className="num">{c.mixture_count.toLocaleString('en-US')}</span> : <span className="text-faint">–</span>),
        searchable: false,
        align: 'right',
        width: 84,
      },
    ],
    [],
  )

  const header = (
    <PageHeader
      icon={<ShieldCheck />}
      title="Controls"
      subtitle={controls.data ? `${countOf(all.length, 'control')} · known strains for quantification bias` : undefined}
      actions={
        <>
          <Button
            size="sm"
            variant="primary"
            disabled={binEstimators.length === 0}
            title={binEstimators.length === 0 ? 'A control’s alleles are bins: create a bin estimator first' : 'New control'}
            onClick={() => go('/controls/new')}
            data-testid="new-control"
          >
            <Plus size={13} /> New control
          </Button>
        </>
      }
    />
  )

  if (controls.isPending || bes.isPending)
    return (
      <Page header={header}>
        <div className="grid flex-1 place-items-center text-muted">
          <Spinner />
        </div>
      </Page>
    )
  if (controls.isError || bes.isError)
    return (
      <Page header={header}>
        <EmptyState title="Could not load controls">{((controls.error ?? bes.error) as Error).message}</EmptyState>
      </Page>
    )

  let detail
  if (isNew)
    detail = (
      <ControlEditor
        key="new"
        control={null}
        binEstimators={binEstimators}
        onSaved={(c) => {
          bypassUnsaved(() => navigate(`/controls/${c.id}`, { replace: true }))
        }}
        onCancelNew={() => bypassUnsaved(() => navigate(selectedId ? `/controls/${selectedId}` : '/controls', { replace: true }))}
      />
    )
  else if (selected)
    detail = (
      <ControlEditor
        key={selected.id}
        control={selected}
        binEstimators={binEstimators}
        onDelete={() => setDeleting(selected)}
        onDuplicate={() => duplicate.mutate(selected)}
      />
    )
  else if (selectedId != null) detail = <NotFound what="control" />
  else
    detail = (
      <EmptyState icon={<ShieldCheck />} title={all.length ? 'Select a control' : 'No controls yet'}>
        A control is a lab strain with one known allele per locus. Mixing controls in known proportions lets a quantification-bias estimator measure how much
        PCR favours shorter alleles.
      </EmptyState>
    )

  return (
    <Page header={header}>
      {binEstimators.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="Controls need a bin estimator"
          action={
            <Button asChild size="sm" variant="primary">
              <Link to={KINDS.bin_estimator.path}>Bin estimators</Link>
            </Button>
          }
        >
          A control's alleles are bins of a bin estimator. Create and analyze a bin estimator first.
        </EmptyState>
      ) : (
        <ListDetailLayout
          id="controls"
          listWidth={560}
          minListWidth={380}
          list={
            all.length === 0 ? (
              <EmptyState
                title="No controls yet"
                action={
                  <Button size="sm" variant="primary" onClick={() => go('/controls/new')}>
                    <Plus size={13} /> New control
                  </Button>
                }
              >
                Add each lab strain you mix into control samples (e.g. 3D7, HB3, DD2) with its allele at every locus.
              </EmptyState>
            ) : (
              <DataTable
                data={shown}
                columns={columns}
                getRowId={(c) => String(c.id)}
                selectionMode="single"
                selected={selectedId != null ? [String(selectedId)] : []}
                onSelectionChange={(ids) => ids[0] && Number(ids[0]) !== selectedId && go(`/controls/${ids[0]}`)}
                ariaLabel="Controls"
                filterPlaceholder="Filter controls…"
                initialSort={[{ id: 'be', desc: false }]}
                toolbar={
                  binEstimators.length > 1 ? (
                    <SelectInput
                      value={beFilter}
                      onChange={setBeFilter}
                      className="w-44"
                      aria-label="Bin estimator filter"
                      options={[{ value: 'all', label: 'All bin estimators' }, ...binEstimators.map((b) => ({ value: String(b.id), label: b.title }))]}
                    />
                  ) : undefined
                }
                emptyMessage="No controls match the filter"
              />
            )
          }
          detail={detail}
        />
      )}
      {deleting && <DeleteControlDialog control={deleting} onClose={() => setDeleting(null)} onDeleted={() => bypassUnsaved(() => navigate('/controls', { replace: true }))} />}
    </Page>
  )
}

function DeleteControlDialog({ control, onClose, onDeleted }: { control: Control; onClose: () => void; onDeleted: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const del = useMutation({
    mutationFn: () => api.delete_control({ id: control.id }),
    meta: { silent: true },
    onSuccess: () => {
      toast.success(`Deleted ${control.label}`)
      onClose()
      onDeleted()
    },
    onError: (e) => setError(isRpcError(e) ? e.message : String(e)),
  })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Delete control ${control.label}?`}
      width="sm"
      footer={
        <>
          <Button onClick={onClose}>{error ? 'Close' : 'Cancel'}</Button>
          {!error && (
            <Button variant="danger" onClick={() => del.mutate()} disabled={del.isPending} data-testid="confirm-delete-control">
              {del.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          )}
        </>
      }
    >
      {error ? (
        <p role="alert" className="flex gap-2 text-xs text-danger" data-testid="delete-control-error">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      ) : (
        <p className="text-xs text-muted">
          {control.mixture_count
            ? `It is in ${countOf(control.mixture_count, 'control mixture')}. A control that a mixture uses cannot be deleted; remove those mixtures first.`
            : 'Its alleles are deleted with it. No control mixture uses it.'}
        </p>
      )}
    </Dialog>
  )
}
