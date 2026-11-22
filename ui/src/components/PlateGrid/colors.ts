/**
 * Well coloring. Status: ok / flagged / failed ladder sizing. Signal: a
 * continuous scale from no signal (red) through low (amber) and good (green)
 * to strong (blue) and off-scale (violet), as in the old plate QA view.
 */

export type WellStatus = 'ok' | 'flagged' | 'failed' | 'empty'

export interface SignalScale {
  /** Below this: no signal. */
  none: number
  /** Start of the good range. */
  good: number
  /** End of the good range: strong signal. */
  strong: number
  /** At or above: off-scale (saturated detector). */
  offscale: number
}

export const DEFAULT_SIGNAL_SCALE: SignalScale = { none: 100, good: 1000, strong: 12000, offscale: 30000 }

export type SignalBand = 'none' | 'low' | 'good' | 'high' | 'off'

export function signalBand(v: number | null | undefined, s: SignalScale = DEFAULT_SIGNAL_SCALE): SignalBand {
  if (v == null || !Number.isFinite(v) || v < s.none) return 'none'
  if (v < s.good) return 'low'
  if (v < s.strong) return 'good'
  if (v < s.offscale) return 'high'
  return 'off'
}

/** Position 0..1 of v on a log scale from `none` to `offscale`. */
export function signalPosition(v: number | null | undefined, s: SignalScale = DEFAULT_SIGNAL_SCALE): number {
  if (v == null || !Number.isFinite(v) || v <= s.none) return 0
  if (v >= s.offscale) return 1
  return Math.log(v / s.none) / Math.log(s.offscale / s.none)
}

const STOPS: { at: (s: SignalScale) => number; varName: string }[] = [
  { at: () => 0, varName: '--scale-none' },
  { at: (s) => signalPosition(s.good, s) * 0.85, varName: '--scale-low' },
  { at: (s) => (signalPosition(s.good, s) + signalPosition(s.strong, s)) / 2, varName: '--scale-good' },
  { at: (s) => signalPosition(s.strong, s), varName: '--scale-high' },
  { at: () => 1, varName: '--scale-off' },
]

/**
 * CSS color for a signal: color-mix between the theme's scale stops.
 * `null` means measured but no signal (red); `undefined` means not measured.
 */
export function signalColor(v: number | null | undefined, s: SignalScale = DEFAULT_SIGNAL_SCALE): string {
  if (v === undefined || (v !== null && !Number.isFinite(v))) return 'var(--c-surface-3)'
  if (v === null) return 'var(--scale-none)'
  const t = signalPosition(v, s)
  for (let i = 1; i < STOPS.length; i++) {
    const a = STOPS[i - 1]!
    const b = STOPS[i]!
    const ta = a.at(s)
    const tb = b.at(s)
    if (t <= tb) {
      const k = tb === ta ? 1 : (t - ta) / (tb - ta)
      return `color-mix(in oklab, var(${a.varName}) ${Math.round((1 - k) * 100)}%, var(${b.varName}))`
    }
  }
  return 'var(--scale-off)'
}

/**
 * CSS color at position t (0..1) of a ramp of evenly spaced theme variables,
 * e.g. `rampColor(0.3, ['--scale-good', '--scale-low', '--scale-none'])`, so
 * custom fills follow the light and dark themes.
 */
export function rampColor(t: number, vars: readonly string[]): string {
  if (!vars.length) return 'var(--c-surface-3)'
  if (vars.length === 1 || !Number.isFinite(t)) return `var(${vars[0]})`
  const x = Math.max(0, Math.min(1, t)) * (vars.length - 1)
  const i = Math.min(vars.length - 2, Math.floor(x))
  const k = x - i
  if (k <= 0) return `var(${vars[i]})`
  if (k >= 1) return `var(${vars[i + 1]})`
  return `color-mix(in oklab, var(${vars[i]}) ${Math.round((1 - k) * 100)}%, var(${vars[i + 1]}))`
}

export const STATUS_COLOR: Record<WellStatus, string> = {
  ok: 'var(--c-ok)',
  flagged: 'var(--c-warn)',
  failed: 'var(--c-danger)',
  empty: 'var(--c-surface-3)',
}

export const STATUS_LABEL: Record<WellStatus, string> = {
  ok: 'Ladder OK',
  flagged: 'Flagged',
  failed: 'Failed',
  empty: 'No data',
}
