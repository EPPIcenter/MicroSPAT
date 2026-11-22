/**
 * Ladders: size standards and how they are fitted. List on the left; the
 * editor on the right holds label, dye, base sizes and the fitting parameters,
 * with one save for all of it. `/ladders/new` is a new ladder.
 */
import { overlayOpen } from '@/lib/keys'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Plus, RotateCcw, Ruler, Trash2, Undo2 } from 'lucide-react'
import type { Color, Ladder, LadderSpec } from '@/api/bindings'
import { api } from '@/api/client'
import { apiQuery } from '@/api/query'
import { countOf, plural } from '@/lib/format'
import { Page, PageHeader } from '@/layouts/layouts'
import { ListDetailLayout } from '@/layouts/layouts'
import { DataTable, type DataColumn } from '@/components/DataTable'
import { ParameterSections, useParameterForm } from '@/components/form/ParameterForm'
import { nonDefaultKeys } from '@/components/form/schema'
import { SelectField, TextField } from '@/components/form/fields'
import { Button } from '@/components/ui/Button'
import { DyeChip } from '@/components/ui/Badge'
import { EmptyState, NotFound } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { toast } from '@/stores/toasts'
import { bypassUnsaved, useUnsavedChanges } from '@/lib/unsaved'
import { ladderParams } from '@/params/schemas'
import { Banner, BulkDeleteDialog, DYE_OPTIONS, errorCode, errorText } from '@/features/loci/shared'
import { BaseSizesEditor } from './BaseSizesEditor'
import { checkSizes, fmtSize } from './baseSizes'
import { copyLabel, DEFAULT_SPEC, needsResize, specToValues, valuesToSpec } from './spec'

const columns: DataColumn<Ladder>[] = [
  { id: 'label', header: 'Label', value: (l) => l.label, width: 150 },
  { id: 'color', header: 'Dye', value: (l) => l.spec.color, cell: (l) => <DyeChip color={l.spec.color} />, width: 76 },
  {
    id: 'sizes',
    header: 'Sizes',
    value: (l) => l.spec.base_sizes.length,
    cell: (l) => (
      <span className="num text-muted" title={l.spec.base_sizes.map(fmtSize).join(', ')}>
        {l.spec.base_sizes.length} · {fmtSize(l.spec.base_sizes[0] ?? 0)}–{fmtSize(l.spec.base_sizes.at(-1) ?? 0)}
      </span>
    ),
    width: 104,
    searchable: false,
  },
  { id: 'plates', header: 'Plates', value: (l) => l.plate_count, align: 'right', width: 60, searchable: false, description: 'Plates sized with this ladder' },
]

export default function LaddersPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const ladders = useQuery(apiQuery(['ladders'], 'list_ladders'))
  const isNew = id === 'new'
  const selectedId = id && !isNew ? Number(id) : null
  const selected = ladders.data?.find((l) => l.id === selectedId) ?? null

  // Open the first ladder when nothing is selected.
  useEffect(() => {
    if (!id && ladders.data?.length) navigate(`/ladders/${ladders.data[0]!.id}`, { replace: true })
  }, [id, ladders.data, navigate])

  const labels = useMemo(() => (ladders.data ?? []).map((l) => l.label), [ladders.data])

  let detail
  // The editor calls this after saving, cancelling or deleting: nothing is left to lose.
  const done = (l: Ladder | null) => bypassUnsaved(() => navigate(l ? `/ladders/${l.id}` : '/ladders'))
  if (ladders.isPending) detail = <Centered><Spinner /></Centered>
  else if (ladders.isError) detail = <EmptyState title="Could not load ladders" children={errorText(ladders.error)} />
  else if (isNew) detail = <LadderEditor key="new" labels={labels} onDone={done} />
  else if (selected) detail = <LadderEditor key={selected.id} ladder={selected} labels={labels} onDone={done} />
  else if (selectedId != null) detail = <NotFound what="ladder" />
  else
    detail = (
      <EmptyState icon={<Ruler />} title="No ladders" action={<Button onClick={() => navigate('/ladders/new')}><Plus size={13} /> New ladder</Button>}>
        A ladder (size standard) maps each well's time axis to base pairs. New workspaces start with the common standards.
      </EmptyState>
    )

  return (
    <Page
      header={
        <PageHeader
          icon={<Ruler />}
          title="Ladders"
          subtitle="Size standards and how ladder peaks are found and fitted"
          actions={
            <Button size="sm" variant="primary" onClick={() => navigate('/ladders/new')}>
              <Plus size={13} /> New ladder
            </Button>
          }
        />
      }
    >
      <ListDetailLayout
        id="ladders"
        listWidth={400}
        list={
          <DataTable
            data={ladders.data ?? []}
            columns={columns}
            getRowId={(l) => String(l.id)}
            selectionMode="single"
            selected={selectedId != null ? [String(selectedId)] : []}
            onSelectionChange={(ids) => ids[0] && navigate(`/ladders/${ids[0]}`)}
            ariaLabel="Ladders"
            emptyMessage={ladders.isPending ? 'Loading…' : 'No ladders'}
          />
        }
        detail={detail}
      />
    </Page>
  )
}

function sizesDirtyFrom(entries: readonly string[], spec: LadderSpec): boolean {
  return entries.filter((e) => e.trim() !== '').join(',') !== spec.base_sizes.map(fmtSize).join(',')
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid h-full place-items-center text-muted">{children}</div>
}

function LadderEditor({ ladder, labels, onDone }: { ladder?: Ladder; labels: string[]; onDone: (l: Ladder | null) => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const initial: LadderSpec = ladder?.spec ?? DEFAULT_SPEC
  const [label, setLabel] = useState(ladder?.label ?? '')
  const [color, setColor] = useState<Color>(initial.color)
  const [entries, setEntries] = useState<string[]>(initial.base_sizes.map(fmtSize))
  const savedValues = useMemo(() => specToValues(initial), [initial])
  const form = useParameterForm(ladderParams, savedValues)
  const [serverError, setServerError] = useState<{ field: 'label' | 'color' | 'sizes' | 'form'; message: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const inUse = (ladder?.plate_count ?? 0) > 0

  const plates = useQuery({ ...apiQuery(['plates'], 'list_plates'), enabled: inUse, meta: { silent: true } })
  const usedBy = (plates.data ?? []).filter((p) => p.ladder_id === ladder?.id)

  const check = checkSizes(entries)
  const sizesDirty = !ladder || entries.filter((e) => e.trim() !== '').join(',') !== initial.base_sizes.map(fmtSize).join(',')
  const labelDirty = label.trim() !== (ladder?.label ?? '')
  const colorDirty = color !== initial.color
  const dirtyCount = form.dirty.length + Number(sizesDirty && !!ladder) + Number(labelDirty && !!ladder) + Number(colorDirty)
  const isDirty = !ladder || dirtyCount > 0
  const missingTooMany =
    check.sizes && typeof form.values.maximum_missing_peak_count === 'number' && form.values.maximum_missing_peak_count >= check.sizes.length
      ? `Max missing peaks must be fewer than the ${check.sizes.length} sizes.`
      : null
  const labelError = label.trim() === '' ? 'Required' : null
  // A new ladder is "dirty" (it can be created) from the start; only real edits need guarding.
  const edited = ladder ? dirtyCount > 0 : label.trim() !== '' || form.dirty.length > 0 || sizesDirtyFrom(entries, DEFAULT_SPEC) || colorDirty
  useUnsavedChanges(edited, ladder ? `changes to ladder ${ladder.label}` : 'new ladder')
  const valid = form.isValid && !!check.sizes && !missingTooMany && !labelError

  const save = useMutation({
    mutationFn: async () => {
      const spec = valuesToSpec(form.values, { base_sizes: check.sizes!, color }, initial)
      if (!ladder) return api.create_ladder({ label: label.trim(), spec })
      const specChanged = form.dirty.length > 0 || sizesDirty || colorDirty
      return api.update_ladder({ id: ladder.id, label: labelDirty ? label.trim() : undefined, spec: specChanged ? spec : undefined })
    },
    meta: { silent: true },
    onMutate: () => setServerError(null),
    onSuccess: (l) => {
      qc.setQueryData<Ladder[]>(['ladders'], (old) => (old ? (ladder ? old.map((x) => (x.id === l.id ? l : x)) : [...old, l]) : old))
      const changed = [...form.dirty, ...(sizesDirty ? ['base_sizes'] : []), ...(colorDirty ? ['color'] : [])]
      if (!ladder) {
        toast.success('Ladder created', l.label)
        onDone(l)
      } else if (l.plate_count > 0 && needsResize(changed)) {
        toast.info('Ladder saved', `Re-size the ${countOf(l.plate_count, 'plate')} that use it to apply the new settings.`)
      } else toast.success('Ladder saved', l.label)
    },
    onError: (e) => {
      const code = errorCode(e)
      const message = errorText(e)
      const field = code === 'conflict' || /label/i.test(message) ? 'label' : code === 'in_use' ? 'color' : /size/i.test(message) ? 'sizes' : 'form'
      setServerError({ field, message })
    },
  })

  const duplicate = useMutation({
    mutationFn: () => api.create_ladder({ label: copyLabel(ladder!.label, labels), spec: ladder!.spec }),
    meta: { errorTitle: 'Could not duplicate ladder' },
    onSuccess: (l) => {
      toast.success('Ladder duplicated', l.label)
      navigate(`/ladders/${l.id}`)
    },
  })

  const revert = () => {
    form.revert()
    setLabel(ladder?.label ?? '')
    setColor(initial.color)
    setEntries(initial.base_sizes.map(fmtSize))
    setServerError(null)
  }
  // Esc reverts wherever focus is (after a failed save it is often on the body),
  // unless a dialog, menu or list box has it.
  const escRef = useRef<(e: KeyboardEvent) => void>(() => {})
  useLayoutEffect(() => {
    escRef.current = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !ladder || !isDirty || save.isPending) return
      if (overlayOpen()) return
      e.preventDefault()
      revert()
    }
  })
  useEffect(() => {
    const h = (e: KeyboardEvent) => escRef.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  const nonDefault = nonDefaultKeys(ladderParams, form.values)
  const busy = save.isPending

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      aria-label={ladder ? `Ladder ${ladder.label}` : 'New ladder'}
      onSubmit={(e) => {
        e.preventDefault()
        if (valid && isDirty && !busy) save.mutate()
      }}
    >
      <div className="flex shrink-0 items-start gap-3 border-b border-line bg-surface px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold">{ladder ? ladder.label : 'New ladder'}</h2>
          <p className="truncate text-xs text-muted">
            {ladder ? (
              <>
                {color} dye · {countOf(ladder.spec.base_sizes.length, 'size')} · used by {countOf(ladder.plate_count, 'plate')}
              </>
            ) : (
              'Starts from HD ROX 400 with default parameters'
            )}
          </p>
        </div>
        {ladder && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button size="sm" onClick={() => duplicate.mutate()} disabled={duplicate.isPending}>
              <Copy size={12} /> Duplicate
            </Button>
            <Button size="sm" variant="danger-ghost" onClick={() => setDeleting(true)}>
              <Trash2 size={12} /> Delete
            </Button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 [&>*]:max-w-[1100px]">
        {inUse && ladder && (
          <Banner tone="warn">
            Used by {countOf(ladder.plate_count, 'plate')}
            {usedBy.length > 0 && (
              <>
                {' '}
                (
                {usedBy.slice(0, 6).map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ', '}
                    <Link to={`/plates/${p.id}`} className="font-medium text-accent hover:underline">
                      {p.label}
                    </Link>
                  </span>
                ))}
                {usedBy.length > 6 && ', …'})
              </>
            )}
            . Sizing-quality limits apply at once. Changes to sizes, detection or matching settings reach {plural(ladder.plate_count, 'that plate', 'those plates')} only
            after {plural(ladder.plate_count, 'it is', 'they are')} re-sized on the Plates page. The dye cannot change while plates use the ladder.
          </Banner>
        )}
        <fieldset className="grid min-w-0 grid-cols-[minmax(160px,1fr)_minmax(120px,160px)] gap-x-4 gap-y-3" disabled={busy}>
          <TextField
            label="Label"
            value={label}
            onChange={(v) => {
              setLabel(v)
              if (serverError?.field === 'label') setServerError(null)
            }}
            error={serverError?.field === 'label' ? serverError.message : label !== '' || ladder ? labelError : null}
            dirty={!!ladder && labelDirty}
            help="Unique name of the ladder (case-insensitive)."
          />
          <SelectField
            label="Dye"
            value={color}
            onChange={(v) => setColor(v as Color)}
            options={DYE_OPTIONS}
            disabled={busy || inUse}
            dirty={colorDirty && !!ladder}
            error={serverError?.field === 'color' ? serverError.message : null}
            hint={inUse ? 'Fixed while plates use this ladder' : undefined}
            help="Dye channel that carries the ladder."
          />
          <div className="col-span-2">
            <BaseSizesEditor entries={entries} onChange={setEntries} check={check} disabled={busy} serverError={serverError?.field === 'sizes' ? serverError.message : null} />
          </div>
        </fieldset>
        <ParameterSections schema={ladderParams} form={form} disabled={busy} columnWidth={180} />
        {missingTooMany && <Banner tone="danger">{missingTooMany}</Banner>}
        {serverError?.field === 'form' && <Banner tone="danger">{serverError.message}</Banner>}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-3 py-2">
        <span className="text-xs text-muted" aria-live="polite">
          {!ladder
            ? 'Not created yet'
            : dirtyCount > 0
              ? `${dirtyCount} unsaved ${plural(dirtyCount, 'change')}`
              : nonDefault.length
                ? `${countOf(nonDefault.length, 'parameter')} changed from default`
                : 'Default parameters'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={form.resetToDefaults} disabled={busy || nonDefault.length === 0} title="Set fitting parameters to their defaults (then Save)">
            <RotateCcw size={12} /> Defaults
          </Button>
          {ladder ? (
            <Button size="sm" variant="ghost" onClick={revert} disabled={busy || !isDirty} title="Discard edits (Esc)">
              <Undo2 size={12} /> Revert
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => onDone(null)}>
              Cancel
            </Button>
          )}
          <Button size="sm" variant="primary" type="submit" disabled={busy || !isDirty || !valid}>
            {busy && <Spinner className="size-3" />}
            {ladder ? 'Save' : 'Create ladder'}
          </Button>
        </div>
      </div>

      {ladder && (
        <BulkDeleteDialog
          open={deleting}
          onOpenChange={setDeleting}
          items={[{ id: ladder.id, label: ladder.label }]}
          noun="ladder"
          onDelete={(id) => api.delete_ladder({ id })}
          onDeleted={() => onDone(null)}
          note={inUse ? <p>It sizes {countOf(ladder.plate_count, 'plate')}; the engine refuses to delete a ladder in use.</p> : undefined}
        />
      )}
    </form>
  )
}
