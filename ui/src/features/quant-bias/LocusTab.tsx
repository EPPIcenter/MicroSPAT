/**
 * Per-locus workspace of a quantification-bias estimator: β with its SD, R²
 * and support, what β means in shares, the regression plot (each control
 * peak's size offset from its mixture's center against its log-ratio error,
 * with the fit through the origin and ± SD), observed and
 * corrected shares against the truth, and every control peak with the
 * reason it was left out. Parameters slide in from the right (P).
 */
import { shortcutBlocked } from '@/lib/keys'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Play, SlidersHorizontal } from 'lucide-react'
import type { BiasEstimate, LocusQuantBias, ProjectDetail, ProjectLocus } from '@/api/bindings'
import { DataTable, type DataColumn } from '@/components/DataTable'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Kbd } from '@/components/ui/Kbd'
import { Spinner } from '@/components/ui/ProgressBar'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'
import { countOf, fmtFixed } from '@/lib/format'
import { withAlpha } from '@/plot/theme'
import { LocusStatusList } from '@/features/projects-shared/LocusStatusList'
import { ParamsPanel } from '@/features/projects-shared/ParamsPanel'
import { useAnalyze } from '@/features/projects-shared/ProjectHeader'
import { useLocusParams, useProjectTask } from '@/features/projects-shared/queries'
import { StaleFrame, StaleNotice } from '@/features/projects-shared/StatusBits'
import { BiasScatter, type ScatterDatum, type UnderlayArgs } from './BiasScatter'
import { betaStandardError, fitIssues, fmtBeta, pct1, readBeta, type FitIssue } from './model/beta'
import { buildPointRows, correctionAccuracy, missingText, OUTLIER_Z, type PointRow } from './model/points'
import { fitGeometry, regressionDomains } from './model/plot'
import { useAllLocusQuantBias, useLocusQuantBias } from './queries'

export interface LocusTabProps {
  detail: ProjectDetail
  locusId: number | null
  onSelectLocus: (id: number, replace?: boolean) => void
  onOpenMixtures: () => void
  active: boolean
}

export function LocusTab({ detail, locusId, onSelectLocus, onOpenMixtures, active }: LocusTabProps) {
  const pid = detail.project.id
  const locus = detail.loci.find((l) => l.locus_id === locusId) ?? detail.loci[0] ?? null
  const lid = locus?.locus_id ?? null
  useEffect(() => {
    if (active && locus && locusId !== locus.locus_id) onSelectLocus(locus.locus_id, true)
  }, [active, locus, locusId, onSelectLocus])

  const all = useAllLocusQuantBias(
    pid,
    detail.loci.map((l) => l.locus_id),
  )
  const betaOf = new Map(all.map((q) => [q.data?.locus_id, q.data?.estimate ?? null]))
  const [showParams, setShowParams] = useState(false)

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (shortcutBlocked(e) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        setShowParams((v) => !v)
      } else if (e.key === '[' || e.key === ']') {
        const ids = detail.loci.map((l) => l.locus_id)
        const i = ids.indexOf(lid ?? -1)
        const n = ids[i + (e.key === ']' ? 1 : -1)]
        if (n != null) onSelectLocus(n)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, detail.loci, lid, onSelectLocus])

  if (!locus) return <EmptyState title="This project has no loci">Its locus set is empty.</EmptyState>
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
        <LocusStatusList
          detail={detail}
          selected={lid}
          onSelect={(l) => onSelectLocus(l)}
          variant="strip"
          className="min-w-0 flex-1"
          trailing={(l) => <BetaChip est={betaOf.get(l.locus_id)} loading={!all.find((q) => q.data?.locus_id === l.locus_id)} />}
        />
        <Button
          size="sm"
          variant={showParams ? 'secondary' : 'ghost'}
          onClick={() => setShowParams((v) => !v)}
          title="Parameters (P)"
          aria-pressed={showParams}
          data-testid="toggle-params"
        >
          <SlidersHorizontal size={12} /> Parameters
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <LocusResults key={locus.locus_id} detail={detail} locus={locus} onOpenMixtures={onOpenMixtures} />
        {showParams && (
          <aside className="flex w-[320px] shrink-0 flex-col border-l border-line">
            <ParamsPanel detail={detail} locusId={locus.locus_id} onClose={() => setShowParams(false)} />
          </aside>
        )}
      </div>
    </div>
  )
}

function BetaChip({ est, loading }: { est: BiasEstimate | null | undefined; loading: boolean }) {
  if (loading) return null
  if (!est) return <span className="num text-2xs text-faint">no β</span>
  const bad = fitIssues(est).some((i) => i.level === 'danger')
  return <span className={cn('num text-2xs', bad ? 'font-semibold text-danger' : 'text-muted')}>{fmtBeta(est.beta)}</span>
}

function LocusResults({ detail, locus, onOpenMixtures }: { detail: ProjectDetail; locus: ProjectLocus; onOpenMixtures: () => void }) {
  const pid = detail.project.id
  const lid = locus.locus_id
  const q = useLocusQuantBias(pid, lid)
  const data = q.data && q.data.locus_id === lid ? q.data : undefined
  const paramsView = useLocusParams(pid, lid)
  // The parameters the stored fit used (the engine evaluates `used` and
  // `exclusion` with them); the current ones only for results stored before
  // those were recorded.
  const params = data?.params ?? paramsView.data?.params.quant_bias ?? null
  const [selected, setSelected] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const analyze = useAnalyze(pid)
  const task = useProjectTask('analyze_project', detail.project.title)
  const running = analyze.isPending || task?.status === 'running'

  const points = useMemo(() => data?.points ?? [], [data])
  const est = data?.estimate ?? null
  const rows = useMemo(() => buildPointRows(points, params, { beta: est?.beta, sd: est?.sd }), [points, params, est])
  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows])
  const se = useMemo(() => betaStandardError(est, points), [est, points])
  const issues = useMemo(() => fitIssues(est, se), [est, se])
  const acc = useMemo(() => correctionAccuracy(points), [points])
  const focusKey = hover ?? selected
  const linked = useMemo(() => {
    const r = focusKey ? byKey.get(focusKey) : undefined
    return new Set(r ? rows.filter((x) => x.point.sample_id === r.point.sample_id && x.key !== r.key).map((x) => x.key) : [])
  }, [focusKey, byKey, rows])

  const reanalyze = (
    <Button
      size="sm"
      variant="primary"
      disabled={running}
      onClick={() => analyze.mutate({ locus_ids: [lid] })}
      data-testid="reanalyze-locus"
    >
      {running ? <Spinner className="size-3" /> : <Play size={11} />} {locus.status.state === 'not_analyzed' ? 'Analyze' : 'Re-analyze'}{' '}
      {locus.label}
    </Button>
  )

  if (detail.project.sample_count === 0)
    return (
      <EmptyState
        title="No control mixtures yet"
        action={
          <Button size="sm" variant="primary" onClick={onOpenMixtures}>
            Assign control mixtures
          </Button>
        }
      >
        β is measured from samples that mix known strains in known proportions. Assign those mixtures first, then analyze.
      </EmptyState>
    )

  return (
    <StaleFrame status={locus.status} className="min-w-0">
      <StaleNotice status={locus.status} what={`${locus.label} bias estimates`} action={reanalyze} />
      {q.isError && !data ? (
        <EmptyState title="Could not load the estimate">{(q.error as Error).message}</EmptyState>
      ) : !data ? (
        <div className="grid flex-1 place-items-center text-muted">
          <Spinner />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col" data-testid="locus-bias" data-locus={locus.label} data-beta={est?.beta ?? ''}>
          <Summary locus={locus} data={data} est={est} se={se} issues={issues} points={rows} />
          <div className="grid min-h-0 flex-[3] grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-px border-b border-line bg-line">
            <section className="flex min-h-0 flex-col bg-surface" aria-label="Regression">
              <PlotHeader title="Log-ratio error by size offset">
                <Legend
                  items={[
                    ['used', 'used in the fit'],
                    ['outlier', `|residual| > ${OUTLIER_Z} SD`],
                    ['excluded', 'left out'],
                  ]}
                />
              </PlotHeader>
              <RegressionPlot
                rows={rows}
                est={est}
                selected={selected}
                onSelect={setSelected}
                onHover={setHover}
                linked={linked}
                byKey={byKey}
              />
            </section>
            <section className="flex min-h-0 flex-col bg-surface" aria-label="Correction check">
              <PlotHeader title="Does the correction work?">
                <Legend
                  items={[
                    ['before', 'observed'],
                    ['after', 'corrected'],
                  ]}
                />
                {acc && (
                  <span
                    className="num text-2xs text-muted"
                    data-testid="correction-accuracy"
                    title={`Mean absolute difference from the true share over ${acc.n} control peaks`}
                  >
                    error {pct1(acc.before)} → <b className={acc.after <= acc.before ? 'text-ok' : 'text-danger'}>{pct1(acc.after)}</b>
                  </span>
                )}
              </PlotHeader>
              <CorrectionPlot rows={rows} selected={selected} onSelect={setSelected} linked={linked} byKey={byKey} />
            </section>
          </div>
          <PointsTable rows={rows} selected={selected} onSelect={setSelected} />
        </div>
      )}
    </StaleFrame>
  )
}

function Summary({
  locus,
  data,
  est,
  se,
  issues,
  points,
}: {
  locus: ProjectLocus
  data: LocusQuantBias
  est: BiasEstimate | null
  se: number | null
  issues: FitIssue[]
  points: PointRow[]
}) {
  const reading = est ? readBeta(est.beta) : null
  const excluded = points.filter((r) => r.excluded).length
  return (
    <div className="shrink-0 border-b border-line bg-surface px-3 py-2" data-testid="beta-summary">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-sm">
          <span className="text-muted">{locus.label}</span>{' '}
          <Tooltip
            content={
              <div className="max-w-xs space-y-1">
                <p>
                  β is how much an allele's observed share drifts from its true share per bp of size above its mixture's center. For two
                  strains:
                </p>
                <p className="font-mono">logit(observed) = logit(true) + β·(size − center)</p>
                <p>
                  For any number of strains, 2·(clr(observed) − clr(true)) = β·(size − center), where clr is a share's log minus the mean
                  log share of the mixture's peaks.
                </p>
                <p>
                  Negative β: shorter alleles look larger than they are, as PCR favours short fragments. Genotyping projects that link this
                  estimator invert it.
                </p>
              </div>
            }
          >
            <span tabIndex={0} className="font-semibold outline-none" data-testid="beta-value">
              β = <span className="num">{fmtBeta(est?.beta)}</span>
            </span>
          </Tooltip>
          <span className="text-xs text-muted"> /bp{se != null && <span className="num"> ± {fmtFixed(1.96 * se, 4)} (95%)</span>}</span>
        </span>
        <Stat label="SD" value={fmtFixed(est?.sd, 3)} title="Root mean squared residual of the fit, in units of the log-ratio error" />
        <Stat label="R²" value={fmtFixed(est?.r_squared, 2)} title="Share of the variation in log-ratio error explained by size" />
        <Stat label="mixtures" value={est ? String(est.n_sets) : '0'} title="Control mixtures whose peaks entered the fit" />
        <Stat label="peaks" value={est ? String(est.n_peaks) : '0'} title="Control peaks in the fit" />
        {excluded > 0 && <Stat label="left out" value={String(excluded)} title="Control peaks not in the fit; the table says why" />}
      </div>
      {data.params_recomputed && (
        <p className="mt-1 text-xs text-warn" data-testid="stale-mix-note">
          This β was estimated before MicroSPAT recorded the parameters of a fit, so which peaks are marked used or left out below follows
          the current parameters and may not match it. Re-analyze {locus.label} to bring them together.
        </p>
      )}
      <MixtureNotes data={data} locus={locus} />
      {reading && (
        <p className="mt-1 text-xs" data-testid="beta-sentence">
          {reading.sentence} <span className="text-muted">{reading.longer}</span>
        </p>
      )}
      {issues.length > 0 && (
        <ul className="mt-1 space-y-0.5" data-testid="fit-issues">
          {issues.map((i) => (
            <li key={i.tag} className={cn('text-xs', i.level === 'danger' ? 'font-medium text-danger' : 'text-warn')}>
              {i.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The control mixtures that contributed nothing at this locus, grouped by why. */
function MixtureNotes({ data, locus }: { data: LocusQuantBias; locus: ProjectLocus }) {
  const mixtures = data.mixtures ?? []
  const left = mixtures.filter((m) => !m.used)
  if (!mixtures.length || !left.length) return null
  const names = (ms: typeof left) =>
    ms.length <= 3
      ? ms.map((m) => m.barcode).join(', ')
      : `${ms
          .slice(0, 3)
          .map((m) => m.barcode)
          .join(', ')} and ${ms.length - 3} more`
  const noRun = left.filter((m) => m.reference_run_id == null)
  const missing = left.filter((m) => m.reference_run_id != null && m.components.some((c) => c.missing))
  const byPeaks = left.filter((m) => m.reference_run_id != null && !m.components.some((c) => c.missing))
  const parts: ReactNode[] = []
  if (noRun.length)
    parts.push(
      <span key="run" title={noRun.map((m) => m.barcode).join('\n')}>
        {names(noRun)}: no usable run at {locus.label}
      </span>,
    )
  for (const m of missing)
    parts.push(
      <span key={m.sample_id} data-barcode={m.barcode}>
        {m.barcode} (
        {m.components
          .filter((c) => c.missing)
          .map((c) => `${c.control_label}: ${missingText(c.missing!)}`)
          .join('; ')}
        )
      </span>,
    )
  if (byPeaks.length)
    parts.push(
      <span key="peaks" title={byPeaks.map((m) => m.barcode).join('\n')}>
        {countOf(byPeaks.length, 'mixture')} whose control peaks fall outside the limits ({names(byPeaks)}; the In fit column says why)
      </span>,
    )
  return (
    <div className="mt-1 text-xs text-muted" data-testid="mixture-notes">
      <span className="font-medium text-fg">
        {mixtures.length - left.length} of {countOf(mixtures.length, 'mixture')}
      </span>{' '}
      entered the fit. Left out:{' '}
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          {p}
        </span>
      ))}
      .
    </div>
  )
}

function Stat({ label, value, title }: { label: string; value: string; title: string }) {
  return (
    <span className="text-xs" title={title}>
      <span className="num font-medium">{value}</span> <span className="text-muted">{label}</span>
    </span>
  )
}

function PlotHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-7 shrink-0 items-center gap-3 px-3">
      <h3 className="truncate text-2xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
      <div className="ml-auto flex items-center gap-3">{children}</div>
    </div>
  )
}

const DOT: Record<string, string> = {
  used: 'size-2 rounded-full bg-[var(--plot-select)]',
  outlier: 'size-2.5 rounded-full bg-danger',
  excluded: 'size-2 rounded-full border-[1.5px] border-muted',
  before: 'size-2 rounded-full border-[1.5px] border-warn',
  after: 'size-2 rounded-full bg-[var(--plot-select)]',
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <span className="flex items-center gap-2.5 text-2xs text-muted">
      {items.map(([k, label]) => (
        <span key={k} className="flex items-center gap-1">
          <span className={DOT[k]} aria-hidden />
          {label}
        </span>
      ))}
    </span>
  )
}

function PointTip({ r }: { r: PointRow | undefined }) {
  if (!r) return null
  const p = r.point
  return (
    <div className="space-y-0.5">
      <div className="font-semibold">{p.barcode}</div>
      <div>
        allele <b>{r.allele ?? '?'}</b> · {p.size.toFixed(2)} bp ({p.centered_size >= 0 ? '+' : '−'}
        {Math.abs(p.centered_size).toFixed(1)} bp from center)
      </div>
      <div className="num">
        true {pct1(p.true_proportion)} · observed {pct1(p.observed_proportion)}
        {p.corrected_proportion != null && <> · corrected {pct1(p.corrected_proportion)}</>}
      </div>
      {p.log_odds_error != null && (
        <div className="num">
          log-ratio error {p.log_odds_error.toFixed(3)}
          {r.z != null && <> · residual {r.z.toFixed(1)} SD</>}
        </div>
      )}
      {r.height != null && <div className="num">height {Math.round(r.height).toLocaleString('en-US')} RFU</div>}
      <div className={r.excluded ? 'text-warn' : 'text-ok'}>{r.excluded ? r.excluded.text : 'Used in the fit.'}</div>
    </div>
  )
}

interface PlotProps {
  rows: PointRow[]
  selected: string | null
  onSelect: (k: string | null) => void
  onHover?: (k: string | null) => void
  linked: ReadonlySet<string>
  byKey: Map<string, PointRow>
}

function RegressionPlot({ rows, est, selected, onSelect, onHover, linked, byKey }: PlotProps & { est: BiasEstimate | null }) {
  const doms = useMemo(
    () =>
      regressionDomains(
        rows.map((r) => r.point),
        est?.beta ?? null,
        est?.sd ?? null,
      ),
    [rows, est],
  )
  const pts = useMemo<ScatterDatum[]>(
    () =>
      rows.map((r) => ({
        key: r.key,
        x: r.point.centered_size,
        y: r.point.log_odds_error,
        style: r.excluded ? 'excluded' : r.z != null && Math.abs(r.z) > OUTLIER_Z ? 'outlier' : 'used',
      })),
    [rows],
  )
  const underlay = useCallback(
    (ctx: CanvasRenderingContext2D, { x, y, r, t }: UnderlayArgs) => {
      ctx.strokeStyle = t.axis
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(Math.round(x(0)) + 0.5, r.y)
      ctx.lineTo(Math.round(x(0)) + 0.5, r.y + r.h)
      ctx.moveTo(r.x, Math.round(y(0)) + 0.5)
      ctx.lineTo(r.x + r.w, Math.round(y(0)) + 0.5)
      ctx.stroke()
      if (!est) return
      const g = fitGeometry(est.beta, est.sd, doms.x)
      ctx.fillStyle = withAlpha(t.select, t.dark ? 0.2 : 0.13)
      ctx.beginPath()
      g.band.forEach(([bx, by], i) => (i ? ctx.lineTo(x(bx), y(by)) : ctx.moveTo(x(bx), y(by))))
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = t.fg
      ctx.lineWidth = 1.75
      ctx.beginPath()
      ctx.moveTo(x(g.line[0][0]), y(g.line[0][1]))
      ctx.lineTo(x(g.line[1][0]), y(g.line[1][1]))
      ctx.stroke()
    },
    [est, doms.x],
  )
  const captions = useMemo(
    () => [
      { text: 'shorter · looks larger', corner: 'tl' as const },
      { text: 'longer · looks smaller', corner: 'br' as const },
    ],
    [],
  )
  return (
    <BiasScatter
      points={pts}
      x={doms.x}
      y={doms.y}
      xLabel="size − mixture center (bp)"
      yLabel="2·(clr(observed) − clr(true))"
      underlay={underlay}
      captions={captions}
      tooltip={(k) => <PointTip r={byKey.get(k)} />}
      selectedKey={selected}
      onSelect={onSelect}
      onHover={onHover}
      linkedKeys={linked}
      ariaLabel={est ? `Regression of log-ratio error on size offset; β ${fmtBeta(est.beta)}` : 'Control peaks; no fit'}
      testId="bias-plot"
      className="m-1 mt-0 flex-1"
    />
  )
}

const PCT: readonly [number, number] = [0, 100]

/** y range of the error plot in percentage points: symmetric, at least ±2. */
function errorDomain(rows: PointRow[]): readonly [number, number] {
  let m = 2
  for (const r of rows) {
    const c = r.point.corrected_proportion
    if (c == null) continue
    m = Math.max(m, 100 * Math.abs(r.point.observed_proportion - r.point.true_proportion), 100 * Math.abs(c - r.point.true_proportion))
  }
  return [-m * 1.2, m * 1.2]
}

/**
 * Whether the correction works: each control peak's share minus its true
 * share, observed (hollow) and corrected with β (filled), against the true
 * share. Corrected points should sit on the zero line.
 */
function CorrectionPlot({ rows, selected, onSelect, linked, byKey }: PlotProps) {
  const pts = useMemo<ScatterDatum[]>(() => {
    const out: ScatterDatum[] = []
    for (const r of rows) {
      const c = r.point.corrected_proportion
      if (c == null) continue
      const t = r.point.true_proportion
      out.push({ key: `${r.key}|b`, x: 100 * t, y: 100 * (r.point.observed_proportion - t), style: 'before' })
      out.push({ key: `${r.key}|a`, x: 100 * t, y: 100 * (c - t), style: 'after' })
    }
    return out
  }, [rows])
  const yDom = useMemo(() => errorDomain(rows), [rows])
  const linkedHere = useMemo(() => new Set([...linked].flatMap((k) => [`${k}|a`, `${k}|b`])), [linked])
  const underlay = useCallback(
    (ctx: CanvasRenderingContext2D, { x, y, r, t }: UnderlayArgs) => {
      ctx.strokeStyle = t.fg
      ctx.lineWidth = 1.25
      ctx.beginPath()
      ctx.moveTo(r.x, Math.round(y(0)) + 0.5)
      ctx.lineTo(r.x + r.w, Math.round(y(0)) + 0.5)
      ctx.stroke()
      ctx.strokeStyle = withAlpha(t.muted, 0.55)
      ctx.lineWidth = 1
      ctx.beginPath()
      for (const row of rows) {
        const c = row.point.corrected_proportion
        if (c == null) continue
        const tt = row.point.true_proportion
        ctx.moveTo(x(100 * tt), y(100 * (row.point.observed_proportion - tt)))
        ctx.lineTo(x(100 * tt), y(100 * (c - tt)))
      }
      ctx.stroke()
    },
    [rows],
  )
  const captions = useMemo(
    () => [
      { text: 'share looks larger than it is', corner: 'tl' as const },
      { text: 'looks smaller', corner: 'bl' as const },
    ],
    [],
  )
  return (
    <BiasScatter
      points={pts}
      x={PCT}
      y={yDom}
      xLabel="true share (%)"
      yLabel="share − true (points)"
      underlay={underlay}
      captions={captions}
      tooltip={(k) => <PointTip r={byKey.get(k.split('|')[0]!)} />}
      selectedKey={selected ? `${selected}|a` : null}
      onSelect={(k) => onSelect(k ? k.split('|')[0]! : null)}
      linkedKeys={linkedHere}
      ariaLabel="Share error before and after correction, against the true share"
      testId="correction-plot"
      className="m-1 mt-0 flex-1"
      margins={{ top: 10, right: 10, bottom: 34, left: 46 }}
    />
  )
}

function PointsTable({ rows, selected, onSelect }: { rows: PointRow[]; selected: string | null; onSelect: (k: string | null) => void }) {
  const columns = useMemo<DataColumn<PointRow>[]>(
    () => [
      { id: 'sample', header: 'Mixture', value: (r) => r.point.barcode, width: 170 },
      { id: 'allele', header: 'Allele', value: (r) => r.allele ?? '', width: 62 },
      {
        id: 'size',
        header: 'Size',
        value: (r) => r.point.size,
        cell: (r) => <span className="num">{r.point.size.toFixed(2)}</span>,
        align: 'right',
        width: 68,
        searchable: false,
      },
      {
        id: 'offset',
        header: 'Offset',
        description: "Size minus the mixture's center (mean size of its control peaks), bp",
        value: (r) => r.point.centered_size,
        cell: (r) => <span className="num">{r.point.centered_size.toFixed(1)}</span>,
        align: 'right',
        width: 62,
        searchable: false,
      },
      {
        id: 'true',
        header: 'True',
        value: (r) => r.point.true_proportion,
        cell: (r) => <span className="num">{pct1(r.point.true_proportion)}</span>,
        align: 'right',
        width: 60,
        searchable: false,
      },
      {
        id: 'obs',
        header: 'Observed',
        value: (r) => r.point.observed_proportion,
        cell: (r) => <span className="num">{pct1(r.point.observed_proportion)}</span>,
        align: 'right',
        width: 74,
        searchable: false,
      },
      {
        id: 'corr',
        header: 'Corrected',
        description: 'Share after correction with β',
        value: (r) => r.point.corrected_proportion,
        cell: (r) => <span className="num">{r.point.corrected_proportion != null ? pct1(r.point.corrected_proportion) : '–'}</span>,
        align: 'right',
        width: 88,
        searchable: false,
      },
      {
        id: 'err',
        header: 'Log-ratio err',
        description: '2·(clr(observed) − clr(true)), the fit’s y; for a two-strain mixture, logit(observed) − logit(true)',
        value: (r) => r.point.log_odds_error,
        cell: (r) => <span className="num">{fmtFixed(r.point.log_odds_error, 3)}</span>,
        align: 'right',
        width: 104,
        searchable: false,
      },
      {
        id: 'z',
        header: 'Resid.',
        description: 'Residual from the fit in SDs (used peaks)',
        value: (r) => (r.z == null ? null : Math.abs(r.z)),
        cell: (r) =>
          r.z == null ? (
            <span className="text-faint">–</span>
          ) : (
            <span className={cn('num', Math.abs(r.z) > OUTLIER_Z && 'font-semibold text-danger')}>{r.z.toFixed(1)}</span>
          ),
        align: 'right',
        width: 58,
        searchable: false,
      },
      {
        id: 'status',
        header: 'In fit',
        value: (r) => (r.excluded ? r.excluded.label : 'used'),
        cell: (r) =>
          r.excluded ? (
            <span className="truncate text-warn" title={r.excluded.text}>
              {r.excluded.label}
            </span>
          ) : (
            <span className="text-ok">used</span>
          ),
        minWidth: 160,
        width: 220,
      },
    ],
    [],
  )
  return (
    <section className="flex min-h-0 flex-[2] flex-col bg-surface" aria-label="Control peaks" data-testid="points-table">
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.key}
        selectionMode="single"
        selected={selected ? [selected] : []}
        onSelectionChange={(ids) => onSelect(ids[0] ?? null)}
        ariaLabel="Control peaks"
        filterPlaceholder="Filter peaks…"
        initialSort={[{ id: 'sample', desc: false }]}
        rowHeight={24}
        toolbar={
          <span className="text-2xs text-faint">
            Hover the plot to read a peak; <Kbd>←</Kbd>/<Kbd>→</Kbd> step through it; <Kbd>[</Kbd>/<Kbd>]</Kbd> change locus
          </span>
        }
        emptyMessage="No control peaks at this locus. Check that the mixtures' samples have runs here and their controls have an allele at this locus."
      />
    </section>
  )
}
