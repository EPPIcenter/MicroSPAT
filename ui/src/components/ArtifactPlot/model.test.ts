import { describe, expect, it } from 'vitest'
import { addBreakpoint, hitBreakpoint, removeBreakpoint, segmentY } from './model'

describe('artifact model', () => {
  it('segment y', () => {
    expect(segmentY({ start: 0, end: 10, slope: 2, intercept: 1, sd: 0 }, 3)).toBe(7)
  })
  it('adds sorted, rounded breakpoints and rejects near-duplicates', () => {
    expect(addBreakpoint([200], 180.123)).toEqual([180.12, 200])
    expect(addBreakpoint([200], 200.3)).toEqual([200])
  })
  it('removes', () => {
    expect(removeBreakpoint([180, 200], 180)).toEqual([200])
  })
  it('hit-tests in pixels', () => {
    expect(hitBreakpoint([100, 300], 303)).toBe(1)
    expect(hitBreakpoint([100, 300], 200)).toBe(-1)
  })
})
