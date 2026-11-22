/**
 * Loci: the markers, with dye and size range. A per-dye layout on top shows
 * where every locus sits (overlaps on one dye flagged), the table below is
 * sortable and filterable, and the side panel edits the selected locus.
 * `/loci/new` opens the panel for a new locus.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronDown, ChevronRight, Dna, FileUp, Plus, Trash2 } from 'lucide-react'
import type { Color, Locus } from '@/api/bindings'
import { api } from '@/api/client'
import { apiQuery } from '@/api/query'
import { cn } from '@/lib/cn'
import { countOf, plural } from '@/lib/format'
import { Page, PageHeader } from '@/layouts/layouts'
import { DataTable, type DataColumn } from '@/components/DataTable'
import { Button } from '@/components/ui/Button'
import { DyeChip } from '@/components/ui/Badge'
import { EmptyState, NotFound } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { Tooltip } from '@/components/ui/Tooltip'
import { ImportLociDialog } from './ImportLociDialog'
import { LocusLayout } from './LocusLayout'
import { LocusPanel } from './LocusPanel'
import { findOverlaps, overlapIndex } from './overlap'
import { BulkDeleteDialog, DyeFilter, errorText } from './shared'

export default function LociPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const loci = useQuery(apiQuery(['loci'], 'list_loci'))
  const sets = useQuery(apiQuery(['locus_sets'], 'list_locus_sets'))
  const isNew = id === 'new'
  const [selected, setSelected] = useState<string[]>(() => (id && !isNew ? [id] : []))
  // Follow the URL when it changes (back/forward, links from other pages).
  const [urlId, setUrlId] = useState(id)
  if (urlId !== id) {
    setUrlId(id)
    if (id && !isNew && !(selected.length === 1 && selected[0] === id)) setSelected([id])
  }
  const [dyes, setDyes] = useState<Color[]>([])
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(true)

  const all = useMemo(() => loci.data ?? [], [loci.data])
  const overlaps = useMemo(() => findOverlaps(all), [all])
  const flagged = useMemo(() => overlapIndex(overlaps), [overlaps])
  const setLabel = useMemo(() => new Map((sets.data ?? []).map((s) => [s.id, s.label])), [sets.data])
  const shown = useMemo(() => (dyes.length ? all.filter((l) => dyes.includes(l.color)) : all), [all, dyes])
  const counts = useMemo(() => {
    const c: Partial<Record<Color, number>> = {}
    for (const l of all) c[l.color] = (c[l.color] ?? 0) + 1
    return c
  }, [all])
  const selectedLoci = all.filter((l) => selected.includes(String(l.id)))
  const single = selectedLoci.length === 1 ? selectedLoci[0]! : null

  const select = (ids: string[]) => {
    setSelected(ids)
    const next = ids.length === 1 ? `/loci/${ids[0]}` : '/loci'
    if (next !== (id ? `/loci/${id}` : '/loci')) navigate(next, { replace: true })
  }

  const columns = useMemo<DataColumn<Locus>[]>(
    () => [
      {
        id: 'label',
        header: 'Label',
        value: (l) => l.label,
        cell: (l) => (
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium">{l.label}</span>
            {flagged.has(l.id) && (
              <span title={`Overlaps ${flagged.get(l.id)!.join(', ')} on the ${l.color} dye`} className="text-danger" aria-label="Overlapping range">
                <AlertTriangle size={12} />
              </span>
            )}
          </span>
        ),
        width: 140,
      },
      { id: 'color', header: 'Dye', value: (l) => l.color, cell: (l) => <DyeChip color={l.color} />, width: 80 },
      { id: 'min', header: 'Min (bp)', value: (l) => l.min_base_length, align: 'right', width: 80, searchable: false },
      { id: 'max', header: 'Max (bp)', value: (l) => l.max_base_length, align: 'right', width: 80, searchable: false },
      { id: 'repeat', header: 'Repeat', value: (l) => l.nucleotide_repeat_length, align: 'right', width: 66, searchable: false, description: 'Repeat unit length in bases' },
      {
        id: 'sets',
        header: 'Sets',
        value: (l) => l.locus_set_ids.length,
        cell: (l) => (
          <span className="num" title={l.locus_set_ids.map((s) => setLabel.get(s) ?? `#${s}`).join(', ')}>
            {l.locus_set_ids.length}
          </span>
        ),
        align: 'right',
        width: 56,
        searchable: false,
        description: 'Locus sets containing this locus',
      },
      { id: 'runs', header: 'Runs', value: (l) => l.run_count, align: 'right', width: 70, searchable: false, description: 'Runs assigned to this locus by plate maps' },
      {
        id: 'overlap',
        header: 'Overlaps',
        value: (l) => flagged.get(l.id)?.join(', ') ?? '',
        cell: (l) => (flagged.has(l.id) ? <span className="text-danger">{flagged.get(l.id)!.join(', ')}</span> : null),
        width: 120,
        description: 'Loci on the same dye whose size ranges overlap this one',
      },
    ],
    [flagged, setLabel],
  )

  let panel
  if (isNew)
    panel = (
      <LocusPanel
        key="new"
        sets={sets.data ?? []}
        onCreated={(l) => select([String(l.id)])}
        onCancel={() => navigate(selected.length === 1 ? `/loci/${selected[0]}` : '/loci', { replace: true })}
      />
    )
  else if (single)
    panel = <LocusPanel key={single.id} locus={single} sets={sets.data ?? []} overlapsWith={flagged.get(single.id)} onDelete={() => setDeleting(true)} />
  else if (id && !isNew && loci.data && !all.some((l) => String(l.id) === id) && selected.length <= 1) panel = <NotFound what="locus" />
  else if (selectedLoci.length > 1)
    panel = (
      <div className="flex flex-col gap-3 p-3 text-xs">
        <p className="text-fg">{countOf(selectedLoci.length, 'locus', 'loci')} selected</p>
        <p className="text-muted">{selectedLoci.map((l) => l.label).join(', ')}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={() => navigate(`/locus-sets/new?loci=${selectedLoci.map((l) => l.id).join(',')}`)} data-testid="locus-set-from-selection">
            <Plus size={12} /> New locus set of these
          </Button>
          <Button size="sm" variant="danger-ghost" onClick={() => setDeleting(true)}>
            <Trash2 size={12} /> Delete {countOf(selectedLoci.length, 'locus', 'loci')}
          </Button>
        </div>
      </div>
    )
  else
    panel = (
      <EmptyState
        title={!all.length ? 'Next: add loci' : sets.data?.length === 0 ? 'Next: a locus set' : 'No locus selected'}
        action={
          all.length > 0 &&
          sets.data?.length === 0 && (
            <Button size="sm" variant="primary" onClick={() => navigate('/locus-sets/new')} data-testid="next-locus-set">
              <Plus size={13} /> New locus set
            </Button>
          )
        }
      >
        {!all.length
          ? 'Add each marker with its dye, size range and repeat length, or import a CSV of them. Then group them into a locus set, which bin estimators and projects analyze.'
          : sets.data?.length === 0
            ? 'Group the loci you analyze together into a locus set; every bin estimator and project uses one. Select a locus here to edit it.'
            : 'Select a locus to edit it, or Cmd/Ctrl-click and Shift-click to select several. Bars in the layout above select too.'}
      </EmptyState>
    )

  const header = (
    <PageHeader
      icon={<Dna />}
      title="Loci"
      subtitle={loci.data ? `${countOf(all.length, 'locus', 'loci')}${overlaps.length ? ` · ${countOf(overlaps.length, 'overlap')}` : ''}` : undefined}
      actions={
        <>
          <Button size="sm" variant="danger-ghost" disabled={selectedLoci.length === 0} onClick={() => setDeleting(true)} title="Delete the selected loci">
            <Trash2 size={12} /> Delete{selectedLoci.length > 1 ? ` ${selectedLoci.length}` : ''}
          </Button>
          <Button size="sm" onClick={() => setImporting(true)}>
            <FileUp size={12} /> Import CSV
          </Button>
          <Button size="sm" variant="primary" onClick={() => navigate('/loci/new')}>
            <Plus size={13} /> New locus
          </Button>
        </>
      }
    />
  )

  if (loci.isPending)
    return (
      <Page header={header}>
        <div className="grid flex-1 place-items-center text-muted">
          <Spinner />
        </div>
      </Page>
    )
  if (loci.isError)
    return (
      <Page header={header}>
        <EmptyState title="Could not load loci">{errorText(loci.error)}</EmptyState>
      </Page>
    )

  return (
    <Page header={header}>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {all.length === 0 && !isNew ? (
            <EmptyState
              icon={<Dna />}
              title="No loci yet"
              action={
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setImporting(true)}>
                    <FileUp size={12} /> Import CSV
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => navigate('/loci/new')}>
                    <Plus size={13} /> New locus
                  </Button>
                </div>
              }
            >
              A locus is a microsatellite marker: the dye its primers carry, the size range where its alleles fall, and its repeat length.
            </EmptyState>
          ) : (
            <>
              <section className="shrink-0 border-b border-line bg-surface" aria-label="Size layout">
                <div className="flex h-8 items-center gap-2 px-3">
                  <button
                    type="button"
                    onClick={() => setLayoutOpen((v) => !v)}
                    aria-expanded={layoutOpen}
                    className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted uppercase hover:text-fg"
                  >
                    {layoutOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    Size layout
                  </button>
                  {overlaps.length > 0 ? (
                    <Tooltip content={overlaps.map((o) => `${o.a.label} / ${o.b.label}: ${o.from}–${o.to} bp on ${o.color}`).join('\n')}>
                      <span className="flex items-center gap-1 text-xs text-danger" data-testid="overlap-warning">
                        <AlertTriangle size={12} />
                        {countOf(overlaps.length, 'overlapping pair')} on the same dye: peaks there can be assigned to the wrong locus
                      </span>
                    </Tooltip>
                  ) : (
                    <span className="text-xs text-faint">No overlapping ranges on any dye</span>
                  )}
                </div>
                {layoutOpen && (
                  <div className="px-3 pr-6 pb-2">
                    <LocusLayout
                      loci={shown}
                      selected={selectedLoci.map((l) => l.id)}
                      onSelect={(lid, m) => {
                        const s = String(lid)
                        select(m.toggle ? (selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s]) : [s])
                      }}
                    />
                  </div>
                )}
              </section>
              <DataTable
                data={shown}
                columns={columns}
                getRowId={(l) => String(l.id)}
                selectionMode="multi"
                selected={selected}
                onSelectionChange={select}
                filterPlaceholder="Filter loci…"
                ariaLabel="Loci"
                initialSort={[{ id: 'color', desc: false }]}
                toolbar={<DyeFilter value={dyes} onChange={setDyes} counts={counts} />}
                emptyMessage="No loci match the filter"
              />
            </>
          )}
        </div>
        <aside
          className={cn('flex min-h-0 w-[300px] shrink-0 flex-col border-l border-line bg-surface')}
          aria-label={isNew ? 'New locus' : single ? `Locus ${single.label}` : 'Locus details'}
        >
          <div className="flex h-9 shrink-0 items-center border-b border-line px-3">
            <h2 className={cn('truncate text-xs font-semibold', single && !isNew ? 'text-fg' : 'tracking-wide text-muted uppercase')}>
              {isNew ? 'New locus' : single ? single.label : 'Locus'}
            </h2>
            {single && !isNew && <DyeChip color={single.color} className="ml-auto" />}
          </div>
          {panel}
        </aside>
      </div>
      <ImportLociDialog open={importing} onOpenChange={setImporting} existing={all} onImported={(c) => select(c.map((l) => String(l.id)))} />
      <BulkDeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        items={selectedLoci.map((l) => ({ id: l.id, label: l.label }))}
        noun="locus"
        nounPlural="loci"
        onDelete={(lid) => api.delete_locus({ id: lid })}
        onDeleted={(ids) => select(selected.filter((s) => !ids.includes(Number(s))))}
        note={
          selectedLoci.some((l) => l.run_count > 0 || l.locus_set_ids.length > 0) ? (
            <p>
              {plural(selectedLoci.length, 'This locus is', 'Some of these loci are')} used by runs or locus sets; the engine refuses those and says what uses them.
            </p>
          ) : undefined
        }
      />
    </Page>
  )
}
