/**
 * BinPlot: peak size (x) vs relative height (y) for one locus across runs,
 * with editable allele bins. Holds no server state: edits are reported via
 * onBinsChange and the parent passes the new bins back.
 *
 * Mouse: click a bin to select; drag its body to move, its edges to resize;
 * drag empty space to pan; wheel to zoom; double-click empty space to add a
 * bin; right-click for a menu. Keys (plot focused): Delete removes the
 * selected bin, arrows nudge it (Shift ×10), [ and ] change its width,
 * Esc deselects, 0 resets the zoom.
 *
 * Large scatters (more than `DENSITY_THRESHOLD` points, or `density="density"`)
 * are drawn as a density raster whose opacity follows the log of the count
 * per cell; the raster is cached, so dragging a bin never re-renders points.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Maximize2 } from 'lucide-react'
import type { Bin } from '@/api/bindings'
import { cn } from '@/lib/cn'
import { createFrameScheduler, prepareCanvas, useElementSize } from '@/plot/canvas'
import { clipTo, drawAxes, haloText, inRect, plotRect, type Margins } from '@/plot/axes'
import { hitBand, type BandHit } from '@/plot/hit'
import { linear, pixelsToData, panDomain, type Domain } from '@/plot/scale'
import { resolveColor, usePlotTheme, withAlpha } from '@/plot/theme'
import { useXView } from '@/plot/useXView'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/Menu'
import { moveBin, newBin, removeBin, replaceBin, resizeBinEdge, setBuffer, type BinChange } from './binEdit'
import { densityGrid, hexRgb, paintDensity } from './density'

export interface ScatterPoint {
  x: number
  y: number
}

/** Per-bin emphasis: a warning or error tone and/or a dashed outline (e.g. unsaved). */
export interface BinStyle {
  tone?: 'warn' | 'danger'
  dashed?: boolean
}

/** Above this many points the scatter is drawn as a density raster. */
export const DENSITY_THRESHOLD = 2500

export interface BinPlotProps {
  /** One point per peak: x = size (bp), y = relative height (0..1). */
  points: readonly ScatterPoint[]
  bins: readonly Bin[]
  selectedId?: number | null
  onSelect?: (id: number | null) => void
  onBinsChange?: (bins: Bin[], change: BinChange) => void
  /** Point color: dye name or CSS color. */
  color?: string
  /** Locus size range (bp): sets the default view and shades outside. */
  locusRange?: Domain | null
  /** Half-width of bins added by double-click / menu. */
  defaultBuffer?: number
  readOnly?: boolean
  /** Faint vertical guide lines (bp), e.g. the repeat grid. */
  guides?: readonly number[]
  /** Emphasis per bin (flagged, unsaved). */
  binStyle?: (bin: Bin) => BinStyle | undefined
  /** Pan to the selected bin when it is selected from outside and off screen. */
  followSelection?: boolean
  /** Point rendering: `auto` switches to density above DENSITY_THRESHOLD points. */
  density?: 'auto' | 'points' | 'density'
  className?: string
}

const MARGINS: Margins = { top: 22, right: 12, bottom: 34, left: 44 }
const Y_DOMAIN: Domain = [-0.04, 1.08]

// A bin drag carries its current result (`bin`) itself. Pointer moves render
// at continuous priority, in a later task than the event, and the browser
// runs a following pointerup before that task: reading the rendered preview
// state on release would commit an older step, or nothing, after a quick drag.
type Drag =
  | { kind: 'move' | 'left' | 'right'; id: number; startX: number; start: Bin; moved: boolean; bin: Bin | null }
  | { kind: 'pan'; startX: number; startDomain: Domain; moved: boolean }

export function BinPlot({
  points,
  bins,
  selectedId = null,
  onSelect,
  onBinsChange,
  color = 'blue',
  locusRange = null,
  defaultBuffer = 0.75,
  readOnly,
  guides,
  binStyle,
  followSelection,
  density = 'auto',
  className,
}: BinPlotProps) {
  const theme = usePlotTheme()
  const [boxRef, size] = useElementSize<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [preview, setPreview] = useState<Bin | null>(null)
  const drag = useRef<Drag | null>(null)
  const hoverX = useRef<number | null>(null)
  const menuAt = useRef<{ x: number; hit: Bin | null }>({ x: 0, hit: null })
  const [menuState, setMenuState] = useState<{ x: number; hit: Bin | null }>({ x: 0, hit: null })

  const shown = useMemo(() => (preview ? replaceBin(bins, preview) : [...bins]), [bins, preview])
  const bounds = useMemo<Domain>(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const p of points) {
      lo = Math.min(lo, p.x)
      hi = Math.max(hi, p.x)
    }
    for (const b of bins) {
      lo = Math.min(lo, b.base_size - b.bin_buffer)
      hi = Math.max(hi, b.base_size + b.bin_buffer)
    }
    if (locusRange) {
      lo = Math.min(lo, locusRange[0])
      hi = Math.max(hi, locusRange[1])
    }
    if (!Number.isFinite(lo)) return [0, 500]
    return [lo - 10, hi + 10]
    // Bounds follow the data extent; recomputing on every bin edit would
    // jump the view, so only points and the locus range count.
  }, [points, locusRange])
  const initial = useMemo<Domain>(
    () => (locusRange ? [locusRange[0] - 3, locusRange[1] + 3] : bounds),
    [locusRange, bounds],
  )

  const rect = useCallback(() => plotRect(size.width, size.height, MARGINS), [size])
  // Bumped when the points change, so the density raster is rebuilt.
  const pointsVersion = useRef(0)
  const lastPoints = useRef(points)
  if (lastPoints.current !== points) {
    lastPoints.current = points
    pointsVersion.current++
  }
  const latest = useRef({ shown, selectedId, points, theme, color, locusRange, size, guides, binStyle, density })
  latest.current = { shown, selectedId, points, theme, color, locusRange, size, guides, binStyle, density }
  // Cached density raster; rebuilt only when the view, size or data change.
  const raster = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null)
  const columns = useMemo(() => {
    const xs = new Float64Array(points.length)
    const ys = new Float64Array(points.length)
    points.forEach((p, i) => {
      xs[i] = p.x
      ys[i] = p.y
    })
    return { xs, ys }
  }, [points])
  const columnsRef = useRef(columns)
  columnsRef.current = columns

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const L = latest.current
    if (!canvas || L.size.width === 0) return
    const ctx = prepareCanvas(canvas, L.size)
    if (!ctx) return
    const t = L.theme
    const r = plotRect(L.size.width, L.size.height, MARGINS)
    const x = linear(view.domain.current, [r.x, r.x + r.w])
    const y = linear(Y_DOMAIN, [r.y + r.h, r.y])
    ctx.fillStyle = t.bg
    ctx.fillRect(0, 0, L.size.width, L.size.height)
    drawAxes(ctx, r, x, y, t, { xLabel: 'size (bp)', yLabel: 'relative height', yTicks: 5 })
    boxRef.current?.setAttribute('data-x-domain', view.domain.current.map((v) => v.toFixed(3)).join(','))
    clipTo(ctx, r)

    if (L.locusRange) {
      ctx.fillStyle = withAlpha(t.range, t.dark ? 0.12 : 0.09)
      const a = x(L.locusRange[0])
      const b = x(L.locusRange[1])
      if (a > r.x) ctx.fillRect(r.x, r.y, a - r.x, r.h)
      if (b < r.x + r.w) ctx.fillRect(b, r.y, r.x + r.w - b, r.h)
    }

    if (L.guides?.length) {
      ctx.strokeStyle = withAlpha(t.muted, t.dark ? 0.35 : 0.3)
      ctx.lineWidth = 1
      ctx.setLineDash([2, 4])
      ctx.beginPath()
      for (const g of L.guides) {
        const gx = Math.round(x(g)) + 0.5
        if (gx < r.x || gx > r.x + r.w) continue
        ctx.moveTo(gx, r.y)
        ctx.lineTo(gx, r.y + r.h)
      }
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Bins under the points.
    const sel = L.shown.find((b) => b.id === L.selectedId) ?? null
    for (const b of L.shown) {
      const a = x(b.base_size - b.bin_buffer)
      const c = x(b.base_size + b.bin_buffer)
      if (c < r.x || a > r.x + r.w) continue
      const isSel = b === sel
      const st = L.binStyle?.(b)
      const toneColor = st?.tone === 'danger' ? t.danger : st?.tone === 'warn' ? t.warn : null
      ctx.fillStyle = withAlpha(isSel ? t.select : (toneColor ?? t.bin), isSel ? 0.22 : toneColor ? (t.dark ? 0.2 : 0.16) : t.dark ? 0.16 : 0.13)
      ctx.fillRect(a, r.y, Math.max(1, c - a), r.h)
      if (!isSel && (toneColor || st?.dashed)) {
        ctx.strokeStyle = toneColor ?? t.bin
        ctx.lineWidth = 1
        ctx.setLineDash(st?.dashed ? [4, 3] : [])
        ctx.strokeRect(Math.round(a) + 0.5, r.y + 0.5, Math.max(1, Math.round(c - a) - 1), r.h - 1)
        ctx.setLineDash([])
      }
      if (isSel) {
        ctx.strokeStyle = t.select
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(Math.round(a) + 0.5, r.y)
        ctx.lineTo(Math.round(a) + 0.5, r.y + r.h)
        ctx.moveTo(Math.round(c) - 0.5, r.y)
        ctx.lineTo(Math.round(c) - 0.5, r.y + r.h)
        ctx.stroke()
        // Edge grips.
        ctx.fillStyle = t.select
        for (const ex of [a, c]) ctx.fillRect(ex - 2, r.y + r.h / 2 - 10, 4, 20)
      }
    }

    // Points.
    const pc = resolveColor(t, L.color)
    const n = L.points.length
    if (L.density === 'density' || (L.density === 'auto' && n > DENSITY_THRESHOLD)) {
      const cell = n > 20000 ? 2 : 2.5
      const d = view.domain.current
      const key = `${d[0]}|${d[1]}|${r.w}|${r.h}|${pc}|${n}`
      let img = raster.current
      if (!img || img.key !== key || img.canvas.dataset.points !== String(pointsVersion.current)) {
        const { xs, ys } = columnsRef.current
        const g = densityGrid(xs, ys, (v) => x(v) - r.x, (v) => y(v) - r.y, r.w, r.h, cell)
        const canvasEl = img?.canvas ?? document.createElement('canvas')
        canvasEl.width = g.w
        canvasEl.height = g.h
        const cctx = canvasEl.getContext('2d')
        if (cctx) {
          const data = cctx.createImageData(g.w, g.h)
          paintDensity(g, hexRgb(pc), data.data)
          cctx.putImageData(data, 0, 0)
        }
        canvasEl.dataset.points = String(pointsVersion.current)
        img = { key, canvas: canvasEl }
        raster.current = img
      }
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img.canvas, r.x, r.y, img.canvas.width * cell, img.canvas.height * cell)
      ctx.imageSmoothingEnabled = true
    } else {
      const rad = n > 1200 ? 1.8 : 2.4
      ctx.fillStyle = withAlpha(pc, n > 1200 ? 0.45 : 0.55)
      ctx.beginPath()
      for (const p of L.points) {
        const px = x(p.x)
        if (px < r.x - 3 || px > r.x + r.w + 3) continue
        const py = y(p.y)
        ctx.moveTo(px + rad, py)
        ctx.arc(px, py, rad, 0, Math.PI * 2)
      }
      ctx.fill()
    }
    ctx.restore()

    // Labels above the plot area so they never cover points.
    ctx.font = t.font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    let lastRight = -Infinity
    const ordered = [...L.shown].sort((a, b) => a.base_size - b.base_size)
    for (const b of ordered) {
      const mid = x(b.base_size)
      if (mid < r.x || mid > r.x + r.w) continue
      const w = ctx.measureText(b.label).width
      if (b !== sel && mid - w / 2 < lastRight + 4) continue
      ctx.fillStyle = b === sel ? t.select : t.muted
      if (b === sel) ctx.font = `600 ${t.font}`
      ctx.fillText(b.label, mid, r.y - 4)
      ctx.font = t.font
      lastRight = mid + w / 2
    }
    if (sel) {
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      haloText(
        ctx,
        `${sel.label}: ${sel.base_size.toFixed(2)} ± ${sel.bin_buffer.toFixed(2)} bp`,
        r.x + r.w - 6,
        r.y + 6,
        t.fg,
        t.bg,
      )
    }
    if (hoverX.current != null && inRect(r, hoverX.current, r.y + 1)) {
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      haloText(ctx, `${x.invert(hoverX.current).toFixed(2)} bp`, r.x + 6, r.y + 6, t.muted, t.bg)
    }
  }, [boxRef])

  const scheduler = useMemo(() => createFrameScheduler(draw), [draw])
  useEffect(() => () => scheduler.cancel(), [scheduler])
  const view = useXView({
    bounds,
    initial,
    minSpan: 2,
    onChange: scheduler.request,
    target: canvasRef,
    getRect: rect,
  })
  useEffect(() => scheduler.request(), [scheduler, shown, selectedId, points, theme, color, size, locusRange, guides, binStyle, density])

  // Pan to a bin selected from outside (a table) when it is off screen.
  useEffect(() => {
    if (!followSelection || selectedId == null || drag.current) return
    const b = bins.find((v) => v.id === selectedId)
    if (!b) return
    const [lo, hi] = view.domain.current
    if (b.base_size - b.bin_buffer >= lo && b.base_size + b.bin_buffer <= hi) return
    const half = (hi - lo) / 2
    view.set([b.base_size - half, b.base_size + half])
    // Only a selection change should pan, not edits to the bin.
  }, [followSelection, selectedId])

  // -------------------------------------------------------------- hit testing

  const toData = (px: number) => linear(view.domain.current, [rect().x, rect().x + rect().w]).invert(px)
  // Hit testing reads the latest rendered bins and selection (not this
  // render's closure), so a press right after an edit sees that edit.
  const hitAt = (px: number): (BandHit & { bin: Bin }) | null => {
    const { shown: cur, selectedId: sel } = latest.current
    const x = linear(view.domain.current, [rect().x, rect().x + rect().w])
    const bands = cur.map((b) => ({ lo: x(b.base_size - b.bin_buffer), hi: x(b.base_size + b.bin_buffer) }))
    const selIdx = cur.findIndex((b) => b.id === sel)
    const h = hitBand(bands, px, 5, selIdx)
    return h ? { ...h, bin: cur[h.index] as Bin } : null
  }
  const local = (e: { clientX: number; clientY: number }) => {
    const b = canvasRef.current?.getBoundingClientRect()
    return b ? { x: e.clientX - b.left, y: e.clientY - b.top } : { x: 0, y: 0 }
  }

  const commit = (next: Bin[], change: BinChange) => onBinsChange?.(next, change)

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = local(e)
    if (e.button === 2) {
      const h = inRect(rect(), x, y) ? hitAt(x) : null
      menuAt.current = { x: toData(x), hit: h?.bin ?? null }
      setMenuState(menuAt.current)
      return
    }
    if (e.button !== 0 || !inRect(rect(), x, y)) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const h = hitAt(x)
    if (h) {
      if (h.bin.id !== selectedId) onSelect?.(h.bin.id)
      if (!readOnly) {
        drag.current = { kind: h.part === 'body' ? 'move' : h.part, id: h.bin.id, startX: x, start: h.bin, moved: false, bin: null }
        return
      }
    }
    drag.current = { kind: 'pan', startX: x, startDomain: view.domain.current, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x } = local(e)
    hoverX.current = x
    const d = drag.current
    if (!d) {
      const h = hitAt(x)
      e.currentTarget.style.cursor = !h || readOnly ? 'crosshair' : h.part === 'body' ? 'grab' : 'ew-resize'
      scheduler.request()
      return
    }
    if (!d.moved && Math.abs(x - d.startX) < 3) return
    d.moved = true
    if (d.kind === 'pan') {
      view.set(panDomain(d.startDomain, pixelsToData(d.startDomain, rect().w, d.startX - x), bounds))
      e.currentTarget.style.cursor = 'grabbing'
      return
    }
    if (d.kind === 'move') {
      d.bin = moveBin(d.start, d.start.base_size + (toData(x) - toData(d.startX)))
      e.currentTarget.style.cursor = 'grabbing'
    } else {
      d.bin = resizeBinEdge(d.start, d.kind, toData(x))
    }
    setPreview(d.bin)
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    drag.current = null
    e.currentTarget.style.cursor = ''
    if (!d) return
    if (d.kind === 'pan') {
      if (!d.moved) onSelect?.(null)
      return
    }
    if (d.moved && d.bin) {
      commit(replaceBin(bins, d.bin), { type: d.kind === 'move' ? 'move' : 'resize', bin: d.bin })
    }
    setPreview(null)
  }

  const addAt = (bp: number) => {
    if (readOnly) return
    const b = newBin(bins, bp, defaultBuffer)
    commit([...bins, b], { type: 'add', bin: b })
    onSelect?.(b.id)
  }
  const del = (b: Bin) => {
    if (readOnly) return
    commit(removeBin(bins, b.id), { type: 'delete', bin: b })
    onSelect?.(null)
  }

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = local(e)
    if (!inRect(rect(), x, y) || hitAt(x)) return
    addAt(toData(x))
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const sel = bins.find((b) => b.id === selectedId)
    if (e.key === '0') {
      view.reset()
      return
    }
    if (e.key === 'Escape') {
      onSelect?.(null)
      return
    }
    if (!sel || readOnly) return
    const step = e.shiftKey ? 0.5 : 0.05
    let next: Bin | null = null
    let type: BinChange['type'] = 'move'
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        del(sel)
        return
      case 'ArrowLeft':
        next = moveBin(sel, sel.base_size - step)
        break
      case 'ArrowRight':
        next = moveBin(sel, sel.base_size + step)
        break
      case '[':
        next = setBuffer(sel, sel.bin_buffer - step)
        type = 'resize'
        break
      case ']':
        next = setBuffer(sel, sel.bin_buffer + step)
        type = 'resize'
        break
      case 'Tab': {
        // Cycle selection through bins by position.
        const ordered = [...bins].sort((a, b) => a.base_size - b.base_size)
        const i = ordered.findIndex((b) => b.id === sel.id)
        const n = ordered[(i + (e.shiftKey ? -1 : 1) + ordered.length) % ordered.length]
        if (n) {
          e.preventDefault()
          onSelect?.(n.id)
        }
        return
      }
    }
    if (next) {
      e.preventDefault()
      commit(replaceBin(bins, next), { type, bin: next })
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={readOnly}>
        <div
          ref={boxRef}
          tabIndex={0}
          role="application"
          aria-label="Bin editor plot"
          onKeyDown={onKeyDown}
          className={cn('relative min-h-0 min-w-0 overflow-hidden rounded-sm bg-[var(--plot-bg)] outline-none focus-visible:ring-2 focus-visible:ring-accent/40', className)}
          data-testid="bin-plot"
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              drag.current = null
              setPreview(null)
            }}
            onPointerLeave={() => {
              hoverX.current = null
              scheduler.request()
            }}
            onDoubleClick={onDoubleClick}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => addAt(menuState.x)}>
          <Plus /> Add bin at {menuState.x.toFixed(1)} bp
        </ContextMenuItem>
        {menuState.hit && (
          <ContextMenuItem danger onSelect={() => menuState.hit && del(menuState.hit)}>
            <Trash2 /> Delete bin {menuState.hit.label}
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
