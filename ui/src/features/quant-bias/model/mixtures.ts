/**
 * Editing a control mixture by hand: components (a control and its share,
 * in percent), the running sum, and the same checks the engine applies in
 * `set_control_mixtures` (controls of the project's bin estimator, each at
 * most once, shares in (0, 100], summing to 100 within ±1 percentage point;
 * the engine rescales them to exactly 1).
 */
import type { MixtureComponent } from '@/api/bindings'

export interface DraftComponent {
  key: string
  controlId: number | null
  /** Percent of the mixture; null while empty or unparsable. */
  percent: number | null
}

export interface MixtureCheck {
  /** Sum of the entered percents. */
  sum: number
  /** 100 − sum. */
  remainder: number
  /** Per-row problems by component key. */
  rowErrors: Record<string, string>
  /** Problems with the mixture as a whole. */
  errors: string[]
  /** Advice that does not block saving. */
  warnings: string[]
  ok: boolean
}

/** Allowed distance of the sum from 100%, as the engine (±0.01). */
export const SUM_TOLERANCE = 1

let seq = 0
export function newComponent(controlId: number | null = null, percent: number | null = null): DraftComponent {
  return { key: `c${++seq}`, controlId, percent }
}

export function mixtureSum(components: readonly DraftComponent[]): number {
  let s = 0
  for (const c of components) if (c.percent != null && Number.isFinite(c.percent)) s += c.percent
  return Math.round(s * 1e6) / 1e6
}

export function checkMixture(components: readonly DraftComponent[], controlIds: ReadonlySet<number>): MixtureCheck {
  const rowErrors: Record<string, string> = {}
  const errors: string[] = []
  const warnings: string[] = []
  const seen = new Set<number>()
  for (const c of components) {
    if (c.controlId == null) rowErrors[c.key] = 'Choose a control.'
    else if (!controlIds.has(c.controlId)) rowErrors[c.key] = "Not a control of this project's bin estimator."
    else if (seen.has(c.controlId)) rowErrors[c.key] = 'This control is already in the mixture.'
    else if (c.percent == null || !Number.isFinite(c.percent)) rowErrors[c.key] = 'Enter its share.'
    else if (c.percent <= 0 || c.percent > 100) rowErrors[c.key] = 'A share must be above 0 and at most 100%.'
    if (c.controlId != null) seen.add(c.controlId)
  }
  const sum = mixtureSum(components)
  if (components.length === 0) errors.push('Add at least one control.')
  else if (Math.abs(sum - 100) > SUM_TOLERANCE) errors.push(`Shares sum to ${fmtPercentNumber(sum)}%, not 100%.`)
  if (components.length === 1 && Object.keys(rowErrors).length === 0)
    warnings.push('A single strain at 100% says nothing about bias; mixtures of two or more strains do.')
  return { sum, remainder: Math.round((100 - sum) * 1e6) / 1e6, rowErrors, errors, warnings, ok: errors.length === 0 && Object.keys(rowErrors).length === 0 }
}

export function fmtPercentNumber(v: number): string {
  return String(+v.toFixed(2))
}

/** Engine components (proportions sum to 1). */
export function toComponents(components: readonly DraftComponent[]): MixtureComponent[] {
  return components.filter((c) => c.controlId != null && c.percent != null).map((c) => ({ control_id: c.controlId!, proportion: c.percent! / 100 }))
}

/** Draft rows from stored components (percent rounded to 0.01). */
export function fromComponents(cs: readonly MixtureComponent[]): DraftComponent[] {
  return cs.map((c) => newComponent(c.control_id, Math.round(c.proportion * 10000) / 100))
}

/** Put the rest of 100% into one component. */
export function fillRemainder(components: readonly DraftComponent[], key: string): DraftComponent[] {
  const others = mixtureSum(components.filter((c) => c.key !== key))
  const rest = Math.round((100 - others) * 100) / 100
  return components.map((c) => (c.key === key ? { ...c, percent: rest > 0 ? rest : c.percent } : c))
}

/** "3D7 70% · DD2 30%". */
export function describeMixture(cs: readonly MixtureComponent[], labelOf?: (id: number) => string | undefined): string {
  return cs.map((c) => `${c.label ?? labelOf?.(c.control_id) ?? `#${c.control_id}`} ${fmtPercentNumber(c.proportion * 100)}%`).join(' · ')
}

/** True when every sample in `rows` has the same composition (for editing several at once). */
export function sameComposition(a: readonly MixtureComponent[], b: readonly MixtureComponent[]): boolean {
  if (a.length !== b.length) return false
  const m = new Map(a.map((c) => [c.control_id, c.proportion]))
  return b.every((c) => m.has(c.control_id) && Math.abs(m.get(c.control_id)! - c.proportion) < 1e-6)
}
