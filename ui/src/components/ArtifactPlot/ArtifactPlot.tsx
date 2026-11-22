/**
 * ArtifactPlot: artifact relative height vs main-peak size for one distance
 * class (e.g. −1 repeat stutter), with the fitted segments, ±SD bands and
 * breakpoints between segments.
 *
 * Double-click empty space adds a breakpoint; double-click a breakpoint (or
 * select it and press Delete) removes it; right-click for a menu. Wheel zooms,
 * drag pans, 0 resets. A click on a segment reports it (`onSegmentClick`), and
 * `selectedSegment` draws that segment's band stronger. `markers` draw a
 * labeled point (e.g. the expected artifact at an example parent size).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { createFrameScheduler, prepareCanvas, useElementSize } from '@/plot/canvas'
import { clipTo, drawAxes, haloText, inRect, plotRect, type Margins } from '@/plot/axes'
import { linear, panDomain, pixelsToData, type Domain } from '@/plot/scale'
import { resolveColor, usePlotTheme, withAlpha } from '@/plot/theme'
import { useXView } from '@/plot/useXView'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/Menu'
import type { ScatterPoint } from '@/components/BinPlot'
import { addBreakpoint, hitBreakpoint, removeBreakpoint, segmentY, type ArtifactSegment } from './model'

export interface ArtifactPlotProps {
  /** x = main peak size (bp), y = artifact height relative to the main peak. */
  points: readonly ScatterPoint[]
  segments: readonly ArtifactSegment[]
  breakpoints: readonly number[]
  onBreakpointsChange?: (bps: number[], change: { type: 'add' | 'remove'; x: number }) => void
  /** Shown top-left, e.g. "−4 bp (−1 repeat)". */
  title?: string
  color?: string
  /** Fixed y top; default fits points and bands. */
  yMax?: number
  readOnly?: boolean
  /** Index into `segments` drawn emphasized. */
  selectedSegment?: number | null
  /** Click (not drag) inside the plot over a segment. */
  onSegmentClick?: (index: number) => void
  /** Labeled points, e.g. an example prediction; `y` omitted = vertical line only. */
  markers?: readonly { x: number; y?: number; label?: string }[]
  className?: string
}

const MARGINS: Margins = { top: 12, right: 12, bottom: 34, left: 48 }

export function ArtifactPlot({
  points,
  segments,
  breakpoints,
  onBreakpointsChange,
  title,
  color = 'blue',
  yMax,
  readOnly,
  selectedSegment = null,
  onSegmentClick,
  markers,
  className,
}: ArtifactPlotProps) {
  const theme = usePlotTheme()
  const [boxRef, size] = useElementSize<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selectedRaw, setSelected] = useState<number | null>(null)
  // A removed breakpoint can leave the index dangling.
  const selected = selectedRaw != null && selectedRaw < breakpoints.length ? selectedRaw : null
  const hover = useRef<{ x: number; bp: number } | null>(null)
  const drag = useRef<{ startX: number; startDomain: Domain; moved: boolean } | null>(null)
  const [menu, setMenu] = useState<{ x: number; bp: number | null }>({ x: 0, bp: null })

  const bounds = useMemo<Domain>(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const p of points) {
      lo = Math.min(lo, p.x)
      hi = Math.max(hi, p.x)
    }
    for (const s of segments) {
      lo = Math.min(lo, s.start)
      hi = Math.max(hi, s.end)
    }
    if (!Number.isFinite(lo)) return [0, 500]
    const pad = Math.max(2, (hi - lo) * 0.04)
    return [lo - pad, hi + pad]
  }, [points, segments])
  const yTop = useMemo(() => {
    if (yMax) return yMax
    let m = 0.05
    for (const p of points) m = Math.max(m, p.y)
    for (const s of segments) m = Math.max(m, segmentY(s, s.start) + 2 * s.sd, segmentY(s, s.end) + 2 * s.sd)
    return m * 1.1
  }, [points, segments, yMax])

  const rect = useCallback(() => plotRect(size.width, size.height, MARGINS), [size])
  const latest = useRef({ points, segments, breakpoints, selected, theme, color, yTop, size, title, selectedSegment, markers })
  latest.current = { points, segments, breakpoints, selected, theme, color, yTop, size, title, selectedSegment, markers }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const L = latest.current
    if (!canvas || L.size.width === 0) return
    const ctx = prepareCanvas(canvas, L.size)
    if (!ctx) return
    const t = L.theme
    const r = plotRect(L.size.width, L.size.height, MARGINS)
    const x = linear(view.domain.current, [r.x, r.x + r.w])
    const y = linear([-L.yTop * 0.03, L.yTop], [r.y + r.h, r.y])
    ctx.fillStyle = t.bg
    ctx.fillRect(0, 0, L.size.width, L.size.height)
    drawAxes(ctx, r, x, y, t, { xLabel: 'main peak size (bp)', yLabel: 'artifact rel. height', yTicks: 5 })
    boxRef.current?.setAttribute('data-x-domain', view.domain.current.map((v) => v.toFixed(3)).join(','))
    clipTo(ctx, r)

    const lineColor = t.fg
    // ±1 SD and ±2 SD bands, then the fit.
    L.segments.forEach((s, si) => {
      const a = x(s.start)
      const b = x(s.end)
      const emph = L.selectedSegment === si && L.segments.length > 1 ? 1.7 : 1
      for (const [k, alpha] of [
        [2, 0.07],
        [1, 0.13],
      ] as const) {
        ctx.fillStyle = withAlpha(t.select, (t.dark ? alpha * 1.5 : alpha) * emph)
        ctx.beginPath()
        ctx.moveTo(a, y(segmentY(s, s.start) + k * s.sd))
        ctx.lineTo(b, y(segmentY(s, s.end) + k * s.sd))
        ctx.lineTo(b, y(segmentY(s, s.end) - k * s.sd))
        ctx.lineTo(a, y(segmentY(s, s.start) - k * s.sd))
        ctx.closePath()
        ctx.fill()
      }
    })

    const pc = resolveColor(t, L.color)
    ctx.fillStyle = withAlpha(pc, 0.6)
    ctx.beginPath()
    for (const p of L.points) {
      const px = x(p.x)
      if (px < r.x - 3 || px > r.x + r.w + 3) continue
      const py = y(p.y)
      ctx.moveTo(px + 2.4, py)
      ctx.arc(px, py, 2.4, 0, Math.PI * 2)
    }
    ctx.fill()

    ctx.strokeStyle = lineColor
    L.segments.forEach((s, si) => {
      ctx.lineWidth = L.selectedSegment === si && L.segments.length > 1 ? 2.5 : 1.75
      ctx.beginPath()
      ctx.moveTo(x(s.start), y(segmentY(s, s.start)))
      ctx.lineTo(x(s.end), y(segmentY(s, s.end)))
      ctx.stroke()
    })

    for (const m of L.markers ?? []) {
      const mx = Math.round(x(m.x)) + 0.5
      if (mx < r.x || mx > r.x + r.w) continue
      ctx.strokeStyle = withAlpha(t.ok, 0.8)
      ctx.lineWidth = 1
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(mx, r.y)
      ctx.lineTo(mx, r.y + r.h)
      ctx.stroke()
      ctx.setLineDash([])
      if (m.y != null) {
        ctx.fillStyle = t.ok
        ctx.beginPath()
        ctx.arc(mx, y(m.y), 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = t.bg
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
      if (m.label) {
        ctx.font = t.font
        ctx.textAlign = 'left'
        ctx.textBaseline = 'bottom'
        haloText(ctx, m.label, mx + 6, r.y + r.h - 4, t.ok, t.bg)
      }
    }

    // Breakpoints.
    ctx.font = t.font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    L.breakpoints.forEach((bp, i) => {
      const px = Math.round(x(bp)) + 0.5
      const isSel = i === L.selected
      const isHover = hover.current && Math.abs(hover.current.bp - bp) < 1e-9
      ctx.strokeStyle = isSel ? t.select : isHover ? t.fg : t.warn
      ctx.lineWidth = isSel ? 2 : 1.5
      ctx.setLineDash(isSel ? [] : [5, 3])
      ctx.beginPath()
      ctx.moveTo(px, r.y)
      ctx.lineTo(px, r.y + r.h)
      ctx.stroke()
      ctx.setLineDash([])
      haloText(ctx, bp.toFixed(1), px, r.y + 4, isSel ? t.select : t.warn, t.bg)
    })
    ctx.restore()

    if (L.title) {
      ctx.font = `600 ${t.font}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      haloText(ctx, L.title, r.x + 8, r.y + 6, t.fg, t.bg)
    }
    // Equation readout for the segment under the cursor.
    const h = hover.current
    if (h) {
      const s = L.segments.find((sg) => h.x >= sg.start && h.x <= sg.end)
      if (s) {
        ctx.font = t.monoFont
        ctx.textAlign = 'right'
        ctx.textBaseline = 'top'
        haloText(
          ctx,
          `y = ${s.slope.toExponential(2)}·x ${s.intercept >= 0 ? '+' : '−'} ${Math.abs(s.intercept).toFixed(3)}   sd ${s.sd.toFixed(3)}`,
          r.x + r.w - 8,
          r.y + 6,
          t.text,
          t.bg,
        )
      }
    }
  }, [boxRef])

  const scheduler = useMemo(() => createFrameScheduler(draw), [draw])
  useEffect(() => () => scheduler.cancel(), [scheduler])
  const view = useXView({ bounds, initial: bounds, minSpan: 2, onChange: scheduler.request, target: canvasRef, getRect: rect })
  useEffect(() => scheduler.request(), [scheduler, points, segments, breakpoints, selected, theme, color, yTop, size, title, selectedSegment, markers])

  const xScale = () => linear(view.domain.current, [rect().x, rect().x + rect().w])
  const local = (e: { clientX: number; clientY: number }) => {
    const b = canvasRef.current?.getBoundingClientRect()
    return b ? { x: e.clientX - b.left, y: e.clientY - b.top } : { x: 0, y: 0 }
  }
  const hitAt = (px: number) => hitBreakpoint(breakpoints.map((b) => xScale()(b)), px)

  const add = (bp: number) => {
    if (readOnly) return
    const next = addBreakpoint(breakpoints, bp)
    if (next.length !== breakpoints.length) onBreakpointsChange?.(next, { type: 'add', x: next.find((v) => !breakpoints.includes(v)) ?? bp })
  }
  const remove = (bp: number) => {
    if (readOnly) return
    onBreakpointsChange?.(removeBreakpoint(breakpoints, bp), { type: 'remove', x: bp })
    setSelected(null)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={readOnly}>
        <div
          ref={boxRef}
          tabIndex={0}
          role="application"
          aria-label="Artifact equation plot"
          className={cn('relative min-h-0 min-w-0 overflow-hidden rounded-sm bg-[var(--plot-bg)] outline-none focus-visible:ring-2 focus-visible:ring-accent/40', className)}
          onKeyDown={(e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selected != null) {
              const bp = breakpoints[selected]
              if (bp != null) {
                e.preventDefault()
                remove(bp)
              }
            } else if (e.key === 'Escape') setSelected(null)
            else if (e.key === '0') view.reset()
          }}
          data-testid="artifact-plot"
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full touch-none"
            onPointerDown={(e) => {
              const { x, y } = local(e)
              if (e.button === 2) {
                const i = hitAt(x)
                setMenu({ x: xScale().invert(x), bp: i >= 0 ? (breakpoints[i] ?? null) : null })
                return
              }
              if (e.button !== 0 || !inRect(rect(), x, y)) return
              const i = hitAt(x)
              if (i >= 0) {
                setSelected(i)
                return
              }
              e.currentTarget.setPointerCapture(e.pointerId)
              drag.current = { startX: x, startDomain: view.domain.current, moved: false }
            }}
            onPointerMove={(e) => {
              const { x } = local(e)
              const d = drag.current
              if (d) {
                if (!d.moved && Math.abs(x - d.startX) < 3) return
                d.moved = true
                view.set(panDomain(d.startDomain, pixelsToData(d.startDomain, rect().w, d.startX - x), bounds))
                e.currentTarget.style.cursor = 'grabbing'
                return
              }
              const i = hitAt(x)
              hover.current = { x: xScale().invert(x), bp: i >= 0 ? (breakpoints[i] as number) : NaN }
              e.currentTarget.style.cursor = i >= 0 ? 'pointer' : 'crosshair'
              scheduler.request()
            }}
            onPointerUp={(e) => {
              const d = drag.current
              drag.current = null
              e.currentTarget.style.cursor = ''
              if (d && !d.moved) {
                setSelected(null)
                const dx = xScale().invert(d.startX)
                const si = segments.findIndex((sg) => dx >= sg.start && dx <= sg.end)
                if (si >= 0) onSegmentClick?.(si)
              }
            }}
            onPointerLeave={() => {
              hover.current = null
              scheduler.request()
            }}
            onDoubleClick={(e) => {
              const { x, y } = local(e)
              if (!inRect(rect(), x, y)) return
              const i = hitAt(x)
              if (i >= 0) remove(breakpoints[i] as number)
              else add(xScale().invert(x))
            }}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => add(menu.x)}>
          <Plus /> Add breakpoint at {menu.x.toFixed(1)} bp
        </ContextMenuItem>
        {menu.bp != null && (
          <ContextMenuItem danger onSelect={() => menu.bp != null && remove(menu.bp)}>
            <Trash2 /> Remove breakpoint {menu.bp.toFixed(1)}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => view.reset()}>
          <Maximize2 /> Reset zoom
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
