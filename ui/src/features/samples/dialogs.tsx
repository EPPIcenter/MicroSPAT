/** Create-sample and import-samples dialogs. */
import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, CircleX, MinusCircle } from 'lucide-react'
import type { Designation, Sample, SampleRefusal, SamplesBatchResult } from '@/api/bindings'
import { api } from '@/api/client'
import { cn } from '@/lib/cn'
import { countOf } from '@/lib/format'
import { SelectField, TextField } from '@/components/form/fields'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Spinner } from '@/components/ui/ProgressBar'
import { toast } from '@/stores/toasts'
import { Banner, CsvTextInput, errorText } from '@/features/loci/shared'
import { DESIGNATION_OPTIONS, DesignationBadge } from './designation'
import { previewSamplesCsv, rowsToCreateCsv } from './importPreview'

export function CreateSampleDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (s: Sample) => void
}) {
  const qc = useQueryClient()
  const [barcode, setBarcode] = useState('')
  const [designation, setDesignation] = useState<Designation>('sample')
  const create = useMutation({
    meta: { silent: true },
    mutationFn: () => api.create_sample({ barcode: barcode.trim(), designation }),
    onSuccess: (s) => {
      qc.setQueryData<Sample[]>(['samples'], (old) => (old ? [...old, s] : old))
      toast.success('Sample created', s.barcode)
      setBarcode('')
      onOpenChange(false)
      onCreated(s)
    },
  })
  const close = (v: boolean) => {
    if (!v) create.reset()
    onOpenChange(v)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={close}
      width="sm"
      title="New sample"
      footer={
        <>
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="create-sample" disabled={barcode.trim() === '' || create.isPending}>
            {create.isPending && <Spinner className="size-3" />}
            Create sample
          </Button>
        </>
      }
    >
      <form
        id="create-sample"
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (barcode.trim()) create.mutate()
        }}
      >
        <TextField
          label="Barcode"
          value={barcode}
          onChange={(v) => {
            setBarcode(v)
            if (create.isError) create.reset()
          }}
          error={create.isError ? errorText(create.error) : null}
          help="Unique sample identifier (case-insensitive), as used in plate maps."
        />
        <SelectField
          label="Designation"
          value={designation}
          onChange={(v) => setDesignation(v as Designation)}
          options={DESIGNATION_OPTIONS}
          help="Negative controls with signal above the contamination limit flag their plate and locus."
        />
      </form>
    </Dialog>
  )
}

const PREVIEW_LIMIT = 400

export function ImportSamplesDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  existing: readonly Sample[]
}) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const barcodes = useMemo(() => new Set(existing.map((s) => s.barcode.toLowerCase())), [existing])
  const preview = useMemo(() => (text.trim() ? previewSamplesCsv(text, barcodes) : null), [text, barcodes])
  const imp = useMutation({
    meta: { silent: true },
    mutationFn: () => api.import_samples_csv({ content: rowsToCreateCsv(preview!) }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['samples'] })
      toast.success(
        `Imported ${countOf(r.created.length, 'sample')}`,
        r.existing.length
          ? `${countOf(r.existing.length, 'barcode')} already existed and ${r.existing.length === 1 ? 'was' : 'were'} left unchanged.`
          : undefined,
      )
      setText('')
      onOpenChange(false)
    },
  })
  const close = (v: boolean) => {
    if (!v) {
      setText('')
      imp.reset()
    }
    onOpenChange(v)
  }
  const n = preview?.create ?? 0
  return (
    <Dialog
      open={open}
      onOpenChange={close}
      width="lg"
      title="Import samples"
      description="Create samples from a list of barcodes. Barcodes already in the workspace are left unchanged."
      footer={
        <>
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button variant="primary" disabled={!preview || !!preview.headerError || n === 0 || imp.isPending} onClick={() => imp.mutate()}>
            {imp.isPending && <Spinner className="size-3" />}
            Import {countOf(n, 'sample')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-md bg-surface-2 px-2.5 py-2 text-xs text-muted">
          A CSV with a <code className="font-mono text-fg">Barcode</code> column and an optional{' '}
          <code className="font-mono text-fg">Designation</code> column (sample, negative / neg / NTC, positive / pos), or just one barcode
          per line.
        </div>
        <CsvTextInput
          value={text}
          onChange={(t) => setText(t)}
          placeholder={'Barcode,Designation\nP1-S001,sample\nP1-NTC,negative'}
          rows={5}
        />
        {imp.isError && <Banner tone="danger">{errorText(imp.error)}</Banner>}
        {preview?.headerError && <Banner tone="danger">{preview.headerError}</Banner>}
        {preview && !preview.headerError && (
          <div className="flex flex-col gap-1.5" data-testid="samples-import-preview">
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-ok">
                <CheckCircle2 size={13} /> {preview.create} to create
              </span>
              {preview.existing > 0 && (
                <span className="flex items-center gap-1 text-muted">
                  <MinusCircle size={13} /> {preview.existing} already exist
                </span>
              )}
              {preview.invalid > 0 && (
                <span className="flex items-center gap-1 text-danger">
                  <CircleX size={13} /> {preview.invalid} rejected
                </span>
              )}
            </div>
            <div className="max-h-64 overflow-auto rounded-md border border-line">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2 text-2xs text-muted uppercase">
                  <tr>
                    <th className="px-2 py-1 text-right font-semibold">Line</th>
                    <th className="px-2 py-1 text-left font-semibold">Barcode</th>
                    <th className="px-2 py-1 text-left font-semibold">Designation</th>
                    <th className="px-2 py-1 text-left font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, PREVIEW_LIMIT).map((r) => (
                    <tr key={r.line} className={cn('border-t border-line/60', r.status === 'invalid' && 'bg-danger-soft/50')}>
                      <td className="num px-2 py-1 text-right text-faint">{r.line}</td>
                      <td className="px-2 py-1 font-medium">{r.barcode}</td>
                      <td className="px-2 py-1">{r.designation ? <DesignationBadge d={r.designation} /> : '–'}</td>
                      <td
                        className={cn(
                          'px-2 py-1',
                          r.status === 'create' ? 'text-ok' : r.status === 'existing' ? 'text-muted' : 'text-danger',
                        )}
                      >
                        {r.status === 'create' ? 'Create' : r.problem}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > PREVIEW_LIMIT && (
                <p className="border-t border-line px-2 py-1 text-2xs text-muted">
                  …and {(preview.rows.length - PREVIEW_LIMIT).toLocaleString('en-US')} more rows
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}

/**
 * Delete samples in one `delete_samples` call. Samples the engine refuses
 * (runs on a plate map, used by a project) are listed with its reason; the
 * others are gone.
 */
export function DeleteSamplesDialog({
  open,
  onOpenChange,
  samples,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  samples: readonly Pick<Sample, 'id' | 'barcode' | 'run_count'>[]
  /** Ids that were deleted (called before refusals are shown). */
  onDeleted?: (ids: number[]) => void
}) {
  const qc = useQueryClient()
  const [result, setResult] = useState<SamplesBatchResult | null>(null)
  const del = useMutation({
    meta: { silent: true },
    mutationFn: () => api.delete_samples({ sample_ids: samples.map((s) => s.id) }),
    onSuccess: (r) => {
      if (r.done.length) {
        const gone = new Set(r.done)
        qc.setQueryData<Sample[]>(['samples'], (old) => old?.filter((s) => !gone.has(s.id)))
        onDeleted?.(r.done)
        toast.success(`Deleted ${countOf(r.done.length, 'sample')}`)
      }
      if (r.refused.length) setResult(r)
      else onOpenChange(false)
    },
  })
  const close = (v: boolean) => {
    if (del.isPending) return
    if (!v) {
      setResult(null)
      del.reset()
    }
    onOpenChange(v)
  }
  const withRuns = samples.filter((s) => s.run_count > 0).length
  const what = samples.length === 1 ? `sample ${samples[0]!.barcode}` : countOf(samples.length, 'sample')
  return (
    <Dialog
      open={open}
      onOpenChange={close}
      width="md"
      title={result ? `${countOf(result.refused.length, 'sample')} not deleted` : `Delete ${what}?`}
      description={result && result.done.length ? `${countOf(result.done.length, 'sample')} deleted.` : undefined}
      footer={
        result ? (
          <Button onClick={() => close(false)}>Close</Button>
        ) : (
          <>
            <Button onClick={() => close(false)} disabled={del.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => del.mutate()}
              disabled={del.isPending || samples.length === 0}
              data-testid="confirm-delete"
            >
              {del.isPending && <Spinner className="size-3" />}
              {del.isPending ? 'Deleting…' : `Delete ${countOf(samples.length, 'sample')}`}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <Refusals refused={result.refused} testId="delete-failures" />
      ) : (
        <div className="flex flex-col gap-2 text-xs text-muted">
          {samples.length > 1 && samples.length <= 12 && <p className="text-fg">{samples.map((s) => s.barcode).join(', ')}</p>}
          {withRuns > 0 && (
            <Banner tone="warn">
              {withRuns === samples.length
                ? samples.length === 1
                  ? 'It has runs'
                  : 'They all have runs'
                : `${countOf(withRuns, 'of them', 'of them')} ${withRuns === 1 ? 'has' : 'have'} runs`}{' '}
              on a plate map; the engine will refuse {withRuns === 1 ? 'it' : 'those'} until the plate maps are cleared or changed.
            </Banner>
          )}
          {del.isError && <Banner tone="danger">{errorText(del.error)}</Banner>}
          <p>This cannot be undone. Samples that are still in use are refused and listed here.</p>
        </div>
      )}
    </Dialog>
  )
}

/** A batch method's refusals: barcode and reason, scrollable when long. */
export function Refusals({ refused, testId }: { refused: readonly SampleRefusal[]; testId?: string }) {
  return (
    <ul className="flex max-h-72 flex-col gap-1 overflow-auto" data-testid={testId}>
      {refused.map((r) => (
        <li key={r.sample_id} className="rounded-[5px] border border-danger/25 bg-danger-soft px-2 py-1 text-xs">
          <span className="font-medium text-fg">{r.barcode ?? `#${r.sample_id}`}</span>
          <span className="text-muted">: {r.reason}</span>
        </li>
      ))}
    </ul>
  )
}
