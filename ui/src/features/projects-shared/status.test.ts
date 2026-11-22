import { describe, expect, it } from 'vitest'
import type { ProjectSummary } from '@/api/bindings'
import { lociNeedingAnalysis, projectOverall, shortStatus, statusView } from './status'

const base: Pick<ProjectSummary, 'locus_count' | 'current_loci' | 'stale_loci' | 'unanalyzed_loci' | 'probabilities' | 'kind'> = {
  kind: 'genotyping',
  locus_count: 6,
  current_loci: 6,
  stale_loci: 0,
  unanalyzed_loci: 0,
  probabilities: { state: 'current', reasons: [], analyzed_at: '2026-01-01T00:00:00Z' },
}

describe('statusView', () => {
  it('keeps the engine reasons and marks stale results suspect', () => {
    const v = statusView({ state: 'stale', reasons: ['Parameters changed.', 'Bins changed in Demo bins.'], analyzed_at: '2026-01-01T00:00:00Z' }, 'PfY1 calls')
    expect(v.tone).toBe('warn')
    expect(v.suspect).toBe(true)
    expect(v.reasons).toEqual(['Parameters changed.', 'Bins changed in Demo bins.'])
    expect(v.sentence).toContain('Parameters changed; Bins changed in Demo bins')
  })
  it('treats missing and never-analyzed results as suspect, current as not', () => {
    expect(statusView(null).suspect).toBe(true)
    expect(statusView({ state: 'not_analyzed', reasons: [], analyzed_at: null }).label).toBe('Not analyzed')
    expect(statusView({ state: 'current', reasons: [], analyzed_at: null }).suspect).toBe(false)
  })
  it('short status names the first reason', () => {
    expect(shortStatus({ state: 'stale', reasons: ['Runs changed.'], analyzed_at: null })).toBe('Stale: Runs changed')
  })
})

describe('projectOverall', () => {
  it('is current only when loci and probabilities are', () => {
    expect(projectOverall(base).tone).toBe('ok')
    expect(projectOverall({ ...base, probabilities: { state: 'stale', reasons: [], analyzed_at: null } }).label).toBe('Probabilities stale')
  })
  it('counts loci needing analysis', () => {
    const o = projectOverall({ ...base, current_loci: 4, stale_loci: 1, unanalyzed_loci: 1 })
    expect(o.needsAnalysis).toBe(2)
    expect(o.label).toBe('2 of 6 loci need analysis')
    expect(o.sentence).toContain('1 stale, 1 not analyzed')
  })
  it('a fresh project is not analyzed', () => {
    expect(projectOverall({ ...base, current_loci: 0, unanalyzed_loci: 6 }).label).toBe('Not analyzed')
  })
  it('lists loci needing analysis', () => {
    const l = (id: number, state: 'current' | 'stale' | 'not_analyzed') => ({ locus_id: id, label: `L${id}`, color: 'blue' as const, min_base_length: 0, max_base_length: 1, nucleotide_repeat_length: 3, custom_params: false, status: { state, reasons: [], analyzed_at: null } })
    expect(lociNeedingAnalysis([l(1, 'current'), l(2, 'stale'), l(3, 'not_analyzed')]).map((x) => x.locus_id)).toEqual([2, 3])
  })
})
