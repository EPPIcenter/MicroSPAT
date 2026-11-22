/**
 * Assign control mixtures from a CSV (the old MicroSPAT format). Shows the
 * format with an example and a template, then previews the file through the
 * engine's dry run: what each row assigns, and every problem (unknown
 * barcode, unknown control, control of another bin estimator, proportions
 * not summing to 1) before anything is applied.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Download, FileUp } from 'lucide-react'
import { api } from '@/api/client'
import type { Control, MixturesReport, ProjectDetail, ProjectSampleRow } from '@/api/bindings'
import { isRpcError, saveTextFile } from '@/api/transport'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Spinner } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/cn'
import { countOf } from '@/lib/format'
import { toast } from '@/stores/toasts'
import { useWorkspaceSamples } from '@/features/projects-shared/queries'
import { mixtureTemplate, previewMixtureCsv, type MixtureCsvPreview } from './model/csvPreview'

export interface MixtureCsvDialogProps {
  detail: ProjectDetail
  rows: readonly ProjectSampleRow[]
  /** Every control (to explain controls of another bin estimator). */
  controls: readonly Control[]
  open: boolean
  onOpenChange: (o: boolean) => void
}

function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v)
  useEffect(() => {
    const h = setTimeout(() => setD(v), ms)
    return () => clearTimeout(h)
  }, [v, ms])
  return d
}

export function MixtureCsvDialog({ detail, rows, controls, open, onOpenChange }: MixtureCsvDialogProps) {
  const p = detail.project
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const samples = useWorkspaceSamples(open)
  const content = useDebounced(text, 250)
  const own = controls.filter((c) => c.bin_estimator_id === p.bin_estimator?.id)

  const dry = useQuery({
    queryKey: ['projects', p.id, 'mixtures-dry-run', content],
    queryFn: () => api.import_control_mixtures_csv({ id: p.id, content, dry_run: true }),
    enabled: open && content.trim() !== '',
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    meta: { silent: true },
  })
  const fatal = dry.error ? (isRpcError(dry.error) ? dry.error.message : String(dry.error)) : null
  const preview = useMemo<MixtureCsvPreview | null>(() => {
    if (!content.trim() || !samples.data) return null
    return previewMixtureCsv(content, dry.data ?? null, {
      samples: samples.data,
      projectSampleIds: new Set(rows.map((r) => r.sample_id)),
      controls,
      binEstimatorId: p.bin_estimator?.id ?? -1,
      binEstimatorTitle: p.bin_estimator?.title ?? '?',
    })
  }, [content, samples.data, dry.data, rows, controls, p.bin_estimator])
  const checking = text !== content || dry.isFetching
  const canApply = !!preview && preview.canApply && !checking && !fatal

  const apply = useMutation({
    mutationFn: () => api.import_control_mixtures_csv({ id: p.id, content }),
    meta: { errorTitle: 'Could not assign the mixtures' },
    onSuccess: (r: MixturesReport) => {
      toast.success(
        `Assigned ${countOf(r.added + r.replaced, 'mixture')}`,
        `${r.added} new, ${r.replaced} replaced. Analyze the loci to update β.`,
      )
      close()
    },
  })
  const close = () => {
    setText('')
    setFileName(null)
    onOpenChange(false)
  }
  const template = () =>
    saveTextFile(
      `${p.title.replace(/\W+/g, '_')}_mixtures.csv`,
      mixtureTemplate(
        rows,
        own.map((c) => c.label),
      ),
    )
  const ex = own.length >= 2 ? [own[0]!.label, own[1]!.label] : ['3D7', 'DD2']

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      title="Assign control mixtures from CSV"
      description={`Samples are matched by barcode; controls by name among the controls of ${p.bin_estimator?.title ?? 'the bin estimator'}.`}
      width="xl"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!canApply || apply.isPending} onClick={() => apply.mutate()} data-testid="csv-apply">
            {apply.isPending ? <Spinner className="size-3" /> : null}
            {preview && preview.rows.length ? `Assign ${countOf(preview.rows.length, 'mixture')}` : 'Assign'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp size={12} /> Choose file…
            </Button>
            <span className="truncate text-2xs text-muted">{fileName ?? 'or paste below'}</span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              hidden
              data-testid="mixtures-csv-file"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                setFileName(f.name)
                setText(await f.text())
                e.target.value = ''
              }}
            />
            {checking && text.trim() && (
              <span className="ml-auto flex items-center gap-1 text-2xs text-muted">
                <Spinner className="size-3" /> checking with the engine…
              </span>
            )}
          </div>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setFileName(null)
            }}
            placeholder={`Barcode,Control 1,Control 2\nMIX-01,${ex[0]};0.7,${ex[1]};0.3`}
            aria-label="Mixtures CSV"
            spellCheck={false}
            className="h-28 w-full resize-y rounded-[5px] border border-line-strong bg-surface p-2 font-mono text-xs outline-none focus:border-accent"
          />
          {fatal ? (
            <p role="alert" className="flex gap-1.5 text-xs text-danger" data-testid="csv-fatal">
              <AlertTriangle size={13} className="mt-px shrink-0" /> {fatal}
            </p>
          ) : preview ? (
            <Preview preview={preview} checking={checking} />
          ) : null}
        </div>
        <aside className="space-y-2 rounded border border-line bg-surface-2 p-2.5 text-xs" aria-label="CSV format">
          <h3 className="font-semibold">Format</h3>
          <p className="text-muted">
            A header row starting with <b>Barcode</b>, then one column per control strain in the sample (column names do not matter). Each
            cell is <code>CONTROL;PROPORTION</code>, and a row's proportions add up to 1.
          </p>
          <pre className="overflow-x-auto rounded bg-surface p-1.5 font-mono text-2xs leading-relaxed">
            {`Barcode,C1,C2\nMIX-01,${ex[0]};0.7,${ex[1]};0.3\nMIX-02,${ex[0]};0.5,${ex[1]};0.5`}
          </pre>
          <ul className="list-disc space-y-0.5 pl-4 text-muted">
            <li>Barcodes are samples already in the workspace (plate maps create them).</li>
            <li>
              Controls are named as on the Controls page, from <b>{p.bin_estimator?.title}</b>
              {own.length ? `: ${own.map((c) => c.label).join(', ')}` : ' (none yet)'}.
            </li>
            <li>Proportions are fractions (0.7, not 70%).</li>
            <li>A sample already in the project gets the new composition.</li>
          </ul>
          <Button size="sm" onClick={template} className="w-full" data-testid="csv-template">
            <Download size={12} /> {rows.some((r) => r.controls.length) ? 'Download current mixtures' : 'Download template'}
          </Button>
        </aside>
      </div>
    </Dialog>
  )
}

function Preview({ preview, checking }: { preview: MixtureCsvPreview; checking: boolean }) {
  if (preview.fatal)
    return (
      <p role="alert" className="text-xs text-danger" data-testid="csv-fatal">
        {preview.fatal}
      </p>
    )
  const added = preview.rows.filter((r) => r.change === 'new' && !r.problems.length).length
  const replaced = preview.rows.filter((r) => r.change === 'replace' && !r.problems.length).length
  return (
    <div className="flex min-h-0 flex-col gap-1.5" data-testid="csv-preview" data-bad={preview.badRows} data-ok={preview.okRows}>
      <p className="text-xs">
        {preview.badRows === 0 && preview.general.length === 0 ? (
          <span className="flex items-center gap-1 text-ok">
            <CheckCircle2 size={13} /> {countOf(preview.rows.length, 'mixture')} ready
            {!checking && (
              <span className="text-muted">
                {' '}
                · {added} new, {replaced} replacing the current composition
              </span>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-danger">
            <AlertTriangle size={13} />
            {preview.badRows > 0 ? `${countOf(preview.badRows, 'row')} with problems` : 'Problems'}; nothing is assigned until every row is
            fixed.
            <span className="text-muted">({preview.okRows} fine)</span>
          </span>
        )}
      </p>
      {preview.general.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-danger" data-testid="csv-general-problems">
          {preview.general.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      )}
      <div className="max-h-64 overflow-auto rounded border border-line">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface-2 text-left text-2xs text-muted">
            <tr>
              <th className="px-2 py-1 font-medium">Line</th>
              <th className="px-2 py-1 font-medium">Barcode</th>
              <th className="px-2 py-1 font-medium">Composition</th>
              <th className="px-2 py-1 text-right font-medium">Sum</th>
              <th className="px-2 py-1 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((r) => (
              <tr
                key={r.line}
                className={cn('border-t border-line align-top', r.problems.length && 'bg-danger-soft/50')}
                data-barcode={r.barcode}
                data-ok={!r.problems.length}
              >
                <td className="num px-2 py-1 text-faint">{r.line}</td>
                <td className="px-2 py-1 font-medium whitespace-nowrap">{r.barcode || <span className="text-faint">(none)</span>}</td>
                <td className="px-2 py-1 whitespace-nowrap">
                  {r.components
                    .map(
                      (c) =>
                        `${c.label} ${c.proportion != null && c.proportion >= 0 && c.proportion <= 1 ? `${+(c.proportion * 100).toFixed(2)}%` : (c.raw.split(';')[1] ?? '?')}`,
                    )
                    .join(' · ')}
                </td>
                <td className={cn('num px-2 py-1 text-right', Math.abs(r.sum - 1) > 0.01 && 'text-danger')}>{r.sum.toFixed(2)}</td>
                <td className="px-2 py-1">
                  {r.problems.length ? (
                    <ul className="text-danger">
                      {r.problems.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-ok">{r.change === 'replace' ? 'replaces current' : 'new'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
