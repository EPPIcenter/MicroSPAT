/**
 * One sample: designation, its runs grouped by locus (plate, well, signal,
 * sizing), and the raw trace of the selected run zoomed to the locus range.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ExternalLink, FlaskConical, Trash2 } from 'lucide-react'
import type { Designation, Locus, Sample, SampleDetail as SampleDetailT, SampleRun, SizingState } from '@/api/bindings'
import { api } from '@/api/client'
import { apiQuery } from '@/api/query'
import { cn } from '@/lib/cn'
import { countOf, fmtRfu } from '@/lib/format'
import { SelectInput } from '@/components/form/fields'
import { TraceViewer } from '@/components/TraceViewer'
import { Button } from '@/components/ui/Button'
import { DyeChip, StatusChip, type Status } from '@/components/ui/Badge'
import { EmptyState, NotFound } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { SplitView } from '@/components/ui/SplitView'
import { Banner, errorText } from '@/features/loci/shared'
import { SIZING_LABEL } from '@/features/plates/model/status'
import { DeleteSamplesDialog } from './dialogs'
import { DESIGNATION_OPTIONS } from './designation'

// Labels as the plates page words them.
const SIZING: Record<SizingState, { status: Status; label: string }> = {
  good: { status: 'ok', label: SIZING_LABEL.good },
  flagged: { status: 'flagged', label: SIZING_LABEL.flagged },
  unusable: { status: 'failed', label: SIZING_LABEL.unusable },
  failed: { status: 'failed', label: SIZING_LABEL.failed },
}

export function SampleDetail({ id, onDeleted }: { id: number; onDeleted: () => void }) {
  const qc = useQueryClient()
  const sample = useQuery({ ...apiQuery(['samples', id], 'get_sample', { id }), meta: { silent: true } })
  const loci = useQuery(apiQuery(['loci'], 'list_loci'))
  const [runId, setRunId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const setDesignation = useMutation({
    meta: { errorTitle: 'Could not change the designation' },
    mutationFn: (d: Designation) => api.update_sample({ id, designation: d }),
    onSuccess: (s) => {
      qc.setQueryData<SampleDetailT>(['samples', id], (old) => (old ? { ...old, designation: s.designation } : old))
      qc.setQueryData<Sample[]>(['samples'], (old) => old?.map((x) => (x.id === s.id ? s : x)))
    },
  })

  const runs = useMemo(() => sample.data?.runs ?? [], [sample.data])
  const groups = useMemo(() => {
    const m = new Map<number, SampleRun[]>()
    for (const r of runs) m.set(r.locus_id, [...(m.get(r.locus_id) ?? []), r])
    return [...m.values()]
  }, [runs])
  const run = runs.find((r) => r.run_id === runId) ?? runs[0] ?? null
  const plates = new Set(runs.map((r) => r.plate_id)).size

  if (sample.isPending)
    return (
      <div className="grid h-full place-items-center text-muted">
        <Spinner />
      </div>
    )
  if (sample.isError) return <NotFound what="sample" error={sample.error} />
  const s = sample.data
  const locus = run ? loci.data?.find((l) => l.id === run.locus_id) : undefined
  const contaminated = runs.filter((r) => r.contaminated)

  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-label={`Sample ${s.barcode}`}>
      <div className="flex shrink-0 items-start gap-3 border-b border-line bg-surface px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold" data-testid="sample-title">
            {s.barcode}
          </h2>
          <p className="truncate text-xs text-muted">
            {countOf(runs.length, 'run')} · {countOf(groups.length, 'locus', 'loci')} · {countOf(plates, 'plate')}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <SelectInput
            aria-label="Designation"
            className="w-40"
            value={s.designation}
            options={DESIGNATION_OPTIONS}
            disabled={setDesignation.isPending}
            onChange={(v) => setDesignation.mutate(v as Designation)}
          />
          <Button size="sm" variant="danger-ghost" onClick={() => setDeleting(true)}>
            <Trash2 size={12} /> Delete
          </Button>
        </div>
      </div>
      {contaminated.length > 0 && (
        <Banner tone="danger" className="m-3 mb-0">
          Negative control with signal above the contamination limit at {[...new Set(contaminated.map((r) => r.locus_label))].join(', ')}.
        </Banner>
      )}
      {runs.length === 0 ? (
        <EmptyState icon={<FlaskConical />} title="No runs">
          A sample gets runs when a plate map assigns it to wells. Apply a plate map on the Plates page.
        </EmptyState>
      ) : (
        <SplitView
          id="sample-runs"
          defaultSize={300}
          minSize={220}
          minSecond={320}
          first={<RunList groups={groups} selected={run?.run_id ?? null} onSelect={setRunId} />}
          second={run ? <RunTrace run={run} locus={locus} /> : <div />}
        />
      )}
      <DeleteSamplesDialog
        open={deleting}
        onOpenChange={setDeleting}
        samples={[{ id: s.id, barcode: s.barcode, run_count: runs.length }]}
        onDeleted={() => onDeleted()}
      />
    </div>
  )
}

function RunList({ groups, selected, onSelect }: { groups: SampleRun[][]; selected: number | null; onSelect: (id: number) => void }) {
  const flat = groups.flat()
  return (
    <div
      role="listbox"
      aria-label="Runs"
      tabIndex={0}
      className="min-h-0 flex-1 overflow-auto bg-surface outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-inset"
      onKeyDown={(e) => {
        const i = flat.findIndex((r) => r.run_id === selected)
        const go = (k: number) => {
          const r = flat[Math.max(0, Math.min(flat.length - 1, k))]
          if (r) {
            e.preventDefault()
            onSelect(r.run_id)
          }
        }
        if (e.key === 'ArrowDown') go(i + 1)
        else if (e.key === 'ArrowUp') go(i - 1)
      }}
    >
      {groups.map((g) => (
        <div key={g[0]!.locus_id} role="group" aria-label={g[0]!.locus_label}>
          <div className="sticky top-0 z-[1] flex h-7 items-center gap-2 border-b border-line bg-surface-2 px-3 text-xs font-semibold">
            {g[0]!.locus_label}
            <DyeChip color={g[0]!.color} className="font-normal text-muted" />
            <span className="ml-auto text-2xs font-normal text-faint">{countOf(g.length, 'run')}</span>
          </div>
          {g.map((r) => {
            const sz = SIZING[r.sizing]
            return (
              <div
                key={r.run_id}
                role="option"
                aria-selected={r.run_id === selected}
                data-run-id={r.run_id}
                onMouseDown={() => onSelect(r.run_id)}
                className={cn(
                  'flex h-7 cursor-default items-center gap-2 border-b border-line/60 px-3 text-[13px]',
                  r.run_id === selected ? 'bg-accent-soft' : 'hover:bg-surface-3/60',
                )}
              >
                <span className="truncate">{r.plate_label}</span>
                <span className="num w-8 shrink-0 text-muted">{r.well_label}</span>
                <span className="num ml-auto w-14 shrink-0 text-right text-muted" title="Highest raw signal in the locus range (RFU)">
                  {fmtRfu(r.max_signal)}
                </span>
                {r.contaminated && <AlertTriangle size={12} className="shrink-0 text-danger" aria-label="Contaminated" />}
                <span className="w-[74px] shrink-0" title={r.sizing_reason}>
                  <StatusChip status={sz.status} label={sz.label} className="justify-start" />
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function RunTrace({ run, locus }: { run: SampleRun; locus: Locus | undefined }) {
  const trace = useQuery(apiQuery(['plates', 'channels', run.channel_id, 'trace'], 'get_channel_trace', { id: run.channel_id }))
  const t = trace.data
  const series = useMemo(
    () =>
      t
        ? [
            {
              id: `ch-${t.channel_id}`,
              color: t.color,
              data: t.trace,
              baseSizes: t.base_sizes,
              label: `${run.locus_label} · ${run.plate_label} ${run.well_label}`,
            },
          ]
        : [],
    [t, run.locus_label, run.plate_label, run.well_label],
  )
  const range: [number, number] | undefined = locus && t?.base_sizes ? [locus.min_base_length, locus.max_base_length] : undefined
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 text-xs">
        <span className="font-medium">{run.locus_label}</span>
        <DyeChip color={run.color} />
        {locus && (
          <span className="num text-muted">
            {locus.min_base_length}–{locus.max_base_length} bp
          </span>
        )}
        <span className="text-faint">·</span>
        <span className="text-muted">
          {run.plate_label} {run.well_label}
        </span>
        <Link to={`/plates/${run.plate_id}?well=${run.well_label}`} className="ml-auto flex items-center gap-1 text-accent hover:underline">
          Open well <ExternalLink size={11} />
        </Link>
      </div>
      {run.sizing !== 'good' && run.sizing_reason && (
        <div className="m-2 mb-0" data-testid="run-sizing-reason">
          <Banner tone={run.sizing === 'flagged' ? 'warn' : 'danger'}>
            {SIZING[run.sizing].label}: {run.sizing_reason}
          </Banner>
        </div>
      )}
      {t && !t.base_sizes && (
        <Banner tone="warn" className="m-2 mb-0">
          This well is not sized, so the trace is shown by data point and the locus range cannot be marked.
        </Banner>
      )}
      <div className="flex min-h-0 flex-1 p-1.5">
        {trace.isPending ? (
          <div className="grid flex-1 place-items-center text-muted">
            <Spinner />
          </div>
        ) : trace.isError ? (
          <EmptyState title="Could not load the trace">{errorText(trace.error)}</EmptyState>
        ) : (
          <TraceViewer
            className="h-full w-full"
            series={series}
            xMode={t?.base_sizes ? 'bp' : 'index'}
            locusRange={range}
            resetKey={`${run.run_id}`}
            showLegend={false}
          />
        )}
      </div>
    </div>
  )
}
