/**
 * Samples: a virtualized table that stays smooth with tens of thousands of
 * rows, filtered by text and designation, with bulk designation changes and
 * deletes (one engine call each; samples it refuses are listed with the
 * reason). The detail shows the selected sample's runs and raw traces.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@tanstack/react-query'
import { ChevronDown, FileUp, FlaskConical, Plus, Tags, Trash2, X } from 'lucide-react'
import type { Designation, Sample, SampleRefusal } from '@/api/bindings'
import { api } from '@/api/client'
import { apiQuery } from '@/api/query'
import { countOf } from '@/lib/format'
import { ListDetailLayout, Page, PageHeader } from '@/layouts/layouts'
import { DataTable, type DataColumn } from '@/components/DataTable'
import { SelectInput } from '@/components/form/fields'
import { Button } from '@/components/ui/Button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/Menu'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { toast } from '@/stores/toasts'
import { IconButton } from '@/components/ui/IconButton'
import { errorText } from '@/features/loci/shared'
import { DESIGNATION_LABEL, DESIGNATIONS, DesignationBadge } from './designation'
import { CreateSampleDialog, DeleteSamplesDialog, ImportSamplesDialog, Refusals } from './dialogs'
import { SampleDetail } from './SampleDetail'

const columns: DataColumn<Sample>[] = [
  { id: 'barcode', header: 'Barcode', value: (s) => s.barcode, width: 150 },
  {
    id: 'designation',
    header: 'Designation',
    value: (s) => DESIGNATION_LABEL[s.designation],
    cell: (s) => <DesignationBadge d={s.designation} />,
    width: 104,
  },
  {
    id: 'loci',
    header: 'Loci',
    value: (s) => s.locus_count ?? null,
    align: 'right',
    width: 48,
    searchable: false,
    description: 'Loci the sample has runs at (loci covered)',
  },
  {
    id: 'runs',
    header: 'Runs',
    value: (s) => s.run_count,
    align: 'right',
    width: 52,
    searchable: false,
    description: 'Runs (well × locus) assigned to the sample',
  },
  {
    id: 'plates',
    header: 'Plates',
    value: (s) => (s.plate_labels ?? []).join(', '),
    cell: (s) => <PlateLabels labels={s.plate_labels ?? []} count={s.plate_count} />,
    width: 120,
    description: 'Plates the sample was run on (the filter matches them too)',
  },
]

function PlateLabels({ labels, count }: { labels: readonly string[]; count: number }) {
  if (count === 0) return <span className="text-faint">–</span>
  const text = labels.join(', ')
  return (
    <span className="block truncate text-muted" title={text}>
      {labels.length ? text : `${count} plates`}
    </span>
  )
}

type DesignationFilter = 'all' | Designation

const FILTER_OPTIONS: { value: DesignationFilter; label: string }[] = [
  { value: 'all', label: 'All designations' },
  ...DESIGNATIONS.map((d) => ({ value: d, label: `${DESIGNATION_LABEL[d]}s` })),
]

export default function SamplesPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const samples = useQuery(apiQuery(['samples'], 'list_samples'))
  const [filter, setFilter] = useState<DesignationFilter>('all')
  const [selected, setSelected] = useState<string[]>(() => (id ? [id] : []))
  const [urlId, setUrlId] = useState(id)
  if (urlId !== id) {
    setUrlId(id)
    if (id && !selected.includes(id)) setSelected([id])
  }
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Samples the last bulk designation change left alone, until dismissed.
  const [refused, setRefused] = useState<{ designation: Designation; refused: SampleRefusal[] } | null>(null)
  // Scroll to the sample a deep link opened (once, when the list arrives).
  const [linkedId] = useState(id ?? null)

  const all = useMemo(() => samples.data ?? [], [samples.data])
  const shown = useMemo(() => (filter === 'all' ? all : all.filter((s) => s.designation === filter)), [all, filter])
  const byId = useMemo(() => new Map(all.map((s) => [String(s.id), s])), [all])
  const selectedSamples = useMemo(() => selected.flatMap((sid) => byId.get(sid) ?? []), [selected, byId])
  const detailId = id ? Number(id) : null

  const select = (ids: string[]) => {
    setSelected(ids)
    if (ids.length === 1 && ids[0] !== id) void navigate(`/samples/${ids[0]}`, { replace: true })
  }

  const designate = useMutation({
    meta: { errorTitle: 'Could not change the designation' },
    mutationFn: (v: { ids: number[]; designation: Designation }) =>
      api.set_samples_designation({ sample_ids: v.ids, designation: v.designation }),
    onMutate: () => setRefused(null),
    onSuccess: (r, v) => {
      const done = new Set(r.done)
      qc.setQueryData<Sample[]>(['samples'], (old) => old?.map((x) => (done.has(x.id) ? { ...x, designation: v.designation } : x)))
      if (r.done.length) toast.success(`${countOf(r.done.length, 'sample')} set to ${DESIGNATION_LABEL[v.designation].toLowerCase()}`)
      if (r.refused.length) setRefused({ designation: v.designation, refused: r.refused })
    },
  })
  const setDesignation = (d: Designation) => {
    const ids = selectedSamples.filter((s) => s.designation !== d).map((s) => s.id)
    if (ids.length) designate.mutate({ ids, designation: d })
    else toast.info(`Already ${DESIGNATION_LABEL[d].toLowerCase()}${selectedSamples.length === 1 ? '' : 's'}`)
  }

  const header = (
    <PageHeader
      icon={<FlaskConical />}
      title="Samples"
      subtitle={samples.data ? countOf(all.length, 'sample') : undefined}
      actions={
        <>
          <Button size="sm" onClick={() => setImporting(true)}>
            <FileUp size={12} /> Import CSV
          </Button>
          <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
            <Plus size={13} /> New sample
          </Button>
        </>
      }
    />
  )

  const actionBar = (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-surface-2/60 px-2">
      <SelectInput
        aria-label="Designation filter"
        className="h-6 w-44 text-xs"
        value={filter}
        onChange={(v) => setFilter(v as DesignationFilter)}
        options={FILTER_OPTIONS}
      />
      <span className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" disabled={selectedSamples.length === 0 || designate.isPending}>
            {designate.isPending ? <Spinner className="size-3" /> : <Tags size={12} />}
            Set designation
            <ChevronDown size={11} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Set {countOf(selectedSamples.length, 'selected sample')} to</DropdownMenuLabel>
          {DESIGNATIONS.map((d) => (
            <DropdownMenuItem key={d} onSelect={() => setDesignation(d)}>
              {DESIGNATION_LABEL[d]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        size="sm"
        variant="danger-ghost"
        disabled={selectedSamples.length === 0}
        onClick={() => setDeleting(true)}
        title="Delete the selected samples"
      >
        <Trash2 size={12} />
        Delete
      </Button>
    </div>
  )

  const refusedBar = refused && (
    <div
      className="flex max-h-48 shrink-0 flex-col gap-1.5 border-b border-line bg-danger-soft/40 px-2 py-1.5"
      role="alert"
      data-testid="designation-refusals"
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium text-danger">
          {countOf(refused.refused.length, 'sample')} not set to {DESIGNATION_LABEL[refused.designation].toLowerCase()}
        </span>
        <IconButton label="Dismiss" size="icon-sm" className="ml-auto" onClick={() => setRefused(null)}>
          <X size={13} />
        </IconButton>
      </div>
      <Refusals refused={refused.refused} />
    </div>
  )

  let detail
  if (selectedSamples.length > 1)
    detail = (
      <EmptyState icon={<FlaskConical />} title={`${countOf(selectedSamples.length, 'sample')} selected`}>
        Change their designation or delete them with the buttons above the table. Select one sample to see its runs.
      </EmptyState>
    )
  else if (detailId != null && !Number.isNaN(detailId))
    detail = (
      <SampleDetail
        key={detailId}
        id={detailId}
        onDeleted={() => {
          setSelected([])
          void navigate('/samples', { replace: true })
        }}
      />
    )
  else
    detail = (
      <EmptyState icon={<FlaskConical />} title="No sample selected">
        Select a sample to see its runs by locus and look at any run's raw trace.
      </EmptyState>
    )

  if (samples.isPending)
    return (
      <Page header={header}>
        <div className="grid flex-1 place-items-center text-muted">
          <Spinner />
        </div>
      </Page>
    )
  if (samples.isError)
    return (
      <Page header={header}>
        <EmptyState title="Could not load samples">{errorText(samples.error)}</EmptyState>
      </Page>
    )

  return (
    <Page header={header}>
      {all.length === 0 ? (
        <EmptyState
          icon={<FlaskConical />}
          title="No samples yet"
          action={
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setImporting(true)}>
                <FileUp size={12} /> Import CSV
              </Button>
              <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
                <Plus size={13} /> New sample
              </Button>
            </div>
          }
        >
          Samples are usually created by applying a plate map with “create samples” on the Plates page. You can also import a list of
          barcodes.
        </EmptyState>
      ) : (
        <ListDetailLayout
          id="samples"
          listWidth={500}
          minListWidth={380}
          list={
            <>
              {actionBar}
              {refusedBar}
              <DataTable
                data={shown}
                columns={columns}
                getRowId={(s) => String(s.id)}
                selectionMode="multi"
                selected={selected}
                onSelectionChange={select}
                filterPlaceholder="Filter barcodes or plates…"
                ariaLabel="Samples"
                emptyMessage="No samples match the filter"
                scrollToId={linkedId}
              />
            </>
          }
          detail={detail}
        />
      )}
      <CreateSampleDialog open={creating} onOpenChange={setCreating} onCreated={(s) => select([String(s.id)])} />
      <ImportSamplesDialog open={importing} onOpenChange={setImporting} existing={all} />
      <DeleteSamplesDialog
        open={deleting}
        onOpenChange={setDeleting}
        samples={selectedSamples}
        onDeleted={(ids) => {
          const gone = new Set(ids.map(String))
          setSelected((cur) => cur.filter((x) => !gone.has(x)))
          if (id && gone.has(id)) void navigate('/samples', { replace: true })
        }}
      />
    </Page>
  )
}
