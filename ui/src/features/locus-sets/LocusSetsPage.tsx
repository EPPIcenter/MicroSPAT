/**
 * Locus sets: named groups of loci analyzed together. List on the left; the
 * detail shows the set's per-dye layout and picks members from the loci table
 * (selection = membership). `/locus-sets/new` creates one.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Layers, Plus, Trash2, Undo2 } from 'lucide-react'
import type { Color, Locus, LocusSet, LocusSetDetail } from '@/api/bindings'
import { api } from '@/api/client'
import { apiQuery } from '@/api/query'
import { COLORS } from '@/api/helpers'
import { countOf } from '@/lib/format'
import { ListDetailLayout, Page, PageHeader } from '@/layouts/layouts'
import { DataTable, type DataColumn } from '@/components/DataTable'
import { TextField } from '@/components/form/fields'
import { Button } from '@/components/ui/Button'
import { DyeChip } from '@/components/ui/Badge'
import { EmptyState, NotFound } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { toast } from '@/stores/toasts'
import { LocusLayout } from '@/features/loci/LocusLayout'
import { findOverlaps, overlapIndex } from '@/features/loci/overlap'
import { Banner, BulkDeleteDialog, DyeFilter, errorCode, errorText } from '@/features/loci/shared'

export default function LocusSetsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const sets = useQuery(apiQuery(['locus_sets'], 'list_locus_sets'))
  const loci = useQuery(apiQuery(['loci'], 'list_loci'))
  const isNew = id === 'new'
  // `/locus-sets/new?loci=1,2,3` starts the new set with those loci (from the Loci page's selection).
  const [search] = useSearchParams()
  const preset = useMemo(() => (search.get('loci') ?? '').split(',').filter((v) => /^\d+$/.test(v)), [search])
  const selectedId = id && !isNew ? Number(id) : null
  const selected = sets.data?.find((s) => s.id === selectedId) ?? null
  // Open the first set when none is chosen.
  useEffect(() => {
    if (!id && sets.data?.length) void navigate(`/locus-sets/${sets.data[0]!.id}`, { replace: true })
  }, [id, sets.data, navigate])
  const lociById = useMemo(() => new Map((loci.data ?? []).map((l) => [l.id, l])), [loci.data])

  const columns = useMemo<DataColumn<LocusSet>[]>(
    () => [
      { id: 'label', header: 'Label', value: (s) => s.label, width: 150 },
      { id: 'n', header: 'Loci', value: (s) => s.locus_ids.length, align: 'right', width: 50, searchable: false },
      {
        id: 'dyes',
        header: 'Dyes',
        value: (s) => dyesOf(s, lociById).join(' '),
        cell: (s) => (
          <span className="flex items-center gap-1">
            {dyesOf(s, lociById).map((c) => (
              <span key={c} title={c} className="size-2.5 rounded-[3px]" style={{ background: `var(--dye-${c})` }} />
            ))}
          </span>
        ),
        width: 90,
        searchable: false,
      },
    ],
    [lociById],
  )

  let detail
  if (sets.isPending || loci.isPending)
    detail = (
      <div className="grid h-full place-items-center text-muted">
        <Spinner />
      </div>
    )
  else if (sets.isError) detail = <EmptyState title="Could not load locus sets">{errorText(sets.error)}</EmptyState>
  else if (isNew)
    detail = (
      <SetEditor key="new" loci={loci.data ?? []} initialIds={preset} onDone={(s) => navigate(s ? `/locus-sets/${s.id}` : '/locus-sets')} />
    )
  else if (selected)
    detail = <SetDetailView key={selected.id} id={selected.id} loci={loci.data ?? []} onDeleted={() => navigate('/locus-sets')} />
  else if (selectedId != null) detail = <NotFound what="locus set" />
  else
    detail = (
      <EmptyState
        icon={<Layers />}
        title={sets.data?.length ? 'Select a locus set' : 'No locus sets yet'}
        action={
          loci.data && loci.data.length === 0 ? (
            <Button asChild size="sm" variant="primary" data-testid="prerequisite-link">
              <Link to="/loci">Go to Loci</Link>
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={() => navigate('/locus-sets/new')}>
              <Plus size={13} /> New locus set
            </Button>
          )
        }
      >
        A locus set is a group of loci analyzed together; every project uses one.
        {loci.data?.length === 0 && ' It needs loci: create them, or import them from CSV, on the Loci page first.'}
      </EmptyState>
    )

  return (
    <Page
      header={
        <PageHeader
          icon={<Layers />}
          title="Locus sets"
          subtitle="Groups of loci analyzed together"
          actions={
            <Button
              size="sm"
              variant="primary"
              onClick={() => navigate('/locus-sets/new')}
              disabled={loci.data?.length === 0}
              title={loci.data?.length === 0 ? 'Create loci first' : 'New locus set'}
            >
              <Plus size={13} /> New locus set
            </Button>
          }
        />
      }
    >
      <ListDetailLayout
        id="locus-sets"
        listWidth={360}
        list={
          <DataTable
            data={sets.data ?? []}
            columns={columns}
            getRowId={(s) => String(s.id)}
            selectionMode="single"
            selected={selectedId != null ? [String(selectedId)] : []}
            onSelectionChange={(ids) => ids[0] && navigate(`/locus-sets/${ids[0]}`)}
            ariaLabel="Locus sets"
            emptyMessage={sets.isPending ? 'Loading…' : 'No locus sets'}
          />
        }
        detail={detail}
      />
    </Page>
  )
}

function dyesOf(s: LocusSet, byId: Map<number, Locus>) {
  const present = new Set(s.locus_ids.map((i) => byId.get(i)?.color))
  return COLORS.filter((c) => present.has(c))
}

function SetDetailView({ id, loci, onDeleted }: { id: number; loci: Locus[]; onDeleted: () => void }) {
  const set = useQuery({ ...apiQuery(['locus_sets', id], 'get_locus_set', { id }), meta: { silent: true } })
  if (set.isPending)
    return (
      <div className="grid h-full place-items-center text-muted">
        <Spinner />
      </div>
    )
  if (set.isError) return <EmptyState title="Could not load the locus set">{errorText(set.error)}</EmptyState>
  return <SetEditor set={set.data} loci={loci} onDone={(s) => (s ? undefined : onDeleted())} />
}

/** Rename, change members, delete; or create when `set` is absent. */
function SetEditor({
  set,
  loci,
  initialIds,
  onDone,
}: {
  set?: LocusSetDetail
  loci: Locus[]
  initialIds?: string[]
  onDone: (s: LocusSetDetail | null) => void
}) {
  const qc = useQueryClient()
  const savedIds = useMemo(() => (set?.loci ?? []).map((l) => String(l.id)), [set])
  const [label, setLabel] = useState(set?.label ?? '')
  const [members, setMembers] = useState<string[]>(() =>
    set ? savedIds : (initialIds ?? []).filter((i) => loci.some((l) => String(l.id) === i)),
  )
  const [dyes, setDyes] = useState<Color[]>([])
  const [err, setErr] = useState<{ field: 'label' | 'members'; message: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const memberSet = new Set(members)
  const memberLoci = loci.filter((l) => memberSet.has(String(l.id)))
  const overlaps = findOverlaps(memberLoci)
  const flagged = overlapIndex(overlaps)
  const labelDirty = label.trim() !== (set?.label ?? '')
  const membersDirty = [...members].sort().join() !== [...savedIds].sort().join()
  const isDirty = !set || labelDirty || membersDirty
  const valid = label.trim() !== '' && members.length > 0
  const shown = dyes.length ? loci.filter((l) => dyes.includes(l.color)) : loci

  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => {
      const ids = members.map(Number)
      return set
        ? api.update_locus_set({ id: set.id, label: labelDirty ? label.trim() : undefined, locus_ids: membersDirty ? ids : undefined })
        : api.create_locus_set({ label: label.trim(), locus_ids: ids })
    },
    onMutate: () => setErr(null),
    onSuccess: (s) => {
      qc.setQueryData(['locus_sets', s.id], s)
      toast.success(set ? 'Locus set saved' : 'Locus set created', s.label)
      if (!set) onDone(s)
    },
    onError: (e) => {
      const m = errorText(e)
      setErr({ field: errorCode(e) === 'conflict' || /label/i.test(m) ? 'label' : 'members', message: m })
    },
  })

  const columns: DataColumn<Locus>[] = [
    {
      id: 'in',
      header: 'In set',
      value: (l) => (memberSet.has(String(l.id)) ? 1 : 0),
      cell: (l) => (
        <span aria-label={memberSet.has(String(l.id)) ? 'In set' : 'Not in set'} className="grid place-items-center">
          <span
            className={memberSet.has(String(l.id)) ? 'size-3 rounded-[3px] bg-accent' : 'size-3 rounded-[3px] border border-line-strong'}
          />
        </span>
      ),
      width: 56,
      align: 'center',
      searchable: false,
    },
    {
      id: 'label',
      header: 'Locus',
      value: (l) => l.label,
      cell: (l) => (
        <span className="flex items-center gap-1.5">
          {l.label}
          {flagged.has(l.id) && (
            <AlertTriangle size={12} className="text-danger" aria-label={`Overlaps ${flagged.get(l.id)!.join(', ')}`} />
          )}
        </span>
      ),
      width: 130,
    },
    { id: 'color', header: 'Dye', value: (l) => l.color, cell: (l) => <DyeChip color={l.color} />, width: 80 },
    {
      id: 'range',
      header: 'Range (bp)',
      value: (l) => l.min_base_length,
      cell: (l) => `${l.min_base_length}–${l.max_base_length}`,
      align: 'right',
      width: 96,
      searchable: false,
    },
    { id: 'repeat', header: 'Repeat', value: (l) => l.nucleotide_repeat_length, align: 'right', width: 64, searchable: false },
    { id: 'runs', header: 'Runs', value: (l) => l.run_count, align: 'right', width: 64, searchable: false },
  ]

  const busy = save.isPending
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      aria-label={set ? `Locus set ${set.label}` : 'New locus set'}
      onSubmit={(e) => {
        e.preventDefault()
        if (valid && isDirty && !busy) save.mutate()
      }}
    >
      <div className="flex shrink-0 items-end gap-3 border-b border-line bg-surface px-4 py-3">
        <TextField
          className="w-72"
          label={set ? 'Name' : 'Name of the new locus set'}
          value={label}
          onChange={(v) => {
            setLabel(v)
            if (err?.field === 'label') setErr(null)
          }}
          error={err?.field === 'label' ? err.message : set && label.trim() === '' ? 'Required' : null}
          dirty={!!set && labelDirty}
          help="Unique name of the locus set."
        />
        <span className="pb-1.5 text-xs text-muted">{countOf(members.length, 'locus', 'loci')}</span>
        <div className="ml-auto flex items-center gap-1.5 pb-0.5">
          {set && (
            <Button size="sm" variant="danger-ghost" onClick={() => setDeleting(true)}>
              <Trash2 size={12} /> Delete
            </Button>
          )}
          {set ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={!isDirty || busy}
              onClick={() => {
                setLabel(set.label)
                setMembers(savedIds)
                setErr(null)
              }}
            >
              <Undo2 size={12} /> Revert
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => onDone(null)}>
              Cancel
            </Button>
          )}
          <Button size="sm" variant="primary" type="submit" disabled={!valid || !isDirty || busy}>
            {busy && <Spinner className="size-3" />}
            {set ? 'Save' : 'Create locus set'}
          </Button>
        </div>
      </div>
      <section className="shrink-0 border-b border-line bg-surface px-4 py-2" aria-label="Size layout of the set">
        <div className="mb-1 flex items-center gap-2 text-2xs font-semibold tracking-wide text-faint uppercase">
          Size layout
          {overlaps.length > 0 && (
            <span className="flex items-center gap-1 font-normal tracking-normal text-danger normal-case">
              <AlertTriangle size={11} />
              {overlaps.map((o) => `${o.a.label} / ${o.b.label} overlap on ${o.color}`).join('; ')}
            </span>
          )}
        </div>
        <div className="pr-4">
          <LocusLayout loci={memberLoci} emptyText="Pick loci below to add them to the set." />
        </div>
        {err?.field === 'members' && (
          <Banner tone="danger" className="mt-2">
            {err.message}
          </Banner>
        )}
      </section>
      <div className="flex h-8 shrink-0 items-center gap-2 bg-surface-2 px-3 text-xs text-muted">
        Click a locus to add or remove it; Shift-click adds a range; Cmd/Ctrl+A adds every locus shown.
      </div>
      <DataTable
        data={shown}
        columns={columns}
        getRowId={(l) => String(l.id)}
        selectionMode="multi"
        clickToggles
        selected={members}
        onSelectionChange={(ids) => {
          // Rows hidden by the dye filter keep their membership.
          const hidden = members.filter((m) => !shown.some((l) => String(l.id) === m))
          setMembers([...hidden, ...ids])
          if (err?.field === 'members') setErr(null)
        }}
        filterPlaceholder="Search loci…"
        ariaLabel="Loci to include"
        toolbar={<DyeFilter value={dyes} onChange={setDyes} />}
        initialSort={[{ id: 'color', desc: false }]}
        emptyMessage={loci.length === 0 ? 'No loci in the workspace yet' : 'No loci match'}
      />
      {set && (
        <BulkDeleteDialog
          open={deleting}
          onOpenChange={setDeleting}
          items={[{ id: set.id, label: set.label }]}
          noun="locus set"
          onDelete={(sid) => api.delete_locus_set({ id: sid })}
          onDeleted={() => onDone(null)}
          note={<p>The loci themselves are kept.</p>}
        />
      )}
    </form>
  )
}
