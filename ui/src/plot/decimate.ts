/**
 * Trace decimation for canvas line drawing.
 *
 * A CE trace has ~10,000 points per dye; a plot is ~1,000 px wide. When more
 * than two points fall in a pixel column we keep, per column, the first,
 * minimum, maximum and last point in index order (the M4 method). Drawing
 * those gives the same pixels as drawing every point, so narrow peaks never
 * vanish when zoomed out, at a cost of at most 4 points per column.
 */

export type NumArray = ArrayLike<number>

/** First index i with xs[i] >= v (xs ascending). */
export function lowerBound(xs: NumArray, v: number, lo = 0, hi = xs.length): number {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if ((xs[mid] as number) < v) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** First index i with xs[i] > v (xs ascending). */
export function upperBound(xs: NumArray, v: number, lo = 0, hi = xs.length): number {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if ((xs[mid] as number) <= v) lo = mid + 1
    else hi = mid
  }
  return lo
}

const monotonicCache = new WeakMap<object, boolean>()

/** True when xs never decreases. Cached per array object. */
export function isMonotonic(xs: NumArray): boolean {
  const key = xs as unknown as object
  const hit = monotonicCache.get(key)
  if (hit !== undefined) return hit
  let ok = true
  for (let i = 1; i < xs.length; i++) {
    if ((xs[i] as number) < (xs[i - 1] as number)) {
      ok = false
      break
    }
  }
  monotonicCache.set(key, ok)
  return ok
}

/**
 * Index range `[i0, i1)` of the points to draw for the x window `[lo, hi]`,
 * including one point past each edge so the line reaches the plot border.
 * `xs` null means x is the point index.
 */
export function visibleRange(xs: NumArray | null, n: number, lo: number, hi: number): [number, number] {
  if (n === 0) return [0, 0]
  if (!xs) {
    return [Math.max(0, Math.floor(lo) - 1), Math.min(n, Math.ceil(hi) + 1)]
  }
  if (!isMonotonic(xs)) return [0, n]
  const i0 = Math.max(0, lowerBound(xs, lo) - 1)
  const i1 = Math.min(n, upperBound(xs, hi) + 1)
  return [i0, Math.max(i0, i1)]
}

export interface Decimated {
  /** Flat pairs: [px0, y0, px1, y1, ...]; x already in pixels, y in data units. */
  points: Float64Array
  count: number
}

/**
 * Decimate `ys[i0..i1)` for drawing. `xToPx` maps data x to pixels. Returns
 * all points when they are sparse enough to draw directly.
 */
export function decimate(
  ys: NumArray,
  xs: NumArray | null,
  i0: number,
  i1: number,
  xToPx: (x: number) => number,
  widthPx: number,
): Decimated {
  const n = Math.max(0, i1 - i0)
  const xAt = xs ? (i: number) => xs[i] as number : (i: number) => i
  if (n <= Math.max(2, widthPx * 2)) {
    const points = new Float64Array(n * 2)
    for (let k = 0; k < n; k++) {
      const i = i0 + k
      points[2 * k] = xToPx(xAt(i))
      points[2 * k + 1] = ys[i] as number
    }
    return { points, count: n }
  }

  // At most 4 points per column, plus slack for columns revisited when xs is
  // not monotonic.
  const cap = Math.min(n, (Math.ceil(widthPx) + 4) * 4) + 8
  let points = new Float64Array(cap * 2)
  let count = 0
  const push = (px: number, y: number) => {
    if (count * 2 + 2 > points.length) {
      const bigger = new Float64Array(points.length * 2)
      bigger.set(points)
      points = bigger
    }
    points[2 * count] = px
    points[2 * count + 1] = y
    count++
  }

  let col = Math.floor(xToPx(xAt(i0)))
  let firstI = i0
  let lastI = i0
  let minI = i0
  let maxI = i0
  const flush = () => {
    // Emit first, min, max, last in index order without duplicates.
    const idx = [firstI, minI, maxI, lastI].sort((a, b) => a - b)
    let prev = -1
    for (const i of idx) {
      if (i === prev) continue
      prev = i
      push(xToPx(xAt(i)), ys[i] as number)
    }
  }
  for (let i = i0 + 1; i < i1; i++) {
    const c = Math.floor(xToPx(xAt(i)))
    if (c !== col) {
      flush()
      col = c
      firstI = lastI = minI = maxI = i
      continue
    }
    lastI = i
    const y = ys[i] as number
    if (y < (ys[minI] as number)) minI = i
    if (y > (ys[maxI] as number)) maxI = i
  }
  flush()
  return { points, count }
}

/** Maximum of ys over [i0, i1). Returns 0 for an empty range. */
export function rangeMax(ys: NumArray, i0: number, i1: number): number {
  let m = -Infinity
  for (let i = Math.max(0, i0); i < Math.min(ys.length, i1); i++) {
    const y = ys[i] as number
    if (y > m) m = y
  }
  return m === -Infinity ? 0 : m
}

/** Index of the largest value within `radius` points of `center`. */
export function localMaxIndex(ys: NumArray, center: number, radius: number): number {
  const lo = Math.max(0, Math.round(center) - radius)
  const hi = Math.min(ys.length - 1, Math.round(center) + radius)
  let best = Math.max(0, Math.min(ys.length - 1, Math.round(center)))
  for (let i = lo; i <= hi; i++) if ((ys[i] as number) > (ys[best] as number)) best = i
  return best
}

/** Data-point index whose x is closest to `x`. */
export function nearestIndex(xs: NumArray | null, n: number, x: number): number {
  if (n === 0) return 0
  if (!xs) return Math.max(0, Math.min(n - 1, Math.round(x)))
  if (isMonotonic(xs)) {
    const i = lowerBound(xs, x)
    if (i <= 0) return 0
    if (i >= n) return n - 1
    return x - (xs[i - 1] as number) <= (xs[i] as number) - x ? i - 1 : i
  }
  let best = 0
  for (let i = 1; i < n; i++) if (Math.abs((xs[i] as number) - x) < Math.abs((xs[best] as number) - x)) best = i
  return best
}

/** Linear interpolation of xs at fractional index `idx` (index -> bp). */
export function interpAt(xs: NumArray, idx: number): number {
  const n = xs.length
  if (n === 0) return idx
  const i = Math.max(0, Math.min(n - 1, Math.floor(idx)))
  const j = Math.min(n - 1, i + 1)
  const t = idx - i
  return (xs[i] as number) + ((xs[j] as number) - (xs[i] as number)) * t
}

/** Fractional index at which ascending xs reaches `x` (bp -> index). */
export function invertInterp(xs: NumArray, x: number): number {
  const n = xs.length
  if (n === 0) return x
  const i = lowerBound(xs, x)
  if (i <= 0) return 0
  if (i >= n) return n - 1
  const a = xs[i - 1] as number
  const b = xs[i] as number
  return b === a ? i : i - 1 + (x - a) / (b - a)
}
