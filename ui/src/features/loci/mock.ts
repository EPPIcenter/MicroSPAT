/**
 * Mock handlers for loci and locus sets. Ids and labels match the plates mock
 * (both come from DEMO_LOCI); run counts come from its plate maps.
 */
import type {
  CreateLocusParams,
  CreateLocusSetParams,
  CsvSource,
  IdParams,
  Locus,
  LocusSetDetail,
  UpdateLocusParams,
  UpdateLocusSetParams,
} from '@/api/bindings'
import { registerMocks, type MockHandler } from '@/api/mock/registry'
import { RpcError } from '@/api/transport'
import { DEMO_LOCI } from '@/mock/data'
import { mockPlateRuns } from '@/features/samples/mock'
import { previewLociCsv } from './importPreview'

type L = Omit<Locus, 'run_count' | 'locus_set_ids'>
let loci: L[] = DEMO_LOCI.map((l, i) => ({
  id: i + 1,
  label: l.label,
  color: l.color,
  min_base_length: l.range[0],
  max_base_length: l.range[1],
  nucleotide_repeat_length: l.repeat,
}))
let nextLocus = loci.length + 1
let sets: { id: number; label: string; locus_ids: number[] }[] = [{ id: 1, label: 'Demo panel', locus_ids: loci.map((l) => l.id) }]
let nextSet = 2

async function runCounts(): Promise<Map<number, number>> {
  const m = new Map<number, number>()
  for (const r of await mockPlateRuns()) m.set(r.run.locus_id, (m.get(r.run.locus_id) ?? 0) + 1)
  return m
}

function full(l: L, counts: Map<number, number>): Locus {
  return { ...l, run_count: counts.get(l.id) ?? 0, locus_set_ids: sets.filter((s) => s.locus_ids.includes(l.id)).map((s) => s.id) }
}

function find(id: number) {
  const l = loci.find((x) => x.id === id)
  if (!l) throw new RpcError('not_found', `Locus ${id} does not exist`)
  return l
}

function check(label: string, min: number, max: number, repeat: number, except: number) {
  const t = label.trim()
  if (!t) throw new RpcError('invalid', 'Locus label cannot be empty.')
  if (!(min >= 0 && min < max)) throw new RpcError('invalid', `Locus ${t}: the size range must satisfy 0 ≤ min < max (got ${min}–${max}).`)
  if (!(repeat > 0 && repeat <= 100)) throw new RpcError('invalid', `Locus ${t}: the repeat length must be a positive number of bases.`)
  if (loci.some((l) => l.id !== except && l.label.toLowerCase() === t.toLowerCase())) throw new RpcError('conflict', `A locus named "${t}" already exists.`)
  return t
}

async function setDetail(id: number): Promise<LocusSetDetail> {
  const s = sets.find((x) => x.id === id)
  if (!s) throw new RpcError('not_found', `Locus set ${id} does not exist`)
  const counts = await runCounts()
  return { id: s.id, label: s.label, loci: s.locus_ids.map((i) => full(find(i), counts)).sort((a, b) => a.label.localeCompare(b.label)) }
}

function checkSet(label: string, ids: number[], except: number) {
  const t = label.trim()
  if (!t) throw new RpcError('invalid', 'Locus set label cannot be empty.')
  if (sets.some((s) => s.id !== except && s.label.toLowerCase() === t.toLowerCase())) throw new RpcError('conflict', `A locus set named "${t}" already exists.`)
  if (ids.length === 0) throw new RpcError('invalid', 'A locus set needs at least one locus.')
  ids.forEach(find)
  return t
}

const handlers: Record<string, MockHandler> = {
  list_loci: async () => {
    const counts = await runCounts()
    return [...loci].sort((a, b) => a.label.localeCompare(b.label)).map((l) => full(l, counts))
  },
  get_locus: async (params) => full(find((params as IdParams).id), await runCounts()),
  create_locus: async (params, ctx) => {
    const p = params as CreateLocusParams
    const label = check(p.label, p.min_base_length, p.max_base_length, p.nucleotide_repeat_length, 0)
    const l = { ...p, label, id: nextLocus++ }
    loci.push(l)
    ctx.changed('loci', [l.id])
    ctx.changed('workspace')
    return full(l, await runCounts())
  },
  update_locus: async (params, ctx) => {
    const p = params as UpdateLocusParams
    const cur = find(p.id)
    const counts = await runCounts()
    const next = { ...cur, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) } as L
    next.label = check(next.label, next.min_base_length, next.max_base_length, next.nucleotide_repeat_length, cur.id)
    const runs = counts.get(cur.id) ?? 0
    if (next.color !== cur.color && runs > 0)
      throw new RpcError('in_use', `Locus ${cur.label} has ${runs} runs on the ${cur.color} dye; clear those plate maps before changing its dye.`)
    Object.assign(cur, next)
    ctx.changed('loci', [cur.id])
    return full(cur, counts)
  },
  delete_locus: async (params, ctx) => {
    const l = find((params as IdParams).id)
    const runs = (await runCounts()).get(l.id) ?? 0
    if (runs > 0) throw new RpcError('in_use', `Locus ${l.label} has ${runs} runs on plate(s) in this workspace. Clear those plate maps first.`)
    const inSets = sets.filter((s) => s.locus_ids.includes(l.id))
    if (inSets.length) throw new RpcError('in_use', `Locus ${l.label} is in locus set(s) ${inSets.map((s) => s.label).join(', ')}. Remove it from them first.`)
    loci = loci.filter((x) => x.id !== l.id)
    ctx.changed('loci', [l.id])
    ctx.changed('workspace')
    return null
  },
  import_loci_csv: async (params, ctx) => {
    const p = params as CsvSource
    const preview = previewLociCsv(p.content ?? '', loci.map((l) => l.label))
    if (preview.headerError) throw new RpcError('invalid', preview.headerError)
    if (preview.rejected) throw new RpcError('invalid', `The loci CSV has ${preview.rejected} problem(s). Nothing was imported.`)
    const counts = await runCounts()
    const created = preview.rows.map((r) => {
      const l = { ...r.locus!, id: nextLocus++ }
      loci.push(l)
      return full(l, counts)
    })
    ctx.changed('loci', created.map((l) => l.id))
    ctx.changed('workspace')
    return { created }
  },
  list_locus_sets: () => [...sets].sort((a, b) => a.label.localeCompare(b.label)),
  get_locus_set: (params) => setDetail((params as IdParams).id),
  create_locus_set: (params, ctx) => {
    const p = params as CreateLocusSetParams
    const label = checkSet(p.label, p.locus_ids, 0)
    const s = { id: nextSet++, label, locus_ids: [...new Set(p.locus_ids)] }
    sets.push(s)
    ctx.changed('locus_sets', [s.id])
    ctx.changed('loci')
    ctx.changed('workspace')
    return setDetail(s.id)
  },
  update_locus_set: (params, ctx) => {
    const p = params as UpdateLocusSetParams
    const s = sets.find((x) => x.id === p.id)
    if (!s) throw new RpcError('not_found', `Locus set ${p.id} does not exist`)
    const label = p.label !== undefined ? checkSet(p.label, p.locus_ids ?? s.locus_ids, s.id) : s.label
    if (p.locus_ids) checkSet(label, p.locus_ids, s.id)
    s.label = label
    if (p.locus_ids) s.locus_ids = [...new Set(p.locus_ids)]
    ctx.changed('locus_sets', [s.id])
    ctx.changed('loci')
    return setDetail(s.id)
  },
  delete_locus_set: (params, ctx) => {
    const id = (params as IdParams).id
    if (!sets.some((s) => s.id === id)) throw new RpcError('not_found', `Locus set ${id} does not exist`)
    sets = sets.filter((s) => s.id !== id)
    ctx.changed('locus_sets', [id])
    ctx.changed('loci')
    ctx.changed('workspace')
    return null
  },
}

registerMocks(handlers)
