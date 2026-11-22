/** The mock study serves what the review needs: engine-shaped call rows, review marks, several runs per sample, and their traces and wells. */
import { describe, expect, it } from 'vitest'
import '@/api/mock/handlers'
import { dispatchMock } from '@/api/mock/registry'
import type { ChannelTrace, LocusCalls, ProjectDetail, ProjectSummary, SampleCalls, SampleLocusCallView, WellDetail } from '@/api/bindings'

async function study() {
  const p = ((await dispatchMock('list_projects', { kind: 'genotyping' })) as ProjectSummary[]).find((x) => x.title === 'Mock genotyping')!
  const d = (await dispatchMock('get_project', { id: p.id })) as ProjectDetail
  const lid = d.loci[0]!.locus_id
  const calls = (await dispatchMock('get_locus_calls', { project_id: p.id, locus_id: lid })) as LocusCalls
  return { pid: p.id, lid, calls }
}

describe('genotyping mock', () => {
  it('gives some samples several runs, each with a trace and a well whose other dyes can be overlaid', async () => {
    const { pid, lid, calls } = await study()
    const row = calls.rows.find((r) => r.barcode === 'MX-004')!
    expect(row.run_count).toBe(3)
    expect(calls.rows.filter((r) => (r.run_count ?? 0) > 1).length).toBeGreaterThan(3)
    const v = (await dispatchMock('get_sample_locus_call', { project_id: pid, sample_id: row.sample_id, locus_id: lid })) as SampleLocusCallView
    expect(v.runs.map((r) => r.plate_label)).toEqual(['MOCK-1', 'MOCK-2', 'MOCK-3'])
    expect(v.runs.filter((r) => r.is_reference)).toHaveLength(1)
    const rerun = v.runs[1]!
    const t = (await dispatchMock('get_channel_trace', { id: rerun.channel_id })) as ChannelTrace
    expect(t.trace.length).toBe(t.base_sizes!.length)
    expect(Math.max(...t.trace)).toBeLessThan(Math.max(...v.reference!.trace)) // the re-run is weaker
    const w = (await dispatchMock('get_well', { id: rerun.well_id, traces: true })) as WellDetail
    expect(w.channels.length).toBeGreaterThan(1)
    expect(w.channels.every((c) => c.trace?.length === w.base_sizes!.length)).toBe(true)
  }, 20000)

  it('keeps a review mark until the call changes, and fills the engine fields of a row', async () => {
    const { pid, lid, calls } = await study()
    const r = calls.rows.find((x) => x.alleles.length > 0 && !x.flags.failure)!
    expect(r.alleles[0]).toMatchObject({ size: expect.any(Number), proportion: expect.any(Number) })
    expect(r.well_label).toMatch(/^[A-H]\d\d$/)
    await dispatchMock('set_call_reviewed', { project_id: pid, sample_id: r.sample_id, locus_id: lid, reviewed: true })
    const after = (await dispatchMock('get_locus_calls', { project_id: pid, locus_id: lid })) as LocusCalls
    expect(after.rows.find((x) => x.sample_id === r.sample_id)!.reviewed).toBe(true)
    const toggled = (await dispatchMock('toggle_allele', { project_id: pid, sample_id: r.sample_id, locus_id: lid, bin_id: r.alleles[0]!.bin_id })) as LocusCalls['rows'][number]
    expect(toggled.reviewed).toBe(false)
    const sc = (await dispatchMock('get_project_sample_calls', { project_id: pid, sample_id: r.sample_id })) as SampleCalls
    expect(sc.max_alleles).toBeGreaterThanOrEqual(0)
  }, 20000)
})
