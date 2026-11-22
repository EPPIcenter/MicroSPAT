/**
 * Ladder base sizes: parsing pasted lists and checking the rules the engine
 * enforces (at least 4 sizes, positive, strictly increasing).
 */

export const MIN_LADDER_SIZES = 4

/** Split pasted text on commas, semicolons and whitespace. Tokens that are not numbers are returned separately. */
export function parseSizeList(text: string): { values: number[]; invalid: string[] } {
  const values: number[] = []
  const invalid: string[] = []
  for (const tok of text.split(/[\s,;]+/)) {
    if (tok === '') continue
    const n = Number(tok)
    if (Number.isFinite(n) && /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(tok)) values.push(n)
    else invalid.push(tok)
  }
  return { values, invalid }
}

export interface SizeCheck {
  /** Problem per entry index (entries are the editable texts). */
  entryErrors: Record<number, string>
  /** Problem with the list as a whole. */
  listError: string | null
  /** Parsed sizes when there are no problems, else null. */
  sizes: number[] | null
}

/** Check editable entries (text per size). Empty entries are ignored. */
export function checkSizes(entries: readonly string[]): SizeCheck {
  const entryErrors: Record<number, string> = {}
  const parsed: { i: number; v: number }[] = []
  entries.forEach((t, i) => {
    const s = t.trim()
    if (s === '') return
    const n = Number(s)
    if (!Number.isFinite(n)) entryErrors[i] = 'Not a number'
    else if (n <= 0) entryErrors[i] = 'Must be positive'
    else parsed.push({ i, v: n })
  })
  const seen = new Map<number, number>()
  for (const p of parsed) {
    const first = seen.get(p.v)
    if (first !== undefined) entryErrors[p.i] = `Duplicate of ${fmtSize(p.v)}`
    else seen.set(p.v, p.i)
  }
  for (let k = 1; k < parsed.length; k++) {
    const prev = parsed[k - 1]!
    const cur = parsed[k]!
    if (cur.v < prev.v && entryErrors[cur.i] === undefined) entryErrors[cur.i] = `Smaller than ${fmtSize(prev.v)} before it`
  }
  const count = parsed.length
  let listError: string | null = null
  if (Object.keys(entryErrors).length > 0) {
    const unordered = Object.values(entryErrors).some((e) => e.startsWith('Smaller'))
    listError = unordered ? 'Sizes must be in increasing order (Sort fixes this).' : 'Fix the marked sizes.'
  } else if (count < MIN_LADDER_SIZES) listError = `A ladder needs at least ${MIN_LADDER_SIZES} sizes.`
  return { entryErrors, listError, sizes: listError ? null : parsed.map((p) => p.v) }
}

/** Sorted, de-duplicated sizes from entries (unparsable and non-positive dropped). */
export function sortEntries(entries: readonly string[]): string[] {
  const vals = new Set<number>()
  for (const t of entries) {
    const n = Number(t.trim())
    if (t.trim() !== '' && Number.isFinite(n) && n > 0) vals.add(n)
  }
  return [...vals].sort((a, b) => a - b).map(fmtSize)
}

export function fmtSize(v: number): string {
  return String(+v.toPrecision(10))
}

export function formatSizeList(values: readonly number[]): string {
  return values.map(fmtSize).join(', ')
}
