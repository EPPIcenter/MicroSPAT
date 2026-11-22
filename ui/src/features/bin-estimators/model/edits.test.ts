import { describe, expect, it } from 'vitest'
import type { Bin } from '@/api/bindings'
import { moveBin, newBin, removeBin, replaceBin } from '@/components/BinPlot/binEdit'
import { applyEdit, baseChanged, buildBatch, describeDiff, diffBins, discard, initEdits, isDirty, receive, redo, undo } from './edits'

const b = (id: number, size: number, label = String(Math.round(size))): Bin => ({ id, label, base_size: size, bin_buffer: 0.75, peak_count: 30 })
const base = [b(1, 72.3), b(2, 75.3), b(3, 78.31)]

describe('bin edit history', () => {
  it('undoes and redoes several steps', () => {
    let s = initEdits(base)
    s = applyEdit(s, replaceBin(s.present, moveBin(base[0]!, 72.6)))
    const added = newBin(s.present, 81.3, 0.75)
    s = applyEdit(s, [...s.present, added])
    s = applyEdit(s, removeBin(s.present, 2))
    expect(s.present.map((x) => x.id)).toEqual([1, 3, added.id])
    expect(isDirty(s)).toBe(true)
    s = undo(undo(s))
    expect(s.present.find((x) => x.id === 1)!.base_size).toBe(72.6)
    expect(s.present).toHaveLength(3)
    s = redo(s)
    expect(s.present).toHaveLength(4)
    s = undo(undo(s))
    expect(isDirty(s)).toBe(false)
    expect(undo(s)).toBe(s)
  })

  it('a new edit drops the redo branch', () => {
    let s = applyEdit(initEdits(base), removeBin(base, 1))
    s = undo(s)
    expect(s.future).toHaveLength(1)
    s = applyEdit(s, removeBin(base, 3))
    expect(s.future).toHaveLength(0)
    expect(redo(s)).toBe(s)
  })

  it('coalesces repeated nudges of one bin into one step', () => {
    let s = initEdits(base)
    s = applyEdit(s, replaceBin(s.present, moveBin(base[0]!, 72.35)), 'nudge:1', 1000)
    s = applyEdit(s, replaceBin(s.present, moveBin(base[0]!, 72.4)), 'nudge:1', 1300)
    s = applyEdit(s, replaceBin(s.present, moveBin(base[0]!, 72.45)), 'nudge:1', 1600)
    expect(s.past).toHaveLength(1)
    s = applyEdit(s, replaceBin(s.present, moveBin(base[0]!, 72.5)), 'nudge:1', 5000)
    expect(s.past).toHaveLength(2)
    expect(undo(undo(s)).present).toEqual(base)
  })

  it('ignores no-op edits and discards to the saved bins', () => {
    const s0 = initEdits(base)
    expect(applyEdit(s0, [...base])).toBe(s0)
    const s = applyEdit(s0, removeBin(base, 2))
    expect(discard(s).present).toEqual(base)
    expect(discard(s).past).toHaveLength(0)
  })

  it('adopts new engine bins unless there are edits', () => {
    const s = initEdits(base)
    const fresh = [...base, b(4, 81.3)]
    expect(receive(s, fresh).present).toEqual(fresh)
    const edited = applyEdit(s, removeBin(base, 1))
    expect(receive(edited, fresh)).toBe(edited)
    expect(baseChanged(edited, fresh)).toBe(true)
    expect(receive(undefined, base).present).toEqual(base)
  })
})

describe('save batch', () => {
  it('sends new (id ≤ 0), changed and deleted bins in one batch', () => {
    let s = initEdits(base)
    const added = newBin(s.present, 84.31, 0.75)
    s = applyEdit(s, [...replaceBin(s.present, { ...moveBin(base[1]!, 75.5), label: ' A75 ' }), added])
    s = applyEdit(s, removeBin(s.present, 3))
    const d = diffBins(s.base, s.present)
    expect(describeDiff(d)).toBe('1 new, 1 changed, 1 deleted')
    const batch = buildBatch(7, 2, s.base, s.present, new Map([[added.id, 12]]))!
    expect(batch.project_id).toBe(7)
    expect(batch.locus_id).toBe(2)
    expect(batch.delete_ids).toEqual([3])
    expect(batch.bins).toEqual([
      { id: 2, label: 'A75', base_size: 75.5, bin_buffer: 0.75, peak_count: 30 },
      { id: added.id, label: '84', base_size: 84.31, bin_buffer: 0.75, peak_count: 12 },
    ])
    expect(added.id).toBeLessThanOrEqual(0)
  })

  it('returns null with nothing to save, and omits delete_ids without deletions', () => {
    expect(buildBatch(1, 1, base, base)).toBeNull()
    const batch = buildBatch(1, 1, base, replaceBin(base, { ...base[0]!, bin_buffer: 0.5 }))!
    expect(batch.delete_ids).toBeUndefined()
    expect(batch.bins).toHaveLength(1)
  })

  it('gives a vanished saved bin a fresh unsaved id', () => {
    const present = [...base, b(99, 90.3), { ...b(0, 93.3), id: -1 }]
    const batch = buildBatch(1, 1, base, present)!
    const ids = batch.bins.map((x) => x.id)
    expect(ids.every((id) => id <= 0)).toBe(true)
    expect(new Set(ids).size).toBe(2)
  })
})
