/**
 * Mock handlers for ladders. Ids and labels of the first two match the plates
 * mock; plate counts come from its plate list.
 */
import type { CreateLadderParams, IdParams, Ladder, LadderSpec, PlateSummary, UpdateLadderParams } from '@/api/bindings'
import { dispatchMock, registerMocks, type MockHandler } from '@/api/mock/registry'
import { RpcError } from '@/api/transport'
import { LIZ500 } from '@/mock/data'
import { checkSizes, fmtSize } from './baseSizes'
import { DEFAULT_SPEC } from './spec'

const GS600 = [20, 40, 60, 80, 100, 114, 120, 140, 160, 180, 200, 214, 220, 240, 250, 260, 280, 300, 314, 320, 340, 360, 380, 400, 414, 420, 440, 460, 480, 500, 514, 520, 540, 560, 580, 600]
const with_ = (color: LadderSpec['color'], base_sizes: number[]): LadderSpec => ({ ...DEFAULT_SPEC, scanning: { ...DEFAULT_SPEC.scanning }, color, base_sizes })

let ladders: { id: number; label: string; spec: LadderSpec }[] = [
  { id: 1, label: 'GeneScan 500 LIZ', spec: with_('orange', LIZ500) },
  { id: 2, label: 'HD ROX 400', spec: with_('red', DEFAULT_SPEC.base_sizes) },
  { id: 3, label: 'GeneScan 500 ROX', spec: with_('red', LIZ500) },
  { id: 4, label: 'GeneScan 600 LIZ', spec: with_('orange', GS600) },
]
let nextId = 5

async function plateCounts(): Promise<Map<number, number>> {
  const m = new Map<number, number>()
  try {
    for (const p of (await dispatchMock('list_plates', null)) as PlateSummary[]) m.set(p.ladder_id, (m.get(p.ladder_id) ?? 0) + 1)
  } catch {
    // No plates mock: no plate uses any ladder.
  }
  return m
}

async function out(l: (typeof ladders)[number]): Promise<Ladder> {
  return { ...l, plate_count: (await plateCounts()).get(l.id) ?? 0 }
}

function find(id: number) {
  const l = ladders.find((x) => x.id === id)
  if (!l) throw new RpcError('not_found', `Ladder ${id} does not exist`)
  return l
}

/** The engine's `validate_spec` checks. */
function validate(spec: LadderSpec) {
  const c = checkSizes(spec.base_sizes.map(fmtSize))
  if (!c.sizes) throw new RpcError('invalid', 'Ladder sizes must be positive numbers in strictly increasing order.')
  if (!(spec.sq_flag_limit > 0 && spec.sq_unusable_limit >= spec.sq_flag_limit))
    throw new RpcError('invalid', 'Sizing-quality limits must be positive, with the unusable limit at or above the flag limit.')
  if (!(spec.min_relative_height >= 0 && spec.min_relative_height < 1)) throw new RpcError('invalid', 'Min relative height must be a fraction from 0 up to 1.')
  if (spec.maximum_missing_peak_count >= spec.base_sizes.length) throw new RpcError('invalid', 'Maximum missing peaks must be fewer than the number of ladder sizes.')
}

function checkLabel(label: string, except: number) {
  const t = label.trim()
  if (!t) throw new RpcError('invalid', 'Ladder label cannot be empty.')
  if (ladders.some((l) => l.id !== except && l.label.toLowerCase() === t.toLowerCase())) throw new RpcError('conflict', `A ladder named "${t}" already exists.`)
  return t
}

const handlers: Record<string, MockHandler> = {
  list_ladders: async () => {
    const counts = await plateCounts()
    return [...ladders].sort((a, b) => a.label.localeCompare(b.label)).map((l) => ({ ...l, plate_count: counts.get(l.id) ?? 0 }))
  },
  get_ladder: (params) => out(find((params as IdParams).id)),
  create_ladder: (params, ctx) => {
    const p = params as CreateLadderParams
    const label = checkLabel(p.label, 0)
    // Like the engine: omitted fields take the HD ROX 400 defaults.
    const spec: LadderSpec = { ...DEFAULT_SPEC, ...p.spec, scanning: { ...DEFAULT_SPEC.scanning, ...p.spec.scanning } }
    validate(spec)
    const l = { id: nextId++, label, spec }
    ladders.push(l)
    ctx.changed('ladders', [l.id])
    ctx.changed('workspace')
    return out(l)
  },
  update_ladder: async (params, ctx) => {
    const p = params as UpdateLadderParams
    const l = find(p.id)
    const label = p.label !== undefined ? checkLabel(p.label, l.id) : l.label
    if (p.spec) {
      validate(p.spec)
      const used = (await plateCounts()).get(l.id) ?? 0
      if (p.spec.color !== l.spec.color && used > 0)
        throw new RpcError('in_use', `Ladder "${l.label}" sizes ${used} plate(s); its dye cannot change. Create a new ladder instead.`)
    }
    l.label = label
    if (p.spec) l.spec = p.spec
    ctx.changed('ladders', [l.id])
    ctx.changed('plates')
    return out(l)
  },
  delete_ladder: async (params, ctx) => {
    const l = find((params as IdParams).id)
    const used = (await plateCounts()).get(l.id) ?? 0
    if (used > 0) throw new RpcError('in_use', `Ladder "${l.label}" is used by ${used} plate(s). Delete those plates or size them with another ladder first.`)
    ladders = ladders.filter((x) => x.id !== l.id)
    ctx.changed('ladders', [l.id])
    ctx.changed('workspace')
    return null
  },
}

registerMocks(handlers)
