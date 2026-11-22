import { describe, expect, it } from 'vitest'
import '@/api/mock/handlers'
import { dispatchMock } from '@/api/mock/registry'
import type { Control, LocusQuantBias, ProjectDetail, ProjectSummary } from '@/api/bindings'

describe('mock backend', () => {
  it('serves controls and a quantification-bias estimator', async () => {
    const controls = (await Promise.race([
      dispatchMock('list_controls', {}),
      new Promise((_, rej) => setTimeout(() => rej(new Error('list_controls hangs')), 15000)),
    ])) as Control[]
    console.log(JSON.stringify(controls.map((c) => [c.label, c.alleles.map((a) => a.bin_label)])))
    expect(controls.map((c) => c.label)).toEqual(['3D7', 'DD2', 'HB3', 'W2'])
    const qb = ((await dispatchMock('list_projects', { kind: 'quant_bias_estimator' })) as ProjectSummary[])[0]!
    const d = (await dispatchMock('get_project', { id: qb.id })) as ProjectDetail
    const r = (await dispatchMock('get_locus_quant_bias', { project_id: qb.id, locus_id: d.loci[0]!.locus_id })) as LocusQuantBias
    console.log(JSON.stringify(r.points.slice(0, 4)))
    expect(new Set(r.points.map((p) => `${p.sample_id}:${p.size}`)).size).toBe(r.points.length)
    expect(r.estimate!.beta).toBeLessThan(0)
  }, 20000)
})
