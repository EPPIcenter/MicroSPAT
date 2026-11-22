/**
 * Pure parts of the guided tour: finding the demo study in a workspace, and
 * placing the tour card beside the element a step points at.
 */
import type { PlateSummary, ProjectSummary, Sample, WellSummary } from '@/api/bindings'

/** Title the engine gives the demo genotyping project (`DEMO_GENOTYPING` in the engine's demo.rs). */
export const DEMO_PROJECT_TITLE = 'Demo genotyping'
/** A demo sample whose minor allele sits on the major allele's stutter. */
export const DEMO_SHOWCASE_SAMPLE = 'D1-SHOW-1'
const DEMO_PLATE_PREFIX = 'DEMO-'

/** Where the tour's stops are in this workspace. */
export interface TourContext {
  plateId: number
  /** A failed well of that plate, selected at the plate stops; null when every well sized (the page then picks the well). */
  failedWell: string | null
  binEstimatorId: number
  artifactEstimatorId: number
  /** Null when the demo project has no quantification-bias estimator; that stop is skipped. */
  quantBiasId: number | null
  genotypingId: number
  /** Null when the showcase sample is gone; the review stops then show the first sample. */
  showcaseSampleId: number | null
}

/**
 * The demo study's items, or null when the workspace does not hold it (never
 * loaded, or its project or plates were deleted). The estimators are taken
 * from the project's own links, so renaming them does not hide the demo.
 */
export function findDemo(
  plates: readonly PlateSummary[],
  projects: readonly ProjectSummary[],
  samples: readonly Pick<Sample, 'id' | 'barcode'>[],
): Omit<TourContext, 'failedWell'> | null {
  const project = projects.find((p) => p.kind === 'genotyping' && p.title === DEMO_PROJECT_TITLE)
  if (!project?.bin_estimator || !project.artifact_estimator) return null
  const demoPlates = plates.filter((p) => p.label.startsWith(DEMO_PLATE_PREFIX))
  // A plate with a failed well shows what a sizing failure looks like.
  const plate = demoPlates.find((p) => p.sizing.failed > 0) ?? demoPlates[0]
  if (!plate) return null
  return {
    plateId: plate.id,
    binEstimatorId: project.bin_estimator.id,
    artifactEstimatorId: project.artifact_estimator.id,
    quantBiasId: project.quant_bias_estimator?.id ?? null,
    genotypingId: project.id,
    showcaseSampleId: samples.find((s) => s.barcode === DEMO_SHOWCASE_SAMPLE)?.id ?? null,
  }
}

/** The label of the first failed well, in plate order. */
export function firstFailedWell(wells: readonly Pick<WellSummary, 'label' | 'sizing'>[]): string | null {
  return wells.find((w) => w.sizing === 'failed')?.label ?? null
}

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export type Side = 'right' | 'left' | 'bottom' | 'top'
/** Where the card ended up: beside the target, over it, or in the middle of the window. */
export type Placement = Side | 'inside' | 'center'

export interface CardPosition {
  left: number
  top: number
  placement: Placement
}

const SIDES: readonly Side[] = ['right', 'left', 'bottom', 'top']

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(Math.max(lo, hi), v))
}

/**
 * Position of the tour card. Beside the target on the preferred side when it
 * fits there, otherwise on the side with the most room. When no side has
 * quite enough room, the card still goes on the roomiest side and covers the
 * target's edge, as long as it hides no more than a third of its own width
 * or height of it; past that (a target that fills the window) it sits over
 * the target's lower right corner. In the middle of the window when there is
 * no target.
 */
export function placeCard({
  target,
  card,
  viewport,
  prefer,
  gap = 14,
  margin = 12,
}: {
  target: Rect | null
  card: Size
  viewport: Size
  prefer?: Side
  /** Distance between target and card. */
  gap?: number
  /** Least distance between the card and the window edge. */
  margin?: number
}): CardPosition {
  const maxLeft = viewport.width - card.width - margin
  const maxTop = viewport.height - card.height - margin
  if (!target) {
    return {
      left: clamp((viewport.width - card.width) / 2, margin, maxLeft),
      top: clamp((viewport.height - card.height) / 2, margin, maxTop),
      placement: 'center',
    }
  }
  const room: Record<Side, number> = {
    right: viewport.width - (target.left + target.width),
    left: target.left,
    bottom: viewport.height - (target.top + target.height),
    top: target.top,
  }
  const needs = (s: Side) => (s === 'right' || s === 'left' ? card.width : card.height) + gap + margin
  const fits = (s: Side) => room[s] >= needs(s)
  const byRoom = [...SIDES].sort((a, b) => room[b] - needs(b) - (room[a] - needs(a)))
  const nearest = byRoom[0]
  const nearlyFits = nearest != null && needs(nearest) - room[nearest] <= (needs(nearest) - gap - margin) / 3
  const side = prefer && fits(prefer) ? prefer : (byRoom.find(fits) ?? (nearlyFits ? nearest : undefined))
  if (!side) {
    return {
      left: clamp(target.left + target.width - card.width - 16, margin, maxLeft),
      top: clamp(target.top + target.height - card.height - 16, margin, maxTop),
      placement: 'inside',
    }
  }
  // Along the other axis the card starts level with the target, kept inside the window.
  const alongX = clamp(target.left, margin, maxLeft)
  const alongY = clamp(target.top, margin, maxTop)
  switch (side) {
    case 'right':
      return { left: clamp(target.left + target.width + gap, margin, maxLeft), top: alongY, placement: side }
    case 'left':
      return { left: clamp(target.left - gap - card.width, margin, maxLeft), top: alongY, placement: side }
    case 'bottom':
      return { left: alongX, top: clamp(target.top + target.height + gap, margin, maxTop), placement: side }
    case 'top':
      return { left: alongX, top: clamp(target.top - gap - card.height, margin, maxTop), placement: side }
  }
}

/** The target grown by `pad` on every side and cut to the window, for the highlight. */
export function highlightRect(target: Rect, viewport: Size, pad: number): Rect {
  const left = Math.max(0, target.left - pad)
  const top = Math.max(0, target.top - pad)
  const right = Math.min(viewport.width, target.left + target.width + pad)
  const bottom = Math.min(viewport.height, target.top + target.height + pad)
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

export function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === null || b === null) return a === b
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
}

/**
 * Whether the app at `current` already shows the page a step asks for: the
 * same path, with every query parameter the step names. Pages add parameters
 * of their own (the selected locus or well), which do not count.
 */
export function onPage(current: { pathname: string; search: string }, wanted: string): boolean {
  const [path = '', query = ''] = wanted.split('?')
  if (current.pathname !== path) return false
  const have = new URLSearchParams(current.search)
  for (const [k, v] of new URLSearchParams(query)) if (have.get(k) !== v) return false
  return true
}
