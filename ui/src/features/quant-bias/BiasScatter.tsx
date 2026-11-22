/* eslint-disable react-hooks/refs -- canvas plot: latest props live in a ref and are drawn from animation frames, outside render (as in components/ArtifactPlot). */
/**
 * Small canvas scatter plot shared by the bias plots: axes from the plot
 * kit, a background layer drawn by the caller (fit line, band, diagonal),
 * points in a few styles, hover readout and click selection. Arrow keys
 * step through the points in x order; Esc clears the selection.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { createFrameScheduler, prepareCanvas, useElementSize } from '@/plot/canvas'
import { clipTo, drawAxes, haloText, plotRect, type Margins, type Rect } from '@/plot/axes'
import type { Domain, Scale } from '@/plot/scale'
import { usePlotTheme, withAlpha, type PlotTheme } from '@/plot/theme'
import { hitPoint, pixelPoints, plotScales } from './model/plot'

export type PointStyle = 'used' | 'outlier' | 'excluded' | 'before' | 'after'

export interface ScatterDatum {
  key: string
  x: number | null
  y: number | null
  style: PointStyle
}

export interface UnderlayArgs {
  x: Scale
  y: Scale
  r: Rect
  t: PlotTheme
}

export interface BiasScatterProps {
  points: readonly ScatterDatum[]
  x: Domain
  y: Domain
  xLabel: string
  yLabel: string
  /** Draw under the points (in data space via the scales); clipped to the plot area. */
  underlay?: (ctx: CanvasRenderingContext2D, s: UnderlayArgs) => void
  /** Corner captions, e.g. what a quadrant means. */
  captions?: { text: string; corner: 'tl' | 'tr' | 'bl' | 'br' }[]
  /** Hover readout for a point. */
  tooltip: (key: string) => ReactNode
  selectedKey?: string | null
  onSelect?: (key: string | null) => void
  /** Keys to emphasize (e.g. the other peak of the hovered mixture). */
  linkedKeys?: ReadonlySet<string>
  onHover?: (key: string | null) => void
  ariaLabel: string
  className?: string
  testId?: string
  margins?: Margins
}

const MARGINS: Margins = { top: 10, right: 12, bottom: 34, left: 52 }

export function BiasScatter({
  points,
  x,
  y,
  xLabel,
  yLabel,
  underlay,
  captions,
  tooltip,
  selectedKey,
  onSelect,
  linkedKeys,
  onHover,
  ariaLabel,
  className,
  testId,
  margins = MARGINS,
}: BiasScatterProps) {
  const theme = usePlotTheme()
  const [boxRef, size] = useElementSize<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<string | null>(null)

  const r = useMemo(() => plotRect(size.width, size.height, margins), [size, margins])
  const scales = useMemo(() => plotScales(r, x, y), [r, x, y])
  const px = useMemo(() => pixelPoints(points, (p) => p.x, (p) => p.y, scales.x, scales.y), [points, scales])
  const order = useMemo(
    () =>
      points
        .map((p, i) => ({ p, i }))
        .filter(({ i }) => !Number.isNaN(px[i]!.px))
        .sort((a, b) => (a.p.x ?? 0) - (b.p.x ?? 0))
        .map(({ p }) => p.key),
    [points, px],
  )

  const latest = useRef({ points, px, scales, r, theme, underlay, captions, selectedKey, hover, linkedKeys, size, xLabel, yLabel })
  latest.current = { points, px, scales, r, theme, underlay, captions, selectedKey, hover, linkedKeys, size, xLabel, yLabel }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const L = latest.current
    if (!canvas || L.size.width === 0) return
    const ctx = prepareCanvas(canvas, L.size)
    if (!ctx) return
    const t = L.theme
    ctx.fillStyle = t.bg
    ctx.fillRect(0, 0, L.size.width, L.size.height)
    drawAxes(ctx, L.r, L.scales.x, L.scales.y, t, { xLabel: L.xLabel, yLabel: L.yLabel, yTicks: 6 })
    clipTo(ctx, L.r)
    L.underlay?.(ctx, { x: L.scales.x, y: L.scales.y, r: L.r, t })
    const color: Record<PointStyle, string> = { used: t.select, outlier: t.danger, excluded: t.muted, before: t.warn, after: t.select }
    // Excluded first (underneath), then used, then emphasized.
    const rank: Record<PointStyle, number> = { excluded: 0, before: 1, after: 2, used: 2, outlier: 3 }
    const idx = L.points.map((_, i) => i).sort((a, b) => rank[L.points[a]!.style] - rank[L.points[b]!.style])
    for (const i of idx) {
      const p = L.points[i]!
      const { px: cx, py: cy } = L.px[i]!
      if (Number.isNaN(cx)) continue
      const c = color[p.style]
      ctx.beginPath()
      if (p.style === 'excluded' || p.style === 'before') {
        ctx.arc(cx, cy, 3.6, 0, Math.PI * 2)
        ctx.lineWidth = 1.4
        ctx.strokeStyle = withAlpha(c, p.style === 'excluded' ? 0.85 : 0.9)
        ctx.stroke()
      } else {
        ctx.arc(cx, cy, p.style === 'outlier' ? 4.4 : 3.8, 0, Math.PI * 2)
        ctx.fillStyle = withAlpha(c, 0.85)
        ctx.fill()
      }
    }
    for (let i = 0; i < L.points.length; i++) {
      const p = L.points[i]!
      const { px: cx, py: cy } = L.px[i]!
      if (Number.isNaN(cx)) continue
      const sel = p.key === L.selectedKey
      const hov = p.key === L.hover
      const link = L.linkedKeys?.has(p.key)
      if (!sel && !hov && !link) continue
      ctx.beginPath()
      ctx.arc(cx, cy, sel ? 7.5 : 6.5, 0, Math.PI * 2)
      ctx.lineWidth = sel ? 2 : 1.5
      ctx.strokeStyle = sel ? t.fg : hov ? t.fg : withAlpha(t.fg, 0.45)
      ctx.stroke()
    }
    ctx.restore()
    ctx.font = t.font
    for (const c of L.captions ?? []) {
      const left = c.corner === 'tl' || c.corner === 'bl'
      const top = c.corner === 'tl' || c.corner === 'tr'
      ctx.textAlign = left ? 'left' : 'right'
      ctx.textBaseline = top ? 'top' : 'bottom'
      haloText(ctx, c.text, left ? L.r.x + 6 : L.r.x + L.r.w - 6, top ? L.r.y + 5 : L.r.y + L.r.h - 5, t.muted, t.bg)
    }
  }, [])
  const scheduler = useMemo(() => createFrameScheduler(draw), [draw])
  useEffect(() => () => scheduler.cancel(), [scheduler])
  useEffect(() => scheduler.request(), [scheduler, points, px, scales, theme, underlay, captions, selectedKey, hover, linkedKeys, size])

  const setH = (k: string | null) => {
    if (k === hover) return
    setHover(k)
    onHover?.(k)
  }
  const local = (e: { clientX: number; clientY: number }) => {
    const b = canvasRef.current?.getBoundingClientRect()
    return b ? { x: e.clientX - b.left, y: e.clientY - b.top } : { x: 0, y: 0 }
  }
  const tipKey = hover ?? null
  const ti = tipKey != null ? points.findIndex((p) => p.key === tipKey) : -1
  const tp = ti >= 0 ? px[ti] : undefined
  const flipX = tp ? tp.px > size.width - 240 : false
  const flipY = tp ? tp.py > size.height - 150 : false

  return (
    <div
      ref={boxRef}
      tabIndex={0}
      role="img"
      aria-label={ariaLabel}
      data-testid={testId}
      data-points={order.length}
      data-hover={hover ?? ''}
      data-selected={selectedKey ?? ''}
      className={cn('relative min-h-0 min-w-0 overflow-hidden rounded-sm bg-[var(--plot-bg)] outline-none focus-visible:ring-2 focus-visible:ring-accent/40', className)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault()
          if (!order.length) return
          const cur = order.indexOf(selectedKey ?? '')
          const n = cur < 0 ? (e.key === 'ArrowRight' ? 0 : order.length - 1) : Math.max(0, Math.min(order.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)))
          onSelect?.(order[n]!)
          setH(order[n]!)
        } else if (e.key === 'Escape') {
          onSelect?.(null)
          setH(null)
        }
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        onPointerMove={(e) => {
          const { x: mx, y: my } = local(e)
          const i = hitPoint(px, mx, my)
          setH(i >= 0 ? points[i]!.key : null)
          e.currentTarget.style.cursor = i >= 0 ? 'pointer' : 'crosshair'
        }}
        onPointerLeave={() => setH(null)}
        onClick={(e) => {
          const { x: mx, y: my } = local(e)
          const i = hitPoint(px, mx, my)
          onSelect?.(i >= 0 ? points[i]!.key : null)
        }}
      />
      {tp && tipKey && (
        <div
          role="tooltip"
          data-testid="plot-tooltip"
          className="pointer-events-none absolute z-10 w-56 rounded-md border border-line bg-surface/95 px-2 py-1.5 text-2xs shadow-lg"
          style={{
            left: flipX ? undefined : tp.px + 12,
            right: flipX ? size.width - tp.px + 12 : undefined,
            top: flipY ? undefined : tp.py + 10,
            bottom: flipY ? size.height - tp.py + 10 : undefined,
          }}
        >
          {tooltip(tipKey)}
        </div>
      )}
    </div>
  )
}
