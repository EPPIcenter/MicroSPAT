/* eslint-disable react-hooks/refs -- canvas plot: latest props live in a ref and are drawn from animation frames, outside render (as in components/ArtifactPlot). */
/**
 * β across loci: one row per locus with its 95% interval (from the SD and
 * the spread of size offsets), so a locus with a poor or wrong-signed fit
 * stands out, and a table with R², the mixtures and peaks behind each fit,
 * and its status. Click a locus to open it.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { ProjectDetail, ProjectLocus } from '@/api/bindings'
import { DataTable, type DataColumn } from '@/components/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/cn'
import { fmtFixed } from '@/lib/format'
import { createFrameScheduler, prepareCanvas, useElementSize } from '@/plot/canvas'
import { haloText } from '@/plot/axes'
import { linear, tickFormat } from '@/plot/scale'
import { usePlotTheme, withAlpha } from '@/plot/theme'
import { AnalysisBadge } from '@/features/projects-shared/StatusBits'
import { betaStandardError, fitIssues, fmtBeta, readBeta, type FitIssue } from './model/beta'
import { overviewDomain } from './model/plot'
import { useAllLocusQuantBias } from './queries'

interface Row {
  locus: ProjectLocus
  beta: number | null
  lo: number | null
  hi: number | null
  sd: number | null
  r2: number | null
  sets: number
  peaks: number
  issues: FitIssue[]
  loaded: boolean
}

const ROW_H = 26
const M = { top: 8, right: 16, bottom: 30, left: 92 }

export function OverviewTab({ detail, onOpenLocus }: { detail: ProjectDetail; onOpenLocus: (locusId: number) => void }) {
  const qs = useAllLocusQuantBias(
    detail.project.id,
    detail.loci.map((l) => l.locus_id),
  )
  const dataKey = qs.map((q) => q.dataUpdatedAt).join(',')
  const rows = useMemo<Row[]>(
    () =>
      detail.loci.map((locus, i) => {
        const d = qs[i]?.data
        const est = d?.estimate ?? null
        const se = d ? betaStandardError(est, d.points) : null
        return {
          locus,
          beta: est?.beta ?? null,
          lo: est && se != null ? est.beta - 1.96 * se : null,
          hi: est && se != null ? est.beta + 1.96 * se : null,
          sd: est?.sd ?? null,
          r2: est?.r_squared ?? null,
          sets: est?.n_sets ?? 0,
          peaks: est?.n_peaks ?? 0,
          issues: d && locus.status.state !== 'not_analyzed' ? fitIssues(est, se) : [],
          loaded: !!d,
        }
      }),
    // qs is a new array every render; dataKey says when any result changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detail.loci, dataKey],
  )
  const columns = useMemo<DataColumn<Row>[]>(
    () => [
      { id: 'locus', header: 'Locus', value: (r) => r.locus.label, cell: (r) => <span className="font-medium">{r.locus.label}</span>, width: 90 },
      { id: 'status', header: 'Status', value: (r) => r.locus.status.state, cell: (r) => <AnalysisBadge status={r.locus.status} what={`${r.locus.label} bias estimates`} />, width: 100, searchable: false },
      {
        id: 'beta',
        header: 'Beta /bp',
        value: (r) => r.beta,
        cell: (r) => <span className={cn('num', r.issues.some((i) => i.level === 'danger') && 'font-semibold text-danger')}>{fmtBeta(r.beta)}</span>,
        align: 'right',
        width: 80,
        searchable: false,
      },
      {
        id: 'ci',
        header: '95% interval',
        value: (r) => (r.lo == null ? null : r.hi! - r.lo),
        cell: (r) => (r.lo == null ? <span className="text-faint">–</span> : <span className="num">{fmtBeta(r.lo)} … {fmtBeta(r.hi)}</span>),
        align: 'right',
        width: 176,
        searchable: false,
      },
      { id: 'sd', header: 'SD', value: (r) => r.sd, cell: (r) => <span className="num">{fmtFixed(r.sd, 3)}</span>, align: 'right', width: 60, searchable: false, description: 'Residual SD of the log-ratio error (log-odds for two strains)' },
      {
        id: 'r2',
        header: 'R²',
        value: (r) => r.r2,
        cell: (r) => <span className={cn('num', r.r2 != null && r.r2 < 0.5 && 'text-warn')}>{fmtFixed(r.r2, 2)}</span>,
        align: 'right',
        width: 52,
        searchable: false,
      },
      { id: 'sets', header: 'Mixtures', value: (r) => r.sets, align: 'right', width: 72, searchable: false },
      { id: 'peaks', header: 'Peaks', value: (r) => r.peaks, align: 'right', width: 56, searchable: false },
      {
        id: 'reading',
        header: 'Shorter allele',
        description: 'How an allele with a true share of 50%, 10 bp shorter than its mixture’s center, appears at this β',
        value: (r) => (r.beta == null ? null : readBeta(r.beta).shortShare),
        cell: (r) => (r.beta == null ? <span className="text-faint">–</span> : <span className="num">{(readBeta(r.beta).shortShare * 100).toFixed(1)}%</span>),
        align: 'right',
        width: 110,
        searchable: false,
      },
      {
        id: 'issues',
        header: 'Check',
        value: (r) => r.issues.map((i) => i.tag).join(', '),
        cell: (r) =>
          r.issues.length ? (
            <span className={cn('truncate', r.issues.some((i) => i.level === 'danger') ? 'text-danger' : 'text-warn')} title={r.issues.map((i) => i.text).join('\n')}>
              {r.issues.map((i) => i.tag).join(' · ')}
            </span>
          ) : r.loaded && r.locus.status.state !== 'not_analyzed' ? (
            <span className="text-ok">ok</span>
          ) : null,
        width: 200,
      },
    ],
    [],
  )
  if (detail.loci.length === 0) return <EmptyState title="This project has no loci" />
  const loading = qs.some((q) => q.isPending)
  const bad = rows.filter((r) => r.issues.some((i) => i.level === 'danger'))
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="bias-overview">
      <div className="shrink-0 border-b border-line bg-surface px-3 py-2">
        <div className="flex items-center gap-3">
          <h2 className="text-2xs font-semibold tracking-wide text-muted uppercase">Bias (beta) per locus, with 95% interval</h2>
          {loading && <Spinner className="size-3" />}
          <span className="ml-auto text-2xs text-muted">Negative β: shorter alleles look larger. Click a locus to open it.</span>
        </div>
        {bad.length > 0 && (
          <p className="mt-1 text-xs text-danger" data-testid="overview-alert">
            Check {bad.map((r) => r.locus.label).join(', ')}: {bad[0]!.issues[0]!.text}
          </p>
        )}
        <ForestPlot rows={rows} onOpen={onOpenLocus} />
      </div>
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => String(r.locus.locus_id)}
        selectionMode="single"
        onRowActivate={(r) => onOpenLocus(r.locus.locus_id)}
        ariaLabel="β per locus"
        hideToolbar
      />
    </div>
  )
}

function ForestPlot({ rows, onOpen }: { rows: Row[]; onOpen: (id: number) => void }) {
  const theme = usePlotTheme()
  const [boxRef, size] = useElementSize<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const height = M.top + M.bottom + rows.length * ROW_H
  const domain = useMemo(() => overviewDomain(rows), [rows])
  const latest = useRef({ rows, size, theme, domain, hover })
  latest.current = { rows, size, theme, domain, hover }
  const scheduler = useMemo(
    () =>
      createFrameScheduler(() => {
        const c = canvasRef.current
        const L = latest.current
        if (!c || L.size.width === 0) return
        const ctx = prepareCanvas(c, L.size)
        if (!ctx) return
        const t = L.theme
        const r = { x: M.left, y: M.top, w: Math.max(1, L.size.width - M.left - M.right), h: L.rows.length * ROW_H }
        const x = linear(L.domain, [r.x, r.x + r.w])
        ctx.fillStyle = t.bg
        ctx.fillRect(0, 0, L.size.width, L.size.height)
        const ticks = x.ticks(Math.max(3, Math.floor(r.w / 90)))
        const f = tickFormat(ticks)
        ctx.font = t.font
        ctx.strokeStyle = t.grid
        ctx.lineWidth = 1
        ctx.beginPath()
        for (const v of ticks) {
          const px = Math.round(x(v)) + 0.5
          ctx.moveTo(px, r.y)
          ctx.lineTo(px, r.y + r.h)
        }
        ctx.stroke()
        ctx.fillStyle = t.text
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        for (const v of ticks) ctx.fillText(f(v).replace('-', '−'), x(v), r.y + r.h + 5)
        ctx.textAlign = 'right'
        ctx.fillStyle = t.muted
        ctx.fillText('β (per bp)', r.x + r.w, r.y + r.h + 17)
        // Zero: no bias.
        ctx.strokeStyle = t.axis
        ctx.beginPath()
        ctx.moveTo(Math.round(x(0)) + 0.5, r.y)
        ctx.lineTo(Math.round(x(0)) + 0.5, r.y + r.h)
        ctx.stroke()
        L.rows.forEach((row, i) => {
          const cy = r.y + i * ROW_H + ROW_H / 2
          if (L.hover === i) {
            ctx.fillStyle = withAlpha(t.select, 0.08)
            ctx.fillRect(0, cy - ROW_H / 2, L.size.width, ROW_H)
          }
          const danger = row.issues.some((s) => s.level === 'danger')
          const warn = row.issues.length > 0
          const stale = row.locus.status.state !== 'current'
          ctx.textAlign = 'right'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = danger ? t.danger : t.fg
          ctx.font = `${danger ? '600 ' : ''}${t.font}`
          ctx.fillText(`${stale ? '⚠ ' : ''}${row.locus.label}`, r.x - 10, cy)
          ctx.font = t.font
          if (row.beta == null) {
            ctx.textAlign = 'left'
            haloText(ctx, row.loaded ? (row.locus.status.state === 'not_analyzed' ? 'not analyzed' : 'no estimate') : '…', x(0) + 6, cy, t.muted, t.bg)
            return
          }
          const col = danger ? t.danger : warn ? t.warn : t.select
          if (row.lo != null && row.hi != null) {
            ctx.strokeStyle = col
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.moveTo(x(row.lo), cy)
            ctx.lineTo(x(row.hi), cy)
            ctx.moveTo(x(row.lo), cy - 4)
            ctx.lineTo(x(row.lo), cy + 4)
            ctx.moveTo(x(row.hi), cy - 4)
            ctx.lineTo(x(row.hi), cy + 4)
            ctx.stroke()
          }
          ctx.fillStyle = col
          ctx.beginPath()
          ctx.arc(x(row.beta), cy, 4.5, 0, Math.PI * 2)
          ctx.fill()
          if (stale) {
            ctx.strokeStyle = t.warn
            ctx.setLineDash([2, 2])
            ctx.beginPath()
            ctx.arc(x(row.beta), cy, 7.5, 0, Math.PI * 2)
            ctx.stroke()
            ctx.setLineDash([])
          }
          // Label right of the interval, or left of it when it would run off the plot.
          const label = `${fmtBeta(row.beta)}${row.r2 != null ? `  R² ${row.r2.toFixed(2)}` : ''}  n ${row.sets}`
          const right = x(row.hi ?? row.beta) + 9
          const fits = right + ctx.measureText(label).width < L.size.width - 4
          ctx.textAlign = fits ? 'left' : 'right'
          haloText(ctx, label, fits ? right : x(row.lo ?? row.beta) - 9, cy, t.text, t.bg)
        })
      }),
    [],
  )
  useEffect(() => () => scheduler.cancel(), [scheduler])
  useEffect(() => scheduler.request(), [scheduler, rows, size, theme, domain, hover])
  const rowAt = (e: MouseEvent) => {
    const b = canvasRef.current?.getBoundingClientRect()
    if (!b) return null
    const i = Math.floor((e.clientY - b.top - M.top) / ROW_H)
    return i >= 0 && i < rows.length ? i : null
  }
  return (
    <div ref={boxRef} className="relative mt-1" style={{ height }} data-testid="forest-plot" role="img" aria-label={rows.map((r) => `${r.locus.label} β ${fmtBeta(r.beta)}`).join('; ')}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full cursor-pointer"
        onPointerMove={(e) => setHover(rowAt(e))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const i = rowAt(e)
          if (i != null) onOpen(rows[i]!.locus.locus_id)
        }}
      />
    </div>
  )
}
