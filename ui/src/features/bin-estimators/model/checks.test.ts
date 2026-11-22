import { describe, expect, it } from 'vitest'
import type { Bin } from '@/api/bindings'
import {
  binIssues,
  binsBelow,
  blockingIssues,
  fitRepeatGrid,
  gridLines,
  gridPosition,
  liveCounts,
  overlappingPairs,
  setAllBuffers,
  snapToGrid,
  sortedSizes,
} from './checks'

const b = (id: number, size: number, count = 40, buffer = 0.75, label = String(Math.round(size))): Bin => ({
  id,
  label,
  base_size: size,
  bin_buffer: buffer,
  peak_count: count,
})

describe('repeat grid', () => {
  it('fits the grid of a 3 bp locus and flags a stutter bin off it', () => {
    const bins = [b(1, 72.3), b(2, 75.3, 70), b(3, 78.31, 110), b(4, 80.2, 25), b(5, 81.31, 80), b(6, 84.31)]
    const g = fitRepeatGrid(bins, 3)!
    expect(gridPosition(g, 84.31).offset).toBeCloseTo(0, 1)
    const issues = binIssues(bins, g)
    const off = [...issues].filter(([, is]) => is.some((i) => i.kind === 'off_grid'))
    expect(off.map(([id]) => id)).toEqual([4])
    expect(issues.get(4)!.find((i) => i.kind === 'off_grid')!.message).toMatch(/below the repeat grid \(81\.3\d bp\)/)
  })

  it('follows mobility drift across the locus', () => {
    // 4 bp repeat, but each repeat runs 4.02 bp: far bins drift 0.4 bp.
    const bins = Array.from({ length: 21 }, (_, k) => b(k + 1, 150.2 + 4.02 * k))
    const g = fitRepeatGrid(bins, 4)!
    expect(g.step).toBeCloseTo(4.02, 3)
    expect(binIssues(bins, g).size).toBe(0)
    expect(gridLines(g, 150, 160).map((v) => +v.toFixed(2))).toEqual([150.2, 154.22, 158.24])
  })

  it('snaps bins onto the grid, keeping custom labels', () => {
    const bins = [b(1, 72.3), b(2, 75.3), b(3, 78.6, 40, 0.75, 'X'), b(4, 81.3)]
    const g = fitRepeatGrid(bins, 3)!
    const snapped = snapToGrid(bins, g, new Set([3]))
    expect(snapped[2]!.base_size).toBeCloseTo(78.3, 1)
    expect(snapped[2]!.label).toBe('X')
    expect(snapped[0]).toBe(bins[0])
  })

  it('has no grid without bins or a repeat length', () => {
    expect(fitRepeatGrid([], 3)).toBeNull()
    expect(fitRepeatGrid([b(1, 100)], 0)).toBeNull()
  })
})

describe('bin issues', () => {
  it('finds overlapping windows', () => {
    const bins = [b(1, 100, 40, 0.75), b(2, 101.2, 40, 0.75), b(3, 103, 40, 0.5)]
    expect(overlappingPairs(bins).map(([x, y]) => [x.id, y.id])).toEqual([[1, 2]])
    const issues = binIssues(bins, null)
    expect(issues.get(1)![0]).toMatchObject({ kind: 'overlap', others: [2] })
    expect(issues.get(1)![0]!.message).toContain('0.30 bp')
    // Touching is not overlapping.
    expect(overlappingPairs([b(1, 100, 1, 0.5), b(2, 101, 1, 0.5)])).toHaveLength(0)
  })

  it('blocks duplicate labels and invalid bins, not overlaps', () => {
    const bins = [b(1, 100, 40, 0.75, '100'), b(2, 100.5, 40, 0.75, '100 '), b(3, 110, 40, 0, '110'), b(4, 120, 40, 0.75, ' ')]
    const issues = binIssues(bins, null)
    expect(issues.get(1)!.map((i) => i.kind)).toEqual(['duplicate_label', 'overlap'])
    expect(
      blockingIssues(issues)
        .map((i) => i.kind)
        .sort(),
    ).toEqual(['duplicate_label', 'duplicate_label', 'invalid', 'invalid'])
  })
})

describe('peak counts and bulk edits', () => {
  const sizes = sortedSizes([99.5, 100, 100.2, 100.75, 101, 105, 105.1])
  const bins = [b(1, 100), b(2, 105, 2, 0.2), b(3, 110)]
  const counts = liveCounts(sizes, bins)
  it('counts peaks in each window', () => {
    expect(Object.fromEntries(counts)).toEqual({ 1: 4, 2: 2, 3: 0 })
  })
  it('selects bins below a count and sets buffers', () => {
    expect(binsBelow(bins, counts, 3).map((x) => x.id)).toEqual([2, 3])
    expect(setAllBuffers(bins, 0.5).map((x) => x.bin_buffer)).toEqual([0.5, 0.5, 0.5])
    expect(setAllBuffers(bins, 0.01, new Set([1]))[0]!.bin_buffer).toBe(0.05)
  })
})
