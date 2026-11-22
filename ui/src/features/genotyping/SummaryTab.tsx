/**
 * Project summary: allele prevalence per locus (bars with counts), two
 * distributions side by side (the model MOI, and the most alleles called at
 * any locus), failure rates, curated calls and review progress. Prevalence
 * is the share of typed samples carrying an allele; mixed samples carry
 * several, so a locus's prevalences add up to more than 100%.
 */
import { fmtShare } from '@/lib/format'
import { useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { CallRow, LocusSummary, MoiCount, ProjectDetail } from '@/api/bindings'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/form/fields'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/cn'
import { AnalysisBadge, StaleFrame, StaleNotice } from '@/features/projects-shared/StatusBits'
import { useAllLocusCalls, useSummary } from './queries'
import { ReviewProgressBar } from './review/parts'

const pct = fmtShare

/** Bars of how many samples have each MOI (or any count: pass `axis` and `noun`). */
export function MoiChart({
  moi,
  axis = 'MOI',
  testId = 'moi-chart',
  yMax,
  tone = 'accent',
}: {
  moi: readonly MoiCount[]
  axis?: string
  testId?: string
  yMax?: number
  tone?: 'accent' | 'muted'
}) {
  const max = Math.max(1, yMax ?? 0, ...moi.map((m) => m.samples))
  const total = moi.reduce((s, m) => s + m.samples, 0)
  if (!moi.length) return <p className="mt-2 text-xs text-faint">No MOI yet.</p>
  return (
    <div
      className="mt-3 flex h-36 items-end gap-2"
      role="img"
      aria-label={`${axis} distribution: ${moi.map((m) => `${axis} ${m.moi}: ${m.samples}`).join(', ')}`}
      data-testid={testId}
    >
      {moi.map((m) => (
        <div
          key={m.moi}
          className="flex h-full w-12 flex-col items-center justify-end gap-1"
          title={`${axis} ${m.moi}: ${m.samples} samples (${pct(m.samples / Math.max(1, total))})`}
        >
          <span className="num text-2xs text-muted">{m.samples}</span>
          <div
            className={cn('w-6 rounded-t-[4px]', tone === 'accent' ? 'bg-accent' : 'bg-fg/45')}
            style={{ height: `${(m.samples / max) * 100}%`, minHeight: m.samples ? 2 : 0 }}
          />
          <span className="num border-t border-line pt-0.5 text-xs">{m.moi}</span>
        </div>
      ))}
      <span className="mb-0.5 self-end text-2xs text-faint">{axis}</span>
    </div>
  )
}

/** Per true sample, the most alleles called at any one locus (calls with a reference run), as a distribution. */
export function maxAllelesDistribution(locusRows: readonly (readonly CallRow[])[]): MoiCount[] {
  const best = new Map<number, number>()
  for (const rows of locusRows)
    for (const r of rows) {
      if (r.designation !== 'sample' || r.reference_run_id == null) continue
      best.set(r.sample_id, Math.max(best.get(r.sample_id) ?? 0, r.alleles.length))
    }
  const counts = new Map<number, number>()
  for (const n of best.values()) counts.set(n, (counts.get(n) ?? 0) + 1)
  return [...counts].sort((a, b) => a[0] - b[0]).map(([moi, samples]) => ({ moi, samples }))
}

export function SummaryTab({ detail, onOpenLocus }: { detail: ProjectDetail; onOpenLocus: (locusId: number) => void }) {
  const p = detail.project
  const summary = useSummary(p.id)
  const calls = useAllLocusCalls(
    p.id,
    detail.loci.map((l) => l.locus_id),
  )
  const [showAll, setShowAll] = useState(false)
  const curated = useMemo(() => {
    const m = new Map<number, number>()
    calls.forEach((c, i) => {
      const id = detail.loci[i]?.locus_id
      if (id != null && c.data) m.set(id, c.data.rows.filter((r) => r.flags.manual_curation).length)
    })
    return m
  }, [calls, detail.loci])
  const totalCurated = [...curated.values()].reduce((a, b) => a + b, 0)
  const allLoaded = calls.length > 0 && calls.every((c) => c.data)
  const maxAlleles = useMemo(() => (allLoaded ? maxAllelesDistribution(calls.map((c) => c.data!.rows)) : []), [calls, allLoaded])
  if (summary.isLoading)
    return (
      <div className="grid flex-1 place-items-center">
        <Spinner />
      </div>
    )
  if (!summary.data) return <EmptyState title="Could not load the summary" />
  const s = summary.data
  const review = s.loci.reduce((a, l) => ({ calls: a.calls + (l.calls ?? 0), reviewed: a.reviewed + (l.reviewed ?? 0) }), {
    calls: 0,
    reviewed: 0,
  })
  const above = maxAlleles.length && s.moi.length ? meanOf(maxAlleles) - (s.mean_moi ?? meanOf(s.moi)) : 0
  const yMax = Math.max(0, ...s.moi.map((m) => m.samples), ...maxAlleles.map((m) => m.samples))
  // Same x categories in both charts, so they compare bar for bar.
  const xs = [...new Set([...s.moi.map((m) => m.moi), ...maxAlleles.map((m) => m.moi)])].sort((a, b) => a - b)
  const pad = (d: readonly MoiCount[]) => (d.length ? xs.map((x) => ({ moi: x, samples: d.find((m) => m.moi === x)?.samples ?? 0 })) : [])
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-bg" data-testid="summary-tab">
      <StaleNotice status={s.probabilities} what="Probabilities and MOI" />
      <div className="flex flex-col gap-3 p-3">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
          <Stat label="Samples" value={s.samples} hint="True samples (controls left out)" />
          <Stat
            label="Mean MOI"
            value={s.mean_moi != null ? s.mean_moi.toFixed(2) : '–'}
            hint={s.moi_source === 'probabilistic' ? 'From the probabilistic pass' : 'From allele counts; probabilities not current'}
          />
          <Stat
            label="Polyclonal"
            value={pct(
              s.moi.filter((m) => m.moi >= 2).reduce((a, m) => a + m.samples, 0) /
                Math.max(
                  1,
                  s.moi.reduce((a, m) => a + m.samples, 0),
                ),
            )}
            hint="Samples with MOI ≥ 2"
          />
          <Stat
            label="Curated calls"
            value={calls.some((c) => c.isLoading) ? '…' : totalCurated}
            hint="Sample × locus calls edited by hand"
          />
          <Stat
            label="Reviewed"
            value={review.calls ? pct(review.reviewed / review.calls) : '–'}
            hint={`${review.reviewed.toLocaleString('en-US')} of ${review.calls.toLocaleString('en-US')} calls (controls included)`}
            testId="summary-reviewed"
          />
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-3">
          <section className="rounded border border-line bg-surface p-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">MOI (model)</h3>
              <AnalysisBadge status={s.probabilities} what="MOI" />
            </div>
            <p className="mt-0.5 text-2xs text-muted">
              Counts only alleles at or above the bootstrap probability, at the locus with the second-most such alleles (by default).
            </p>
            <MoiChart moi={pad(s.moi)} yMax={yMax} />
          </section>
          <section className="rounded border border-line bg-surface p-3">
            <h3 className="text-sm font-semibold">Most alleles called at any locus</h3>
            <p className="mt-0.5 text-2xs text-muted">
              Every called allele, whatever its probability, at the sample’s richest locus.
              {above > 0.05 && ` On average ${above.toFixed(2)} above the model MOI.`}
            </p>
            {allLoaded ? (
              <MoiChart moi={pad(maxAlleles)} axis="alleles" testId="max-alleles-chart" yMax={yMax} tone="muted" />
            ) : (
              <Spinner className="mt-3" />
            )}
          </section>
        </div>
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Allele prevalence by locus</h3>
          <p className="text-xs text-muted">
            Share of typed samples carrying each allele. A mixed infection carries several alleles, so a locus’s prevalences add up to more
            than 100%.
          </p>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
            <Checkbox checked={showAll} onChange={setShowAll} aria-label="Show bins never called" /> Show bins never called
          </label>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3">
          {s.loci.map((l) => (
            <LocusPrevalence
              key={l.locus_id}
              l={l}
              curated={curated.get(l.locus_id)}
              showAll={showAll}
              onOpen={() => onOpenLocus(l.locus_id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function meanOf(d: readonly MoiCount[]): number {
  const n = d.reduce((a, m) => a + m.samples, 0)
  return n ? d.reduce((a, m) => a + m.moi * m.samples, 0) / n : 0
}

function Stat({ label, value, hint, testId }: { label: string; value: React.ReactNode; hint: string; testId?: string }) {
  return (
    <div className="rounded border border-line bg-surface px-3 py-2" title={hint} data-testid={testId}>
      <div className="text-2xs tracking-wide text-muted uppercase">{label}</div>
      <div className="num text-xl font-semibold">{value}</div>
      <div className="text-2xs text-faint">{hint}</div>
    </div>
  )
}

function LocusPrevalence({
  l,
  curated,
  showAll,
  onOpen,
}: {
  l: LocusSummary
  curated: number | undefined
  showAll: boolean
  onOpen: () => void
}) {
  const alleles = showAll ? l.alleles : l.alleles.filter((a) => a.count > 0)
  const sum = l.alleles.reduce((a, x) => a + x.prevalence, 0)
  // Bars on a fixed 0–25/50/75/100% scale, so short bars mean rare alleles, not just "shorter than the commonest".
  const max = Math.min(1, Math.ceil(Math.max(0.01, ...alleles.map((a) => Math.max(a.prevalence, a.estimated_prevalence ?? 0))) * 4) / 4)
  return (
    <StaleFrame status={l.status} className="rounded border border-line bg-surface">
      <section className="flex flex-col gap-2 p-3" data-testid="locus-prevalence" data-locus={l.locus_label}>
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold">{l.locus_label}</h4>
          {l.status.state !== 'current' && <AnalysisBadge status={l.status} what={`${l.locus_label} calls`} />}
          {l.calls != null && l.calls > 0 && <ReviewProgressBar p={{ calls: l.calls, reviewed: l.reviewed ?? 0 }} className="ml-2" />}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onOpen}>
            Review <ArrowRight size={11} />
          </Button>
        </div>
        <p className="text-2xs text-muted">
          {l.typed} of {l.samples} typed · failure rate{' '}
          <b className={cn(l.failure_rate > 0.1 ? 'text-warn' : 'text-fg')}>{pct(l.failure_rate)}</b> ({l.failed} failed, {l.no_run} no run)
          {curated != null && <> · {curated} curated</>} · prevalences sum to {pct(sum)}
        </p>
        <div className="flex flex-col gap-[3px]" role="list" aria-label={`${l.locus_label} allele prevalence`}>
          {alleles.map((a) => (
            <div
              key={a.bin_id}
              role="listitem"
              className="group flex items-center gap-2 text-xs"
              title={`Allele ${a.label} (${a.base_size.toFixed(1)} bp): ${a.count} of ${l.typed} typed samples, ${pct(a.prevalence)}${a.estimated_prevalence != null ? `; model estimate ${pct(a.estimated_prevalence)}` : ''}`}
            >
              <span className="w-9 shrink-0 text-right font-mono">{a.label}</span>
              <div className="relative h-3.5 flex-1">
                <div
                  className="absolute inset-y-0 left-0 rounded-r-[4px] bg-accent group-hover:opacity-80"
                  style={{ width: `${(a.prevalence / max) * 100}%`, minWidth: a.count ? 2 : 0 }}
                />
                {a.estimated_prevalence != null && (
                  <div
                    className="absolute inset-y-[-2px] w-0.5 bg-fg/70"
                    style={{ left: `${(a.estimated_prevalence / max) * 100}%` }}
                    aria-hidden
                  />
                )}
              </div>
              <span className="num w-20 shrink-0 text-right text-muted">
                {a.count} · {pct(a.prevalence)}
              </span>
            </div>
          ))}
          {alleles.length === 0 && <p className="text-xs text-faint">No allele called yet.</p>}
        </div>
        <p className="text-2xs text-faint">
          Bar scale 0–{pct(max)}.
          {l.alleles.some((a) => a.estimated_prevalence != null) && ' Tick: prevalence estimated by the probabilistic model.'}
        </p>
      </section>
    </StaleFrame>
  )
}
