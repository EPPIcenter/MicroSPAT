/** Artifact equation geometry and breakpoint edits. */

/** One fitted line over [start, end] of main-peak size (bp). */
export interface ArtifactSegment {
  start: number
  end: number
  slope: number
  intercept: number
  /** Residual standard deviation, in the y units (relative height). */
  sd: number
}

export function segmentY(s: ArtifactSegment, x: number): number {
  return s.slope * x + s.intercept
}

/** Insert a breakpoint, keeping order; ignored within `minGap` of another. */
export function addBreakpoint(bps: readonly number[], x: number, minGap = 0.5): number[] {
  const r = Math.round(x * 100) / 100
  if (bps.some((b) => Math.abs(b - r) < minGap)) return [...bps]
  return [...bps, r].sort((a, b) => a - b)
}

export function removeBreakpoint(bps: readonly number[], x: number): number[] {
  return bps.filter((b) => b !== x)
}

/** Index of the breakpoint within `tolPx` of pixel x, or -1. */
export function hitBreakpoint(bpsPx: readonly number[], px: number, tolPx = 5): number {
  let best = -1
  let bestD = tolPx
  bpsPx.forEach((b, i) => {
    const d = Math.abs(b - px)
    if (d <= bestD) {
      bestD = d
      best = i
    }
  })
  return best
}
