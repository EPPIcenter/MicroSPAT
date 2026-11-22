/**
 * Apply a plate map: choose or drop a CSV, see the engine's dry run (every
 * run it would make, keep or remove; samples to create; unknown loci or
 * wells; problems), then confirm. In the browser the CSV text is sent; in
 * the desktop app the engine reads the file from its path. Both get the same
 * preview, from the engine's `assignments`.
 *
 * The first version let the user edit the CSV text in place. It is gone:
 * it only worked in the browser, and a wrong barcode is better fixed in the
 * lab's own sheet (the source of truth) and re-chosen.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { apiQuery } from '@/api/query'
import { CircleAlert, CircleCheck, Download, FileSpreadsheet, TriangleAlert, Upload } from 'lucide-react'
import type { PlateSummary } from '@/api/bindings'
import { api } from '@/api/client'
import { chooseBrowserFiles, isTauri, onNativeFileDrop, pickFiles, saveTextFile } from '@/api/transport'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Spinner } from '@/components/ui/ProgressBar'
import { CheckboxField } from '@/components/form/fields'
import { cn } from '@/lib/cn'
import { toast } from '@/stores/toasts'
import { DESIGNATION_LABEL, PLATE_MAP_EXAMPLE, presentPlateMap, type MapPreview, type PreviewCell } from './model/plateMap'

interface CsvChoice {
  name: string
  /** CSV text, when it could be read here. */
  text: string | null
  /** Engine-readable path (desktop), when the text could not be read. */
  path: string | null
}

function hash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return `${s.length}:${(h >>> 0).toString(36)}`
}

export function PlateMapDialog({ plate, open, onOpenChange }: { plate: PlateSummary; open: boolean; onOpenChange: (o: boolean) => void }) {
  const loci = useQuery({ ...apiQuery(['loci'], 'list_loci'), enabled: open })
  const [choice, setChoice] = useState<CsvChoice | null>(null)
  const [create, setCreate] = useState(false)
  const [over, setOver] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  const text = choice?.text ?? null

  const close = (o: boolean) => {
    if (!o) {
      setChoice(null)
      setCreate(false)
    }
    onOpenChange(o)
  }

  // Desktop drops arrive as paths.
  useEffect(
    () =>
      onNativeFileDrop((e) => {
        if (!open) return
        const r = dropRef.current?.getBoundingClientRect()
        const inside = !!r && e.x >= r.left && e.x <= r.right && e.y >= r.top && e.y <= r.bottom
        if (e.type === 'over') setOver(inside)
        else if (e.type === 'leave') setOver(false)
        else {
          setOver(false)
          const p = e.paths.find((x) => /\.(csv|txt)$/i.test(x))
          if (inside && p) setChoice({ name: p.split(/[\\/]/).pop() ?? p, text: null, path: p })
        }
      }),
    [open],
  )

  const choose = async () => {
    try {
      if (isTauri()) {
        const [f] = await pickFiles({ extensions: ['csv', 'txt'] })
        if (f) setChoice({ name: f.name, text: null, path: f.path })
      } else {
        const [f] = await chooseBrowserFiles({ extensions: ['csv', 'txt'] })
        if (f) setChoice({ name: f.name, text: await f.text(), path: null })
      }
    } catch (e) {
      toast.error('Could not read the file', (e as Error).message)
    }
  }

  const source = choice?.path ? { path: choice.path } : text != null ? { content: text } : null
  const dry = useQuery({
    queryKey: ['plates', plate.id, 'map-dry-run', choice?.path ?? hash(text ?? ''), create],
    queryFn: () => api.apply_plate_map({ plate_id: plate.id, ...source, create_samples: create, dry_run: true }),
    enabled: open && source != null && (choice?.path != null || (text ?? '').trim() !== ''),
    meta: { silent: true },
    staleTime: 0,
  })
  const preview = useMemo(() => (dry.data ? presentPlateMap(dry.data) : null), [dry.data])
  const ntc = preview?.created.filter((c) => c.designation === 'negative_control').length ?? 0

  const apply = useMutation({
    mutationFn: () => api.apply_plate_map({ plate_id: plate.id, ...(choice?.path ? { path: choice.path } : { content: choice?.text ?? '' }), create_samples: create }),
    meta: { errorTitle: 'Plate map not applied' },
    onSuccess: (r) => {
      toast.success(
        `Plate map applied to ${plate.label}`,
        `${r.run_count.toLocaleString('en-US')} runs${r.created_samples.length ? `, ${r.created_samples.length} samples created` : ''}`,
      )
      close(false)
    },
  })

  const exportCurrent = async () => {
    try {
      const f = await api.export_plate_map({ id: plate.id })
      await saveTextFile(f.filename, f.content)
    } catch (e) {
      toast.error('Could not export the plate map', (e as Error).message)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={`Apply plate map to ${plate.label}`}
      description={plate.has_plate_map ? 'Replaces the current map. Runs whose well, locus and sample stay the same are kept.' : 'Assigns each well’s dyes to samples and loci.'}
      width="xl"
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={() => void exportCurrent()} title="Download this plate’s current map (or an empty template with every well)">
            <Download size={13} /> {plate.has_plate_map ? 'Export current map' : 'Download template'}
          </Button>
          <Button variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={preview?.status !== 'ready' || dry.isFetching || apply.isPending}
            onClick={() => apply.mutate()}
            data-testid="apply-map"
          >
            {apply.isPending ? <Spinner className="size-3" /> : null}
            {preview?.status === 'ready' && dry.data ? `Apply ${dry.data.run_count.toLocaleString('en-US')} runs` : 'Apply'}
          </Button>
        </>
      }
    >
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_16rem] gap-4">
        <div className="flex min-w-0 flex-col gap-3">
          {loci.data?.length === 0 && (
            <p className="flex items-start gap-2 rounded-[5px] border border-warn/30 bg-warn-soft px-2.5 py-2 text-xs" role="status" data-testid="map-needs-loci">
              <TriangleAlert size={13} className="mt-px shrink-0 text-warn" />
              <span>
                There are no loci yet. A plate map's columns are locus labels, so create the loci first (one by one, or import a CSV of them) on the{' '}
                <Link to="/loci" className="font-medium text-accent hover:underline">
                  Loci page
                </Link>
                .
              </span>
            </p>
          )}
          <div
            ref={dropRef}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              const f = Array.from(e.dataTransfer.files).find((x) => /\.(csv|txt)$/i.test(x.name))
              if (!f) return toast.error('No CSV file', 'Drop a .csv plate map')
              void f.text().then((t) => setChoice({ name: f.name, text: t, path: null }))
            }}
            className={cn(
              'flex items-center gap-3 rounded-md border border-dashed border-line-strong bg-surface-2/50 px-3 py-2.5 text-xs',
              over && 'border-accent bg-accent-soft',
            )}
          >
            <FileSpreadsheet size={18} className="shrink-0 text-faint" />
            <div className="min-w-0 flex-1">
              {choice ? (
                <>
                  <div className="truncate font-medium text-fg">{choice.name}</div>
                  <div className="truncate text-2xs text-muted">{choice.path ?? 'Checked by the engine. Fix problems in the file and choose it again.'}</div>
                </>
              ) : (
                <>
                  <div className="font-medium text-fg">Drop a plate-map CSV here</div>
                  <div className="text-2xs text-muted">Nothing changes until you press Apply.</div>
                </>
              )}
            </div>
            <Button size="sm" onClick={() => void choose()} data-testid="choose-map">
              <Upload size={12} /> {choice ? 'Choose another' : 'Choose file'}
            </Button>
          </div>

          <CheckboxField
            label="Create missing samples (barcodes containing “NTC” become negative controls)"
            value={create}
            onChange={setCreate}
          />

          {choice && dry.isFetching && !preview && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <Spinner /> Checking the map…
            </div>
          )}
          {dry.isError && (
            <p className="rounded-md border border-danger/40 bg-danger-soft px-2.5 py-2 text-xs text-danger" role="alert">
              {(dry.error as Error).message}
            </p>
          )}

          {preview && (
            <div className={cn('flex flex-col gap-2', dry.isFetching && 'opacity-60')} data-testid="map-preview" data-status={preview.status}>
              <div
                className={cn(
                  'flex items-start gap-2 rounded-md px-2.5 py-2 text-xs font-medium',
                  preview.status === 'ready' ? 'bg-ok-soft text-ok' : preview.status === 'samples' ? 'bg-warn-soft text-warn' : 'bg-danger-soft text-danger',
                )}
              >
                {preview.status === 'ready' ? <CircleCheck size={14} className="mt-px shrink-0" /> : preview.status === 'samples' ? <TriangleAlert size={14} className="mt-px shrink-0" /> : <CircleAlert size={14} className="mt-px shrink-0" />}
                <span>{preview.headline}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {preview.facts.map((f) => (
                  <span key={f.label} className="inline-flex items-baseline gap-1">
                    <span className="text-muted">{f.label}</span>
                    <span className={cn('num font-medium', f.tone === 'danger' ? 'text-danger' : f.tone === 'warn' ? 'text-warn' : 'text-fg')}>{f.value}</span>
                  </span>
                ))}
              </div>
              {preview.problems.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-danger">
                  {preview.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              {preview.unknownLoci.length > 0 && (
                <p className="text-xs text-danger">
                  Unknown loci (create them on the{' '}
                  <Link to="/loci" className="underline">
                    Loci page
                  </Link>
                  ; labels must match, ignoring case): <b>{preview.unknownLoci.join(', ')}</b>
                </p>
              )}
              {preview.unknownSamples.length > 0 && (
                <p className="text-xs text-warn">
                  Not in the workspace: {preview.unknownSamples.slice(0, 12).join(', ')}
                  {preview.unknownSamples.length > 12 ? ` and ${preview.unknownSamples.length - 12} more` : ''}
                </p>
              )}
              {preview.created.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted">
                    {preview.created.length === 1 ? '1 sample' : `${preview.created.length} samples`} to create
                    {ntc > 0 && ` (${ntc} as negative control${ntc === 1 ? '' : 's'})`}
                  </summary>
                  <div className="mt-1 flex max-h-24 flex-wrap gap-1 overflow-auto">
                    {preview.created.map((c) => (
                      <span key={c.barcode} className={cn('rounded-[3px] bg-surface-3 px-1 text-2xs', c.designation !== 'sample' && 'text-accent')} title={DESIGNATION_LABEL[c.designation]}>
                        {c.barcode}
                      </span>
                    ))}
                  </div>
                </details>
              )}
              {preview.table && preview.table.rows.length > 0 && <AssignmentTable key={choice?.name} table={preview.table} hasMap={plate.has_plate_map} />}
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-2 border-l border-line pl-4 text-xs text-muted">
          <h3 className="text-2xs font-semibold tracking-wide text-faint uppercase">CSV format</h3>
          <p>
            One row per well: a <b className="text-fg">Well</b> column, then one column per <b className="text-fg">locus label</b>. Each cell is the sample barcode run in that well for that locus; leave it empty for none.
          </p>
          <pre className="overflow-x-auto rounded-[5px] bg-surface-2 px-2 py-1.5 font-mono text-2xs leading-4 text-fg">{PLATE_MAP_EXAMPLE}</pre>
          <p>Wells can be written A01 or A1. Loci must already exist. Loci of the same dye in one well need size ranges that do not overlap.</p>
        </aside>
      </div>
    </Dialog>
  )
}

const CELL_CLS: Record<PreviewCell['state'], string> = {
  unchanged: 'text-fg',
  new: 'text-accent',
  create: 'text-accent',
  unknown: 'bg-danger-soft text-danger',
  removed: 'text-faint',
}

const CELL_TITLE: Record<PreviewCell['state'], string> = {
  unchanged: 'Same as the current map',
  new: 'New run',
  create: 'New run; the sample will be created',
  unknown: 'Sample not in the workspace',
  removed: 'Run of the current map, removed',
}

function Cell({ cell }: { cell: PreviewCell | null }) {
  if (!cell) return <td className="px-2 py-0.5 text-faint">·</td>
  const title = `${CELL_TITLE[cell.state]}${cell.removed ? ` (replaces ${cell.removed})` : ''}`
  return (
    <td className={cn('px-2 py-0.5 whitespace-nowrap', CELL_CLS[cell.state])} title={title} data-change={cell.state}>
      {cell.removed && <span className="mr-1 text-faint line-through">{cell.removed}</span>}
      {cell.barcode}
      {cell.state === 'create' && <span className="ml-0.5 text-2xs">+</span>}
    </td>
  )
}

function AssignmentTable({ table, hasMap }: { table: NonNullable<MapPreview['table']>; hasMap: boolean }) {
  // Re-applying a corrected map: the changes are what matters.
  const [onlyChanges, setOnlyChanges] = useState(hasMap && table.changedRows > 0 && table.changedRows < table.rows.length)
  const rows = onlyChanges ? table.rows.filter((r) => r.changed) : table.rows
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
        <span>
          {hasMap ? `${table.changedRows.toLocaleString('en-US')} of ${table.rows.length.toLocaleString('en-US')} wells change` : `${table.rows.length.toLocaleString('en-US')} wells`}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-accent">S1</span> new
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-accent">S1+</span> sample created
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="rounded-[2px] bg-danger-soft px-0.5 text-danger">S1</span> unknown sample
        </span>
        {hasMap && (
          <span className="inline-flex items-center gap-1">
            <span className="line-through">S0</span> removed
          </span>
        )}
        {hasMap && table.changedRows > 0 && (
          <label className="ml-auto inline-flex cursor-pointer items-center gap-1">
            <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} className="accent-[var(--c-accent)]" />
            Only wells that change
          </label>
        )}
      </div>
      <div className="max-h-64 overflow-auto rounded-md border border-line" data-testid="map-assignments">
        <table className="w-full border-collapse text-2xs">
          <thead className="sticky top-0 bg-surface-2">
            <tr>
              <th className="px-2 py-1 text-left font-semibold text-muted">Well</th>
              {table.loci.map((l) => (
                <th key={l} className="px-2 py-1 text-left font-semibold text-muted">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.well} className="border-t border-line/60" data-well={r.well}>
                <td className="num px-2 py-0.5 font-medium text-fg">{r.well}</td>
                {r.cells.map((c, j) => (
                  <Cell key={j} cell={c} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
