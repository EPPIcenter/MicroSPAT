/**
 * Locus parameters as one flat form. `LocusParams` is nested
 * (`{ scan, filter, genotyping? … }`); the form edits prefixed keys
 * (`scan.smoothing_window`, `filter.min_peak_height`, …) so one
 * ParameterForm state covers every group, and only the changed keys are
 * sent back (the engine merges partial updates).
 */
import type { LocusParams, ProjectKind } from '@/api/bindings'
import type { ParamField, ParamSchema, ParamValues } from '@/components/form/schema'
import { artifactEstimatorParams, binEstimatorParams, filterParams, genotypingParams, quantBiasParams, scanningParams } from '@/params/schemas'
import { KINDS } from './kinds'

export type ParamGroupKey = 'scan' | 'filter' | 'bins' | 'artifact' | 'quant_bias' | 'genotyping'

export interface ParamGroup {
  key: ParamGroupKey
  schema: ParamSchema
  /** Re-scans every run when changed (slow); shown so users know. */
  slow?: boolean
}

const KIND_SCHEMA: Record<'bins' | 'artifact' | 'quant_bias' | 'genotyping', ParamSchema> = {
  bins: binEstimatorParams,
  artifact: artifactEstimatorParams,
  quant_bias: quantBiasParams,
  genotyping: genotypingParams,
}

/**
 * The groups a kind edits, in display order: its own section first (what is
 * tuned most), then filters, then scanning. Pass `kindSchema` to override the
 * kind's schema (e.g. while its keys are being aligned with the engine).
 */
export function paramGroupsFor(kind: ProjectKind, kindSchema?: ParamSchema): ParamGroup[] {
  const section = KINDS[kind].section
  return [
    { key: section, schema: kindSchema ?? KIND_SCHEMA[section] },
    { key: 'filter', schema: filterParams },
    { key: 'scan', schema: scanningParams, slow: true },
  ]
}

function strip(values: ParamValues, group: string): ParamValues {
  const out: ParamValues = {}
  const pre = `${group}.`
  for (const [k, v] of Object.entries(values)) if (k.startsWith(pre)) out[k.slice(pre.length)] = v
  return out
}

function prefixField(f: ParamField, group: string): ParamField {
  return {
    ...f,
    key: `${group}.${f.key}`,
    visibleWhen: f.visibleWhen ? (all) => f.visibleWhen!(strip(all, group)) : undefined,
    validate: f.validate ? (v, all) => f.validate!(v, strip(all, group)) : undefined,
  } as ParamField
}

/** One group's schema with prefixed keys (cross-field rules still see their own group). */
export function prefixedSchema(g: ParamGroup): ParamSchema {
  return {
    ...g.schema,
    id: `${g.key}`,
    sections: g.schema.sections.map((s) => ({ ...s, fields: s.fields.map((f) => prefixField(f, g.key)) })),
  }
}

/** All groups as one schema (for validation and dirty tracking). */
export function combinedSchema(groups: readonly ParamGroup[]): ParamSchema {
  return { id: groups.map((g) => g.key).join('+'), sections: groups.flatMap((g) => prefixedSchema(g).sections) }
}

/** Nested engine params → flat prefixed values. Unknown engine fields are ignored. */
export function flattenParams(p: LocusParams | null | undefined, groups: readonly ParamGroup[]): ParamValues {
  const out: ParamValues = {}
  if (!p) return out
  for (const g of groups) {
    const sec = (p as Record<string, unknown>)[g.key] as Record<string, unknown> | undefined
    if (!sec) continue
    for (const s of g.schema.sections)
      for (const f of s.fields) {
        const v = sec[f.key]
        if (v !== undefined) out[`${g.key}.${f.key}`] = v as ParamValues[string]
      }
  }
  return out
}

/**
 * Flat values of `keys` → a partial nested update. The generated type asks
 * for whole sections, but the engine merges partial objects
 * (`update_project_locus_params`), so the cast is safe.
 */
export function partialParams(values: ParamValues, keys: readonly string[]): LocusParams {
  const out: Record<string, Record<string, unknown>> = {}
  for (const k of keys) {
    const dot = k.indexOf('.')
    if (dot < 0) continue
    const g = k.slice(0, dot)
    const f = k.slice(dot + 1)
    ;(out[g] ??= {})[f] = values[k]
  }
  return out as unknown as LocusParams
}

/** Changed keys grouped by group, for "3 calling, 1 filter changes". */
export function changedByGroup(keys: readonly string[]): Partial<Record<ParamGroupKey, number>> {
  const out: Partial<Record<ParamGroupKey, number>> = {}
  for (const k of keys) {
    const g = k.slice(0, k.indexOf('.')) as ParamGroupKey
    out[g] = (out[g] ?? 0) + 1
  }
  return out
}
