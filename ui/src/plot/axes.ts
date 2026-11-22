/** Axis, grid and label drawing shared by the canvas plots. */
import type { PlotTheme } from './theme'
import { tickFormat, type Scale } from './scale'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Margins {
  top: number
  right: number
  bottom: number
  left: number
}

export function plotRect(width: number, height: number, m: Margins): Rect {
  return { x: m.left, y: m.top, w: Math.max(1, width - m.left - m.right), h: Math.max(1, height - m.top - m.bottom) }
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

export interface AxesOptions {
  xLabel?: string
  yLabel?: string
  xTicks?: number
  yTicks?: number
}

/** Grid lines, tick labels and axis titles. Call before drawing data. */
export function drawAxes(ctx: CanvasRenderingContext2D, r: Rect, x: Scale, y: Scale, t: PlotTheme, o: AxesOptions = {}) {
  const xt = x.ticks(o.xTicks ?? Math.max(2, Math.floor(r.w / 80)))
  const yt = y.ticks(o.yTicks ?? Math.max(2, Math.floor(r.h / 40)))
  const xf = tickFormat(xt)
  const yf = tickFormat(yt)

  ctx.save()
  ctx.fillStyle = t.bg
  ctx.fillRect(r.x, r.y, r.w, r.h)

  ctx.strokeStyle = t.grid
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const v of xt) {
    const px = Math.round(x(v)) + 0.5
    if (px < r.x || px > r.x + r.w) continue
    ctx.moveTo(px, r.y)
    ctx.lineTo(px, r.y + r.h)
  }
  for (const v of yt) {
    const py = Math.round(y(v)) + 0.5
    if (py < r.y || py > r.y + r.h) continue
    ctx.moveTo(r.x, py)
    ctx.lineTo(r.x + r.w, py)
  }
  ctx.stroke()

  ctx.strokeStyle = t.axis
  ctx.beginPath()
  ctx.moveTo(r.x + 0.5, r.y)
  ctx.lineTo(r.x + 0.5, r.y + r.h + 0.5)
  ctx.lineTo(r.x + r.w, r.y + r.h + 0.5)
  ctx.stroke()

  ctx.fillStyle = t.text
  ctx.font = t.font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  let lastRight = -Infinity
  for (const v of xt) {
    const px = x(v)
    if (px < r.x - 1 || px > r.x + r.w + 1) continue
    const label = xf(v)
    const w = ctx.measureText(label).width
    if (px - w / 2 < lastRight + 6) continue
    ctx.fillText(label, px, r.y + r.h + 4)
    lastRight = px + w / 2
  }
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (const v of yt) {
    const py = y(v)
    if (py < r.y - 1 || py > r.y + r.h + 1) continue
    ctx.fillText(yf(v), r.x - 5, py)
  }

  if (o.xLabel) {
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.fillStyle = t.muted
    ctx.fillText(o.xLabel, r.x + r.w, r.y + r.h + 18)
  }
  if (o.yLabel) {
    ctx.translate(12, r.y)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = t.muted
    ctx.fillText(o.yLabel, 0, 0)
  }
  ctx.restore()
}

/** Clip subsequent drawing to the plot area. Pair with ctx.restore(). */
export function clipTo(ctx: CanvasRenderingContext2D, r: Rect) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x, r.y, r.w, r.h)
  ctx.clip()
}

/** Text with a halo so it reads over traces. */
export function haloText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, halo: string) {
  ctx.save()
  ctx.lineWidth = 3
  ctx.strokeStyle = halo
  ctx.lineJoin = 'round'
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
  ctx.restore()
}
