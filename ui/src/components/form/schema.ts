/**
 * Declarative parameter schemas. Analysis screens describe their parameter
 * groups once (label, unit, default, bounds, help text) and ParameterForm
 * renders, validates and tracks dirty state from that.
 */

export type ParamValue = number | string | boolean | null
export type ParamValues = Record<string, ParamValue>

interface FieldBase {
  key: string
  label: string
  /** Tooltip text: what the parameter does. */
  help?: string
  unit?: string
  /** Hide the field unless this returns true (e.g. CWT-only settings). */
  visibleWhen?: (values: ParamValues) => boolean
  /** Extra check; return a message to block saving. */
  validate?: (value: ParamValue, values: ParamValues) => string | null
}

export interface NumberParam extends FieldBase {
  kind: 'number'
  default: number | null
  min?: number
  max?: number
  step?: number
  integer?: boolean
  /** Allow an empty value (null). */
  nullable?: boolean
}

export interface TextParam extends FieldBase {
  kind: 'text'
  default: string
  required?: boolean
  placeholder?: string
  pattern?: RegExp
  patternMessage?: string
}

export interface SelectParam extends FieldBase {
  kind: 'select'
  default: string
  options: { value: string; label: string }[]
}

export interface BooleanParam extends FieldBase {
  kind: 'boolean'
  default: boolean
  variant?: 'checkbox' | 'switch'
}

export type ParamField = NumberParam | TextParam | SelectParam | BooleanParam

export interface ParamSection {
  title?: string
  description?: string
  fields: ParamField[]
}

export interface ParamSchema {
  id: string
  title?: string
  description?: string
  sections: ParamSection[]
}

export function schemaFields(schema: ParamSchema): ParamField[] {
  return schema.sections.flatMap((s) => s.fields)
}

export function defaultsOf(schema: ParamSchema): ParamValues {
  const out: ParamValues = {}
  for (const f of schemaFields(schema)) out[f.key] = f.default
  return out
}

/** Fill missing keys from defaults; ignore keys the schema does not know. */
export function withDefaults(schema: ParamSchema, values: Partial<ParamValues> | null | undefined): ParamValues {
  const out = defaultsOf(schema)
  if (values) for (const k of Object.keys(out)) if (values[k] !== undefined) out[k] = values[k] as ParamValue
  return out
}

function fmtBound(n: number): string {
  return String(+n.toPrecision(6))
}

export function validateField(f: ParamField, v: ParamValue, values: ParamValues): string | null {
  if (f.visibleWhen && !f.visibleWhen(values)) return null
  switch (f.kind) {
    case 'number': {
      if (v === null || v === '') return f.nullable ? (f.validate?.(null, values) ?? null) : 'Required'
      if (typeof v !== 'number' || !Number.isFinite(v)) return 'Must be a number'
      if (f.integer && !Number.isInteger(v)) return 'Must be a whole number'
      if (f.min !== undefined && v < f.min) return `Must be ≥ ${fmtBound(f.min)}`
      if (f.max !== undefined && v > f.max) return `Must be ≤ ${fmtBound(f.max)}`
      break
    }
    case 'text': {
      const s = typeof v === 'string' ? v : ''
      if (f.required && s.trim() === '') return 'Required'
      if (f.pattern && s !== '' && !f.pattern.test(s)) return f.patternMessage ?? 'Invalid format'
      break
    }
    case 'select':
      if (!f.options.some((o) => o.value === v)) return 'Choose an option'
      break
    case 'boolean':
      if (typeof v !== 'boolean') return 'Invalid value'
      break
  }
  return f.validate?.(v, values) ?? null
}

/** Map of key -> message for every invalid visible field. */
export function validateValues(schema: ParamSchema, values: ParamValues): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const f of schemaFields(schema)) {
    const e = validateField(f, values[f.key] ?? null, values)
    if (e) errors[f.key] = e
  }
  return errors
}

function same(a: ParamValue | undefined, b: ParamValue | undefined): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a))
  return (a ?? null) === (b ?? null)
}

/** Keys whose value differs from `saved`. */
export function dirtyKeys(schema: ParamSchema, values: ParamValues, saved: ParamValues): string[] {
  return schemaFields(schema)
    .filter((f) => !same(values[f.key], saved[f.key]))
    .map((f) => f.key)
}

/** Keys whose value differs from the schema default. */
export function nonDefaultKeys(schema: ParamSchema, values: ParamValues): string[] {
  return schemaFields(schema)
    .filter((f) => !same(values[f.key], f.default))
    .map((f) => f.key)
}

/**
 * Parse number-input text. Empty means null; anything unparsable is kept as
 * NaN so validation can report it without losing what the user typed.
 */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/,/g, '')
  if (t === '') return null
  // Number('') and Number(' ') are 0; Number('1e') is NaN, which we want.
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

/** Display text for a number value: no float noise. */
export function formatNumber(v: ParamValue): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return ''
  return String(+v.toPrecision(10))
}
