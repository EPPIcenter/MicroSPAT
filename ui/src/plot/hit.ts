/** Pixel-space hit testing for canvas plots. */

export interface PxPoint {
  px: number
  py: number
}

/**
 * Index of the point nearest to (x, y) within `radius` px, or -1. Ties go to
 * the later point, which is drawn on top.
 */
export function nearestPoint(points: readonly PxPoint[], x: number, y: number, radius: number): number {
  let best = -1
  let bestD = radius * radius
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as PxPoint
    const dx = p.px - x
    const dy = p.py - y
    const d = dx * dx + dy * dy
    if (d <= bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** Index of the point nearest in x only, within `radius` px, or -1. */
export function nearestX(pxs: readonly number[], x: number, radius: number): number {
  let best = -1
  let bestD = radius
  for (let i = 0; i < pxs.length; i++) {
    const d = Math.abs((pxs[i] as number) - x)
    if (d <= bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

export interface BandPx {
  lo: number
  hi: number
}

export type BandPart = 'body' | 'left' | 'right'

export interface BandHit {
  index: number
  part: BandPart
}

/**
 * Which band (bin) is under x. Edges win over bodies within `edgeTol` px so a
 * thin bin can still be resized; among overlapping bodies the narrowest wins.
 * `preferIndex` (the selected band) wins ties.
 */
export function hitBand(bands: readonly BandPx[], x: number, edgeTol = 4, preferIndex = -1): BandHit | null {
  let edge: BandHit | null = null
  let edgeD = edgeTol + 1
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i] as BandPx
    const dl = Math.abs(x - b.lo)
    const dr = Math.abs(x - b.hi)
    const bonus = i === preferIndex ? 0.5 : 0
    if (dl <= edgeTol && dl - bonus < edgeD) {
      edgeD = dl - bonus
      edge = { index: i, part: 'left' }
    }
    if (dr <= edgeTol && dr - bonus < edgeD) {
      edgeD = dr - bonus
      edge = { index: i, part: 'right' }
    }
  }
  if (edge) return edge
  let body: BandHit | null = null
  let bodyW = Infinity
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i] as BandPx
    if (x >= b.lo && x <= b.hi) {
      const w = b.hi - b.lo - (i === preferIndex ? 1e6 : 0)
      if (w < bodyW) {
        bodyW = w
        body = { index: i, part: 'body' }
      }
    }
  }
  return body
}
