/**
 * TraceViewer: electropherogram plot for one or several dye traces.
 *
 * Drawing is imperative on two stacked canvases: the base canvas (axes,
 * overlays, traces, markers) is redrawn when data or the view changes; the
 * overlay canvas (crosshair, box-zoom rectangle) is redrawn on pointer moves.
 * The view lives in a ref so zooming never re-renders React.
 */
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react'
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import { cn } from '@/lib/cn'
import { createFrameScheduler, prepareCanvas, useElementSize } from '@/plot/canvas'
import { clipTo, drawAxes, haloText, inRect, plotRect, type Margins, type Rect } from '@/plot/axes'
import { decimate, localMaxIndex, nearestIndex, visibleRange } from '@/plot/decimate'
import { nearestPoint, type PxPoint } from '@/plot/hit'
import {
  clampDomain,
  domainsEqual,
  linear,
  panDomain,
  pixelsToData,
  wheelPixels,
  wheelZoomFactor,
  zoomDomain,
  type Domain,
} from '@/plot/scale'
import { resolveColor, usePlotTheme, withAlpha, type PlotTheme } from '@/plot/theme'
import { fmtFixed, fmtRfu } from '@/lib/format'
import {
  PEAK_STATE_LABEL,
  autoYMax,
  axisToBp,
  axisToIndex,
  bpToAxis,
  computeBounds,
  defaultDomain,
  markerRfu,
  peakX,
  pointX,
  primarySeries,
  type LadderMarker,
  type PeakState,
  type TraceBin,
  type TracePeak,
  type TraceSeries,
  type XAxisMode,
} from './model'

export interface TraceClick {
  /** X in axis units (bp or index). */
  x: number
  /** Nearest data index of the target series. */
  index: number
  /** Index of the local maximum within `snapRadius` points: where a ladder peak would go. */
  snapIndex: number
  /** bp at x, when base sizes are known. */
  bp: number | null
  /** Signal of the target series at `index`. */
  height: number
  seriesId: string | null
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
}

export interface TraceViewerHandle {
  resetView(): void
  setXDomain(d: Domain): void
  getXDomain(): Domain
}

export interface TraceViewerProps {
  series: TraceSeries[]
  /** X axis in data-point index or base pairs. Default: bp when the first series has base sizes. */
  xMode?: XAxisMode
  peaks?: TracePeak[]
  bins?: TraceBin[]
  /** Locus size range in bp; outside is shaded. */
  locusRange?: Domain | null
  ladder?: LadderMarker[]
  /** Horizontal line in RFU (e.g. min peak height). */
  threshold?: number | null
  /** Controlled x view. Pair with onXDomainChange. */
  xDomain?: Domain
  /** Initial/reset x view. Default: locus range + margin, else everything. */
  defaultXDomain?: Domain
  /** Zoom limits. Default: the data extent. */
  xBounds?: Domain
  onXDomainChange?: (d: Domain) => void
  /** Lock the y-axis top (RFU). Undefined/null: auto-fit the visible data. */
  yMax?: number | null
  /** Called when the user locks/unlocks y (box zoom, Up/Down keys, `a` for auto). */
  onYMaxChange?: (y: number | null) => void
  onPeakClick?: (peak: TracePeak, e: TraceClick) => void
  /** Click on empty plot area (delayed ~200 ms to tell it from a double-click reset). */
  onBackgroundClick?: (e: TraceClick) => void
  /** Series used for background clicks (snapIndex). Default: the primary series. */
  clickSeriesId?: string
  /** Radius in data points for `snapIndex`. Default 15. */
  snapRadius?: number
  /** Changing this resets the view (e.g. a new well). */
  resetKey?: string | number
  showControls?: boolean
  showLegend?: boolean
  /** Axis titles. Default: 'size (bp)' / 'data point' and 'RFU'. */
  xLabel?: string
  yLabel?: string
  className?: string
  ariaLabel?: string
  ref?: Ref<TraceViewerHandle>
}

const MARGINS: Margins = { top: 18, right: 12, bottom: 34, left: 52 }
const EMPTY: never[] = []
const CLICK_DELAY = 300

interface DragState {
  kind: 'pan' | 'box' | 'pending'
  startX: number
  startY: number
  startDomain: Domain
  curX: number
  curY: number
  pointerId: number
  shift: boolean
}

export function TraceViewer(props: TraceViewerProps) {
  const {
    series,
    peaks = EMPTY,
    bins = EMPTY,
    ladder = EMPTY,
    locusRange = null,
    threshold = null,
    showControls = true,
    className,
    ariaLabel = 'Trace plot',
  } = props
  const theme = usePlotTheme()
  const [boxRef, size] = useElementSize<HTMLDivElement>()
  const baseRef = useRef<HTMLCanvasElement>(null)
  const overRef = useRef<HTMLCanvasElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  const mode: XAxisMode = props.xMode ?? (series.some((s) => s.baseSizes) ? 'bp' : 'index')
  const primary = primarySeries(series)
  // Keyed on values, not identities, so a parent passing fresh arrays each
  // render does not reset the view.
  const boundsRaw = props.xBounds ?? computeBounds(series, mode)
  const boundsKey = `${boundsRaw[0]}|${boundsRaw[1]}`
  const bounds = useMemo<Domain>(() => boundsRaw, [boundsKey])
  const dfltRaw = props.defaultXDomain ? clampDomain(props.defaultXDomain, bounds) : defaultDomain(bounds, mode, locusRange, primary)
  const dfltKey = `${dfltRaw[0]}|${dfltRaw[1]}`
  const dflt = useMemo<Domain>(() => dfltRaw, [dfltKey])
  const minSpan = mode === 'bp' ? 2 : 20

  // Mutable view + latest props for event handlers.
  const view = useRef<{ x: Domain; yLock: number | null }>({ x: props.xDomain ?? dflt, yLock: props.yMax ?? null })
  const latest = useRef({ props, theme, size, mode, primary, bounds, dflt, minSpan })
  latest.current = { props, theme, size, mode, primary, bounds, dflt, minSpan }
  const peakPx = useRef<(PxPoint & { peak: TracePeak })[]>([])
  const hover = useRef<{ x: number; y: number } | null>(null)
  const drag = useRef<DragState | null>(null)
  const clickTimer = useRef<number>(0)
  // The delayed background click, so a quick second click elsewhere can
  // deliver it at once instead of dropping it.
  const pendingClick = useRef<(() => void) | null>(null)
  const lastClick = useRef<{ t: number; x: number; y: number } | null>(null)

  // ------------------------------------------------------------ geometry

  const geometry = useCallback(() => {
    const L = latest.current
    const r = plotRect(L.size.width, L.size.height, MARGINS)
    const x = linear(view.current.x, [r.x, r.x + r.w])
    const yTop =
      view.current.yLock ??
      autoYMax(
        L.props.series,
        L.mode,
        view.current.x,
        (L.props.peaks ?? EMPTY)
          .filter((p) => {
            const px = peakX(p, L.mode)
            return px >= view.current.x[0] && px <= view.current.x[1]
          })
          .map(markerRfu),
      )
    const y = linear([-yTop * 0.02, yTop], [r.y + r.h, r.y])
    return { r, x, y, yTop }
  }, [])

  // ------------------------------------------------------------ drawing

  const drawBase = useCallback(() => {
    const canvas = baseRef.current
    const L = latest.current
    if (!canvas || L.size.width === 0) return
    const ctx = prepareCanvas(canvas, L.size)
    if (!ctx) return
    const t = L.theme
    const { r, x, y } = geometry()
    const mode = L.mode
    const P = L.props
    ctx.fillStyle = t.bg
    ctx.fillRect(0, 0, L.size.width, L.size.height)
    drawAxes(ctx, r, x, y, t, {
      xLabel: P.xLabel ?? (mode === 'bp' ? 'size (bp)' : 'data point'),
      yLabel: P.yLabel ?? 'RFU',
    })
    boxRef.current?.setAttribute('data-x-domain', `${view.current.x[0].toFixed(3)},${view.current.x[1].toFixed(3)}`)
    boxRef.current?.setAttribute('data-x-mode', L.mode)
    boxRef.current?.setAttribute('data-y-lock', view.current.yLock == null ? 'auto' : String(Math.round(view.current.yLock)))

    clipTo(ctx, r)

    // Locus range: shade what is outside it.
    if (P.locusRange) {
      const lo = bpToAxis(P.locusRange[0], mode, L.primary)
      const hi = bpToAxis(P.locusRange[1], mode, L.primary)
      if (lo != null && hi != null) {
        ctx.fillStyle = withAlpha(t.range, t.dark ? 0.12 : 0.09)
        const a = x(lo)
        const b = x(hi)
        if (a > r.x) ctx.fillRect(r.x, r.y, a - r.x, r.h)
        if (b < r.x + r.w) ctx.fillRect(b, r.y, r.x + r.w - b, r.h)
        ctx.strokeStyle = withAlpha(t.range, 0.7)
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.moveTo(Math.round(a) + 0.5, r.y)
        ctx.lineTo(Math.round(a) + 0.5, r.y + r.h)
        ctx.moveTo(Math.round(b) + 0.5, r.y)
        ctx.lineTo(Math.round(b) + 0.5, r.y + r.h)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // Bins.
    const binList = P.bins ?? EMPTY
    ctx.font = t.font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    let lastLabelRight = -Infinity
    for (const b of binList) {
      const lo = bpToAxis(b.center - b.halfWidth, mode, L.primary)
      const hi = bpToAxis(b.center + b.halfWidth, mode, L.primary)
      if (lo == null || hi == null) continue
      const a = x(lo)
      const c = x(hi)
      if (c < r.x || a > r.x + r.w) continue
      ctx.fillStyle = withAlpha(t.bin, b.highlighted ? (t.dark ? 0.3 : 0.32) : t.dark ? 0.09 : 0.13)
      ctx.fillRect(a, r.y, Math.max(1, c - a), r.h)
      const mid = (a + c) / 2
      const w = ctx.measureText(b.label).width
      if (mid - w / 2 > lastLabelRight + 3) {
        haloText(ctx, b.label, mid, r.y + 2, b.highlighted ? t.fg : t.muted, t.bg)
        lastLabelRight = mid + w / 2
      }
    }

    // Threshold.
    if (P.threshold != null) {
      const py = Math.round(y(P.threshold)) + 0.5
      ctx.strokeStyle = withAlpha(t.threshold, 0.8)
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(r.x, py)
      ctx.lineTo(r.x + r.w, py)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Traces: overlays first, faded.
    const ordered = [...P.series.filter((s) => s.overlay), ...P.series.filter((s) => !s.overlay)]
    for (const s of ordered) {
      if (s.hidden || s.data.length === 0) continue
      if (mode === 'bp' && !s.baseSizes) continue
      const xs = mode === 'bp' ? (s.baseSizes ?? null) : null
      const [i0, i1] = visibleRange(xs, s.data.length, view.current.x[0], view.current.x[1])
      const dec = decimate(s.data, xs, i0, i1, x, r.w)
      const color = resolveColor(t, s.color)
      ctx.strokeStyle = s.overlay ? withAlpha(color, t.dark ? 0.4 : 0.35) : color
      ctx.lineWidth = s.overlay ? 1 : 1.35
      ctx.lineJoin = 'round'
      ctx.beginPath()
      const pts = dec.points
      for (let k = 0; k < dec.count; k++) {
        const px = pts[2 * k] as number
        const py = y(pts[2 * k + 1] as number)
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }

    // Ladder markers.
    const seriesById = new Map(P.series.map((s) => [s.id, s]))
    ctx.font = t.monoFont
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    const markers = [...(P.ladder ?? EMPTY)].sort((a, b) => a.index - b.index)
    let lastRight = -Infinity
    let lastLift = 0
    for (const m of markers) {
      const s = (m.seriesId ? seriesById.get(m.seriesId) : undefined) ?? L.primary
      if (!s) continue
      const px = x(pointX(s, m.index, mode))
      if (px < r.x - 10 || px > r.x + r.w + 10) continue
      const py = y((s.data[m.index] as number | undefined) ?? 0)
      const seriesCol = resolveColor(t, s.color)
      const unassigned = m.size == null || m.status === 'unassigned'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(px, py - 3)
      ctx.lineTo(px - 4.5, py - 11)
      ctx.lineTo(px + 4.5, py - 11)
      ctx.closePath()
      if (m.status === 'outlier') {
        // Hollow, in a color that differs from any dye: shape carries it too.
        ctx.fillStyle = t.bg
        ctx.strokeStyle = t.danger
        ctx.fill()
        ctx.stroke()
      } else {
        ctx.fillStyle = unassigned ? t.muted : seriesCol
        ctx.strokeStyle = t.bg
        ctx.fill()
        ctx.stroke()
      }
      if (m.size != null) {
        const label = fmtFixed(m.size, m.size % 1 === 0 ? 0 : 1)
        const w = ctx.measureText(label).width
        // Stagger labels of close peaks instead of overprinting them.
        const lift = px - w / 2 < lastRight + 2 && lastLift === 0 ? 11 : 0
        // Keep labels of the tallest peaks inside the plot instead of clipping them.
        haloText(ctx, label, px, Math.max(r.y + 11 + lift, py - 13 - lift), m.status === 'outlier' ? t.danger : t.fg, t.bg)
        lastRight = px + w / 2
        lastLift = lift
      }
    }

    // Expected artifact heights (behind the markers).
    for (const p of P.peaks ?? EMPTY) {
      if (!p.expected || p.expected.height + p.expected.error <= 0) continue
      const px = x(peakX(p, mode))
      if (px < r.x - 8 || px > r.x + r.w + 8) continue
      drawExpectedArtifact(ctx, t, px, y, p.expected.height, p.expected.error, r)
    }

    // Peaks.
    const hits: (PxPoint & { peak: TracePeak })[] = []
    const labels: { text: string; px: number; py: number; strong: boolean }[] = []
    const tags: { text: string; px: number; py: number }[] = []
    for (const p of P.peaks ?? EMPTY) {
      const s = (p.seriesId ? seriesById.get(p.seriesId) : undefined) ?? L.primary
      const px = x(peakX(p, mode))
      if (px < r.x - 8 || px > r.x + r.w + 8) continue
      const py = Math.max(r.y + 6, y(markerRfu(p)))
      hits.push({ px, py, peak: p })
      drawPeakMarker(ctx, t, p.state, px, py, resolveColor(t, s?.color ?? t.fg))
      if (p.selected) {
        ctx.save()
        ctx.strokeStyle = t.select
        ctx.lineWidth = 2
        ctx.setLineDash([3, 2])
        ctx.beginPath()
        ctx.arc(px, py, 10, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
      if (p.highlight === 'warn') {
        ctx.save()
        ctx.strokeStyle = t.warn
        ctx.lineWidth = 1.5
        ctx.setLineDash([2, 2])
        ctx.beginPath()
        ctx.arc(px, py, 7.5, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
      if (p.label && (p.state === 'called' || p.state === 'manual-on')) {
        labels.push({ text: p.label, px, py: py - 8, strong: true })
      } else if (p.label && p.highlight === 'warn') {
        labels.push({ text: p.label, px, py: py - 9, strong: false })
      }
      if (p.tag) tags.push({ text: p.tag, px: px + 9, py: py + 9 })
    }
    ctx.font = `600 ${t.font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    for (const l of labels) haloText(ctx, l.text, l.px, Math.max(r.y + 14, l.py), l.strong ? t.fg : t.warn, t.bg)
    ctx.font = t.monoFont
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    for (const g of tags) haloText(ctx, g.text, g.px, Math.min(r.y + r.h - 6, g.py), t.muted, t.bg)
    peakPx.current = hits
    ctx.restore()

    // Legend.
    if (L.props.showLegend ?? true) drawLegend(ctx, t, r, P.series)
  }, [geometry, boxRef])

  const drawOverlay = useCallback(() => {
    const canvas = overRef.current
    const L = latest.current
    if (!canvas || L.size.width === 0) return
    const ctx = prepareCanvas(canvas, L.size)
    if (!ctx) return
    const t = L.theme
    const { r, x, y } = geometry()
    const d = drag.current
    if (d && d.kind === 'box') {
      const x0 = Math.max(r.x, Math.min(d.startX, d.curX))
      const x1 = Math.min(r.x + r.w, Math.max(d.startX, d.curX))
      const y0 = Math.max(r.y, Math.min(d.startY, d.curY))
      const y1 = Math.min(r.y + r.h, Math.max(d.startY, d.curY))
      ctx.fillStyle = withAlpha(t.select, 0.12)
      ctx.strokeStyle = t.select
      ctx.lineWidth = 1
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0)
    }
    const h = hover.current
    const tip = tipRef.current
    if (!h || !inRect(r, h.x, h.y) || (d && d.kind !== 'pending')) {
      if (tip) tip.style.display = 'none'
      return
    }
    // Crosshair.
    ctx.strokeStyle = withAlpha(t.fg, 0.35)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(Math.round(h.x) + 0.5, r.y)
    ctx.lineTo(Math.round(h.x) + 0.5, r.y + r.h)
    ctx.stroke()

    if (!tip) return
    const ax = x.invert(h.x)
    const hitIdx = nearestPoint(peakPx.current, h.x, h.y, 8)
    const lines: string[] = []
    if (hitIdx >= 0) {
      const p = (peakPx.current[hitIdx] as PxPoint & { peak: TracePeak }).peak
      ctx.strokeStyle = t.select
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x(peakX(p, L.mode)), Math.max(r.y + 6, y(markerRfu(p))), 7, 0, Math.PI * 2)
      ctx.stroke()
      const sized = Number.isFinite(p.size)
      lines.push(`<b>${p.label ? `${escapeHtml(p.label)} · ` : ''}${sized ? `${fmtFixed(p.size, 2)} bp` : `#${p.index}`}</b>`)
      // The analysis height is above baseline; the marker sits on the raw apex.
      const raw = p.apex != null && Math.abs(p.apex - p.height) >= 1 ? ` (raw ${fmtRfu(p.apex)})` : ''
      lines.push(`height ${fmtRfu(p.height)} RFU${raw}${sized ? ` · #${p.index}` : ''}`)
      lines.push(`<span class="opacity-70">${escapeHtml(p.stateLabel ?? PEAK_STATE_LABEL[p.state])}</span>`)
      if (p.expected && p.expected.height + p.expected.error > 0)
        lines.push(`<span class="opacity-70">expected artifact ${fmtRfu(p.expected.height)} ± ${fmtRfu(p.expected.error)} RFU</span>`)
      for (const dl of p.detail ?? []) lines.push(`<span class="opacity-70">${escapeHtml(dl)}</span>`)
    } else {
      const bp = axisToBp(ax, L.mode, L.primary)
      const idx = Math.round(axisToIndex(ax, L.mode, L.primary))
      lines.push(`<b>${bp != null ? `${fmtFixed(bp, 2)} bp` : ''}${bp != null ? ' · ' : ''}#${idx}</b>`)
      for (const s of L.props.series) {
        if (s.hidden || s.overlay) continue
        if (L.mode === 'bp' && !s.baseSizes) continue
        const xs = L.mode === 'bp' ? (s.baseSizes ?? null) : null
        const i = nearestIndex(xs, s.data.length, ax)
        const v = s.data[i] as number | undefined
        if (v == null) continue
        const c = resolveColor(t, s.color)
        lines.push(
          `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c};margin-right:5px"></span>${escapeHtml(s.label ?? s.id)} <span class="num">${fmtRfu(v)}</span>`,
        )
      }
    }
    tip.innerHTML = lines.join('<br>')
    tip.style.display = 'block'
    const tw = tip.offsetWidth
    const th = tip.offsetHeight
    let tx = h.x + 14
    if (tx + tw > L.size.width - 4) tx = h.x - tw - 14
    let ty = h.y + 14
    if (ty + th > L.size.height - 4) ty = h.y - th - 10
    tip.style.transform = `translate(${Math.round(tx)}px, ${Math.round(Math.max(2, ty))}px)`
  }, [geometry])

  const scheduler = useMemo(
    () =>
      createFrameScheduler(() => {
        drawBase()
        drawOverlay()
      }),
    [drawBase, drawOverlay],
  )
  const overlayScheduler = useMemo(() => createFrameScheduler(drawOverlay), [drawOverlay])
  useEffect(
    () => () => {
      scheduler.cancel()
      overlayScheduler.cancel()
    },
    [scheduler, overlayScheduler],
  )

  // ------------------------------------------------------------ view updates

  const setX = useCallback(
    (d: Domain, notify = true) => {
      const L = latest.current
      const next = clampDomain(d, L.bounds, L.minSpan)
      if (domainsEqual(next, view.current.x)) return
      view.current.x = next
      scheduler.request()
      if (notify) L.props.onXDomainChange?.(next)
    },
    [scheduler],
  )

  const setYLock = useCallback(
    (v: number | null) => {
      view.current.yLock = v
      scheduler.request()
      latest.current.props.onYMaxChange?.(v)
    },
    [scheduler],
  )

  const resetView = useCallback(() => {
    setX(latest.current.dflt)
    if (view.current.yLock != null) setYLock(null)
    else scheduler.request()
  }, [setX, setYLock, scheduler])

  useImperativeHandle(props.ref, () => ({ resetView, setXDomain: (d) => setX(d), getXDomain: () => view.current.x }), [resetView, setX])

  // Controlled x domain.
  useEffect(() => {
    if (props.xDomain && !domainsEqual(props.xDomain, view.current.x)) setX(props.xDomain, false)
  }, [props.xDomain, setX])
  // Controlled y lock.
  useEffect(() => {
    view.current.yLock = props.yMax ?? null
    scheduler.request()
  }, [props.yMax, scheduler])
  // New data: keep the view if it still fits, else reset; resetKey forces it.
  useEffect(() => {
    view.current.x = props.xDomain ? clampDomain(props.xDomain, bounds, minSpan) : dflt
    scheduler.request()
  }, [props.resetKey, dflt])
  useEffect(() => {
    const x = view.current.x
    if (x[1] < bounds[0] || x[0] > bounds[1]) view.current.x = dflt
    else view.current.x = clampDomain(x, bounds, minSpan)
    scheduler.request()
  }, [bounds, dflt, minSpan, scheduler])
  // Redraw on any visual input change.
  useEffect(() => {
    scheduler.request()
  }, [scheduler, series, peaks, bins, ladder, locusRange, threshold, theme, size, mode, props.showLegend])

  // ------------------------------------------------------------ pointer input

  const localXY = (e: { clientX: number; clientY: number }) => {
    const rect = overRef.current?.getBoundingClientRect()
    return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: 0, y: 0 }
  }

  const makeClick = useCallback(
    (px: number, e: { shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean }): TraceClick => {
      const L = latest.current
      const { x } = geometry()
      const ax = x.invert(px)
      const target = (L.props.clickSeriesId ? L.props.series.find((s) => s.id === L.props.clickSeriesId) : undefined) ?? L.primary
      const xs = target && L.mode === 'bp' ? (target.baseSizes ?? null) : null
      const n = target?.data.length ?? 0
      const index = nearestIndex(xs, n, ax)
      const snapIndex = target ? localMaxIndex(target.data, index, L.props.snapRadius ?? 15) : index
      return {
        x: ax,
        index,
        snapIndex,
        bp: axisToBp(ax, L.mode, L.primary),
        height: (target?.data[index] as number | undefined) ?? 0,
        seriesId: target?.id ?? null,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey || e.ctrlKey,
      }
    },
    [geometry],
  )

  // The plot's size reaches state through a ResizeObserver, a frame after the
  // layout changed. A pointer event in between (a panel above the plot just
  // closed) would be tested against the old size: dropped as outside the plot
  // or placed at the wrong size. Measure the box itself first.
  const syncSize = () => {
    const el = boxRef.current
    if (!el) return
    const b = el.getBoundingClientRect()
    const L = latest.current
    const width = Math.floor(b.width)
    const height = Math.floor(b.height)
    if (width === L.size.width && height === L.size.height) return
    L.size = { ...L.size, width, height }
    scheduler.request()
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    syncSize()
    const { x, y } = localXY(e)
    const { r } = geometry()
    if (!inRect(r, x, y)) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      kind: e.shiftKey ? 'box' : 'pending',
      startX: x,
      startY: y,
      curX: x,
      curY: y,
      startDomain: view.current.x,
      pointerId: e.pointerId,
      shift: e.shiftKey,
    }
    overlayScheduler.request()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = localXY(e)
    hover.current = { x, y }
    const d = drag.current
    if (d && d.pointerId === e.pointerId) {
      d.curX = x
      d.curY = y
      if (d.kind === 'pending' && Math.hypot(x - d.startX, y - d.startY) > 4) d.kind = 'pan'
      if (d.kind === 'pan') {
        const { r } = geometry()
        const delta = pixelsToData(d.startDomain, r.w, d.startX - x)
        setX(panDomain(d.startDomain, delta, latest.current.bounds))
        e.currentTarget.style.cursor = 'grabbing'
        return
      }
    }
    overlayScheduler.request()
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    syncSize()
    const d = drag.current
    drag.current = null
    e.currentTarget.style.cursor = ''
    if (!d || d.pointerId !== e.pointerId) return
    const { r, x, y } = geometry()
    if (d.kind === 'box') {
      const x0 = Math.max(r.x, Math.min(d.startX, d.curX))
      const x1 = Math.min(r.x + r.w, Math.max(d.startX, d.curX))
      if (x1 - x0 > 5) setX([x.invert(x0), x.invert(x1)])
      const yTop = Math.max(r.y, Math.min(d.startY, d.curY))
      const yBottom = Math.min(r.y + r.h, Math.max(d.startY, d.curY))
      if (yBottom - yTop > 5 && yTop > r.y + 2) setYLock(Math.max(10, y.invert(yTop)))
      overlayScheduler.request()
      return
    }
    if (d.kind === 'pan') return
    // A click. Peaks respond at once; the background waits to see whether
    // this is the first half of a double-click (which resets the view).
    // Peak positions are recorded by the draw: bring a pending frame in first,
    // or a click right after a change (a discarded ladder draft) hits markers
    // that are gone (and selects a peak instead of adding it).
    scheduler.flush()
    const hitIdx = nearestPoint(peakPx.current, d.startX, d.startY, 8)
    // PointerEvent.detail is 0 in Chromium, so detect double-clicks ourselves.
    // Use when the click happened, not when it is handled: a busy main thread
    // must not turn two separate clicks into a double-click.
    const now = e.timeStamp || performance.now()
    const prev = lastClick.current
    const isDouble = !!prev && now - prev.t < 300 && Math.hypot(prev.x - d.startX, prev.y - d.startY) < 6
    lastClick.current = isDouble ? null : { t: now, x: d.startX, y: d.startY }
    if (isDouble) {
      window.clearTimeout(clickTimer.current)
      pendingClick.current = null
      if (hitIdx < 0) resetView()
      return
    }
    // A new single click: the previous one cannot become a double-click.
    if (pendingClick.current) {
      window.clearTimeout(clickTimer.current)
      const run = pendingClick.current
      pendingClick.current = null
      run()
    }
    const info = makeClick(d.startX, e)
    if (hitIdx >= 0) {
      const p = (peakPx.current[hitIdx] as PxPoint & { peak: TracePeak }).peak
      latest.current.props.onPeakClick?.(p, info)
      return
    }
    const cb = latest.current.props.onBackgroundClick
    if (cb) {
      const run = () => cb(info)
      pendingClick.current = run
      clickTimer.current = window.setTimeout(() => {
        pendingClick.current = null
        run()
      }, CLICK_DELAY)
    }
  }

  const onPointerLeave = () => {
    hover.current = null
    overlayScheduler.request()
  }

  // Wheel must be non-passive to stop page scroll.
  useEffect(() => {
    const el = overRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const { x: px, y: py } = localXY(e)
      const { r, x } = geometry()
      if (!inRect(r, px, py)) return
      e.preventDefault()
      const L = latest.current
      const dx = wheelPixels(e.deltaX, e.deltaMode)
      const dy = wheelPixels(e.deltaY, e.deltaMode)
      if (e.altKey) {
        const { yTop } = geometry()
        setYLock(Math.max(10, yTop * wheelZoomFactor(dy)))
        return
      }
      if (Math.abs(dx) > Math.abs(dy) || e.shiftKey) {
        const delta = pixelsToData(view.current.x, r.w, Math.abs(dx) > Math.abs(dy) ? dx : dy)
        setX(panDomain(view.current.x, delta, L.bounds))
        return
      }
      setX(zoomDomain(view.current.x, x.invert(px), wheelZoomFactor(dy), L.bounds, L.minSpan))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [geometry, setX, setYLock])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const L = latest.current
    const d = view.current.x
    const span = d[1] - d[0]
    const center = (d[0] + d[1]) / 2
    const step = e.shiftKey ? 0.5 : 0.1
    let handled = true
    switch (e.key) {
      case 'ArrowLeft':
        setX(panDomain(d, -span * step, L.bounds))
        break
      case 'ArrowRight':
        setX(panDomain(d, span * step, L.bounds))
        break
      case '+':
      case '=':
        setX(zoomDomain(d, center, 0.7, L.bounds, L.minSpan))
        break
      case '-':
      case '_':
        setX(zoomDomain(d, center, 1 / 0.7, L.bounds, L.minSpan))
        break
      case 'ArrowUp':
        setYLock(Math.max(10, geometry().yTop * 0.8))
        break
      case 'ArrowDown':
        setYLock(geometry().yTop * 1.25)
        break
      case 'a':
        setYLock(null)
        break
      case '0':
      case 'Home':
        resetView()
        break
      default:
        handled = false
    }
    if (handled) e.preventDefault()
  }

  const zoomBy = (f: number) => {
    const d = view.current.x
    setX(zoomDomain(d, (d[0] + d[1]) / 2, f, latest.current.bounds, latest.current.minSpan))
  }

  return (
    <div
      ref={boxRef}
      className={cn('relative min-h-0 min-w-0 overflow-hidden rounded-sm bg-[var(--plot-bg)] outline-none', className)}
      tabIndex={0}
      role="img"
      aria-label={ariaLabel}
      aria-roledescription="interactive plot"
      onKeyDown={onKeyDown}
      data-testid="trace-viewer"
    >
      <canvas ref={baseRef} className="absolute inset-0 h-full w-full" />
      <canvas
        ref={overRef}
        className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onPointerLeave={onPointerLeave}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div
        ref={tipRef}
        className="pointer-events-none absolute top-0 left-0 z-10 hidden rounded border border-line bg-surface/95 px-2 py-1 text-2xs leading-4 text-fg shadow-md backdrop-blur-sm"
      />
      {showControls && (
        <div className="absolute top-7 right-4 z-10 flex items-center gap-0.5 rounded border border-line bg-surface/90 p-0.5 opacity-70 shadow-sm transition-opacity hover:opacity-100">
          <PlotButton label="Zoom in (+)" onClick={() => zoomBy(0.6)}>
            <ZoomIn size={13} />
          </PlotButton>
          <PlotButton label="Zoom out (−)" onClick={() => zoomBy(1 / 0.6)}>
            <ZoomOut size={13} />
          </PlotButton>
          <PlotButton label="Reset view (double-click, 0)" onClick={resetView}>
            <Maximize2 size={12} />
          </PlotButton>
        </div>
      )}
    </div>
  )
}

function PlotButton(props: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      tabIndex={-1}
      className="grid size-5 place-items-center rounded-sm text-muted hover:bg-surface-3 hover:text-fg"
    >
      {props.children}
    </button>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
}

/** Peak marker glyphs. Shape carries the state so it survives color blindness. */
export function drawPeakMarker(ctx: CanvasRenderingContext2D, t: PlotTheme, state: PeakState, px: number, py: number, color: string) {
  ctx.save()
  ctx.lineWidth = 1.5
  switch (state) {
    case 'called':
      ctx.fillStyle = color
      ctx.strokeStyle = t.bg
      ctx.beginPath()
      ctx.arc(px, py, 4.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      break
    case 'manual-on':
      ctx.fillStyle = color
      ctx.strokeStyle = t.select
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(px, py, 4.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(px, py, 7.5, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'manual-off':
      ctx.strokeStyle = t.muted
      ctx.beginPath()
      ctx.arc(px, py, 4.5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(px - 4, py - 4)
      ctx.lineTo(px + 4, py + 4)
      ctx.moveTo(px + 4, py - 4)
      ctx.lineTo(px - 4, py + 4)
      ctx.stroke()
      break
    case 'artifact':
      // Hollow down-triangle: "explained by another peak".
      ctx.strokeStyle = color
      ctx.fillStyle = t.bg
      ctx.beginPath()
      ctx.moveTo(px - 4.5, py - 4)
      ctx.lineTo(px + 4.5, py - 4)
      ctx.lineTo(px, py + 4)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    case 'flagged':
      ctx.strokeStyle = t.warn
      ctx.fillStyle = t.bg
      ctx.beginPath()
      ctx.moveTo(px, py - 5)
      ctx.lineTo(px + 5, py)
      ctx.lineTo(px, py + 5)
      ctx.lineTo(px - 5, py)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    case 'below':
      ctx.fillStyle = t.muted
      ctx.beginPath()
      ctx.arc(px, py, 2, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'out-of-bin':
      // Hollow square: a real peak that no bin claims.
      ctx.strokeStyle = color
      ctx.fillStyle = t.bg
      ctx.beginPath()
      ctx.rect(px - 3.5, py - 3.5, 7, 7)
      ctx.fill()
      ctx.stroke()
      break
    case 'candidate':
      ctx.strokeStyle = withAlpha(color, 0.9)
      ctx.fillStyle = t.bg
      ctx.beginPath()
      ctx.arc(px, py, 3.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      break
  }
  ctx.restore()
}

/**
 * Expected artifact height at a peak: an error bar (±1 SD) with a bold tick
 * at the expectation, in a neutral color so it never reads as signal.
 */
function drawExpectedArtifact(
  ctx: CanvasRenderingContext2D,
  t: PlotTheme,
  px: number,
  y: (v: number) => number,
  height: number,
  error: number,
  r: Rect,
) {
  const top = Math.max(r.y, y(height + error))
  const bottom = Math.min(r.y + r.h, y(Math.max(0, height - error)))
  const mid = y(Math.max(0, height))
  ctx.save()
  ctx.fillStyle = withAlpha(t.fg, t.dark ? 0.16 : 0.1)
  ctx.fillRect(px - 6, top, 12, Math.max(1, bottom - top))
  ctx.strokeStyle = withAlpha(t.fg, t.dark ? 0.75 : 0.6)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(Math.round(px) + 0.5, top)
  ctx.lineTo(Math.round(px) + 0.5, bottom)
  ctx.moveTo(px - 4, Math.round(top) + 0.5)
  ctx.lineTo(px + 4, Math.round(top) + 0.5)
  ctx.moveTo(px - 4, Math.round(bottom) + 0.5)
  ctx.lineTo(px + 4, Math.round(bottom) + 0.5)
  ctx.stroke()
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(px - 8, mid)
  ctx.lineTo(px + 8, mid)
  ctx.stroke()
  ctx.restore()
}

function drawLegend(ctx: CanvasRenderingContext2D, t: PlotTheme, r: Rect, series: readonly TraceSeries[]) {
  const items = series.filter((s) => !s.hidden && !s.overlay && s.label)
  const overlays = series.filter((s) => !s.hidden && s.overlay).length
  if (items.length <= 1 && overlays === 0) return
  ctx.save()
  ctx.font = t.font
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  let x = r.x + 8
  const y = r.y + 26
  const entries = items.map((s) => ({ text: s.label as string, color: resolveColor(t, s.color), faded: false }))
  if (overlays) entries.push({ text: `+${overlays} overlay${overlays > 1 ? 's' : ''}`, color: t.overlay, faded: true })
  const totalW = entries.reduce((w, e) => w + ctx.measureText(e.text).width + 24, 0)
  ctx.fillStyle = withAlpha(t.bg, 0.85)
  ctx.fillRect(x - 4, y - 8, totalW, 16)
  for (const e of entries) {
    ctx.strokeStyle = e.faded ? withAlpha(e.color, 0.6) : e.color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 12, y)
    ctx.stroke()
    ctx.fillStyle = t.text
    ctx.fillText(e.text, x + 16, y)
    x += ctx.measureText(e.text).width + 24
  }
  ctx.restore()
}
