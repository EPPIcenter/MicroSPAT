/**
 * One sample across every locus. Polyclonality is judged across loci: the
 * grid shows each locus's alleles, shares and a small trace, the MOI, and
 * which loci drive it (MOI is the allele count of the second-richest locus
 * by default, so one locus with a spurious extra peak does not raise it).
 */
import { useMemo, useState } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import type { ProjectDetail, SampleLocusSummary } from '@/api/bindings'
import { TraceViewer, type TraceBin, type TracePeak } from '@/components/TraceViewer'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/cn'
import { countOf } from '@/lib/format'
import { useProjectSamples } from '@/features/projects-shared/queries'
import { AnalysisBadge, StaleFrame } from '@/features/projects-shared/StatusBits'
import { useLocusParams } from '@/features/projects-shared/queries'
import { fmtShare } from './model/calls'
import { callContext, classifyPeak, peaksInRange } from './model/peaks'
import { useSampleCalls, useSampleLocus } from './queries'
import { MoiLine } from './review/parts'

export interface SampleViewProps {
  detail: ProjectDetail
  sampleId: number | null
  onSelectSample: (id: number) => void
  onOpenReview: (locusId: number, sampleId: number) => void
}

/** Loci whose allele count reaches the MOI: the ones that make the sample polyclonal. */
export function lociDrivingMoi(loci: readonly SampleLocusSummary[], moi: number | null): Set<number> {
  const counts = loci.map((l) => ({ id: l.locus_id, n: l.row?.alleles.length ?? 0 }))
  const m = moi ?? [...counts].sort((a, b) => b.n - a.n)[1]?.n ?? 0
  return new Set(counts.filter((c) => m >= 2 && c.n >= m).map((c) => c.id))
}

export function SampleView({ detail, sampleId, onSelectSample, onOpenReview }: SampleViewProps) {
  const pid = detail.project.id
  const samples = useProjectSamples(pid)
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (samples.data ?? []).filter((s) => !t || s.barcode.toLowerCase().includes(t))
  }, [samples.data, q])
  const sel = sampleId ?? samples.data?.[0]?.sample_id ?? null
  const calls = useSampleCalls(pid, sel)
  const driving = useMemo(() => lociDrivingMoi(calls.data?.loci ?? [], calls.data?.moi ?? null), [calls.data])
  const firstLocus = detail.loci[0]?.locus_id ?? null
  const bootstrap = useLocusParams(pid, firstLocus).data?.params.genotyping?.bootstrap_probability_threshold

  return (
    <div className="flex min-h-0 flex-1" data-testid="sample-view">
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-line bg-surface">
        <label className="relative m-2 flex items-center">
          <Search size={13} className="pointer-events-none absolute left-2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a sample"
            aria-label="Find a sample"
            className="h-6 w-full rounded-[5px] border border-line pl-7 text-xs outline-none focus:border-accent"
          />
        </label>
        <ul role="listbox" aria-label="Samples" className="min-h-0 flex-1 overflow-auto pb-2">
          {list.map((s) => (
            <li
              key={s.sample_id}
              role="option"
              aria-selected={s.sample_id === sel}
              onClick={() => onSelectSample(s.sample_id)}
              data-sample={s.barcode}
              className={cn(
                'mx-1 flex cursor-default items-center gap-2 rounded px-2 py-1 text-xs',
                s.sample_id === sel ? 'bg-accent-soft font-semibold' : 'hover:bg-surface-3/60',
              )}
            >
              <span className="truncate">{s.barcode}</span>
              <span
                className="num ml-auto text-2xs whitespace-nowrap text-muted"
                title={`${s.moi != null ? `Model MOI ${s.moi}` : 'No MOI yet'}${s.max_alleles != null ? `; at most ${countOf(s.max_alleles, 'allele')} called at one locus` : ''}`}
              >
                {s.moi != null ? `MOI ${s.moi}` : ''}
                {s.max_alleles != null && s.max_alleles > (s.moi ?? 0) && (
                  <span className="text-warn">
                    {s.moi != null && ' · '}max {s.max_alleles}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!calls.data ? (
          <div className="grid flex-1 place-items-center text-muted">
            {calls.isLoading || samples.isLoading ? <Spinner /> : <EmptyState title="Select a sample" />}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line bg-surface px-3 py-2">
              <h2 className="text-[15px] font-semibold" data-testid="sample-view-barcode">
                {calls.data.barcode}
              </h2>
              {calls.data.designation !== 'sample' && (
                <span className="text-xs text-muted">{calls.data.designation.replace('_', ' ')}</span>
              )}
              <MoiLine
                className="text-sm"
                moi={calls.data.moi}
                maxAlleles={calls.data.max_alleles}
                maxLoci={calls.data.max_alleles_loci}
                bootstrapThreshold={bootstrap}
              />
              <span className="text-xs text-muted">
                {(calls.data.max_alleles ?? 0) > 1 ? (
                  <>
                    Mixture
                    {driving.size > 0 && (
                      <> · MOI set by {[...driving].map((id) => calls.data!.loci.find((l) => l.locus_id === id)?.locus_label).join(', ')}</>
                    )}
                  </>
                ) : calls.data.max_alleles === 1 ? (
                  'One allele at every typed locus'
                ) : (
                  'No alleles called'
                )}
              </span>
              {calls.data.probabilities && (
                <AnalysisBadge
                  status={calls.data.probabilities}
                  what="Probabilities and MOI"
                  label={`MOI ${calls.data.probabilities.state === 'current' ? 'current' : calls.data.probabilities.state.replace('_', ' ')}`}
                />
              )}
            </div>
            <div className="grid min-h-0 flex-1 auto-rows-[minmax(190px,1fr)] grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2 overflow-auto bg-bg p-2">
              {calls.data.loci.map((l) => (
                <LocusCard
                  key={l.locus_id}
                  pid={pid}
                  detail={detail}
                  sampleId={calls.data!.sample_id}
                  l={l}
                  drives={driving.has(l.locus_id)}
                  onOpen={() => onOpenReview(l.locus_id, calls.data!.sample_id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function LocusCard({
  pid,
  detail,
  sampleId,
  l,
  drives,
  onOpen,
}: {
  pid: number
  detail: ProjectDetail
  sampleId: number
  l: SampleLocusSummary
  drives: boolean
  onOpen: () => void
}) {
  const locus = detail.loci.find((x) => x.locus_id === l.locus_id)
  const view = useSampleLocus(pid, sampleId, l.locus_id)
  const params = useLocusParams(pid, l.locus_id).data?.params.genotyping ?? null
  const v = view.data && view.data.sample_id === sampleId && view.data.locus_id === l.locus_id ? view.data : undefined
  const range: [number, number] = [locus?.min_base_length ?? 0, locus?.max_base_length ?? 1]
  const peaks = useMemo<TracePeak[]>(() => {
    if (!v) return []
    const ctx = callContext(v.row, params)
    // Small multiples: called peaks and anything at least 3% of the tallest; noise maxima would only clutter.
    return peaksInRange(v.peaks, range)
      .map((p) => ({ p, state: classifyPeak(p, ctx) }))
      .filter(({ p, state }) => state === 'called' || state === 'manual-on' || state === 'manual-off' || p.relative_height >= 0.03)
      .map(({ p, state }) => ({ id: p.index, index: p.index, size: p.size, height: p.height, state, label: p.bin_label }))
  }, [v, params]) // eslint-disable-line react-hooks/exhaustive-deps
  const bins = useMemo<TraceBin[]>(
    () =>
      (v?.bins ?? []).map((b) => ({
        id: b.id,
        label: '',
        center: b.base_size,
        halfWidth: b.bin_buffer,
        highlighted: v!.row.alleles.some((a) => a.bin_id === b.id),
      })),
    [v],
  )
  const row = l.row
  return (
    <StaleFrame status={l.status} className={cn('rounded border bg-surface', drives ? 'border-accent' : 'border-line')}>
      <div className="flex items-center gap-2 border-b border-line px-2 py-1" data-locus={l.locus_label}>
        <span aria-hidden className="size-2 rounded-[2px]" style={{ background: `var(--dye-${l.color})` }} />
        <span className="text-xs font-semibold">{l.locus_label}</span>
        {l.status.state !== 'current' && <AnalysisBadge status={l.status} what={`${l.locus_label} calls`} />}
        {drives && (
          <span className="rounded bg-accent-soft px-1 text-2xs text-accent" title="This locus has at least MOI alleles">
            drives MOI
          </span>
        )}
        {row?.flags.manual_curation && <span className="text-2xs text-accent">curated</span>}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onOpen} title="Open in the review workspace">
          Review <ArrowRight size={11} />
        </Button>
      </div>
      <div
        className="flex flex-wrap items-center gap-1 px-2 py-1 text-xs"
        data-testid="sample-locus-alleles"
        data-alleles={row?.alleles.map((a) => a.label).join(';') ?? ''}
      >
        {!row ? (
          <span className="text-faint">no call</span>
        ) : row.reference_run_id == null ? (
          <span className="text-danger">no usable run</span>
        ) : row.flags.failure ? (
          <span className="text-danger">failed</span>
        ) : l.called.length === 0 ? (
          <span className="text-faint">no allele</span>
        ) : (
          l.called.map((c) => (
            <span
              key={c.bin_id}
              className="inline-flex h-[18px] items-center gap-1 rounded-[4px] border border-line-strong bg-surface-2 px-1 font-mono text-[11px]"
            >
              <b>{c.label}</b>
              <span className="text-muted">
                {fmtShare(shareOf(row, c.bin_id) ?? c.corrected_relative_quantification ?? c.relative_quantification)}
              </span>
            </span>
          ))
        )}
        {row && row.alleles.length > 0 && (
          <span className="ml-auto text-2xs text-muted">
            {row.alleles.length} {row.alleles.length === 1 ? 'allele' : 'alleles'}
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 px-1 pb-1">
        {v?.reference ? (
          <TraceViewer
            className="h-full min-h-[110px] w-full"
            series={[{ id: 'main', color: v.color, data: v.reference.trace, baseSizes: v.reference.base_sizes }]}
            peaks={peaks}
            bins={bins}
            locusRange={range}
            defaultXDomain={[range[0] - 2, range[1] + 2]}
            showControls={false}
            showLegend={false}
            ariaLabel={`${l.locus_label} trace`}
          />
        ) : (
          <div className="grid flex-1 place-items-center text-xs text-faint">{view.isLoading ? <Spinner /> : 'no trace'}</div>
        )}
      </div>
    </StaleFrame>
  )
}

/** The engine's share of an allele from the call row (bias-corrected when there is a correction). */
function shareOf(row: SampleLocusSummary['row'], binId: number): number | null {
  const a = row?.alleles.find((x) => x.bin_id === binId)
  return a ? (a.corrected_proportion ?? a.proportion ?? null) : null
}
