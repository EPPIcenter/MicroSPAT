/**
 * Assign or edit control mixtures directly: pick samples (or edit the
 * selected ones), list the controls in them with their shares, and watch
 * the running sum. The same composition goes to every picked sample.
 * Validation matches the engine's (`set_control_mixtures`), which has the
 * last word.
 */
import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Plus, X } from 'lucide-react'
import { api } from '@/api/client'
import type { Control, ProjectDetail, ProjectSampleRow, Sample } from '@/api/bindings'
import { isRpcError } from '@/api/transport'
import { DataTable, type DataColumn } from '@/components/DataTable'
import { NumberInput, SelectInput } from '@/components/form/fields'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Spinner } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/cn'
import { countOf } from '@/lib/format'
import { toast } from '@/stores/toasts'
import { useWorkspaceSamples } from '@/features/projects-shared/queries'
import {
  checkMixture,
  fillRemainder,
  fmtPercentNumber,
  fromComponents,
  newComponent,
  sameComposition,
  toComponents,
  type DraftComponent,
} from './model/mixtures'
import { kbd } from '@/lib/platform'

export interface MixtureEditorDialogProps {
  detail: ProjectDetail
  /** Controls of the project's bin estimator. */
  controls: readonly Control[]
  /** Samples already in the project. */
  rows: readonly ProjectSampleRow[]
  /** Edit these samples; null to pick samples. */
  editing: readonly ProjectSampleRow[] | null
  onClose: () => void
}

function initial(editing: readonly ProjectSampleRow[] | null, controls: readonly Control[]): { draft: DraftComponent[]; mixed: boolean } {
  if (editing?.length) {
    const first = editing[0]!.controls
    const same = editing.every((r) => sameComposition(r.controls, first))
    if (same && first.length) return { draft: fromComponents(first), mixed: false }
    return { draft: [newComponent(), newComponent()], mixed: !same }
  }
  return { draft: [newComponent(controls[0]?.id ?? null, null), newComponent(controls[1]?.id ?? null, null)], mixed: false }
}

export function MixtureEditorDialog({ detail, controls, rows, editing, onClose }: MixtureEditorDialogProps) {
  const p = detail.project
  const [{ draft: start, mixed }] = useState(() => initial(editing, controls))
  const [draft, setDraft] = useState<DraftComponent[]>(start)
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const samples = useWorkspaceSamples(editing == null)
  const inProject = useMemo(() => new Map(rows.map((r) => [r.sample_id, r])), [rows])
  const ids = useMemo(() => new Set(controls.map((c) => c.id)), [controls])
  const check = useMemo(() => checkMixture(draft, ids), [draft, ids])
  const targets = editing ? editing.map((r) => r.sample_id) : picked.map(Number)

  const save = useMutation({
    mutationFn: () =>
      api.set_control_mixtures({ id: p.id, mixtures: targets.map((sample_id) => ({ sample_id, components: toComponents(draft) })) }),
    meta: { silent: true },
    onSuccess: (r) => {
      toast.success(
        editing ? `Updated ${countOf(r.added + r.replaced, 'mixture')}` : `Assigned ${countOf(r.added + r.replaced, 'mixture')}`,
        `${r.added} new, ${r.replaced} replaced. Analyze the loci to update β.`,
      )
      onClose()
    },
    onError: (e) => setError(isRpcError(e) ? e.message : String(e)),
  })

  const update = (key: string, patch: Partial<DraftComponent>) => {
    setError(null)
    setDraft((d) => d.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }
  const sampleColumns = useMemo<DataColumn<Sample>[]>(
    () => [
      {
        id: 'barcode',
        header: 'Barcode',
        value: (s) => s.barcode,
        cell: (s) => <span className="font-medium">{s.barcode}</span>,
        width: 190,
      },
      { id: 'runs', header: 'Runs', value: (s) => s.run_count, align: 'right', width: 56, searchable: false },
      {
        id: 'current',
        header: 'Current mixture',
        value: (s) =>
          inProject.has(s.id)
            ? inProject
                .get(s.id)!
                .controls.map((c) => `${c.label} ${fmtPercentNumber(c.proportion * 100)}%`)
                .join(' · ') || 'none'
            : '',
        cell: (s) =>
          inProject.has(s.id) ? (
            <span className="text-warn">
              {inProject
                .get(s.id)!
                .controls.map((c) => `${c.label} ${fmtPercentNumber(c.proportion * 100)}%`)
                .join(' · ') || 'in project'}{' '}
              (replaced)
            </span>
          ) : (
            <span className="text-faint">–</span>
          ),
        width: 220,
      },
    ],
    [inProject],
  )
  const canSave = check.ok && targets.length > 0 && !save.isPending
  const sumOk = Math.abs(check.sum - 100) <= 1

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={
        editing
          ? editing.length === 1
            ? `Mixture of ${editing[0]!.barcode}`
            : `Mixtures of ${editing.length} samples`
          : 'Assign control mixtures'
      }
      description={
        editing
          ? 'Change the controls in the sample and their shares.'
          : 'Pick the samples that hold the same mixture, then the controls in it and their shares. Run several times for different compositions.'
      }
      width={editing ? 'md' : 'xl'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canSave} onClick={() => save.mutate()} data-testid="mixture-save">
            {save.isPending && <Spinner className="size-3" />}
            {editing ? 'Save' : targets.length ? `Assign to ${countOf(targets.length, 'sample')}` : 'Assign'}
          </Button>
        </>
      }
    >
      <div className={cn('grid gap-4', !editing && 'grid-cols-[minmax(0,1fr)_340px]')} data-testid="mixture-editor">
        {!editing && (
          <div className="flex min-h-0 flex-col">
            <h3 className="mb-1 text-xs font-semibold">1. Samples</h3>
            {samples.isPending ? (
              <Spinner />
            ) : (
              <DataTable
                data={samples.data ?? []}
                columns={sampleColumns}
                getRowId={(s) => String(s.id)}
                selectionMode="multi"
                clickToggles
                selected={picked}
                onSelectionChange={setPicked}
                ariaLabel="Workspace samples"
                filterPlaceholder="Search barcodes…"
                initialSort={[{ id: 'barcode', desc: false }]}
                className="h-[300px] rounded border border-line"
              />
            )}
            <p className="mt-1 text-2xs text-muted">
              {picked.length
                ? `${countOf(picked.length, 'sample')} picked.`
                : kbd('Click to pick, Shift-click for a range, ⌘A for everything the filter shows.')}
            </p>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {!editing && <h3 className="text-xs font-semibold">2. Controls and shares</h3>}
          {mixed && (
            <p className="text-xs text-warn">These samples have different mixtures. Saving gives them all the composition below.</p>
          )}
          {controls.length === 0 ? (
            <p className="text-xs text-danger">{p.bin_estimator?.title} has no controls. Add them on the Controls page first.</p>
          ) : (
            <ul className="flex flex-col gap-1.5" aria-label="Components">
              {draft.map((c, i) => (
                <li key={c.key} className="flex flex-col gap-0.5" data-component={i}>
                  <div className="flex items-center gap-1.5">
                    <SelectInput
                      value={c.controlId != null ? String(c.controlId) : ''}
                      onChange={(v) => update(c.key, { controlId: Number(v) })}
                      options={controls.map((x) => ({ value: String(x.id), label: x.label }))}
                      placeholder="Control"
                      className="w-36"
                      aria-label={`Control ${i + 1}`}
                      aria-invalid={!!check.rowErrors[c.key] && c.controlId == null}
                    />
                    <NumberInput
                      value={c.percent}
                      onChange={(v) => update(c.key, { percent: v })}
                      unit="%"
                      min={0}
                      max={100}
                      step={5}
                      className="w-24"
                      aria-label={`Share of control ${i + 1}`}
                      aria-invalid={!!check.rowErrors[c.key] && c.controlId != null}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Set this share to what is left of 100%"
                      disabled={check.remainder === 0}
                      onClick={() => setDraft((d) => fillRemainder(d, c.key))}
                    >
                      rest
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove control ${i + 1}`}
                      onClick={() => setDraft((d) => d.filter((x) => x.key !== c.key))}
                    >
                      <X size={13} />
                    </Button>
                  </div>
                  {check.rowErrors[c.key] && <p className="text-2xs text-danger">{check.rowErrors[c.key]}</p>}
                </li>
              ))}
            </ul>
          )}
          <div>
            <Button size="sm" variant="ghost" onClick={() => setDraft((d) => [...d, newComponent()])} disabled={controls.length === 0}>
              <Plus size={12} /> Add control
            </Button>
          </div>
          <div className="rounded border border-line bg-surface-2 p-2" data-testid="mixture-sum" data-sum={check.sum}>
            <div className="mb-1 flex h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              {draft.map((c, i) => (
                <span
                  key={c.key}
                  style={{
                    width: `${Math.max(0, Math.min(100, c.percent ?? 0))}%`,
                    background: `var(--dye-${['blue', 'green', 'orange', 'red', 'yellow'][i % 5]})`,
                  }}
                />
              ))}
            </div>
            <p className={cn('flex items-center gap-1 text-xs', sumOk ? 'text-ok' : 'text-warn')}>
              {sumOk ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
              Sum <b className="num">{fmtPercentNumber(check.sum)}%</b>
              {!sumOk && (
                <span className="text-muted">
                  {check.remainder > 0
                    ? ` · ${fmtPercentNumber(check.remainder)}% left`
                    : ` · ${fmtPercentNumber(-check.remainder)}% too much`}
                </span>
              )}
            </p>
            {check.errors
              .filter((e) => !/sum/.test(e))
              .map((e) => (
                <p key={e} className="text-xs text-danger">
                  {e}
                </p>
              ))}
            {check.warnings.map((w) => (
              <p key={w} className="text-2xs text-muted">
                {w}
              </p>
            ))}
          </div>
          <p className="text-2xs text-muted">
            Shares are of the parasite DNA, as mixed. They may be off by up to 1 point in total; the engine rescales them to sum to 100%.
          </p>
          {error && (
            <p role="alert" className="text-xs text-danger" data-testid="mixture-error">
              {error}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  )
}
