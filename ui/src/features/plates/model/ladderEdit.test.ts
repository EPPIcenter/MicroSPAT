import { describe, expect, it } from 'vitest'
import type { LadderPreview } from '@/api/bindings'
import {
  addPeak,
  assignedSizes,
  diffDraft,
  draftMarks,
  explicitRequest,
  fitterRequest,
  hasChosenSizes,
  isClean,
  nearestPeak,
  removePeak,
  setPeakSize,
  shiftOthers,
  startDraft,
} from './ladderEdit'

const saved = [
  { index: 100, size: 50 },
  { index: 200, size: 60 },
  { index: 300, size: 90 },
  { index: 400, size: 100 },
]

describe('ladder draft', () => {
  it('starts from the stored peaks, sorted, sizes left to the fitter', () => {
    const d = startDraft([saved[2]!, saved[0]!, saved[1]!, saved[0]!])
    expect(d).toEqual([
      { index: 100, size: null },
      { index: 200, size: null },
      { index: 300, size: null },
    ])
    expect(isClean(startDraft(saved), saved)).toBe(true)
  })

  it('adds, removes and restores peaks', () => {
    let d = addPeak(startDraft(saved), 250)
    expect(d.map((p) => p.index)).toEqual([100, 200, 250, 300, 400])
    expect(diffDraft(d, saved)).toMatchObject({ added: [250], removed: [], dirty: true })
    d = removePeak(d, 200)
    expect(diffDraft(d, saved)).toMatchObject({ added: [250], removed: [200], dirty: true })
    d = addPeak(removePeak(d, 250), 200)
    expect(isClean(d, saved)).toBe(true)
    expect(addPeak(d, 200)).toEqual(d)
  })

  it('a chosen size different from the stored one is a correction', () => {
    const d = setPeakSize(startDraft(saved), 300, 100)
    expect(diffDraft(d, saved)).toMatchObject({ corrected: [300], dirty: true })
    expect(hasChosenSizes(d)).toBe(true)
    // Choosing the stored size again is no change.
    expect(isClean(setPeakSize(startDraft(saved), 300, 90), saved)).toBe(true)
    expect(hasChosenSizes(setPeakSize(d, 300, null))).toBe(false)
  })

  it('finds the nearest peak within a radius', () => {
    const d = startDraft([
      { index: 100, size: 50 },
      { index: 108, size: 60 },
    ])
    expect(nearestPeak(d, 105, 5)).toBe(108)
    expect(nearestPeak(d, 103, 5)).toBe(100)
    expect(nearestPeak(d, 120, 5)).toBeNull()
  })
})

describe('requests', () => {
  it('without chosen sizes, the fitter assigns them', () => {
    expect(fitterRequest(7, addPeak(startDraft(saved), 250))).toEqual({ id: 7, peak_indices: [100, 200, 250, 300, 400] })
    expect(fitterRequest(7, [])).toBeNull()
  })

  it('with a chosen size, sends explicit pairs filled from the fitter', () => {
    const d = setPeakSize(startDraft(saved), 100, 60)
    const fitted = saved.map((p) => ({ ...p }))
    expect(explicitRequest(7, d, fitted)).toEqual({
      request: {
        id: 7,
        peaks: [
          { index: 100, size: 60 },
          { index: 200, size: 60 },
          { index: 300, size: 90 },
          { index: 400, size: 100 },
        ],
      },
      problem: null,
    })
  })

  it('reports peaks that have no size either way', () => {
    const d = setPeakSize(startDraft(saved), 100, 50)
    const r = explicitRequest(7, d, null)
    expect(r.request).toBeNull()
    expect(r.problem).toMatch(/could not assign 3 peaks/)
    // Every peak chosen: no fitter needed.
    let all = startDraft(saved)
    for (const p of saved) all = setPeakSize(all, p.index, p.size)
    expect(explicitRequest(7, all, null).request).toEqual({ id: 7, peaks: saved })
  })
})

describe('shift the others', () => {
  const ladder = [50, 60, 90, 100, 120, 150, 160]
  // The fitter put four peaks two steps too high.
  const fitted = new Map([
    [100, 90],
    [200, 100],
    [300, 120],
    [400, 150],
  ])
  it('moves every other peak by the steps the corrected one moved', () => {
    const d = setPeakSize(startDraft(saved), 100, 50)
    expect(shiftOthers(d, 100, fitted, 90, ladder)).toEqual([
      { index: 100, size: 50 },
      { index: 200, size: 60 },
      { index: 300, size: 90 },
      { index: 400, size: 100 },
    ])
  })
  it('refuses to run off the ladder or to shift by nothing', () => {
    // 100 -> 50 is three steps down; the peak at 90 bp would go below 50 bp.
    expect(shiftOthers(setPeakSize(startDraft(saved), 200, 50), 200, fitted, 100, ladder)).toBeNull()
    expect(shiftOthers(setPeakSize(startDraft(saved), 100, 90), 100, fitted, 90, ladder)).toBeNull()
  })
})

describe('draft marks', () => {
  const preview: LadderPreview = {
    sizing: 'unusable',
    sizing_quality: 0.05,
    reason: 'Only 5 of 21',
    peaks: [
      { index: 100, size: 50 },
      { index: 250, size: 75 },
      { index: 300, size: 90 },
      { index: 400, size: 100 },
    ],
  }
  const trace = Array.from({ length: 600 }, (_, i) => i)

  it('draws proposed peaks with preview sizes, removed ones crossed out, and candidates', () => {
    const d = setPeakSize(addPeak(removePeak(startDraft(saved), 200), 250), 300, 90)
    const m = draftMarks(d, saved, {
      seriesId: 'red',
      trace,
      preview,
      candidates: [
        { index: 200, height: 5 },
        { index: 500, height: 900 },
      ],
      selected: 250,
    })
    expect(m.ladder.map((l) => [l.index, l.size, l.status])).toEqual([
      [100, 50, 'ok'],
      [250, 75, 'ok'],
      [300, 90, 'ok'],
      [400, 100, 'ok'],
    ])
    const byId = Object.fromEntries(m.peaks.map((p) => [p.id, p]))
    expect(byId['p-100']!.state).toBe('called')
    expect(byId['p-250']).toMatchObject({ state: 'manual-on', selected: true })
    expect(byId['p-300']!.detail?.[0]).toBe('90 bp (chosen by you)')
    expect(byId['p-100']!.detail?.[0]).toBe('50 bp (assigned by the fitter)')
    expect(byId['rm-200']!.state).toBe('manual-off')
    // A candidate that is a removed stored peak is drawn once, as removed.
    expect(byId['c-200']).toBeUndefined()
    expect(byId['c-500']).toMatchObject({ state: 'candidate', height: 500 })
  })

  it('peaks without a size are unassigned', () => {
    const d = addPeak(startDraft(saved), 450)
    const sizes = assignedSizes(d, preview)
    expect(sizes.has(450)).toBe(false)
    const m = draftMarks(d, saved, { seriesId: 'red', trace, preview: null, candidates: [], selected: null })
    expect(m.ladder.every((l) => l.status === 'unassigned' && l.size == null)).toBe(true)
  })
})
