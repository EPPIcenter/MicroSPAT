/**
 * Geometry of the bias plots: data domains, pixel positions and hit testing.
 * Pure, so the canvas components stay thin and this is unit-tested.
 */
import type { QuantBiasPoint } from '@/api/bindings'
import { linear, type Domain, type Scale } from '@/plot/scale'
import { nearestPoint, type PxPoint } from '@/plot/hit'
import type { Rect } from '@/plot/axes'

/**
 * Domains of the regression plot (x: size offset in bp, y: log-odds error).
 * Symmetric around 0 on both axes, so the origin the line passes through is
 * centered and the sign of each point reads at a glance. Covers every point
 * and the fitted line ± SD at the x extremes.
 */
export function regressionDomains(points: readonly Pick<QuantBiasPoint, 'centered_size' | 'log_odds_error'>[], beta: number | null, sd: number | null): { x: Domain; y: Domain } {
  let xm = 0
  let ym = 0
  for (const p of points) {
    if (p.log_odds_error == null || !Number.isFinite(p.log_odds_error)) continue
    xm = Math.max(xm, Math.abs(p.centered_size))
    ym = Math.max(ym, Math.abs(p.log_odds_error))
  }
  if (xm === 0) xm = 10
  xm *= 1.12
  if (beta != null) ym = Math.max(ym, Math.abs(beta * xm) + (sd ?? 0))
  if (ym === 0) ym = 0.1
  ym *= 1.15
  return { x: [-xm, xm], y: [-ym, ym] }
}

/** Scales for a plot rect: x left→right, y bottom→top. */
export function plotScales(r: Rect, x: Domain, y: Domain): { x: Scale; y: Scale } {
  return { x: linear(x, [r.x, r.x + r.w]), y: linear(y, [r.y + r.h, r.y]) }
}

/** Pixel position of every point (NaN for points that cannot be drawn). */
export function pixelPoints<T>(items: readonly T[], fx: (t: T) => number | null, fy: (t: T) => number | null, sx: Scale, sy: Scale): PxPoint[] {
  return items.map((t) => {
    const x = fx(t)
    const y = fy(t)
    return x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y) ? { px: NaN, py: NaN } : { px: sx(x), py: sy(y) }
  })
}

/** Index of the point under the cursor (within `radius` px), or -1. NaN points never match. */
export function hitPoint(px: readonly PxPoint[], x: number, y: number, radius = 7): number {
  return nearestPoint(px, x, y, radius)
}

/** Fitted line endpoints and the ±SD band corners, in data units, over a domain. */
export function fitGeometry(beta: number, sd: number, x: Domain) {
  const [x0, x1] = x
  return {
    line: [
      [x0, beta * x0],
      [x1, beta * x1],
    ] as const,
    band: [
      [x0, beta * x0 + sd],
      [x1, beta * x1 + sd],
      [x1, beta * x1 - sd],
      [x0, beta * x0 - sd],
    ] as const,
  }
}

/** Domain of the per-locus overview (β with its interval), symmetric enough to always show 0. */
export function overviewDomain(rows: readonly { beta: number | null; lo: number | null; hi: number | null }[]): Domain {
  let lo = 0
  let hi = 0
  for (const r of rows) {
    if (r.beta == null) continue
    lo = Math.min(lo, r.lo ?? r.beta, r.beta)
    hi = Math.max(hi, r.hi ?? r.beta, r.beta)
  }
  if (lo === hi) return [-0.01, 0.01]
  const pad = (hi - lo) * 0.1
  return [lo - pad, hi + pad]
}
