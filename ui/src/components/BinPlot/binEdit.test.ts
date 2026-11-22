import { describe, expect, it } from 'vitest'
import type { Bin } from '@/api/bindings'
import { countInBin, moveBin, newBin, removeBin, replaceBin, resizeBinEdge, setBuffer } from './binEdit'

const bin: Bin = { id: 3, label: '162', base_size: 162.3, bin_buffer: 0.75, peak_count: 40 }

describe('bin edits', () => {
  it('move keeps width and updates an auto label', () => {
    const m = moveBin(bin, 165.62)
    expect(m).toMatchObject({ base_size: 165.62, bin_buffer: 0.75, label: '166' })
  })
  it('move keeps a custom label', () => {
    expect(moveBin({ ...bin, label: 'A1' }, 170).label).toBe('A1')
  })
  it('resizing one edge keeps the other fixed', () => {
    const r = resizeBinEdge(bin, 'right', 163.55)
    expect(r.base_size - r.bin_buffer).toBeCloseTo(161.55, 2)
    expect(r.base_size + r.bin_buffer).toBeCloseTo(163.55, 2)
    const l = resizeBinEdge(bin, 'left', 161.0)
    expect(l.base_size + l.bin_buffer).toBeCloseTo(163.05, 2)
  })
  it('edges cannot cross', () => {
    const r = resizeBinEdge(bin, 'right', 150)
    expect(r.bin_buffer).toBeCloseTo(0.05)
  })
  it('setBuffer clamps to the minimum', () => {
    expect(setBuffer(bin, -1).bin_buffer).toBe(0.05)
  })
  it('new bins get unique negative ids', () => {
    const a = newBin([bin], 170.04, 0.75)
    expect(a).toMatchObject({ id: -1, label: '170', base_size: 170.04, peak_count: 0 })
    expect(newBin([bin, a], 180, 0.75).id).toBe(-2)
  })
  it('replace / remove / count', () => {
    const other = { ...bin, id: 4, base_size: 170 }
    expect(replaceBin([bin, other], { ...other, label: 'x' })[1]!.label).toBe('x')
    expect(removeBin([bin, other], 3)).toEqual([other])
    expect(countInBin([161.6, 162.3, 163.1, 163.0], bin)).toBe(3)
  })
})
