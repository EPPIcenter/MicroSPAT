/**
 * Mock controls (`pnpm dev:mock`, `?mock`): 3D7, HB3 and DD2 on "Mock bins",
 * each with an allele at every locus, and W2 with one locus left empty.
 * Labels are unique per bin estimator; a control used in a mixture cannot be
 * deleted (the quantification-bias mock reports the use).
 */
import type { Bin, Control, CreateControlParams, IdParams, ListControlsParams, ProjectDetail, UpdateControlParams } from '@/api/bindings'
import { dispatchMock, registerMocks, type MockHandler } from '@/api/mock/registry'
import { RpcError } from '@/api/transport'
import { mockProjects, projectLoci } from '@/features/projects-shared/mock'

interface StoredControl {
  id: number
  label: string
  bin_estimator_id: number
  alleles: Map<number, number | null>
}

export const mockControls = new Map<number, StoredControl>()
let nextId = 1

/** Projects (titles) whose mixtures use a control; set by the quantification-bias mock. */
export const controlUse: { titles: (controlId: number) => string[]; count: (controlId: number) => number } = {
  titles: () => [],
  count: () => 0,
}

async function binEstimator(id: number): Promise<ProjectDetail> {
  return (await dispatchMock('get_project', { id })) as ProjectDetail
}

export async function mockBins(beId: number, locusId: number): Promise<Bin[]> {
  return ((await dispatchMock('get_locus_bins', { project_id: beId, locus_id: locusId })) as { bins: Bin[] }).bins
}

/** Bins of every locus of a bin estimator, fetched once (each mock call costs a simulated round trip). */
export async function mockBinsByLocus(beId: number, locusIds: readonly number[]): Promise<Map<number, Bin[]>> {
  const all = await Promise.all(locusIds.map((l) => mockBins(beId, l)))
  return new Map(locusIds.map((l, i) => [l, all[i]!]))
}

let seeded: Promise<void> | null = null
export function seedControls(): Promise<void> {
  seeded ??= (async () => {
    // Only methods that do not seed projects (that seed waits for this one): bins seed the genotyping study.
    await dispatchMock('get_locus_bins', { project_id: 0, locus_id: 0 })
    const be = [...mockProjects.values()].find((p) => p.kind === 'bin_estimator')
    if (!be) return
    const loci = (await projectLoci(be)).map((l) => ({ locus_id: l.id }))
    const strains: [string, number, number | null][] = [
      ['3D7', 1, null],
      ['HB3', 4, null],
      ['DD2', 7, null],
      ['W2', 3, loci[loci.length - 1]?.locus_id ?? null],
    ]
    const binsBy = await mockBinsByLocus(
      be.id,
      loci.map((l) => l.locus_id),
    )
    for (const [label, offset, skip] of strains) {
      const alleles = new Map<number, number | null>()
      for (const l of loci) {
        const bins = binsBy.get(l.locus_id) ?? []
        alleles.set(l.locus_id, l.locus_id === skip || !bins.length ? null : (bins[(offset + (l.locus_id % 2)) % bins.length]?.id ?? null))
      }
      mockControls.set(nextId, { id: nextId++, label, bin_estimator_id: be.id, alleles })
    }
  })()
  return seeded
}

export async function controlView(
  c: StoredControl,
  cache?: Map<number, { be: ProjectDetail; bins: Map<number, Bin[]> }>,
): Promise<Control> {
  let hit = cache?.get(c.bin_estimator_id)
  if (!hit) {
    const be = await binEstimator(c.bin_estimator_id)
    hit = {
      be,
      bins: await mockBinsByLocus(
        c.bin_estimator_id,
        be.loci.map((l) => l.locus_id),
      ),
    }
    cache?.set(c.bin_estimator_id, hit)
  }
  const be = hit.be
  const alleles = []
  for (const l of be.loci) {
    const bin = c.alleles.get(l.locus_id) ?? null
    const bins = hit.bins.get(l.locus_id) ?? []
    const found = bins.find((b) => b.id === bin)
    // A bin that is gone reads as the engine reports it: unset, with the deleted bin named.
    if (bin != null && !found && bins.length)
      alleles.push({
        locus_id: l.locus_id,
        locus_label: l.label,
        bin_id: null,
        bin_label: null,
        deleted_bin: { label: `#${bin}`, base_size: 0 },
      })
    else alleles.push({ locus_id: l.locus_id, locus_label: l.label, bin_id: bin, bin_label: found?.label ?? null })
  }
  return {
    id: c.id,
    label: c.label,
    bin_estimator_id: c.bin_estimator_id,
    bin_estimator_title: be.project.title,
    alleles,
    mixture_count: controlUse.count(c.id),
  }
}

function get(id: number): StoredControl {
  const c = mockControls.get(id)
  if (!c) throw new RpcError('not_found', `Control ${id} does not exist`)
  return c
}

function checkLabel(label: string, be: number, except: number): string {
  const l = label.trim()
  if (!l) throw new RpcError('invalid', 'Control label cannot be empty.')
  const other = [...mockControls.values()].find((c) => c.bin_estimator_id === be && c.id !== except && c.label === l)
  if (other) throw new RpcError('conflict', `This bin estimator already has a control named "${other.label}".`)
  return l
}

async function setAlleles(c: StoredControl, alleles: { locus_id: number; bin_id: number | null }[] | undefined) {
  for (const a of alleles ?? []) {
    if (a.bin_id != null && !(await mockBins(c.bin_estimator_id, a.locus_id)).some((b) => b.id === a.bin_id))
      throw new RpcError('invalid', `Bin ${a.bin_id} is not a bin of this control's bin estimator at locus ${a.locus_id}.`)
    c.alleles.set(a.locus_id, a.bin_id)
  }
}

const handlers: Record<string, MockHandler> = {
  list_controls: async (params) => {
    const be = (params as ListControlsParams | null)?.bin_estimator_id
    const list = [...mockControls.values()].filter((c) => be == null || c.bin_estimator_id === be)
    const cache = new Map()
    const out = []
    for (const c of list) out.push(await controlView(c, cache))
    return out.sort((a, b) => a.bin_estimator_title.localeCompare(b.bin_estimator_title) || a.label.localeCompare(b.label))
  },
  create_control: async (params, ctx) => {
    const p = params as CreateControlParams
    const be = await binEstimator(p.bin_estimator_id)
    if (be.project.kind !== 'bin_estimator') throw new RpcError('invalid', `${be.project.title} is not a bin estimator.`)
    const c: StoredControl = {
      id: nextId,
      label: checkLabel(p.label, p.bin_estimator_id, 0),
      bin_estimator_id: p.bin_estimator_id,
      alleles: new Map(),
    }
    await setAlleles(c, p.alleles)
    nextId++
    mockControls.set(c.id, c)
    ctx.changed('controls', [c.id])
    return controlView(c)
  },
  update_control: async (params, ctx) => {
    const p = params as UpdateControlParams
    const c = get(p.id)
    const label = p.label !== undefined ? checkLabel(p.label, c.bin_estimator_id, c.id) : c.label
    const copy = { ...c, alleles: new Map(c.alleles) }
    await setAlleles(copy, p.alleles)
    c.label = label
    c.alleles = copy.alleles
    ctx.changed('controls', [c.id])
    ctx.changed('projects', null)
    return controlView(c)
  },
  delete_control: (params, ctx) => {
    const c = get((params as IdParams).id)
    const n = controlUse.count(c.id)
    if (n > 0)
      throw new RpcError(
        'in_use',
        `Control ${c.label} is in ${n} control mixture(s) of ${controlUse.titles(c.id).join(', ')}. Remove those samples first.`,
      )
    mockControls.delete(c.id)
    ctx.changed('controls', [c.id])
    return null
  },
}

const wrapped: Record<string, MockHandler> = {}
for (const [k, h] of Object.entries(handlers))
  wrapped[k] = async (params, ctx) => {
    await seedControls()
    return h(params, ctx)
  }
registerMocks(wrapped)
