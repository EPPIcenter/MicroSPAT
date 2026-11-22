/**
 * Derivations for the plate list and the plate grid: sizing states, plate
 * health, and the per-well data the grid draws in Ladder and Signal mode.
 * Pure functions over engine types, so they are unit-tested.
 */
import type { Color, PlateDetail, PlateSummary, RunSummary, SizingCounts, SizingState, WellSummary } from '@/api/bindings'
import { COLORS } from '@/api/helpers'
import type { WellDatum } from '@/components/PlateGrid'
import { fmtFixed, fmtRfu } from '@/lib/format'

export const SIZING_STATES: readonly SizingState[] = ['good', 'flagged', 'unusable', 'failed']

export const SIZING_LABEL: Record<SizingState, string> = {
  good: 'Good',
  flagged: 'Flagged',
  unusable: 'Unusable',
  failed: 'Failed',
}

export const SIZING_HELP: Record<SizingState, string> = {
  good: 'Sizing quality within the ladder’s flag limit.',
  flagged: 'Usable, but worth a look: sizing quality above the flag limit, or some loci outside the sized range.',
  unusable: 'Fitted, but not trustworthy (too few ladder peaks, or sizing quality above the unusable limit); excluded from analysis.',
  failed: 'No ladder fit (too few ladder peaks or no ladder signal).',
}

export type Tone = 'ok' | 'warn' | 'danger' | 'neutral'

export const SIZING_TONE: Record<SizingState, Tone> = {
  good: 'ok',
  flagged: 'warn',
  unusable: 'danger',
  failed: 'danger',
}

/** Well fill per sizing state. Unusable is a muted red so it reads apart from failed. */
export const SIZING_FILL: Record<SizingState, string> = {
  good: 'var(--c-ok)',
  flagged: 'var(--c-warn)',
  unusable: 'color-mix(in oklab, var(--c-danger) 50%, var(--c-surface-3))',
  failed: 'var(--c-danger)',
}

export const SIZING_GLYPH: Record<SizingState, string | null> = {
  good: null,
  flagged: '!',
  unusable: '?',
  failed: '×',
}

/**
 * Corner flags. Ladder mode uses manual/draft, Signal mode control/contaminated.
 * Contamination is drawn in the foreground color, not red: a contaminated
 * well is usually colored by the red end of the signal scale already.
 */
export const MARKER = {
  manual: 'var(--c-accent)',
  draft: 'var(--c-fg)',
  contaminated: 'var(--c-fg)',
  control: 'var(--c-faint)',
} as const

/** Sizing quality as shown everywhere: 3 decimals, "–" when failed. */
export function fmtQuality(q: number | null | undefined): string {
  return q == null ? '–' : fmtFixed(q, 3)
}

/** Wells that need a look (anything not good). */
export function problemCount(c: SizingCounts): number {
  return c.flagged + c.unusable + c.failed
}

export interface PlateHealth {
  tone: Tone
  /** One short phrase for the list, e.g. "1 failed" or "all good". */
  text: string
}

/**
 * Overall state of a plate for the list. Contamination is the most serious
 * (it invalidates a locus on the whole plate); then wells that cannot be
 * used; then flagged wells.
 */
export function plateHealth(p: PlateSummary): PlateHealth {
  const s = p.sizing
  if (p.well_count === 0) return { tone: 'neutral', text: 'no wells' }
  const parts: string[] = []
  if (s.failed) parts.push(`${s.failed} failed`)
  if (s.unusable) parts.push(`${s.unusable} unusable`)
  if (s.flagged) parts.push(`${s.flagged} flagged`)
  const tone: Tone =
    p.contaminated_loci.length > 0 || s.failed + s.unusable > 0
      ? s.failed + s.unusable > p.well_count * 0.1 || p.contaminated_loci.length
        ? 'danger'
        : 'warn'
      : s.flagged
        ? 'warn'
        : 'ok'
  return { tone, text: parts.length ? parts.join(', ') : 'all good' }
}

/** "2026-03-18 09:30" from the engine's local ISO timestamp. */
export function fmtRunDate(iso: string | null | undefined): string {
  if (!iso) return '–'
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(iso)
  if (!m) return iso
  return m[2] ? `${m[1]} ${m[2]}` : (m[1] as string)
}

/** Why a well is not good, from the engine; null when good. */
export function wellReason(w: Pick<WellSummary, 'sizing_reason' | 'sizing_error'>): string | null {
  return w.sizing_reason ?? w.sizing_error ?? null
}

/**
 * Per sizing state, a few lines saying which wells and why ("A09: only 7
 * usable ladder peaks, need 16"), for the tooltip of the header counts.
 * Wells sharing a reason are listed together.
 */
export function stateReasons(wells: readonly WellSummary[], maxLines = 6): Partial<Record<SizingState, string>> {
  const by = new Map<SizingState, Map<string, string[]>>()
  for (const w of wells) {
    if (w.sizing === 'good') continue
    const reason = wellReason(w) ?? SIZING_HELP[w.sizing]
    const m = by.get(w.sizing) ?? new Map<string, string[]>()
    m.set(reason, [...(m.get(reason) ?? []), w.label])
    by.set(w.sizing, m)
  }
  const out: Partial<Record<SizingState, string>> = {}
  for (const [state, m] of by) {
    const lines = [...m].map(
      ([reason, labels]) =>
        `${labels.length > 3 ? `${labels.slice(0, 3).join(', ')} +${labels.length - 3}` : labels.join(', ')}: ${reason}`,
    )
    out[state] =
      lines.length > maxLines ? [...lines.slice(0, maxLines), `…and ${lines.length - maxLines} more`].join('\n') : lines.join('\n')
  }
  return out
}

/** Wells in row-major order whose sizing is not good. */
export function problemWells(wells: readonly WellSummary[]): string[] {
  return wells.filter((w) => w.sizing !== 'good').map((w) => w.label)
}

/** Unique sample barcodes of a well's runs, in dye order. */
export function wellSamples(w: WellSummary): string[] {
  const out: string[] = []
  for (const c of w.channels) for (const r of c.runs) if (!out.includes(r.sample_barcode)) out.push(r.sample_barcode)
  return out
}

function wellRuns(w: WellSummary): RunSummary[] {
  return w.channels.flatMap((c) => c.runs)
}

function wellLabelFor(w: WellSummary): string | undefined {
  const s = wellSamples(w)
  if (s.length) return s.length > 2 ? `${s.slice(0, 2).join(', ')} +${s.length - 2}` : s.join(', ')
  return w.sample_name ?? undefined
}

/** Grid data for Ladder mode: sizing state and quality, hand edits marked. */
export function ladderWells(wells: readonly WellSummary[], opts: { drafts?: ReadonlySet<number> } = {}): Record<string, WellDatum> {
  const out: Record<string, WellDatum> = {}
  for (const w of wells) {
    const detail = [w.sizing_quality == null ? 'Failed: no ladder fit' : `${SIZING_LABEL[w.sizing]} · SQ ${fmtQuality(w.sizing_quality)}`]
    const reason = wellReason(w)
    if (reason) detail.push(reason)
    if (w.offscale_count) detail.push(`${w.offscale_count} off-scale point${w.offscale_count === 1 ? '' : 's'}`)
    const draft = opts.drafts?.has(w.id)
    out[w.label] = {
      color: SIZING_FILL[w.sizing],
      glyph: SIZING_GLYPH[w.sizing],
      label: wellLabelFor(w),
      detail,
      marker: draft
        ? { color: MARKER.draft, label: 'Unsaved ladder edit' }
        : w.manual_ladder
          ? { color: MARKER.manual, label: 'Ladder edited by hand' }
          : undefined,
    }
  }
  return out
}

/** Dyes that carry loci: those of the plate map, else every non-ladder dye present. */
export function signalDyes(detail: PlateDetail, ladderColor: Color | null): Color[] {
  const present = new Set<Color>()
  if (detail.loci.length) for (const l of detail.loci) present.add(l.color)
  else for (const w of detail.wells) for (const c of w.channels) if (c.color !== ladderColor) present.add(c.color)
  return COLORS.filter((c) => present.has(c))
}

/**
 * Signal of one dye of a well, as the grid encodes it: a number in RFU,
 * `null` for "measured, no signal", `undefined` for "nothing to measure"
 * (dye not assigned, or the well is unsized so the size range is unknown).
 */
export function dyeSignal(w: WellSummary, color: Color, mapped: boolean, locusId: number | null): number | null | undefined {
  const ch = w.channels.find((c) => c.color === color)
  if (!ch) return undefined
  const unsized = w.sizing === 'failed'
  if (!mapped) return ch.max_signal ?? (unsized ? undefined : null)
  const runs = locusId == null ? ch.runs : ch.runs.filter((r) => r.locus_id === locusId)
  if (runs.length === 0) return undefined
  let best: number | null = null
  for (const r of runs) if (r.max_signal != null) best = best == null ? r.max_signal : Math.max(best, r.max_signal)
  if (best == null) return unsized ? undefined : null
  return best
}

/**
 * Grid data for Signal mode: per-dye signal inside the assigned loci's size
 * ranges (or the whole sized range without a plate map), one stripe per dye,
 * or one value when a single locus is chosen. Negative controls are marked;
 * contaminated ones in red.
 */
export function signalWells(detail: PlateDetail, opts: { ladderColor: Color | null; locusId: number | null }): Record<string, WellDatum> {
  const mapped = detail.plate.has_plate_map
  const dyes = signalDyes(detail, opts.ladderColor)
  const locus = opts.locusId == null ? null : (detail.loci.find((l) => l.locus_id === opts.locusId) ?? null)
  const out: Record<string, WellDatum> = {}
  for (const w of detail.wells) {
    const runs = wellRuns(w).filter((r) => !locus || r.locus_id === locus.locus_id)
    const detailLines: string[] = []
    if (w.sizing === 'failed') detailLines.push('Ladder failed: signal in the size range is unknown')
    if (mapped) {
      for (const r of runs)
        detailLines.push(
          `${r.locus_label}: ${r.max_signal == null ? '–' : `${fmtRfu(r.max_signal)} RFU`}${r.contaminated ? ' · contaminated' : ''}`,
        )
    }
    if (w.offscale_count) detailLines.push(`${w.offscale_count} off-scale point${w.offscale_count === 1 ? '' : 's'}`)
    const negatives = runs.filter((r) => r.designation === 'negative_control')
    const contaminated = negatives.filter((r) => r.contaminated)
    const marker = contaminated.length
      ? { color: MARKER.contaminated, label: `Contaminated negative control (${contaminated.map((r) => r.locus_label).join(', ')})` }
      : negatives.length
        ? { color: MARKER.control, label: 'Negative control' }
        : undefined
    const datum: WellDatum = { label: wellLabelFor(w), detail: detailLines, marker }
    if (locus) datum.value = dyeSignal(w, locus.color, mapped, locus.locus_id)
    else if (dyes.length === 1) datum.value = dyeSignal(w, dyes[0] as Color, mapped, null)
    else datum.dyes = dyes.map((c) => ({ color: c, value: dyeSignal(w, c, mapped, null) }))
    out[w.label] = datum
  }
  return out
}

/** Counts per sizing state over wells (for the grid legend). */
export function countSizing(wells: readonly WellSummary[]): Record<SizingState, number> {
  const c: Record<SizingState, number> = { good: 0, flagged: 0, unusable: 0, failed: 0 }
  for (const w of wells) c[w.sizing]++
  return c
}

export interface LocusStats {
  locusId: number
  label: string
  color: Color
  runs: number
  /** Median of the runs' highest signal in the locus range (sized wells only). */
  median: number | null
  /** Runs in sized wells with no signal above `noneBelow`. */
  none: number
  /** Runs at or above `offscale`. */
  offscale: number
  /** Runs in wells that did not size (signal unknown). */
  unsized: number
  contaminated: boolean
}

/** Per-locus signal summary of a plate, for judging how the run went. */
export function locusStats(detail: PlateDetail, noneBelow = 100, offscale = 30000): LocusStats[] {
  const by = new Map<number, { values: number[]; none: number; off: number; unsized: number }>()
  for (const w of detail.wells)
    for (const c of w.channels)
      for (const r of c.runs) {
        const s = by.get(r.locus_id) ?? { values: [], none: 0, off: 0, unsized: 0 }
        if (w.sizing === 'failed' || r.max_signal == null) s.unsized++
        else {
          s.values.push(r.max_signal)
          if (r.max_signal < noneBelow) s.none++
          if (r.max_signal >= offscale) s.off++
        }
        by.set(r.locus_id, s)
      }
  return detail.loci.map((l) => {
    const s = by.get(l.locus_id)
    const v = (s?.values ?? []).slice().sort((a, b) => a - b)
    const mid = v.length
      ? v.length % 2
        ? (v[(v.length - 1) / 2] as number)
        : ((v[v.length / 2 - 1] as number) + (v[v.length / 2] as number)) / 2
      : null
    return {
      locusId: l.locus_id,
      label: l.label,
      color: l.color,
      runs: l.run_count,
      median: mid,
      none: s?.none ?? 0,
      offscale: s?.off ?? 0,
      unsized: s?.unsized ?? 0,
      contaminated: l.contaminated,
    }
  })
}
