import { describe, expect, it } from 'vitest'
import { moveCursor, nextMatching, pushUndo, reviewKeyAction, SHORTCUTS, stepId } from './navigation'

describe('reviewKeyAction', () => {
  it('maps the documented keys', () => {
    expect(reviewKeyAction({ key: 'j' })).toEqual({ type: 'sample', delta: 1 })
    expect(reviewKeyAction({ key: 'ArrowUp' })).toEqual({ type: 'sample', delta: -1 })
    expect(reviewKeyAction({ key: ']' })).toEqual({ type: 'locus', delta: 1 })
    expect(reviewKeyAction({ key: 'h' })).toEqual({ type: 'locus', delta: -1 })
    expect(reviewKeyAction({ key: 'n' })).toEqual({ type: 'attention', delta: 1 })
    expect(reviewKeyAction({ key: 'N', shiftKey: true })).toEqual({ type: 'attention', delta: -1 })
    expect(reviewKeyAction({ key: 'Enter' })).toEqual({ type: 'accept' })
    expect(reviewKeyAction({ key: '3' })).toEqual({ type: 'toggle-number', n: 3 })
    expect(reviewKeyAction({ key: '0' })).toBeNull() // the trace's reset
    expect(reviewKeyAction({ key: ' ' })).toEqual({ type: 'toggle-cursor' })
    expect(reviewKeyAction({ key: 'z', metaKey: true })).toEqual({ type: 'undo' })
    expect(reviewKeyAction({ key: 'j', metaKey: true })).toBeNull()
    expect(reviewKeyAction({ key: 'j', altKey: true })).toBeNull()
  })
  it('every listed shortcut has a key mapping', () => {
    expect(SHORTCUTS.length).toBeGreaterThan(10)
  })
})

describe('stepping', () => {
  const order = [5, 3, 9, 1]
  it('steps and clamps at the ends', () => {
    expect(stepId(order, 3, 1)).toBe(9)
    expect(stepId(order, 1, 1)).toBe(1)
    expect(stepId(order, 5, -1)).toBe(5)
    expect(stepId(order, null, 1)).toBe(5)
    expect(stepId(order, 42, -1)).toBe(1)
    expect(stepId([], null, 1)).toBeNull()
  })
  it('finds the next match, wrapping once, in both directions', () => {
    const attn = new Set([5, 9])
    expect(nextMatching(order, 3, (id) => attn.has(id))).toBe(9)
    expect(nextMatching(order, 9, (id) => attn.has(id))).toBe(5)
    expect(nextMatching(order, 3, (id) => attn.has(id), -1)).toBe(5)
    expect(nextMatching(order, 5, (id) => id === 5)).toBeNull()
  })
  it('moves the peak cursor without wrapping', () => {
    expect(moveCursor(4, -1, 1)).toBe(0)
    expect(moveCursor(4, -1, -1)).toBe(3)
    expect(moveCursor(4, 3, 1)).toBe(3)
    expect(moveCursor(0, 2, 1)).toBe(-1)
  })
  it('keeps a bounded undo stack', () => {
    let s = pushUndo([], { sampleId: 1, locusId: 1, binId: 1, label: 'a' }, 2)
    s = pushUndo(s, { sampleId: 1, locusId: 1, binId: 2, label: 'b' }, 2)
    s = pushUndo(s, { sampleId: 1, locusId: 1, binId: 3, label: 'c' }, 2)
    expect(s.map((r) => r.binId)).toEqual([2, 3])
  })
})
