/** Plot colors, read from the CSS tokens so canvases follow the app theme. */
import { useMemo } from 'react'
import type { Color } from '@/api/bindings'
import { useThemeStore } from '@/stores/theme'

export interface PlotTheme {
  dark: boolean
  bg: string
  grid: string
  axis: string
  text: string
  bin: string
  range: string
  threshold: string
  select: string
  overlay: string
  fg: string
  muted: string
  danger: string
  warn: string
  ok: string
  dyes: Record<Color, string>
  font: string
  monoFont: string
}

function v(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const s = style.getPropertyValue(name).trim()
  return s || fallback
}

export function readPlotTheme(): PlotTheme {
  const root = document.documentElement
  const s = getComputedStyle(root)
  return {
    dark: root.classList.contains('dark'),
    bg: v(s, '--plot-bg', '#ffffff'),
    grid: v(s, '--plot-grid', '#eeeeee'),
    axis: v(s, '--plot-axis', '#888888'),
    text: v(s, '--plot-text', '#444444'),
    bin: v(s, '--plot-bin', '#5b7fbf'),
    range: v(s, '--plot-range', '#888888'),
    threshold: v(s, '--plot-threshold', '#c62f2f'),
    select: v(s, '--plot-select', '#2f6fdb'),
    overlay: v(s, '--plot-overlay', '#999999'),
    fg: v(s, '--c-fg', '#111111'),
    muted: v(s, '--c-muted', '#666666'),
    danger: v(s, '--c-danger', '#c62f2f'),
    warn: v(s, '--c-warn', '#a86a00'),
    ok: v(s, '--c-ok', '#1e8a4c'),
    dyes: {
      blue: v(s, '--dye-blue', '#1764c0'),
      green: v(s, '--dye-green', '#08946b'),
      yellow: v(s, '--dye-yellow', '#a88400'),
      red: v(s, '--dye-red', '#d01c4b'),
      orange: v(s, '--dye-orange', '#e2690c'),
    },
    font: '11px Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
    monoFont: '10px ui-monospace, SFMono-Regular, Menlo, monospace',
  }
}

/** Current plot theme; recomputed when the app theme flips. */
export function usePlotTheme(): PlotTheme {
  const dark = useThemeStore((s) => s.dark)
  return useMemo(() => readPlotTheme(), [dark])
}

/** Resolve a dye name or any CSS color. */
export function resolveColor(theme: PlotTheme, c: string): string {
  return (theme.dyes as Record<string, string>)[c] ?? c
}

/** `#rrggbb` + alpha -> rgba(). Other color syntaxes pass through. */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return color
  const n = parseInt(m[1] as string, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
