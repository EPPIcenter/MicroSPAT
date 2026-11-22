/**
 * Linear scales and view-domain math shared by every canvas plot.
 *
 * Plots keep their x view as a `[lo, hi]` domain in data units. Zoom and pan
 * are pure functions on that domain, clamped to the data bounds, so the
 * interaction code stays small and the math is unit-tested.
 */
import { scaleLinear } from 'd3-scale'

export type Domain = readonly [number, number]

export interface Scale {
  (v: number): number
  invert(px: number): number
  domain: Domain
  range: Domain
  ticks(count: number): number[]
}

/** A linear map from `domain` to `range` (pixels). */
export function linear(domain: Domain, range: Domain): Scale {
  const [d0, d1] = domain
  const [r0, r1] = range
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0)
  const f = ((v: number) => r0 + (v - d0) * k) as Scale
  f.invert = (px: number) => (k === 0 ? d0 : d0 + (px - r0) / k)
  f.domain = domain
  f.range = range
  f.ticks = (count: number) => scaleLinear().domain([d0, d1]).ticks(count)
  return f
}

/** Tick label formatter with as many decimals as the tick step needs. */
export function tickFormat(ticks: number[]): (v: number) => string {
  if (ticks.length < 2) return (v) => String(+v.toPrecision(6))
  const step = Math.abs((ticks[1] ?? 0) - (ticks[0] ?? 0))
  const decimals = step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step) - 1e-9))
  const big = Math.max(...ticks.map(Math.abs)) >= 10000
  return (v) => {
    if (big && decimals === 0) {
      return Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v.toFixed(0)
    }
    return v.toFixed(decimals)
  }
}

/**
 * Clamp a domain into `bounds` keeping its span, and keep the span between
 * `minSpan` and the bounds' span.
 */
export function clampDomain(d: Domain, bounds: Domain, minSpan = 0): [number, number] {
  const full = bounds[1] - bounds[0]
  let span = Math.max(d[1] - d[0], Math.min(minSpan, full))
  span = Math.min(span, full)
  let lo = d[0]
  // Keep the center when the span had to grow to minSpan.
  if (d[1] - d[0] < span) lo = (d[0] + d[1]) / 2 - span / 2
  lo = Math.max(bounds[0], Math.min(lo, bounds[1] - span))
  return [lo, lo + span]
}

/**
 * Zoom by `factor` (<1 zooms in) keeping the data value `anchor` fixed on
 * screen.
 */
export function zoomDomain(d: Domain, anchor: number, factor: number, bounds: Domain, minSpan = 0): [number, number] {
  const lo = anchor - (anchor - d[0]) * factor
  const hi = anchor + (d[1] - anchor) * factor
  if (hi - lo < minSpan) {
    // Hold the anchor's relative position while respecting minSpan.
    const t = d[1] === d[0] ? 0.5 : (anchor - d[0]) / (d[1] - d[0])
    return clampDomain([anchor - t * minSpan, anchor + (1 - t) * minSpan], bounds, minSpan)
  }
  return clampDomain([lo, hi], bounds, minSpan)
}

/** Shift the domain by `delta` data units, stopping at the bounds. */
export function panDomain(d: Domain, delta: number, bounds: Domain): [number, number] {
  return clampDomain([d[0] + delta, d[1] + delta], bounds)
}

/** Convert a pixel drag distance into a data-unit pan delta. */
export function pixelsToData(d: Domain, widthPx: number, px: number): number {
  return widthPx <= 0 ? 0 : (px / widthPx) * (d[1] - d[0])
}

/** Normalize a wheel event's delta to pixels (line / page modes). */
export function wheelPixels(deltaY: number, deltaMode: number): number {
  return deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY
}

/** Zoom factor for a wheel delta in pixels: smooth and symmetric. */
export function wheelZoomFactor(deltaPx: number): number {
  return Math.exp(Math.max(-1, Math.min(1, deltaPx * 0.0025)))
}

export function domainsEqual(a: Domain, b: Domain, eps = 1e-9): boolean {
  return Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps
}
