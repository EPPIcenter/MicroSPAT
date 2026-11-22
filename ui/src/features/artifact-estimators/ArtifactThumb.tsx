/**
 * A small, static artifact plot for lists and small multiples: the class's
 * points, each segment's fit with its ±1 SD band, breakpoints, and the zero
 * line. Axes are left out; `xDomain` and `yMax` let a row of thumbnails
 * share scales so they can be compared at a glance.
 */
import { useEffect, useMemo, useRef } from 'react'
import type { ArtifactEstimatorView } from '@/api/bindings'
import { cn } from '@/lib/cn'
import { prepareCanvas, useElementSize } from '@/plot/canvas'
import { linear, type Domain } from '@/plot/scale'
import { resolveColor, usePlotTheme, withAlpha } from '@/plot/theme'

export interface ArtifactThumbProps {
  estimator: Pick<ArtifactEstimatorView, 'points' | 'equations'>
  color?: string
  xDomain?: Domain
  yMax?: number
  /** Draw the frame in the warning color. */
  warn?: boolean
  className?: string
}

/** A y top that fits most points and every ±1 SD band (outliers are clipped). */
export function thumbYMax(e: Pick<ArtifactEstimatorView, 'points' | 'equations'>): number {
  const ys = e.points.map((p) => p.relative_height).sort((a, b) => a - b)
  const q = ys.length ? ys[Math.min(ys.length - 1, Math.floor(ys.length * 0.98))]! : 0
  let m = Math.max(0.02, q * 1.15)
  for (const eq of e.equations)
    for (const x of [eq.segment.start_size, eq.segment.end_size]) m = Math.max(m, (eq.fit.slope * x + eq.fit.intercept + eq.fit.sd) * 1.05)
  return m
}

export function ArtifactThumb({ estimator, color = 'blue', xDomain, yMax, warn, className }: ArtifactThumbProps) {
  const theme = usePlotTheme()
  const [ref, size] = useElementSize<HTMLDivElement>()
  const canvas = useRef<HTMLCanvasElement>(null)
  const dom = useMemo<Domain>(() => {
    if (xDomain) return xDomain
    let lo = Infinity
    let hi = -Infinity
    for (const p of estimator.points) {
      lo = Math.min(lo, p.parent_size)
      hi = Math.max(hi, p.parent_size)
    }
    for (const q of estimator.equations) {
      lo = Math.min(lo, q.segment.start_size)
      hi = Math.max(hi, q.segment.end_size)
    }
    return Number.isFinite(lo) ? [lo, hi + 1e-9] : [0, 1]
  }, [estimator, xDomain])
  const top = yMax ?? thumbYMax(estimator)

  useEffect(() => {
    const c = canvas.current
    if (!c || size.width === 0) return
    const ctx = prepareCanvas(c, size)
    if (!ctx) return
    const t = theme
    const pad = 3
    const x = linear(dom, [pad, size.width - pad])
    const y = linear([-top * 0.04, top], [size.height - pad, pad])
    ctx.fillStyle = t.bg
    ctx.fillRect(0, 0, size.width, size.height)
    ctx.strokeStyle = t.grid
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, Math.round(y(0)) + 0.5)
    ctx.lineTo(size.width, Math.round(y(0)) + 0.5)
    ctx.stroke()
    for (const q of estimator.equations) {
      const a = x(q.segment.start_size)
      const b = x(q.segment.end_size)
      const f = (v: number) => q.fit.slope * v + q.fit.intercept
      ctx.fillStyle = withAlpha(t.select, t.dark ? 0.22 : 0.15)
      ctx.beginPath()
      ctx.moveTo(a, y(f(q.segment.start_size) + q.fit.sd))
      ctx.lineTo(b, y(f(q.segment.end_size) + q.fit.sd))
      ctx.lineTo(b, y(f(q.segment.end_size) - q.fit.sd))
      ctx.lineTo(a, y(f(q.segment.start_size) - q.fit.sd))
      ctx.closePath()
      ctx.fill()
    }
    const pc = resolveColor(t, color)
    ctx.fillStyle = withAlpha(pc, 0.55)
    const r = estimator.points.length > 300 ? 1 : 1.4
    for (const p of estimator.points) {
      const py = Math.max(pad, y(p.relative_height))
      ctx.fillRect(x(p.parent_size) - r, py - r, 2 * r, 2 * r)
    }
    ctx.strokeStyle = t.fg
    ctx.lineWidth = 1.25
    estimator.equations.forEach((q, i) => {
      const f = (v: number) => q.fit.slope * v + q.fit.intercept
      ctx.beginPath()
      ctx.moveTo(x(q.segment.start_size), y(f(q.segment.start_size)))
      ctx.lineTo(x(q.segment.end_size), y(f(q.segment.end_size)))
      ctx.stroke()
      if (i > 0) {
        ctx.strokeStyle = t.warn
        ctx.setLineDash([3, 2])
        ctx.beginPath()
        const bx = Math.round(x(q.segment.start_size)) + 0.5
        ctx.moveTo(bx, 0)
        ctx.lineTo(bx, size.height)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.strokeStyle = t.fg
      }
    })
  }, [estimator, size, theme, color, dom, top])

  return (
    <div ref={ref} className={cn('relative overflow-hidden rounded-[4px] border bg-[var(--plot-bg)]', warn ? 'border-warn/60' : 'border-line', className)} aria-hidden>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
    </div>
  )
}
