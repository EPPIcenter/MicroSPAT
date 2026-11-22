/**
 * The samples of a project: list, add (pick from the workspace's samples or
 * a CSV of barcodes, with a preview of matched and unknown barcodes) and
 * remove. Adding or removing samples makes results that depend on the
 * sample set stale.
 *
 * Bin and artifact estimators may use every sample with runs at their loci
 * (`all_samples`, from the engine's project detail). In that mode the engine
 * refuses removals, so the tab offers what works instead: keep only the
 * selected samples, or leave them out; both switch the estimator to a list
 * (`restrictToSamples`). In list mode such an estimator can switch back.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { FileUp, ListChecks, ListX, Plus, Trash2, Undo2 } from 'lucide-react'
import { api } from '@/api/client'
import type { ProjectDetail, ProjectSampleRow, Sample } from '@/api/bindings'
import { DataTable, type DataColumn } from '@/components/DataTable'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { countOf } from '@/lib/format'
import { toast } from '@/stores/toasts'
import { KINDS } from './kinds'
import { useProjectSamples, useWorkspaceSamples } from './queries'
import { previewSampleCsv } from './samplesCsv'
import { kbd } from '@/lib/platform'

/**
 * Switch an all-samples estimator to exactly `keep`. Adding samples switches
 * the engine to a list, but a list stored before an earlier "use every
 * sample" may still hold others; remove those.
 */
export async function restrictToSamples(projectId: number, keep: readonly number[]): Promise<void> {
  if (keep.length === 0) throw new Error('Keep at least one sample.')
  await api.add_project_samples({ id: projectId, sample_ids: [...keep] })
  const now = await api.list_project_samples({ id: projectId })
  const keepSet = new Set(keep)
  const extra = now.filter((r) => !keepSet.has(r.sample_id)).map((r) => r.sample_id)
  if (extra.length) await api.remove_project_samples({ id: projectId, sample_ids: extra })
}

const DESIGNATION: Record<string, string> = { sample: 'Sample', negative_control: 'Negative control', positive_control: 'Positive control' }

export interface SamplesTabProps {
  detail: ProjectDetail
  /** Extra columns (e.g. MOI for genotyping, mixtures for quantification bias). */
  extraColumns?: DataColumn<ProjectSampleRow>[]
  /** Double-click / Enter on a sample. */
  onOpenSample?: (row: ProjectSampleRow) => void
  /** Hide add/remove with this explanation (e.g. samples come from control mixtures). */
  readOnlyReason?: ReactNode
}

export function SamplesTab({ detail, extraColumns, onOpenSample, readOnlyReason }: SamplesTabProps) {
  const p = detail.project
  const info = KINDS[p.kind]
  const noun = info.noun.toLowerCase()
  const allMode = p.all_samples && info.mayUseAllSamples && !readOnlyReason
  const rows = useProjectSamples(p.id)
  const [selected, setSelected] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [restricting, setRestricting] = useState<'keep' | 'exclude' | null>(null)
  const all = rows.data ?? []
  const sel = new Set(selected.map(Number))
  const keepIds = restricting === 'keep' ? [...sel] : all.filter((r) => !sel.has(r.sample_id)).map((r) => r.sample_id)
  const restrict = useMutation({
    mutationFn: () => restrictToSamples(p.id, keepIds),
    meta: { errorTitle: 'Could not change the samples' },
    onSuccess: () => {
      toast.success(`Now uses a list of ${countOf(keepIds.length, 'sample')}`, 'Analyzed loci are stale until re-analyzed.')
      setSelected([])
    },
  })
  const useAll = useMutation({
    mutationFn: () => api.update_project({ id: p.id, all_samples: true }),
    meta: { errorTitle: 'Could not switch to every sample' },
    onSuccess: () => toast.success('Uses every sample with runs again', 'Loci analyzed with the list are stale until re-analyzed.'),
  })
  const columns = useMemo<DataColumn<ProjectSampleRow>[]>(
    () => [
      {
        id: 'barcode',
        header: 'Barcode',
        value: (r) => r.barcode,
        cell: (r) => <span className="font-medium">{r.barcode}</span>,
        width: 170,
      },
      { id: 'designation', header: 'Type', value: (r) => DESIGNATION[r.designation] ?? r.designation, width: 120 },
      {
        id: 'runs',
        header: 'Runs',
        value: (r) => r.run_count,
        align: 'right',
        width: 64,
        description: 'Runs of this sample at the project’s loci',
      },
      ...(extraColumns ?? []),
    ],
    [extraColumns],
  )
  const remove = useMutation({
    mutationFn: (ids: number[]) => api.remove_project_samples({ id: p.id, sample_ids: ids }),
    meta: { errorTitle: 'Could not remove samples' },
    onSuccess: (n) => {
      toast.success(`Removed ${countOf(n, 'sample')}`, p.kind === 'genotyping' ? 'Their calls and comments were deleted.' : undefined)
      setSelected([])
    },
  })

  let body: ReactNode
  if (rows.isLoading)
    body = (
      <div className="grid flex-1 place-items-center text-muted">
        <Spinner />
      </div>
    )
  else if (!rows.data?.length)
    body = (
      <EmptyState
        title="No samples in this project"
        action={
          !readOnlyReason && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus size={13} /> Add samples
            </Button>
          )
        }
      >
        {readOnlyReason ??
          (allMode
            ? 'No samples have runs at these loci yet. Import plates and apply a plate map; their samples appear here.'
            : 'Add samples by picking them from the workspace or with a CSV of barcodes.')}
      </EmptyState>
    )
  else if (allMode)
    body = (
      <DataTable
        data={rows.data}
        columns={columns}
        getRowId={(r) => String(r.sample_id)}
        selectionMode="multi"
        selected={selected}
        onSelectionChange={setSelected}
        onRowActivate={onOpenSample}
        ariaLabel="Project samples"
        filterPlaceholder="Filter samples…"
        initialSort={[{ id: 'barcode', desc: false }]}
        toolbar={
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={!selected.length || selected.length === all.length}
              onClick={() => setRestricting('exclude')}
              data-testid="exclude-samples"
            >
              <ListX size={12} /> Leave out {selected.length || ''}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!selected.length}
              onClick={() => setRestricting('keep')}
              data-testid="keep-samples"
            >
              <ListChecks size={12} /> Use only {selected.length || ''}
            </Button>
          </>
        }
      />
    )
  else
    body = (
      <DataTable
        data={rows.data}
        columns={columns}
        getRowId={(r) => String(r.sample_id)}
        selectionMode={readOnlyReason ? 'single' : 'multi'}
        selected={selected}
        onSelectionChange={setSelected}
        onRowActivate={onOpenSample}
        ariaLabel="Project samples"
        filterPlaceholder="Filter samples…"
        initialSort={[{ id: 'barcode', desc: false }]}
        toolbar={
          !readOnlyReason && (
            <>
              {info.mayUseAllSamples && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => useAll.mutate()}
                  disabled={useAll.isPending}
                  data-testid="samples-use-all"
                  title={`Switch the ${noun} back to every sample with runs at its loci (samples from new plates join automatically)`}
                >
                  {useAll.isPending ? <Spinner className="size-3" /> : <Undo2 size={12} />} Use every sample with runs
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={selected.length === 0}
                onClick={() => setRemoving(true)}
                data-testid="remove-samples"
              >
                <Trash2 size={12} /> Remove{selected.length ? ` ${selected.length}` : ''}
              </Button>
              <Button size="sm" variant="primary" onClick={() => setAdding(true)} data-testid="add-samples">
                <Plus size={12} /> Add samples
              </Button>
            </>
          )
        }
      />
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface" data-testid="samples-tab" data-mode={allMode ? 'all' : 'list'}>
      {readOnlyReason && rows.data?.length ? <p className="border-b border-line px-3 py-1.5 text-xs text-muted">{readOnlyReason}</p> : null}
      {allMode && (
        <div className="flex items-start gap-2 border-b border-line bg-accent-soft/60 px-3 py-2 text-xs" data-testid="samples-mode">
          <ListChecks size={14} className="mt-px shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p>
              <b>Every sample with runs</b> at {p.locus_set_label} ({countOf(all.length, 'sample')} now). Samples from plates imported later
              join automatically.
            </p>
            <p className="mt-0.5 text-muted">
              To restrict the {noun}, select samples and use only those or leave them out. Either switches it to a fixed list you can edit;
              you can switch back from there.
            </p>
          </div>
        </div>
      )}
      {body}
      {adding && (
        <AddSamplesDialog detail={detail} inProject={new Set((rows.data ?? []).map((r) => r.sample_id))} onClose={() => setAdding(false)} />
      )}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove ${countOf(selected.length, 'sample')}?`}
        description={
          p.kind === 'genotyping'
            ? 'Their calls, manual curation and comments in this project are deleted. The samples stay in the workspace.'
            : 'The samples stay in the workspace. Results that use them become stale.'
        }
        confirmLabel="Remove"
        destructive
        onConfirm={() => remove.mutateAsync(selected.map(Number))}
      />
      <ConfirmDialog
        open={restricting != null}
        onOpenChange={(o) => !o && setRestricting(null)}
        title={restricting === 'keep' ? `Use only ${countOf(sel.size, 'sample')}?` : `Leave out ${countOf(sel.size, 'sample')}?`}
        description={`The ${noun} switches to a fixed list of ${countOf(keepIds.length, 'sample')}; samples from new plates are no longer added. Analyzed loci become stale until re-analyzed.`}
        confirmLabel={restricting === 'keep' ? 'Use only these' : 'Leave them out'}
        onConfirm={() => restrict.mutateAsync()}
      />
    </div>
  )
}

/** Add samples by picking or by CSV. Exported for pages with their own sample lists. */
export function AddSamplesDialog({
  detail,
  inProject,
  onClose,
}: {
  detail: ProjectDetail
  inProject: ReadonlySet<number>
  onClose: () => void
}) {
  const p = detail.project
  const all = useWorkspaceSamples()
  const [tab, setTab] = useState<'pick' | 'csv'>('pick')
  const [picked, setPicked] = useState<string[]>([])
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const candidates = useMemo(() => (all.data ?? []).filter((s) => !inProject.has(s.id)), [all.data, inProject])
  const preview = useMemo(() => (csv.trim() ? previewSampleCsv(csv, all.data ?? [], inProject) : null), [csv, all.data, inProject])
  const columns = useMemo<DataColumn<Sample>[]>(
    () => [
      { id: 'barcode', header: 'Barcode', value: (s) => s.barcode, width: 170 },
      { id: 'designation', header: 'Type', value: (s) => DESIGNATION[s.designation] ?? s.designation, width: 120 },
      { id: 'runs', header: 'Runs', value: (s) => s.run_count, align: 'right', width: 60 },
      { id: 'plates', header: 'Plates', value: (s) => s.plate_count, align: 'right', width: 60 },
    ],
    [],
  )
  const add = useMutation({
    mutationFn: async (): Promise<{ added: number; already: number }> => {
      if (tab === 'pick') return api.add_project_samples({ id: p.id, sample_ids: picked.map(Number) })
      if (!preview) return { added: 0, already: 0 }
      // Every barcode known: let the engine read the CSV (its own checks).
      // Some unknown: add only the matched ones, by id.
      if (preview.unknown.length === 0) return api.import_project_samples_csv({ id: p.id, content: csv })
      return api.add_project_samples({ id: p.id, sample_ids: preview.matched.map((s) => s.id) })
    },
    meta: { errorTitle: 'Could not add samples' },
    onSuccess: (r) => {
      toast.success(
        `Added ${countOf(r.added, 'sample')}`,
        r.already ? `${countOf(r.already, 'sample')} already in the project.` : undefined,
      )
      onClose()
    },
  })
  const n = tab === 'pick' ? picked.length : (preview?.matched.length ?? 0)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Add samples to ${p.title}`}
      description={
        p.all_samples && KINDS[p.kind].mayUseAllSamples
          ? 'This project uses every sample with runs; adding samples switches it to a fixed list.'
          : undefined
      }
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={n === 0 || add.isPending} onClick={() => add.mutate()} data-testid="add-samples-confirm">
            {add.isPending && <Spinner className="size-3" />} Add {countOf(n, 'sample')}
          </Button>
        </>
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'pick' | 'csv')} className="flex flex-col">
        <TabsList className="-mx-4 -mt-3 mb-2 px-2">
          <TabsTrigger value="pick">Pick from workspace</TabsTrigger>
          <TabsTrigger value="csv">From CSV</TabsTrigger>
        </TabsList>
        <TabsContent value="pick" className="flex h-[46vh] flex-col">
          {all.isLoading ? (
            <div className="grid flex-1 place-items-center">
              <Spinner />
            </div>
          ) : (
            <DataTable
              data={candidates}
              columns={columns}
              getRowId={(s) => String(s.id)}
              selectionMode="multi"
              clickToggles
              selected={picked}
              onSelectionChange={setPicked}
              ariaLabel="Workspace samples"
              filterPlaceholder="Search barcodes…"
              initialSort={[{ id: 'barcode', desc: false }]}
              emptyMessage="Every workspace sample is already in this project."
              className="rounded border border-line"
            />
          )}
          <p className="mt-1.5 text-2xs text-muted">
            Click to toggle, Shift-click for a range, {kbd('⌘A')} to select everything the filter shows.
          </p>
        </TabsContent>
        <TabsContent value="csv" className="flex flex-col gap-2">
          <p className="text-xs text-muted">
            A CSV with a <b>Barcode</b> column (other columns are ignored), or one barcode per line. Barcodes must match samples in the
            workspace, which plate maps create.
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp size={12} /> Choose file…
            </Button>
            <span className="truncate text-2xs text-muted">{fileName ?? 'or paste below'}</span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.tsv,text/csv,text/plain"
              hidden
              data-testid="samples-csv-file"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                setFileName(f.name)
                setCsv(await f.text())
                e.target.value = ''
              }}
            />
          </div>
          <textarea
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value)
              setFileName(null)
            }}
            placeholder={'Barcode\nD1-S001\nD1-S002'}
            aria-label="Sample CSV"
            className="h-28 w-full resize-y rounded-[5px] border border-line-strong bg-surface p-2 font-mono text-xs outline-none focus:border-accent"
          />
          {preview && <CsvPreview preview={preview} />}
        </TabsContent>
      </Tabs>
    </Dialog>
  )
}

function CsvPreview({ preview }: { preview: ReturnType<typeof previewSampleCsv> }) {
  if (preview.error)
    return (
      <p className="text-xs text-danger" role="alert">
        {preview.error}
      </p>
    )
  const list = (xs: string[]) => (xs.length > 12 ? `${xs.slice(0, 12).join(', ')} and ${xs.length - 12} more` : xs.join(', '))
  return (
    <div className="space-y-1 rounded border border-line bg-surface-2 p-2 text-xs" data-testid="csv-preview">
      <p>
        <b className="text-ok">{countOf(preview.matched.length, 'sample')}</b> to add
        {preview.already.length > 0 && <span className="text-muted"> · {preview.already.length} already in the project</span>}
        {preview.duplicates.length > 0 && <span className="text-muted"> · {preview.duplicates.length} listed twice</span>}
      </p>
      {preview.unknown.length > 0 && (
        <p className="text-warn">
          {countOf(preview.unknown.length, 'unknown barcode')} (not in the workspace, will be skipped):{' '}
          <span className="font-mono">{list(preview.unknown)}</span>
        </p>
      )}
      {preview.matched.length > 0 && (
        <p className="text-muted">
          Adding: <span className="font-mono">{list(preview.matched.map((s) => s.barcode))}</span>
        </p>
      )}
    </div>
  )
}
