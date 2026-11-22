/**
 * Edit one control: its name, its bin estimator (fixed once created), and
 * one allele per locus of that bin estimator's locus set, chosen from the
 * locus's bins. The alleles are a compact grid filled from the keyboard
 * (see AllelePicker). Loci whose bins are not current, loci with no allele,
 * and alleles whose bin was deleted are flagged. Unsaved edits are registered
 * with the app's leave guard (`lib/unsaved`).
 */
import { useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, CircleAlert, Copy, Save, Trash2, Undo2 } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/api/client'
import type { Control, ProjectSummary } from '@/api/bindings'
import { isRpcError } from '@/api/transport'
import { Field, SelectInput, TextInput } from '@/components/form/fields'
import { DyeChip } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Kbd } from '@/components/ui/Kbd'
import { Spinner } from '@/components/ui/ProgressBar'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'
import { countOf } from '@/lib/format'
import { useUnsavedChanges } from '@/lib/unsaved'
import { toast } from '@/stores/toasts'
import { useProject } from '@/features/projects-shared/queries'
import { formatWhen } from '@/features/projects-shared/status'
import { StatusIcon } from '@/features/projects-shared/StatusBits'
import { statusView } from '@/features/projects-shared/status'
import { AllelePicker } from './AllelePicker'
import { alleleIssues, allelesSet, changedAlleles, deletedBins, draftOf } from './model'
import { useBinsByLocus } from './queries'
import { kbd } from '@/lib/platform'

export interface ControlEditorProps {
  /** Null for a new control. */
  control: Control | null
  binEstimators: readonly ProjectSummary[]
  onSaved?: (c: Control) => void
  onCancelNew?: () => void
  onDelete?: () => void
  onDuplicate?: () => void
}

export function ControlEditor({ control, binEstimators, onSaved, onCancelNew, onDelete, onDuplicate }: ControlEditorProps) {
  const isNew = control == null
  const [label, setLabel] = useState(control?.label ?? '')
  const [beId, setBeId] = useState<number | null>(control?.bin_estimator_id ?? (binEstimators.length === 1 ? binEstimators[0]!.id : null))
  const [draft, setDraft] = useState(() => draftOf(control))
  const [error, setError] = useState<string | null>(null)
  // Follow the saved control when it changes elsewhere (another tab, a bin deletion) unless edited here.
  const [base, setBase] = useState(control)
  const be = useProject(beId)
  const loci = useMemo(() => (be.data && be.data.project.id === beId ? be.data.loci : []), [be.data, beId])
  const bins = useBinsByLocus(
    beId,
    loci.map((l) => l.locus_id),
  )
  const changes = useMemo(() => changedAlleles(draft, base), [draft, base])
  const dirty = isNew ? label.trim() !== '' || changes.length > 0 : label !== base!.label || changes.length > 0
  if (control !== base && !dirty) {
    setBase(control)
    setLabel(control?.label ?? '')
    setDraft(draftOf(control))
  }
  useUnsavedChanges(dirty, isNew ? 'new control' : `changes to control ${base!.label}`)
  const mixtures = base?.mixture_count ?? 0
  const deleted = useMemo(() => deletedBins(base), [base])

  const issues = useMemo(
    () =>
      alleleIssues(
        new Map(loci.map((l) => [l.locus_id, draft.get(l.locus_id) ?? null])),
        loci.map((l) => ({ locus_id: l.locus_id, label: l.label, binsState: l.status.state })),
        bins.byLocus,
        deleted,
      ).filter((i) => !(isNew && i.kind === 'missing')),
    [loci, draft, bins.byLocus, isNew, deleted],
  )
  const issuesBy = useMemo(() => {
    const m = new Map<number, typeof issues>()
    for (const i of issues) m.set(i.locusId, [...(m.get(i.locusId) ?? []), i])
    return m
  }, [issues])
  const setCount = loci.filter((l) => draft.get(l.locus_id) != null).length
  const savedMissing = control ? allelesSet(control) : null

  const save = useMutation({
    // The submitted label and alleles travel with the mutation, so edits typed while it runs are kept.
    mutationFn: async (v: { label: string; draft: Map<number, number | null>; changes: typeof changes }) => {
      if (isNew) return api.create_control({ bin_estimator_id: beId!, label: v.label.trim(), alleles: v.changes })
      return api.update_control({
        id: control.id,
        ...(v.label !== control.label ? { label: v.label } : {}),
        ...(v.changes.length ? { alleles: v.changes } : {}),
      })
    },
    meta: { silent: true },
    onSuccess: (c, v) => {
      setError(null)
      setBase(c)
      setLabel((l) => (l === v.label ? c.label : l))
      setDraft((d) => (d === v.draft ? draftOf(c) : d))
      toast.success(
        isNew ? `Created control ${c.label}` : `Saved ${c.label}`,
        mixtures && v.changes.length
          ? `Quantification-bias estimators with its ${countOf(mixtures, 'mixture')} are now stale at the changed loci.`
          : undefined,
      )
      onSaved?.(c)
    },
    onError: (e) => setError(isRpcError(e) ? e.message : String(e)),
  })
  const submit = () => save.mutate({ label, draft, changes })
  const canSave = dirty && label.trim() !== '' && beId != null && !save.isPending
  const revert = () => {
    setLabel(base?.label ?? '')
    setDraft(draftOf(base))
    setError(null)
  }

  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const advance = (i: number, dir: 1 | -1) => {
    const next = inputs.current[i + dir]
    if (next) next.focus()
    else if (dir === 1) document.querySelector<HTMLButtonElement>('[data-testid=control-save]')?.focus()
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-surface"
      data-testid="control-editor"
      data-control={control?.label ?? ''}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
          e.preventDefault()
          if (canSave) submit()
        }
      }}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="truncate text-sm font-semibold">{isNew ? 'New control' : base!.label}</h2>
        {dirty && <span className="text-2xs text-accent">unsaved</span>}
        <div className="ml-auto flex items-center gap-1">
          {!isNew && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={onDuplicate}
                disabled={dirty}
                title={dirty ? 'Save or revert first' : 'Duplicate this control'}
              >
                <Copy size={12} /> Duplicate
              </Button>
              <Button size="sm" variant="danger-ghost" onClick={onDelete} data-testid="control-delete">
                <Trash2 size={12} /> Delete
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-line px-3 py-2.5">
        <Field
          label="Name (barcode)"
          htmlFor="control-label"
          error={error}
          hint="The strain's name as used in mixture CSVs, e.g. 3D7. Unique per bin estimator."
        >
          <TextInput
            id="control-label"
            value={label}
            autoFocus={isNew}
            onChange={(e) => {
              setLabel(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                inputs.current[0]?.focus()
              }
            }}
            aria-invalid={!!error || undefined}
            placeholder="e.g. 3D7"
          />
        </Field>
        <Field
          label="Bin estimator"
          htmlFor="control-be"
          hint={isNew ? 'Its bins are the alleles you can pick.' : 'Fixed once created. Duplicate the control to start from its alleles.'}
        >
          <SelectInput
            id="control-be"
            value={beId != null ? String(beId) : ''}
            onChange={(v) => {
              setBeId(Number(v))
              setDraft(new Map())
            }}
            disabled={!isNew}
            placeholder="Choose a bin estimator"
            options={binEstimators.map((p) => ({ value: String(p.id), label: `${p.title} · ${p.locus_set_label}` }))}
            aria-label="Bin estimator"
          />
        </Field>
      </div>
      {beId == null ? (
        <EmptyState title="Choose a bin estimator">A control has one allele per locus, picked from the bins of a bin estimator.</EmptyState>
      ) : be.isPending ? (
        <div className="grid flex-1 place-items-center text-muted">
          <Spinner />
        </div>
      ) : be.isError ? (
        <EmptyState title="Could not load the bin estimator">{(be.error as Error).message}</EmptyState>
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface-2 px-3 py-1.5 text-xs">
            <span>
              <b className="tabular-nums">{setCount}</b> of {loci.length} loci have an allele
            </span>
            {mixtures > 0 && <span className="text-muted">In {countOf(mixtures, 'control mixture')}</span>}
            {savedMissing && !dirty && savedMissing.set < savedMissing.total && (
              <span className="flex items-center gap-1 text-warn" data-testid="control-missing">
                <AlertTriangle size={12} /> {savedMissing.total - savedMissing.set} without an allele
              </span>
            )}
            <span className="ml-auto text-2xs text-faint">
              Type a label or size, <Kbd>Enter</Kbd> next locus, <Kbd>-</Kbd> none, <Kbd>Esc</Kbd> revert, <Kbd>{kbd('⌘S')}</Kbd> save
            </span>
          </div>
          {issues.length > 0 && (
            <BinsNotice be={be.data!.project.title} beId={beId} issues={issues} analyzedAt={loci.map((l) => l.status.analyzed_at)} />
          )}
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <div
              className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-x-4 gap-y-1"
              role="group"
              aria-label="Alleles by locus"
              data-testid="allele-grid"
            >
              {loci.map((l, i) => {
                const its = issuesBy.get(l.locus_id) ?? []
                const v = statusView(l.status, `${l.label} bins`)
                const value = draft.get(l.locus_id) ?? null
                const changed = (base ? (draftOf(base).get(l.locus_id) ?? null) : null) !== value
                return (
                  <div key={l.locus_id} className="flex h-8 items-center gap-2" data-locus={l.label}>
                    <span className="flex w-24 shrink-0 items-center gap-1.5">
                      <DyeChip color={l.color} label="" className="!px-1" />
                      <label htmlFor={`allele-${l.locus_id}`} className="truncate text-xs font-medium">
                        {l.label}
                      </label>
                      {changed && <span className="size-1.5 shrink-0 rounded-full bg-accent" title="Unsaved change" />}
                    </span>
                    <AllelePicker
                      bins={bins.byLocus.get(l.locus_id)}
                      value={value}
                      label={`${l.label} allele`}
                      invalid={its.some((x) => x.level === 'danger')}
                      onChange={(b) => setDraft((d) => new Map(d).set(l.locus_id, b))}
                      onAdvance={(dir) => advance(i, dir)}
                      inputRef={(el) => {
                        inputs.current[i] = el
                        if (el) el.id = `allele-${l.locus_id}`
                      }}
                      className="flex-1"
                    />
                    <span className="flex w-4 shrink-0 justify-center">
                      {its.length > 0 ? (
                        <Tooltip
                          content={
                            <ul className="space-y-0.5">
                              {its.map((x) => (
                                <li key={x.text}>{x.text}</li>
                              ))}
                            </ul>
                          }
                        >
                          <span
                            tabIndex={-1}
                            aria-label={its.map((x) => x.text).join(' ')}
                            className={its.some((x) => x.level === 'danger') ? 'text-danger' : 'text-warn'}
                          >
                            <CircleAlert size={13} />
                          </span>
                        </Tooltip>
                      ) : l.status.state !== 'current' ? (
                        <StatusIcon view={v} />
                      ) : null}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
      <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2">
        {isNew ? (
          <Button size="sm" variant="ghost" onClick={onCancelNew}>
            Cancel
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={revert} disabled={!dirty}>
            <Undo2 size={12} /> Revert
          </Button>
        )}
        {!isNew && changes.length > 0 && mixtures > 0 && (
          <span className="text-2xs text-muted">
            Saving makes the quantification-bias estimators with its {countOf(mixtures, 'mixture')} stale.
          </span>
        )}
        <Button size="sm" variant="primary" className="ml-auto" disabled={!canSave} onClick={submit} data-testid="control-save">
          {save.isPending ? <Spinner className="size-3" /> : <Save size={12} />} {isNew ? 'Create control' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

function BinsNotice({
  be,
  beId,
  issues,
  analyzedAt,
}: {
  be: string
  beId: number
  issues: ReturnType<typeof alleleIssues>
  analyzedAt: (string | null)[]
}) {
  const missing = issues.filter((i) => i.kind === 'missing').length
  const stale = issues.filter((i) => i.kind === 'stale' || i.kind === 'no_bins').length
  const gone = issues.filter((i) => i.kind === 'gone' || i.kind === 'deleted').length
  const latest = analyzedAt
    .filter((v): v is string => Boolean(v))
    .sort((a, b) => a.localeCompare(b))
    .pop()
  return (
    <div
      role="status"
      className={cn(
        'flex shrink-0 items-start gap-2 border-b px-3 py-1.5 text-xs',
        gone ? 'border-danger/30 bg-danger-soft' : 'border-warn/30 bg-warn-soft',
      )}
      data-testid="bins-notice"
    >
      <AlertTriangle size={14} className={cn('mt-px shrink-0', gone ? 'text-danger' : 'text-warn')} />
      <p className="min-w-0">
        {gone > 0 && (
          <>
            {gone} allele{gone === 1 ? "'s bin was" : "s' bins were"} deleted from the bin estimator
            {latest ? ` (bins last estimated ${formatWhen(latest)})` : ''}; pick {gone === 1 ? 'it' : 'them'} again. Mixtures with this
            control leave its share out there.{' '}
          </>
        )}
        {stale > 0 && (
          <>
            {stale} {stale === 1 ? 'locus has' : 'loci have'} bins that are not current in{' '}
            <Link className="underline" to={`/bin-estimators/${beId}`}>
              {be}
            </Link>
            ; re-estimating them can remove or rename bins.{' '}
          </>
        )}
        {missing > 0 && (
          <>
            {missing} {missing === 1 ? 'locus has' : 'loci have'} no allele set. Mixtures with this control leave its share out at those
            loci.
          </>
        )}
      </p>
    </div>
  )
}
