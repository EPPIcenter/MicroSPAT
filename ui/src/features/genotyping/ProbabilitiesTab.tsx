/**
 * The project-wide probabilistic pass: what it does, whether it is current,
 * running it (a background task), and its results (MOI per sample; peak
 * probabilities show up in review).
 */
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { api } from '@/api/client'
import type { ProbabilityResult, ProjectDetail } from '@/api/bindings'
import { Button } from '@/components/ui/Button'
import { NumberField } from '@/components/form/fields'
import { ProgressBar, Spinner } from '@/components/ui/ProgressBar'
import { countOf } from '@/lib/format'
import { toast } from '@/stores/toasts'
import { useProjectTask } from '@/features/projects-shared/queries'
import { lociNeedingAnalysis } from '@/features/projects-shared/status'
import { AnalysisBadge, StaleNotice } from '@/features/projects-shared/StatusBits'
import { useAnalyze } from '@/features/projects-shared/ProjectHeader'
import { useSummary } from './queries'
import { MoiChart } from './SummaryTab'

export function ProbabilitiesTab({ detail }: { detail: ProjectDetail }) {
  const p = detail.project
  const [offset, setOffset] = useState<number | null>(1)
  const [last, setLast] = useState<ProbabilityResult | null>(null)
  const task = useProjectTask('calculate_peak_probabilities', p.title)
  const summary = useSummary(p.id)
  const analyze = useAnalyze(p.id)
  const needs = lociNeedingAnalysis(detail.loci)
  const run = useMutation({
    mutationFn: () => api.calculate_peak_probabilities({ id: p.id, moi_offset: offset ?? 1 }),
    meta: { errorTitle: 'Could not calculate probabilities' },
    onSuccess: (r) => {
      setLast(r)
      toast.success('Peak probabilities calculated', `${countOf(r.samples, 'sample')}; ${countOf(r.manual_calls_kept, 'curated call')} kept as they were.`)
    },
  })
  const running = run.isPending || task?.status === 'running'
  const status = p.probabilities
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-bg" data-testid="probabilities-tab">
      <StaleNotice status={status} what="Peak probabilities and MOI" />
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <section className="rounded border border-line bg-surface p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Probabilistic annotation</h2>
            <AnalysisBadge status={status} what="Peak probabilities" />
          </div>
          <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted">
            Weighs every candidate peak against the whole project: it estimates how common each allele is (prevalence) and how many clones each sample
            carries (MOI), then gives each peak the probability that it is a true allele rather than stutter, weighing how far it stands above its
            expected artifact height against that prior, and re-calls alleles from those probabilities. It needs every locus analyzed and current, and must be re-run after any locus is re-analyzed. Calls you curated by hand keep
            their alleles; only their probabilities are updated.
          </p>
          {needs.length > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded border border-warn/30 bg-warn-soft px-2.5 py-1.5 text-xs" role="status">
              <span className="flex-1">
                {needs.map((l) => l.label).join(', ')} {needs.length === 1 ? 'is' : 'are'} not current. Analyze {needs.length === 1 ? 'it' : 'them'} first.
              </span>
              <Button size="sm" variant="primary" disabled={analyze.isPending} onClick={() => analyze.mutate({ only_stale: true })}>
                {analyze.isPending && <Spinner className="size-3" />} Analyze {needs.length === 1 ? 'it' : 'them'}
              </Button>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <NumberField
              label="MOI offset"
              help="MOI is the allele count of the locus ranked 1 + offset from the top. 1 (the default) uses the second-richest locus, so a single locus with a spurious extra peak does not raise MOI; 0 uses the richest."
              value={offset}
              onChange={setOffset}
              min={0}
              step={1}
              disabled={running}
            />
            <Button variant="primary" disabled={running || needs.length > 0} onClick={() => run.mutate()} data-testid="run-probabilities">
              {running ? <Spinner className="size-3" /> : <Play size={12} />}
              {status?.state === 'current' ? 'Recalculate' : 'Calculate probabilities'}
            </Button>
            {running && (
              <div className="flex w-56 flex-col gap-0.5" aria-live="polite">
                <span className="truncate text-2xs text-muted">{task?.message ?? 'Working…'}</span>
                <ProgressBar value={task?.status === 'running' ? task.progress : null} label="Probabilities progress" />
              </div>
            )}
          </div>
          {status?.state === 'stale' && status.reasons.length > 0 && <p className="mt-2 text-xs text-warn">Out of date: {status.reasons.join('; ')}</p>}
        </section>
        {last && (
          <section className="rounded border border-line bg-surface p-4 text-xs" data-testid="probability-result">
            <h3 className="text-sm font-semibold">Last run</h3>
            <p className="mt-1 text-muted">
              {countOf(last.samples, 'sample')} annotated; {countOf(last.manual_calls_kept, 'curated call')} kept as curated.
            </p>
          </section>
        )}
        <section className="rounded border border-line bg-surface p-4">
          <h3 className="text-sm font-semibold">MOI per sample</h3>
          <p className="mt-0.5 text-xs text-muted">
            {summary.data?.moi_source === 'probabilistic'
              ? 'From the probabilistic pass.'
              : 'Probabilities are not current, so this is estimated from allele counts (second-highest count across loci).'}
            {summary.data?.mean_moi != null && <> Mean MOI {summary.data.mean_moi.toFixed(2)}.</>}
          </p>
          {summary.data ? <MoiChart moi={summary.data.moi} /> : <Spinner />}
        </section>
      </div>
    </div>
  )
}
