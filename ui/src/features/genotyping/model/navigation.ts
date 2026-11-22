import { kbd } from '@/lib/platform'
/**
 * Keyboard model of the review screen: which key does what, and where
 * "next" goes. Pure, so the keymap and the stepping rules are tested apart
 * from the components.
 */

export type ReviewAction =
  | { type: 'sample'; delta: 1 | -1 }
  | { type: 'locus'; delta: 1 | -1 }
  | { type: 'attention'; delta: 1 | -1 }
  | { type: 'unreviewed'; delta: 1 | -1 }
  | { type: 'accept' }
  | { type: 'review-toggle' }
  | { type: 'cursor'; delta: 1 | -1 }
  | { type: 'toggle-cursor' }
  | { type: 'toggle-number'; n: number }
  | { type: 'undo' }
  | { type: 'comment' }
  | { type: 'params' }
  | { type: 'runs' }
  | { type: 'dyes' }
  | { type: 'help' }
  | { type: 'filter' }

export interface KeyInput {
  key: string
  shiftKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
}

/**
 * Map a key press to an action. Arrow keys are included; the caller skips
 * events a focused control already handled (the trace uses arrows to pan).
 */
export function reviewKeyAction(e: KeyInput): ReviewAction | null {
  const mod = e.metaKey || e.ctrlKey
  if (mod) return e.key.toLowerCase() === 'z' && !e.shiftKey ? { type: 'undo' } : null
  if (e.altKey) return null
  switch (e.key) {
    case 'j':
    case 'ArrowDown':
      return { type: 'sample', delta: 1 }
    case 'k':
    case 'ArrowUp':
      return { type: 'sample', delta: -1 }
    case 'l':
    case 'ArrowRight':
    case ']':
      return { type: 'locus', delta: 1 }
    case 'h':
    case 'ArrowLeft':
    case '[':
      return { type: 'locus', delta: -1 }
    case 'n':
      return { type: 'attention', delta: 1 }
    case 'N':
      return { type: 'attention', delta: -1 }
    case 'u':
      return { type: 'unreviewed', delta: 1 }
    case 'U':
      return { type: 'unreviewed', delta: -1 }
    case 'Enter':
      return e.shiftKey ? null : { type: 'accept' }
    case 'm':
      return { type: 'review-toggle' }
    case '.':
      return { type: 'cursor', delta: 1 }
    case ',':
      return { type: 'cursor', delta: -1 }
    case ' ':
    case 't':
      return { type: 'toggle-cursor' }
    case 'z':
      return { type: 'undo' }
    case 'c':
      return { type: 'comment' }
    case 'p':
      return { type: 'params' }
    case 'r':
      return { type: 'runs' }
    case 'd':
      return { type: 'dyes' }
    case '?':
      return { type: 'help' }
    case '/':
      return { type: 'filter' }
  }
  if (/^[1-9]$/.test(e.key)) return { type: 'toggle-number', n: Number(e.key) }
  return null
}

/** The shortcut sheet, in display order. */
export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['J', '↓'], label: 'Next sample' },
  { keys: ['K', '↑'], label: 'Previous sample' },
  { keys: ['L', '→', ']'], label: 'Next locus (same sample)' },
  { keys: ['H', '←', '['], label: 'Previous locus' },
  { keys: ['N'], label: 'Next call needing attention (not reviewed, and flagged)' },
  { keys: ['⇧N'], label: 'Previous call needing attention' },
  { keys: ['U'], label: 'Next call not reviewed' },
  { keys: ['⇧U'], label: 'Previous call not reviewed' },
  { keys: ['↵'], label: 'Mark reviewed and go to the next sample' },
  { keys: ['M'], label: 'Mark reviewed, or clear the mark (stay)' },
  { keys: ['1–9'], label: 'Toggle the allele of numbered peak' },
  { keys: [',', '.'], label: 'Move the peak cursor' },
  { keys: ['Space', 'T'], label: 'Toggle the allele under the cursor' },
  { keys: ['Z', kbd('⌘Z')], label: 'Undo the last toggle' },
  { keys: ['C'], label: 'Edit the comment' },
  { keys: ['P'], label: 'Show or hide parameters' },
  { keys: ['R'], label: 'Overlay the sample’s other runs' },
  { keys: ['D'], label: 'Overlay the other dyes (pull-up)' },
  { keys: ['/'], label: 'Search samples' },
  { keys: ['?'], label: 'Show these shortcuts' },
]

/** The id `delta` steps from `current` in `order`, clamped at the ends. First item when nothing is current. */
export function stepId<T>(order: readonly T[], current: T | null, delta: number): T | null {
  if (order.length === 0) return null
  const i = current == null ? -1 : order.indexOf(current)
  if (i < 0) return delta < 0 ? (order[order.length - 1] as T) : (order[0] as T)
  const j = Math.max(0, Math.min(order.length - 1, i + delta))
  return order[j] as T
}

/**
 * The next id after `current` (in direction `dir`) whose item matches,
 * wrapping around once; null when none other matches.
 */
export function nextMatching<T>(order: readonly T[], current: T | null, match: (id: T) => boolean, dir: 1 | -1 = 1): T | null {
  const n = order.length
  if (n === 0) return null
  const start = current == null ? (dir > 0 ? -1 : n) : order.indexOf(current)
  for (let k = 1; k <= n; k++) {
    const i = (((start + dir * k) % n) + n) % n
    const id = order[i] as T
    if (id === current) continue
    if (match(id)) return id
  }
  return null
}

/** Move a cursor over `count` items (no wrap); -1 means none chosen yet. */
export function moveCursor(count: number, current: number, delta: number): number {
  if (count === 0) return -1
  if (current < 0) return delta > 0 ? 0 : count - 1
  return Math.max(0, Math.min(count - 1, current + delta))
}

/** Undo stack of toggles (bin ids per sample × locus); undoing a toggle is toggling it again. */
export interface ToggleRecord {
  sampleId: number
  locusId: number
  binId: number
  label: string
}

export function pushUndo(stack: readonly ToggleRecord[], r: ToggleRecord, max = 50): ToggleRecord[] {
  return [...stack, r].slice(-max)
}
