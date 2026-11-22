import { describe, expect, it } from 'vitest'
import { workspaceCounts, workspaceCountsText } from './AppShell'

describe('workspace menu counts', () => {
  it('uses proper singular and plural labels', () => {
    const c = { plates: 1, samples: 288, loci: 1, locus_sets: 1, ladders: 4 }
    expect(workspaceCounts(c)).toEqual(['1 plate', '288 samples', '1 locus', '1 locus set', '4 ladders'])
    expect(workspaceCountsText({ plates: 0, samples: 1, loci: 6, locus_sets: 2, ladders: 1 })).toBe(
      '0 plates · 1 sample · 6 loci · 2 locus sets · 1 ladder',
    )
  })
})
