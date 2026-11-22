/** Pure bin edits used by BinPlot. Bins are immutable values. */
import type { Bin } from '@/api/bindings'

export const MIN_BUFFER = 0.05

export type BinChange =
  | { type: 'move'; bin: Bin }
  | { type: 'resize'; bin: Bin }
  | { type: 'add'; bin: Bin }
  | { type: 'delete'; bin: Bin }

const roundBp = (v: number) => Math.round(v * 1000) / 1000

/** Default label: the rounded base size. */
export function autoLabel(baseSize: number): string {
  return String(Math.round(baseSize))
}

/** Keep auto labels in step with the center; leave custom labels alone. */
function relabel(bin: Bin, newCenter: number): string {
  return bin.label === autoLabel(bin.base_size) ? autoLabel(newCenter) : bin.label
}

export function moveBin(bin: Bin, center: number): Bin {
  const c = roundBp(center)
  return { ...bin, base_size: c, label: relabel(bin, c) }
}

/**
 * Drag one edge to `x`, keeping the opposite edge fixed. The bin's center
 * moves to the middle of the new edges. Edges cannot cross.
 */
export function resizeBinEdge(bin: Bin, edge: 'left' | 'right', x: number, minBuffer = MIN_BUFFER): Bin {
  const lo = bin.base_size - bin.bin_buffer
  const hi = bin.base_size + bin.bin_buffer
  let a = edge === 'left' ? x : lo
  let b = edge === 'right' ? x : hi
  if (edge === 'left') a = Math.min(a, hi - 2 * minBuffer)
  else b = Math.max(b, lo + 2 * minBuffer)
  const center = roundBp((a + b) / 2)
  return { ...bin, base_size: center, bin_buffer: roundBp((b - a) / 2), label: relabel(bin, center) }
}

/** Symmetric buffer change (keyboard [ and ]). */
export function setBuffer(bin: Bin, buffer: number, minBuffer = MIN_BUFFER): Bin {
  return { ...bin, bin_buffer: roundBp(Math.max(minBuffer, buffer)) }
}

/** New unsaved bin: negative id below every existing id. */
export function newBin(bins: readonly Bin[], center: number, buffer: number): Bin {
  const minId = bins.reduce((m, b) => Math.min(m, b.id), 0)
  const c = roundBp(center)
  return { id: minId - 1, label: autoLabel(c), base_size: c, bin_buffer: roundBp(buffer), peak_count: 0 }
}

export function replaceBin(bins: readonly Bin[], bin: Bin): Bin[] {
  return bins.map((b) => (b.id === bin.id ? bin : b))
}

export function removeBin(bins: readonly Bin[], id: number): Bin[] {
  return bins.filter((b) => b.id !== id)
}

/** Points (by x) inside a bin. */
export function countInBin(xs: readonly number[], bin: Bin): number {
  let n = 0
  for (const x of xs) if (Math.abs(x - bin.base_size) <= bin.bin_buffer) n++
  return n
}
