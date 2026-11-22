/**
 * Every class of every locus as small multiples, one row per locus, so a bad
 * fit (noisy, sparse, below zero, worse than flat) stands out on one screen.
 * Thumbnails of a row share the locus's size range and height scale. A tile
 * opens that class in the Classes tab.
 */
import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { ProjectDetail } from '@/api/bindings'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/cn'
import { countOf } from '@/lib/format'
import { AnalysisBadge } from '@/features/projects-shared/StatusBits'
import { ArtifactThumb, thumbYMax } from './ArtifactThumb'
import { className, sortClasses } from './model/classes'
import { fitWarnings } from './model/expected'
import { useAllLocusArtifacts } from './queries'

export function OverviewTab({ detail, onOpen }: { detail: ProjectDetail; onOpen: (locusId: number, classId: number) => void }) {
  const ids = useMemo(() => detail.loci.map((l) => l.locus_id), [detail.loci])
  const results = useAllLocusArtifacts(detail.project.id, ids)
  if (!detail.loci.length) return <EmptyState title="This project has no loci" />
  let flagged = 0
  let total = 0
  for (const r of results)
    for (const e of r.data?.estimators ?? []) {
      total++
      if (e.equations.some((q) => fitWarnings(q).length)) flagged++
    }
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-bg" data-testid="artifact-overview">
      <p className="sticky top-0 z-[1] border-b border-line bg-surface px-3 py-1.5 text-xs text-muted">
        {countOf(total, 'class', 'classes')} at {countOf(detail.loci.length, 'locus', 'loci')}
        {flagged > 0 && <span className="text-warn"> · {flagged} worth a look (amber)</span>}. Each tile: artifact height relative to the
        parent against parent size, the fit with ±1 SD. Tiles of a locus share scales. Click one to open it.
      </p>
      <div className="flex flex-col gap-px">
        {detail.loci.map((l, i) => {
          const r = results[i]
          const ests = r?.data ? sortClasses(r.data.estimators, l.nucleotide_repeat_length) : []
          const yMax = Math.max(0.02, ...ests.filter((e) => e.artifact_distance != null).map((e) => thumbYMax(e)))
          return (
            <section key={l.locus_id} className="flex gap-3 bg-surface px-3 py-2" data-locus={l.label}>
              <div className="w-32 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-[2px]" style={{ background: `var(--dye-${l.color})` }} />
                  <span className="text-[13px] font-semibold">{l.label}</span>
                </div>
                <p className="num text-2xs text-faint">
                  {l.min_base_length}–{l.max_base_length} bp · {l.nucleotide_repeat_length} bp repeat
                </p>
                {r?.data?.mono_allelic_runs != null && (
                  <p className="text-2xs text-muted">{countOf(r.data.mono_allelic_runs, 'single-clone run')}</p>
                )}
                <AnalysisBadge status={r?.data?.status ?? l.status} what={`${l.label} artifact classes`} className="mt-1" />
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                {r?.isLoading && <Spinner />}
                {r?.data && ests.length === 0 && (
                  <p className="self-center text-xs text-muted">
                    {l.status.state === 'not_analyzed' ? 'Not analyzed.' : 'No classes: genotyping expects no stutter here.'}
                  </p>
                )}
                {ests.map((e) => {
                  const n = className(e.artifact_distance, l.nucleotide_repeat_length)
                  const warnings = e.equations.flatMap(fitWarnings)
                  const sd = e.equations.length ? Math.max(...e.equations.map((q) => q.fit.sd)) : 0
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onOpen(l.locus_id, e.id)}
                      className={cn(
                        'flex w-[168px] flex-col gap-1 rounded-[5px] border p-1.5 text-left outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent/40',
                        warnings.length ? 'border-warn/50 bg-warn-soft/40' : 'border-line',
                      )}
                      title={warnings.map((w) => w.text).join(' ') || undefined}
                      data-testid="overview-tile"
                      data-class={n.label}
                    >
                      <ArtifactThumb
                        estimator={e}
                        color={l.color}
                        xDomain={[l.min_base_length, l.max_base_length]}
                        yMax={n.global ? undefined : yMax}
                        className="h-16 w-full"
                      />
                      <span className="flex items-center gap-1 text-xs font-medium">
                        <span className="truncate">{n.label}</span>
                        {warnings.length > 0 && <AlertTriangle size={11} className="shrink-0 text-warn" aria-label="worth a look" />}
                      </span>
                      <span className="num text-2xs text-muted">
                        n {e.points.length} · {countOf(e.equations.length, 'segment')} · SD ≤ {(sd * 100).toFixed(1)} %
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
