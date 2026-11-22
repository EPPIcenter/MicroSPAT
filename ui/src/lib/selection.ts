/**
 * Selection rules shared by DataTable and PlateGrid: plain click selects one,
 * Cmd/Ctrl-click toggles, Shift-click selects the range from the anchor.
 */

export type SelectionMode = 'none' | 'single' | 'multi'

export interface SelectionState {
  selected: readonly string[]
  /** Item a Shift-range starts from: the last plain or toggle click. */
  anchor: string | null
}

export interface ClickMods {
  shift?: boolean
  /** Cmd on macOS, Ctrl elsewhere. */
  toggle?: boolean
}

/** Items from a to b inclusive in display order (either direction). */
export function rangeBetween(order: readonly string[], a: string, b: string): string[] {
  const i = order.indexOf(a)
  const j = order.indexOf(b)
  if (i < 0 || j < 0) return j >= 0 ? [b] : []
  const [lo, hi] = i <= j ? [i, j] : [j, i]
  return order.slice(lo, hi + 1)
}

/**
 * Apply a click on `id`. `rangeOf` turns an anchor..id pair into the items
 * it covers (linear for lists, rectangular for plates).
 */
export function clickSelect(
  state: SelectionState,
  id: string,
  mods: ClickMods,
  mode: SelectionMode,
  rangeOf: (a: string, b: string) => string[],
): SelectionState {
  if (mode === 'none') return state
  if (mode === 'single') return { selected: [id], anchor: id }
  if (mods.shift && state.anchor != null) {
    const range = rangeOf(state.anchor, id)
    const base = mods.toggle ? state.selected.filter((s) => !range.includes(s)) : []
    return { selected: [...base, ...range], anchor: state.anchor }
  }
  if (mods.toggle) {
    const has = state.selected.includes(id)
    return { selected: has ? state.selected.filter((s) => s !== id) : [...state.selected, id], anchor: id }
  }
  return { selected: [id], anchor: id }
}

/** Select a whole group (plate row/column, select-all); toggle adds to the selection. */
export function selectGroup(state: SelectionState, ids: readonly string[], toggle: boolean): SelectionState {
  if (!toggle) return { selected: [...ids], anchor: ids[0] ?? null }
  const allIn = ids.every((i) => state.selected.includes(i))
  return allIn
    ? { selected: state.selected.filter((s) => !ids.includes(s)), anchor: state.anchor }
    : { selected: [...state.selected, ...ids.filter((i) => !state.selected.includes(i))], anchor: state.anchor }
}

/** Keep `selected` in display order, dropping ids no longer present. */
export function orderSelection(order: readonly string[], selected: readonly string[]): string[] {
  const set = new Set(selected)
  return order.filter((o) => set.has(o))
}
