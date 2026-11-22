import { describe, expect, it } from 'vitest'
import type { PlateSummary, ProjectSummary } from '@/api/bindings'
import { findDemo, firstFailedWell, highlightRect, onPage, placeCard, type Rect } from './model'
import { TOUR_STEPS, tourSteps } from './steps'

const WINDOW = { width: 1440, height: 900 }
const CARD = { width: 360, height: 240 }

/** Whether two boxes share any area. */
function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height
}

function placed(target: Rect | null, prefer?: 'right' | 'left' | 'bottom' | 'top', viewport = WINDOW) {
  const p = placeCard({ target, card: CARD, viewport, prefer })
  return { ...p, box: { left: p.left, top: p.top, ...CARD } }
}

describe('placeCard', () => {
  it('centers the card when the step has no target', () => {
    expect(placed(null)).toMatchObject({ left: 540, top: 330, placement: 'center' })
  })

  it('uses the preferred side when the card fits there, clear of the target', () => {
    const sidebar = { left: 0, top: 0, width: 212, height: 900 }
    const p = placed(sidebar, 'right')
    expect(p.placement).toBe('right')
    expect(p.left).toBeGreaterThan(212)
    expect(overlaps(p.box, sidebar)).toBe(false)
  })

  it('moves to the side with room when the preferred side has none', () => {
    const button = { left: 1230, top: 46, width: 84, height: 24 }
    const p = placed(button, 'right')
    expect(p.placement).not.toBe('right')
    expect(overlaps(p.box, button)).toBe(false)
  })

  it('keeps the card inside the window', () => {
    for (const target of [
      { left: 1380, top: 860, width: 50, height: 30 },
      { left: 4, top: 4, width: 30, height: 20 },
      { left: 600, top: 870, width: 300, height: 26 },
    ]) {
      const { box } = placed(target, 'bottom')
      expect(box.left).toBeGreaterThanOrEqual(12)
      expect(box.top).toBeGreaterThanOrEqual(12)
      expect(box.left + box.width).toBeLessThanOrEqual(WINDOW.width - 12)
      expect(box.top + box.height).toBeLessThanOrEqual(WINDOW.height - 12)
    }
  })

  it('covers the edge of a target that leaves a little too little room', () => {
    // A plot in a 1024 px window: 330 px to its right, and the card needs 386.
    const plot = { left: 216, top: 140, width: 478, height: 444 }
    const p = placed(plot, 'right', { width: 1024, height: 640 })
    expect(p.placement).toBe('right')
    expect(p.left + CARD.width).toBe(1024 - 12)
  })

  it('sits over the lower right corner of a target that fills the window', () => {
    const page = { left: 212, top: 75, width: 1228, height: 825 }
    const p = placed(page)
    expect(p.placement).toBe('inside')
    expect(p.left + CARD.width).toBeLessThanOrEqual(1440 - 12)
    expect(p.top + CARD.height).toBeLessThanOrEqual(900 - 12)
    expect(p.left).toBeGreaterThan(900)
  })
})

describe('highlightRect', () => {
  it('pads the target and stops at the window edge', () => {
    expect(highlightRect({ left: 100, top: 50, width: 80, height: 24 }, WINDOW, 6)).toEqual({ left: 94, top: 44, width: 92, height: 36 })
    expect(highlightRect({ left: 0, top: 880, width: 1440, height: 40 }, WINDOW, 6)).toEqual({ left: 0, top: 874, width: 1440, height: 26 })
  })
})

describe('onPage', () => {
  it('matches the path and the parameters the step names, whatever else the page added', () => {
    const here = { pathname: '/projects/4', search: '?tab=review&sample=93&locus=1' }
    expect(onPage(here, '/projects/4?tab=review&sample=93')).toBe(true)
    expect(onPage(here, '/projects/4?tab=export')).toBe(false)
    expect(onPage(here, '/projects/5?tab=review')).toBe(false)
    expect(onPage({ pathname: '/loci', search: '' }, '/loci')).toBe(true)
  })
})

function plate(id: number, label: string, failed = 0): PlateSummary {
  // Only the fields the tour reads matter here.
  return { id, label, sizing: { good: 96 - failed, flagged: 0, unusable: 0, failed } } as PlateSummary
}

function project(over: Partial<ProjectSummary>): ProjectSummary {
  return { id: 1, kind: 'genotyping', title: 'Demo genotyping', bin_estimator: null, artifact_estimator: null, quant_bias_estimator: null, ...over } as ProjectSummary
}

const ref = (id: number, kind: ProjectSummary['kind'], title: string) => ({ id, kind, title })
const demoProject = project({
  id: 4,
  bin_estimator: ref(1, 'bin_estimator', 'Renamed bins'),
  artifact_estimator: ref(2, 'artifact_estimator', 'Demo artifacts'),
  quant_bias_estimator: ref(3, 'quant_bias_estimator', 'Demo bias'),
})

describe('findDemo', () => {
  it('finds the demo study by its project and follows the project links', () => {
    const found = findDemo([plate(3, 'DEMO-3', 1), plate(1, 'DEMO-1')], [demoProject], [{ id: 93, barcode: 'D1-SHOW-1' }])
    expect(found).toEqual({ plateId: 3, binEstimatorId: 1, artifactEstimatorId: 2, quantBiasId: 3, genotypingId: 4, showcaseSampleId: 93 })
  })

  it('prefers a demo plate with a failed well, and never a plate of the user', () => {
    expect(findDemo([plate(9, 'Run 12', 5), plate(1, 'DEMO-1'), plate(2, 'DEMO-2', 6)], [demoProject], [])?.plateId).toBe(2)
    expect(findDemo([plate(9, 'Run 12', 5), plate(1, 'DEMO-1')], [demoProject], [])?.plateId).toBe(1)
  })

  it('is null without the demo project, its estimators, or a demo plate', () => {
    expect(findDemo([plate(1, 'DEMO-1')], [project({ title: 'My study' })], [])).toBeNull()
    expect(findDemo([plate(1, 'DEMO-1')], [project({})], [])).toBeNull()
    expect(findDemo([plate(9, 'Run 12')], [demoProject], [])).toBeNull()
  })
})

describe('firstFailedWell', () => {
  it('is the first failed well in plate order, or null when every well sized', () => {
    expect(firstFailedWell([{ label: 'A01', sizing: 'good' }, { label: 'A06', sizing: 'failed' }, { label: 'B02', sizing: 'failed' }])).toBe('A06')
    expect(firstFailedWell([{ label: 'A01', sizing: 'good' }, { label: 'A02', sizing: 'flagged' }])).toBeNull()
  })
})

describe('tour steps', () => {
  const context = { plateId: 3, failedWell: 'A06', binEstimatorId: 1, artifactEstimatorId: 2, quantBiasId: 3, genotypingId: 4, showcaseSampleId: 93 }

  it('have unique ids, and end on a card of its own', () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length)
    expect(TOUR_STEPS[TOUR_STEPS.length - 1]?.target).toBeUndefined()
  })

  it('fit beside the screen they explain: no stop runs past 60 words', () => {
    for (const s of TOUR_STEPS) expect(s.body.join(' ').split(/\s+/).length, s.id).toBeLessThanOrEqual(60)
  })

  it('select the failed well at the plate stops when the plate has one', () => {
    const well = TOUR_STEPS.find((s) => s.id === 'well')
    expect(well?.path?.(context)).toBe('/plates/3?tab=well&well=A06')
    expect(well?.path?.({ ...context, failedWell: null })).toBe('/plates/3?tab=well')
  })

  it('skip the quantification-bias stop when the demo has no such estimator', () => {
    expect(tourSteps(context).some((s) => s.id === 'quant-bias')).toBe(true)
    expect(tourSteps({ ...context, quantBiasId: null }).some((s) => s.id === 'quant-bias')).toBe(false)
  })

  it('open the review at the showcase sample when it exists', () => {
    const trace = TOUR_STEPS.find((s) => s.id === 'trace')
    expect(trace?.path?.(context)).toBe('/projects/4?tab=review&sample=93')
    expect(trace?.path?.({ ...context, showcaseSampleId: null })).toBe('/projects/4?tab=review')
  })
})
