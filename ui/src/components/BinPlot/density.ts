/**
 * Density rendering for large scatters. Points are counted into a grid of
 * small cells and each occupied cell is painted with an opacity that grows
 * with the log of its count, so a lone peak stays visible and a pile of
 * thousands still shows its shape instead of saturating into one blob.
 * Cost is O(points + cells) per redraw, independent of overdraw.
 */

/** Opacity of a cell holding `count` points when the densest holds `max`. */
export function densityAlpha(count: number, max: number, floor = 0.28): number {
  if (count <= 0) return 0
  if (max <= 1) return 1
  return floor + (1 - floor) * (Math.log1p(count - 1) / Math.log1p(max - 1))
}

export interface DensityGrid {
  /** Columns and rows of the grid. */
  w: number
  h: number
  counts: Uint32Array
  max: number
}

/**
 * Count points into cells. `px`/`py` map data to pixels relative to the grid
 * origin; points outside the grid are skipped.
 */
export function densityGrid(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  px: (x: number) => number,
  py: (y: number) => number,
  widthPx: number,
  heightPx: number,
  cell: number,
): DensityGrid {
  const w = Math.max(1, Math.ceil(widthPx / cell))
  const h = Math.max(1, Math.ceil(heightPx / cell))
  const counts = new Uint32Array(w * h)
  let max = 0
  const n = Math.min(xs.length, ys.length)
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(px(xs[i] as number) / cell)
    if (cx < 0 || cx >= w) continue
    const cy = Math.floor(py(ys[i] as number) / cell)
    if (cy < 0 || cy >= h) continue
    const k = cy * w + cx
    const c = ++counts[k]!
    if (c > max) max = c
  }
  return { w, h, counts, max }
}

/** `#rrggbb` → [r, g, b]; anything else → a neutral blue. */
export function hexRgb(color: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return [47, 111, 219]
  const n = parseInt(m[1] as string, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Paint a grid into an RGBA buffer (one pixel per cell). */
export function paintDensity(g: DensityGrid, rgb: [number, number, number], out: Uint8ClampedArray): void {
  const [r, gg, b] = rgb
  for (let k = 0; k < g.counts.length; k++) {
    const c = g.counts[k]!
    const o = k * 4
    if (c === 0) {
      out[o + 3] = 0
      continue
    }
    out[o] = r
    out[o + 1] = gg
    out[o + 2] = b
    out[o + 3] = Math.round(255 * densityAlpha(c, g.max))
  }
}
