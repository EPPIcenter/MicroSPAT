import { describe, expect, it } from 'vitest'
import { clampDomain, linear, panDomain, tickFormat, wheelZoomFactor, zoomDomain } from './scale'

describe('linear', () => {
  it('maps and inverts', () => {
    const s = linear([100, 200], [0, 500])
    expect(s(150)).toBe(250)
    expect(s.invert(250)).toBe(150)
  })
  it('handles inverted ranges (y axis)', () => {
    const y = linear([0, 1000], [300, 0])
    expect(y(1000)).toBe(0)
    expect(y.invert(150)).toBe(500)
  })
  it('degenerate domain does not divide by zero', () => {
    const s = linear([5, 5], [0, 100])
    expect(s(5)).toBe(0)
    expect(s.invert(40)).toBe(5)
  })
})

describe('zoom and pan', () => {
  const bounds = [0, 500] as const
  it('keeps the anchor fixed', () => {
    const d = zoomDomain([100, 300], 150, 0.5, bounds)
    expect(d).toEqual([125, 225])
    // anchor 150 sat at 25% before and after
    expect((150 - d[0]) / (d[1] - d[0])).toBeCloseTo(0.25)
  })
  it('never zooms out past the bounds', () => {
    expect(zoomDomain([100, 300], 200, 10, bounds)).toEqual([0, 500])
  })
  it('respects the minimum span', () => {
    const d = zoomDomain([100, 110], 105, 0.01, bounds, 2)
    expect(d[1] - d[0]).toBeCloseTo(2)
    expect(d[0]).toBeCloseTo(104)
  })
  it('pans and stops at the edge without changing span', () => {
    expect(panDomain([100, 200], 50, bounds)).toEqual([150, 250])
    expect(panDomain([400, 480], 100, bounds)).toEqual([420, 500])
    expect(panDomain([10, 60], -100, bounds)).toEqual([0, 50])
  })
  it('clampDomain shrinks oversize spans to the bounds', () => {
    expect(clampDomain([-50, 900], bounds)).toEqual([0, 500])
  })
  it('wheel factor is symmetric', () => {
    expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1)
    expect(wheelZoomFactor(-100)).toBeLessThan(1)
  })
})

describe('tickFormat', () => {
  it('uses the decimals the step needs', () => {
    expect(tickFormat([0, 0.05, 0.1])(0.05)).toBe('0.05')
    expect(tickFormat([150, 160])(150)).toBe('150')
  })
  it('abbreviates large RFU values', () => {
    expect(tickFormat([0, 5000, 10000])(10000)).toBe('10k')
  })
})
